"""P1 真实供应商验收：仅通过本地 PeachAgent API 调用已绑定模型。

默认仅校验配置；必须显式 --execute 才会产生真实模型调用和费用。
不读取模型密钥，不记录模型输入/输出、登录凭证或原始错误正文。
"""
import argparse
import base64
import datetime
import http.cookiejar
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave

MODEL_TYPES = {"LLM", "EMBEDDING", "RERANK", "IMAGE", "STT", "TTS"}
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}
MAX_RESPONSE = 32 * 1024 * 1024
MAX_AUDIO = 10 * 1024 * 1024


class SmokeFailure(Exception):
    """仅使用可公开的固定错误码，避免供应商正文或密码进入日志。"""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SmokeFailure("API_REDIRECT_DENIED")


def check(condition, code):
    if not condition:
        raise SmokeFailure(code)


def safe_code(value, fallback):
    return value if isinstance(value, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", value) else fallback


def uuid_string(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value.lower()
    except (ValueError, TypeError, AttributeError):
        return False


def read_plan(path):
    try:
        plan = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise SmokeFailure("CONFIG_UNREADABLE") from None
    check(isinstance(plan, dict) and set(plan) == {"workspaceId", "projectId", "models"}, "INVALID_PLAN")
    check(uuid_string(plan["workspaceId"]) and uuid_string(plan["projectId"]), "INVALID_SCOPE_ID")
    cases = plan["models"]
    check(isinstance(cases, list) and 6 <= len(cases) <= 12, "INVALID_CASE_COUNT")
    model_ids = set()
    types = set()
    for case in cases:
        check(isinstance(case, dict) and set(case) == {"modelId", "modelType", "vendorKey", "protocolKey"},
              "INVALID_CASE")
        check(uuid_string(case["modelId"]), "INVALID_MODEL_ID")
        check(isinstance(case["modelType"], str) and case["modelType"] in MODEL_TYPES, "INVALID_MODEL_TYPE")
        check(all(isinstance(case[k], str) and re.fullmatch(r"[A-Za-z0-9._-]{1,64}", case[k])
                  for k in ("vendorKey", "protocolKey")), "INVALID_ROUTE")
        check(case["modelId"].lower() not in model_ids, "DUPLICATE_MODEL")
        model_ids.add(case["modelId"].lower())
        types.add(case["modelType"])
    check(types == MODEL_TYPES, "MISSING_MODEL_TYPE")
    return plan


def local_base(value):
    try:
        u = urllib.parse.urlsplit(value)
        check(u.scheme in {"http", "https"} and u.hostname in {"localhost", "127.0.0.1", "::1"}
              and u.port is not None and not u.username and not u.password and not u.query
              and not u.fragment and u.path in {"", "/"}, "LOCAL_API_REQUIRED")
    except ValueError:
        raise SmokeFailure("LOCAL_API_REQUIRED") from None
    return value.rstrip("/")


class Client:
    def __init__(self, base):
        self.base = local_base(base)
        self.csrf = None
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            NoRedirect(),
        )

    def call(self, method, path, body=None, key=None, raw=False):
        headers = {"Origin": self.base, "Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        if self.csrf and method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        if key:
            headers["Idempotency-Key"] = key
        if path.endswith("/events"):
            headers["Accept"] = "text/event-stream"
        request = urllib.request.Request(self.base + "/api/v1" + path, method=method, data=data, headers=headers)
        try:
            with self.opener.open(request, timeout=45) as response:
                payload = response.read(MAX_RESPONSE + 1)
        except urllib.error.HTTPError as error:
            error.close()
            raise SmokeFailure("API_HTTP_" + str(error.code)) from None
        except (OSError, TimeoutError, urllib.error.URLError):
            raise SmokeFailure("API_TRANSPORT_UNKNOWN") from None
        check(len(payload) <= MAX_RESPONSE, "API_RESPONSE_TOO_LARGE")
        if raw:
            return payload
        try:
            return json.loads(payload) if payload else None
        except ValueError:
            raise SmokeFailure("API_INVALID_JSON") from None

    def login(self):
        email = os.environ.get("PEACHAGENT_SMOKE_EMAIL")
        password = os.environ.get("PEACHAGENT_SMOKE_PASSWORD")
        check(bool(email and password), "TEST_ACCOUNT_ENV_REQUIRED")
        result = self.call("POST", "/auth/login", {"email": email, "password": password, "remember": False})
        check(isinstance(result, dict) and bool(result.get("csrfToken")), "LOGIN_SESSION_INVALID")
        self.csrf = result["csrfToken"]


def read_audio(path):
    check(bool(path), "STT_WAV_REQUIRED")
    try:
        p = Path(path)
        check(0 < p.stat().st_size <= MAX_AUDIO, "INVALID_STT_AUDIO_SIZE")
        with wave.open(str(p), "rb") as wav:
            check(wav.getnframes() > 0 and wav.getnchannels() > 0, "INVALID_STT_AUDIO")
        return base64.b64encode(p.read_bytes()).decode("ascii")
    except (OSError, EOFError, wave.Error):
        raise SmokeFailure("INVALID_STT_AUDIO") from None


def utc_string(value):
    return value.strftime("%Y%m%d%H%M%S")


def preflight(client, plan):
    w = "/workspaces/" + plan["workspaceId"]
    p = w + "/projects/" + plan["projectId"]
    models = {x["id"]: x for x in client.call("GET", w + "/models")}
    providers = {x["id"]: x for x in client.call("GET", w + "/providers")}
    bindings = {x["modelId"]: x for x in client.call("GET", p + "/model-bindings")}
    for case in plan["models"]:
        model = models.get(case["modelId"])
        check(model and model.get("status") == "ACTIVE" and model.get("enabled"), "MODEL_NOT_ACTIVE")
        check(model.get("modelType") == case["modelType"] and model.get("protocolKey") == case["protocolKey"],
              "MODEL_ROUTE_MISMATCH")
        provider = providers.get(model.get("providerId"))
        check(provider and provider.get("status") == "ACTIVE" and provider.get("enabled")
              and provider.get("vendorKey") == case["vendorKey"], "PROVIDER_MISMATCH")
        binding = bindings.get(case["modelId"])
        check(binding and binding.get("status") == "ACTIVE" and binding.get("enabled"), "MODEL_NOT_BOUND")
    return p


def debug_body(kind, audio):
    if kind == "RERANK":
        value = {"query": "fruit", "documents": ["apple", "mountain"]}
    elif kind == "STT":
        value = {}
    else:
        value = {"text": {
            "LLM": "Reply with a short greeting.",
            "EMBEDDING": "A red apple.",
            "IMAGE": "A simple blue circle on a white background.",
            "TTS": "PeachAgent smoke test.",
        }[kind]}
    return {"input": value, "audioBase64": audio if kind == "STT" else None,
            "maxOutputTokens": 32 if kind == "LLM" else None}


def result_payload(event_data):
    payloads = []
    terminal = False
    last_seq = 0
    for line in event_data.decode("utf-8").splitlines():
        if not line.startswith("data: "):
            continue
        event = json.loads(line[6:])
        seq = event.get("seq")
        check(isinstance(seq, int) and seq > last_seq, "SSE_SEQUENCE_INVALID")
        last_seq = seq
        if event.get("eventType") == "result":
            payloads.append(event.get("payload"))
        if event.get("eventType") == "terminal":
            terminal = True
    check(terminal and len(payloads) == 1 and isinstance(payloads[0], dict), "SSE_RESULT_MISSING")
    return payloads[0]


def verify_result(client, kind, run_path, payload):
    if kind in {"LLM", "STT"}:
        check(isinstance(payload.get("text"), str) and bool(payload["text"].strip()), "TEXT_RESULT_EMPTY")
    elif kind == "EMBEDDING":
        vector = payload.get("vector")
        check(isinstance(vector, list) and len(vector) > 0 and payload.get("dimensions") == len(vector),
              "EMBEDDING_RESULT_INVALID")
    elif kind == "RERANK":
        check(isinstance(payload.get("results"), list) and len(payload["results"]) > 0, "RERANK_RESULT_EMPTY")
    elif kind in {"IMAGE", "TTS"}:
        artifact = payload.get("artifactId")
        check(uuid_string(artifact), "ARTIFACT_MISSING")
        raw = client.call("GET", run_path + "/artifacts/" + artifact, raw=True)
        if kind == "IMAGE":
            check(raw.startswith(b"\x89PNG\r\n\x1a\n"), "IMAGE_ARTIFACT_INVALID")
        else:
            check(len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WAVE", "AUDIO_ARTIFACT_INVALID")


def execute_case(client, scope, case, audio):
    evidence = {"modelType": case["modelType"], "protocolKey": case["protocolKey"],
                "vendorKey": case["vendorKey"], "status": "FAILED"}
    start = datetime.datetime.now(datetime.timezone.utc)
    try:
        result = client.call("POST", scope + "/models/" + case["modelId"] + "/debug",
                             debug_body(case["modelType"], audio), key=uuid.uuid4().hex)
        run_id = result.get("id")
        check(uuid_string(run_id), "RUN_ID_MISSING")
        evidence["runId"] = run_id
        run_path = scope + "/runs/" + run_id
        deadline = time.monotonic() + 210
        detail = result
        while detail.get("status") not in TERMINAL and time.monotonic() < deadline:
            time.sleep(1)
            detail = client.call("GET", run_path)
        evidence["runStatus"] = safe_code(detail.get("status"), "UNKNOWN")
        check(detail.get("status") == "SUCCEEDED",
              safe_code(detail.get("errorCode"), "RUN_NOT_SUCCEEDED"))
        verify_result(client, case["modelType"], run_path,
                      result_payload(client.call("GET", run_path + "/events", raw=True)))
        from_time = utc_string(start - datetime.timedelta(minutes=1))
        to_time = utc_string(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=1))
        usage = client.call("GET", scope + "/usage?from=" + from_time + "&to=" + to_time + "&limit=100")
        calls = [x for x in usage if x.get("runId") == run_id]
        check(len(calls) == 1 and calls[0].get("status") == "SUCCEEDED"
              and calls[0].get("modelId") == case["modelId"], "CALL_LEDGER_MISMATCH")
        evidence["usageSource"] = safe_code(calls[0].get("usageSource"), "UNKNOWN")
        evidence["costSource"] = safe_code(calls[0].get("costSource"), "UNKNOWN")
        evidence["status"] = "PASSED"
    except SmokeFailure as error:
        evidence["errorCode"] = str(error)
    except (ValueError, TypeError, AttributeError, KeyError):
        evidence["errorCode"] = "UNEXPECTED_API_CONTRACT"
    # 结果不包含请求正文、模型输出、账号、密钥或供应商原始错误。
    print(json.dumps(evidence, ensure_ascii=False), flush=True)
    return evidence["status"] == "PASSED"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="配置模型 ID 和预期路由的 JSON")
    parser.add_argument("--base", default="http://localhost:8080", help="仅本地 PeachAgent API")
    parser.add_argument("--wav", help="专用无隐私语音 WAV 样本")
    parser.add_argument("--execute", action="store_true", help="显式允许真实调用，可能产生费用")
    args = parser.parse_args()
    client = None
    try:
        plan = read_plan(args.config)
        local_base(args.base)
        if not args.execute:
            print("PLAN_OK: six model types; no network requests or paid calls")
            return 0
        audio = read_audio(args.wav)
        client = Client(args.base)
        client.login()
        scope = preflight(client, plan)
        # 顺序执行降低支出和并发干扰；每个用例只有一次提交，不自动重试。
        results = [execute_case(client, scope, case, audio) for case in plan["models"]]
        print("RESULT: " + str(sum(results)) + "/" + str(len(results)))
        return 0 if all(results) else 1
    except SmokeFailure as error:
        print("BLOCKED: " + str(error), file=sys.stderr)
        return 1
    except (ValueError, TypeError, AttributeError, KeyError):
        print("BLOCKED: INVALID_API_CONTRACT", file=sys.stderr)
        return 1
    finally:
        if client and client.csrf:
            try:
                client.call("POST", "/auth/logout", {})
            except SmokeFailure:
                print("WARNING: TEST_SESSION_LOGOUT_FAILED", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
