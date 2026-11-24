"""Isolated P1 benchmark. Real API, Worker, MySQL and Redis; local model fixture only.

The fixture seeds terminal history, not actual billed calls. Live assertions reconcile only
requests created through the Runtime. Full load is deliberately separate from ordinary CI.
"""
import copy
from concurrent.futures import ThreadPoolExecutor
import http.cookiejar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"
PROVIDER = "http://127.0.0.1:18081"
HISTORY_TIME = "20200101000000"
HISTORY_END = "20200102000000"
SEED_COUNT = 100_000
SOAK_SECONDS = 600
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}
REPORT = Path("backend/qa/evidence/performance.json")
LOCK = threading.Lock()
REQUESTS = {}
ACTIVE = {}
PEAKS = {"global": 0, "tenant": 0, "workspace": 0, "project": 0}
STOP = threading.Event()


def mysql(sql):
    result = subprocess.run(
        ["docker", "compose", "-f", "compose.dev.yml", "exec", "-T", "mysql",
         "sh", "-c", 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE"'],
        input=sql, text=True, capture_output=True, check=True, timeout=240,
    )
    return result.stdout.strip()


def quote_id(value):
    return "'" + str(uuid.UUID(value)) + "'"


class Client:
    def __init__(self, source=None):
        self.jar = http.cookiejar.CookieJar()
        self.csrf = None
        if source:
            for cookie in source.jar:
                self.jar.set_cookie(copy.copy(cookie))
            self.csrf = source.csrf
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                 urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, data=None, expected=200, key=None):
        headers = {"Origin": ORIGIN, "Content-Type": "application/json"}
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        if key:
            headers["Idempotency-Key"] = key
        req = urllib.request.Request(BASE + "/api/v1" + path, method=method,
                                     data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            with self.opener.open(req, timeout=45) as res:
                status, body = res.status, res.read()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
        assert status == expected, (method, path, status, expected, body[:200])
        return json.loads(body) if body else None

    def events(self, scope, run_id):
        req = urllib.request.Request(BASE + "/api/v1" + scope + "/runs/" + run_id + "/events",
                                     headers={"Accept": "text/event-stream", "Origin": ORIGIN})
        first, terminal, last = None, False, 0
        with self.opener.open(req, timeout=45) as response:
            for raw in response:
                line = raw.decode("utf-8").strip()
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    assert event["seq"] > last, "Non-monotonic SSE"
                    last = event["seq"]
                    if event["eventType"] == "delta" and first is None:
                        first = time.monotonic()
                    if event["eventType"] == "terminal":
                        terminal = True
        assert terminal and first is not None, (run_id, "Missing SSE delta or terminal")
        return first


def mail_code(email):
    for _ in range(60):
        with urllib.request.urlopen("http://127.0.0.1:8025/api/v1/messages", timeout=3) as response:
            messages = json.load(response).get("messages", [])
        for item in messages:
            if any(x.get("Address") == email for x in item.get("To", [])):
                with urllib.request.urlopen("http://127.0.0.1:8025/api/v1/message/" + item["ID"], timeout=3) as response:
                    msg = json.load(response)
                code = re.search(r"\b[A-Za-z0-9_-]{43}\b", msg.get("Text", ""))
                if code:
                    return code.group()
        time.sleep(.5)
    raise AssertionError("Test registration challenge not received")


def register(index):
    client = Client()
    email = "perf-" + str(index) + "-" + uuid.uuid4().hex[:12] + "@example.invalid"
    password = os.environ["PEACHAGENT_PERF_PASSWORD"]
    client.call("POST", "/auth/email-challenges", {"email": email, "purpose": "REGISTER"}, 202)
    client.call("POST", "/auth/register", {"email": email, "token": mail_code(email), "password": password,
                "displayName": "Performance QA", "currency": "USD"}, 201)
    user = client.call("POST", "/auth/login", {"email": email, "password": password, "remember": False})
    client.csrf = user["csrfToken"]
    return client, user


def setup():
    scopes = []
    for tenant_index in range(4):
        client, user = register(tenant_index)
        spaces = [user["defaultWorkspaceId"],
                  client.call("POST", "/workspaces", {"name": "Perf second space", "description": ""}, 201)["id"]]
        for workspace_index, workspace_id in enumerate(spaces):
            w = "/workspaces/" + workspace_id
            projects = [client.call("GET", w + "/projects")[0]["id"],
                        client.call("POST", w + "/projects", {"name": "Perf second project", "description": ""}, 201)["id"]]
            provider = client.call("POST", w + "/providers", {"name": "Performance fixture", "vendorKey": "fixture",
                         "baseUrl": PROVIDER, "authMethod": "NONE", "credentialId": None, "protocolConfig": {},
                         "timeoutMs": 15000, "enabled": True, "rowVersion": None})
            model = client.call("POST", w + "/models", {"providerId": provider["id"], "name": "Performance LLM",
                      "externalModelId": "fixture", "modelType": "LLM", "protocolKey": "openai.chat-completions",
                      "protocolVersion": "v1", "protocolOptions": {}, "capabilities": {},
                      "modelOptions": {"maxOutputTokens": 32}, "pricing": {"currency": "USD", "perRequest": .01},
                      "enabled": True, "rowVersion": None})
            for project_index, project_id in enumerate(projects):
                p = w + "/projects/" + project_id
                client.call("POST", p + "/model-bindings", {"modelId": model["id"], "active": True})
                policies = client.call("GET", p + "/budgets")
                assert {row["scopeType"]: row["maxConcurrency"] for row in policies} == {
                    "TENANT": 8, "WORKSPACE": 4, "PROJECT": 2}
                scopes.append({"client": client, "path": p, "tenant": user["tenantId"], "user": user["userId"],
                               "workspace": workspace_id, "project": project_id, "model": model["id"],
                               "provider": provider["id"], "label": f"{tenant_index}-{workspace_index}-{project_index}"})
    assert len(scopes) == 16
    return scopes


def seed(scope):
    tenant, workspace, project, actor, model, provider = (
        quote_id(scope[k]) for k in ("tenant", "workspace", "project", "user", "model", "provider"))
    mysql(f"""
START TRANSACTION;
INSERT INTO RT_RUN (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,ACTOR_USER_ID,RUN_TYPE,TRACE_ID,
    IDEMPOTENCY_KEY,REQUEST_HASH,STATUS,LIMIT_SNAPSHOT,QUEUED_AT,DEADLINE_AT,FINISHED_AT,CREATED_AT,UPDATED_AT)
WITH PERF_DIGIT AS (
    SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
)
SELECT UUID(),{tenant},{workspace},{project},{actor},'MODEL_DEBUG',REPLACE(UUID(),'-',''),
    CONCAT('perf-seed-',A.N*10000+B.N*1000+C.N*100+D.N*10+E.N),
    UNHEX(SHA2(CONCAT('seed-',A.N,B.N,C.N,D.N,E.N),256)),'SUCCEEDED',JSON_OBJECT(),
    '{HISTORY_TIME}','20200101000300','{HISTORY_TIME}','{HISTORY_TIME}','{HISTORY_TIME}'
FROM PERF_DIGIT A CROSS JOIN PERF_DIGIT B CROSS JOIN PERF_DIGIT C CROSS JOIN PERF_DIGIT D CROSS JOIN PERF_DIGIT E;
INSERT INTO RT_MODEL_CALL (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,RUN_ID,ATTEMPT_NO,MODEL_ID,PROVIDER_ID,
    MODEL_TYPE,PROTOCOL_KEY,PROTOCOL_VERSION,ADAPTER_KEY,ADAPTER_VERSION,MODEL_SNAPSHOT,TRACE_ID,SPAN_ID,STATUS,
    DISPATCH_INTENT_AT,FINISHED_AT,INPUT_TOKENS,OUTPUT_TOKENS,TOTAL_TOKENS,USAGE_SOURCE,COST_AMOUNT,COST_CURRENCY,
    COST_SOURCE,CREATED_AT,UPDATED_AT)
SELECT UUID(),R.TENANT_ID,R.WORKSPACE_ID,R.PROJECT_ID,R.ID,1,{model},{provider},
    'LLM','openai.chat-completions','v1','peachagent.openai.chat-completions','1.0.0',JSON_OBJECT('seed',TRUE),
    R.TRACE_ID,LEFT(REPLACE(UUID(),'-',''),16),'SUCCEEDED','{HISTORY_TIME}','{HISTORY_TIME}',
    10,5,15,'REPORTED',0.01,'USD','ESTIMATED','{HISTORY_TIME}','{HISTORY_TIME}'
FROM RT_RUN R WHERE R.TENANT_ID={tenant} AND R.PROJECT_ID={project} AND R.IDEMPOTENCY_KEY LIKE 'perf-seed-%';
COMMIT;
""")
    counts = mysql("SELECT (SELECT COUNT(*) FROM RT_RUN),(SELECT COUNT(*) FROM RT_MODEL_CALL);")
    assert counts == f"{SEED_COUNT}\t{SEED_COUNT}", counts


class FixtureServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        assert self.path.endswith("/chat/completions")
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        marker = body["messages"][-1]["content"]
        assert re.fullmatch(r"perf-live-[0-3]-[0-1]-[0-1]-[a-f0-9]{32}", marker)
        label = marker[len("perf-live-"):].rsplit("-", 1)[0]
        tenant, workspace, _ = label.split("-")
        with LOCK:
            entry = REQUESTS.setdefault(marker, {"count": 0, "arrived": time.monotonic()})
            entry["count"] += 1
            ACTIVE[label] = ACTIVE.get(label, 0) + 1
            PEAKS["global"] = max(PEAKS["global"], sum(ACTIVE.values()))
            PEAKS["tenant"] = max(PEAKS["tenant"], sum(v for k, v in ACTIVE.items() if k.startswith(tenant + "-")))
            PEAKS["workspace"] = max(PEAKS["workspace"], sum(v for k, v in ACTIVE.items() if k.startswith(tenant + "-" + workspace + "-")))
            PEAKS["project"] = max(PEAKS["project"], ACTIVE[label])
        try:
            time.sleep(.1)
            first = b'data: {"choices":[{"delta":{"content":"Performance fixture"}}]}\n\n'
            last = b'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n'
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(first) + len(last)))
            self.end_headers()
            with LOCK:
                entry["first"] = time.monotonic()
            self.wfile.write(first)
            self.wfile.flush()
            # Hold the stream long enough to exercise 32 simultaneous model executions.
            time.sleep(2)
            self.wfile.write(last)
            self.wfile.flush()
        finally:
            with LOCK:
                ACTIVE[label] -= 1


def page_paths(scope):
    p = scope["path"]
    return p + "/runs?limit=50", p + "/usage?from=" + HISTORY_TIME + "&to=" + HISTORY_END + "&limit=50"


def check_pages(scopes):
    s = scopes[0]
    client = s["client"]
    for path in page_paths(s):
        first = client.call("GET", path)
        assert len(first) == 50 and all(row["createdAt"] == HISTORY_TIME for row in first)
        cursor = first[-1]
        second = client.call("GET", path + "&" + urllib.parse.urlencode({"before": cursor["createdAt"], "beforeId": cursor["id"]}))
        assert len(second) == 50 and not ({row["id"] for row in first} & {row["id"] for row in second})
        assert [row["id"] for row in first + second] == sorted([row["id"] for row in first + second], reverse=True)
        client.call("GET", path + "&beforeId=bad", expected=422)
    other = scopes[4]["client"]
    other.call("GET", s["path"] + "/runs", expected=404)
    first = client.call("GET", page_paths(s)[0])[0]
    other.call("GET", s["path"] + "/runs/" + first["id"], expected=404)
    other.call("GET", s["path"] + "/runs/" + first["id"] + "/events", expected=404)


def p95(values):
    assert values
    values = sorted(values)
    return round(values[math.ceil(.95 * len(values)) - 1], 3)


def read_benchmark(scope):
    barrier = threading.Barrier(50)
    paths = page_paths(scope)
    next_paths = []
    for path in paths:
        last = scope["client"].call("GET", path)[-1]
        next_paths.append(path + "&" + urllib.parse.urlencode({"before": last["createdAt"], "beforeId": last["id"]}))

    def reader(index):
        client = Client(scope["client"])
        path = paths[index % 2]
        values = []
        barrier.wait(timeout=30)
        for page in range(10):
            start = time.monotonic()
            rows = client.call("GET", path if page % 2 == 0 else next_paths[index % 2])
            values.append((time.monotonic() - start) * 1000)
            assert len(rows) == 50 and all(row["createdAt"] == HISTORY_TIME for row in rows)
        return index % 2, values

    with ThreadPoolExecutor(max_workers=50) as pool:
        result = list(pool.map(reader, range(50)))
    runs = [v for kind, items in result if kind == 0 for v in items]
    calls = [v for kind, items in result if kind == 1 for v in items]
    return {"concurrency": 50, "runSamples": len(runs), "callSamples": len(calls),
            "runP95Ms": p95(runs), "callP95Ms": p95(calls)}


def submit(scope, client):
    marker = "perf-live-" + scope["label"] + "-" + uuid.uuid4().hex
    payload = {"input": {"text": marker}, "audioBase64": None, "maxOutputTokens": 32}
    path = scope["path"] + "/models/" + scope["model"] + "/debug"
    start = time.monotonic()
    run = client.call("POST", path, payload, key=marker)
    created = (time.monotonic() - start) * 1000
    duplicate = client.call("POST", path, payload, key=marker)
    assert duplicate["id"] == run["id"], "Duplicate run"
    first = client.events(scope["path"], run["id"])
    detail = client.call("GET", scope["path"] + "/runs/" + run["id"])
    assert detail["status"] == "SUCCEEDED", detail
    with LOCK:
        observed = REQUESTS[marker]
        assert observed["count"] == 1, "Provider replay"
        delay = observed["first"] - observed["arrived"]
    return marker, run["id"], created, max(0., (first - start - delay) * 1000)


def create_benchmark(scopes):
    samples = []
    # Each batch has 20 concurrent requests and no project exceeds its two execution slots.
    for _ in range(5):
        barrier = threading.Barrier(20)

        def writer(index):
            scope = scopes[index % len(scopes)]
            client = Client(scope["client"])
            barrier.wait(timeout=30)
            return submit(scope, client)

        with ThreadPoolExecutor(max_workers=20) as pool:
            samples.extend(pool.map(writer, range(20)))
    return samples


def soak_benchmark(scopes):
    start = time.monotonic()
    deadline = start + SOAK_SECONDS
    barrier = threading.Barrier(32)

    def execute(index):
        scope = scopes[index // 2]
        client = Client(scope["client"])
        samples = []
        try:
            barrier.wait(timeout=30)
            while time.monotonic() < deadline and not STOP.is_set():
                samples.append(submit(scope, client))
        except Exception:
            STOP.set()
            raise
        return samples

    with ThreadPoolExecutor(max_workers=32) as pool:
        samples = [sample for batch in pool.map(execute, range(32)) for sample in batch]
    return samples, time.monotonic() - start


def reconcile(samples):
    expected = len(samples)
    assert len({sample[0] for sample in samples}) == expected
    assert len({sample[1] for sample in samples}) == expected
    with LOCK:
        assert len(REQUESTS) == expected and all(row["count"] == 1 for row in REQUESTS.values())
        assert all(value == 0 for value in ACTIVE.values())
    values = mysql("""
SELECT COUNT(*),SUM(R.STATUS='SUCCEEDED'),COUNT(DISTINCT C.ID),SUM(C.STATUS='SUCCEEDED'),
    SUM(C.TOTAL_TOKENS),SUM(C.COST_AMOUNT),SUM(C.DISPATCH_INTENT_AT IS NOT NULL)
FROM RT_RUN R JOIN RT_MODEL_CALL C ON C.RUN_ID=R.ID AND C.TENANT_ID=R.TENANT_ID
    AND C.WORKSPACE_ID=R.WORKSPACE_ID AND C.PROJECT_ID=R.PROJECT_ID
WHERE R.IDEMPOTENCY_KEY LIKE 'perf-live-%';
SELECT COUNT(*),SUM(B.STATE='SETTLED'),SUM(B.CONCURRENCY_RELEASED),SUM(B.ACTUAL_CALLS),
    SUM(B.ACTUAL_TOKENS),SUM(B.ACTUAL_COST)
FROM BUDGET_RESERVATION B JOIN RT_MODEL_CALL C ON C.ID=B.CALL_ID
    JOIN RT_RUN R ON R.ID=C.RUN_ID
WHERE R.IDEMPOTENCY_KEY LIKE 'perf-live-%';
SELECT SUM(INFLIGHT_COUNT) FROM BUDGET_POLICY;
SELECT COUNT(*) FROM RT_RUN WHERE STATUS IN ('QUEUED','RUNNING','CANCEL_REQUESTED');
SELECT COUNT(*) FROM RT_RUN WHERE IDEMPOTENCY_KEY LIKE 'perf-live-%';
SELECT SUM(CONSUMED_CALLS),SUM(CONSUMED_TOKENS),SUM(CONSUMED_COST),
    SUM(RESERVED_CALLS),SUM(RESERVED_TOKENS),SUM(RESERVED_COST),SUM(UNKNOWN_CALLS)
FROM BUDGET_BUCKET;
""").splitlines()
    run, reserved = [line.split("\t") for line in values[:2]]
    assert list(map(int, run[:5])) == [expected, expected, expected, expected, expected * 15], run
    assert abs(float(run[5]) - expected * .01) < .0001 and int(run[6]) == expected, run
    assert list(map(int, reserved[:5])) == [expected * 3, expected * 3, expected * 3, expected * 3, expected * 45], reserved
    assert abs(float(reserved[5]) - expected * .03) < .0001, reserved
    assert values[2:5] == ["0", "0", str(expected)], values
    bucket = values[5].split("\t")
    assert [int(bucket[0]), int(bucket[1])] == [expected * 3, expected * 45], bucket
    assert abs(float(bucket[2]) - expected * .03) < .0001, bucket
    assert all(float(value) == 0 for value in bucket[3:]), bucket
    return {"liveRuns": expected, "providerDispatches": expected, "settledReservations": expected * 3,
            "inflight": 0, "unfinished": 0}


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("PEACHAGENT_ISOLATED_PERF") == "1", \
        "Benchmark requires isolated GitHub Actions database"
    assert mysql("SELECT COUNT(*) FROM IAM_USER;") == "0", "Refuse to seed a nonempty database"
    report = {"seedRowsPerTable": SEED_COUNT, "cpuCount": os.cpu_count(),
              "memoryKiB": int(re.search(r"MemTotal:\s+(\d+)", Path("/proc/meminfo").read_text()).group(1)),
              "status": "INCOMPLETE"}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    server = FixtureServer(("127.0.0.1", 18081), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        scopes = setup()
        seed(scopes[0])
        check_pages(scopes)
        report["pagination"] = "PASSED"
        report["read"] = read_benchmark(scopes[0])
        print("READ", json.dumps(report["read"]), flush=True)
        created = create_benchmark(scopes)
        report["create"] = {"concurrency": 20, "samples": len(created), "p95Ms": p95([row[2] for row in created])}
        print("CREATE", json.dumps(report["create"]), flush=True)
        with LOCK:
            for key in PEAKS:
                PEAKS[key] = 0
        soaked, elapsed = soak_benchmark(scopes)
        report["soak"] = {"durationSeconds": round(elapsed, 3), "samples": len(soaked), "peaks": dict(PEAKS),
                          "platformFirstEventP95Ms": p95([row[3] for row in soaked])}
        report["reconciliation"] = reconcile(created + soaked)
        thresholds = {
            "runRead": report["read"]["runP95Ms"] <= 200,
            "callRead": report["read"]["callP95Ms"] <= 200,
            "create": report["create"]["p95Ms"] <= 300,
            "soakDuration": elapsed >= SOAK_SECONDS,
            "globalConcurrency": PEAKS["global"] == 32,
            "scopeConcurrency": PEAKS["tenant"] <= 8 and PEAKS["workspace"] <= 4 and PEAKS["project"] <= 2,
            "firstEvent": report["soak"]["platformFirstEventP95Ms"] <= 300,
        }
        report["thresholds"] = thresholds
        report["status"] = "PASSED" if all(thresholds.values()) else "FAILED"
        print("RESULT", json.dumps(report), flush=True)
        assert all(thresholds.values()), thresholds
    finally:
        server.shutdown()
        server.server_close()
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
