"""Real API/Worker/MySQL/Redis execution against a local protocol fixture.
External vendor availability/credentials are intentionally not claimed by this test.
"""
import base64
import http.cookiejar
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"
PROVIDER = "http://127.0.0.1:18081"
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}
REQUESTS = []
FIXTURE_AUTH = []
FIXTURE_MESSAGES = []
audio = io.BytesIO()
with wave.open(audio, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(8000)
    w.writeframes(b"\x00\x00" * 80)
WAV = audio.getvalue()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJdQAAAAASUVORK5CYII=")

class Provider(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, body, typ="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Request-ID", "fixture-" + uuid.uuid4().hex)
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        path = self.path
        REQUESTS.append(path)
        FIXTURE_AUTH.append((path, self.headers.get('Authorization'), self.headers.get('x-api-key')))
        if path.endswith("/chat/completions"):
            obj = json.loads(raw)
            FIXTURE_MESSAGES.append(obj.get("messages",[]))
            if obj.get("model") == "partial" and obj.get("messages",[])[-1]["content"]=="stream-cut":
                time.sleep(.15)
                first=b'data: {"choices":[{"delta":{"content":"Retained partial response"}}]}\n\n'
                self.send_response(200)
                self.send_header("Content-Type","text/event-stream")
                self.send_header("Connection","close")
                self.end_headers()
                self.wfile.write(first);self.wfile.flush()
                time.sleep(1)
                self.close_connection=True
                return
            if obj.get("model") == "reject":
                self.send_error(429)
                return
            if obj.get("model") == "slow":
                time.sleep(4)
            if obj.get("model") == "crash":
                time.sleep(45)
            events = [{"choices":[{"delta":{"content":"Fixture answer"}}]},
                      {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}]
            try: self.reply(("".join("data: "+json.dumps(x)+"\n\n" for x in events)+"data: [DONE]\n\n").encode(),"text/event-stream")
            except (BrokenPipeError, ConnectionResetError): pass
        elif path.endswith("/messages"):
            events=[{"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":0}}},
                    {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anthropic fixture"}},
                    {"type":"message_delta","usage":{"output_tokens":4}},{"type":"message_stop"}]
            self.reply("".join("data: "+json.dumps(x)+"\n\n" for x in events).encode(),"text/event-stream")
        elif path.endswith("/embeddings"):
            self.reply({"data":[{"embedding":[.1,.2,.3]}],"usage":{"prompt_tokens":3,"total_tokens":3}})
        elif path.endswith("/text-rerank"):
            self.reply({"output":{"results":[{"index":0,"relevance_score":.9}]},"usage":{"total_tokens":5}})
        elif path.endswith("/images/generations"):
            self.reply({"data":[{"b64_json":base64.b64encode(PNG).decode()}]})
        elif path.endswith("/audio/transcriptions"):
            assert b"RIFF" in raw
            self.reply({"text":"Audio fixture"})
        elif path.endswith("/audio/speech"):
            self.reply(WAV,"audio/wav")
        else:
            self.send_error(404)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None
    def call(self, method, path, data=None, expected=200, key=None, raw=False):
        headers = {"Origin":ORIGIN, "Content-Type":"application/json"}
        if self.csrf: headers["X-CSRF-Token"] = self.csrf
        if key: headers["Idempotency-Key"] = key
        req=urllib.request.Request(BASE+"/api/v1"+path,method=method,data=None if data is None else json.dumps(data).encode(),headers=headers)
        try:
            with self.opener.open(req,timeout=45) as response:
                status,payload=response.status,response.read()
        except urllib.error.HTTPError as e:
            status,payload=e.code,e.read()
        assert status==expected,(method,path,status,expected,payload[:500])
        return payload if raw else json.loads(payload) if payload else None
    def login(self,email,password):
        result=self.call("POST","/auth/login",{"email":email,"password":password,"remember":False})
        self.csrf=result["csrfToken"]
        return result

def key(): return uuid.uuid4().hex
def wait(c,p,run,expected="SUCCEEDED",timeout=40):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        detail=c.call("GET",p+"/runs/"+run["id"])
        if detail["status"] in TERMINAL:
            assert detail["status"]==expected,detail
            return detail
        time.sleep(.25)
    raise AssertionError(("Run timeout",run))
def replay_events(c,p,r,after=0):
    req=urllib.request.Request(BASE+"/api/v1"+p+"/runs/"+r["id"]+"/events",
                               headers={"Origin":ORIGIN,"Accept":"text/event-stream","Last-Event-ID":str(after)})
    with c.opener.open(req,timeout=45) as response:
        return [json.loads(line[6:]) for line in response.read().decode().splitlines() if line.startswith("data: ")]

def event_text(c,p,r):
    data=c.call("GET",p+"/runs/"+r["id"]+"/events",raw=True).decode()
    assert "event: terminal" in data,data[:500]
    return data

server=ThreadingHTTPServer(("127.0.0.1",18081),Provider)
threading.Thread(target=server.serve_forever,daemon=True).start()
recovery_worker = None
recovery_log = None
try:
    c=Client();user=c.login("p1-b@example.invalid","CI-only-test-passphrase-123")
    other=Client();other_user=other.login("p1-a@example.invalid","CI-only-reset-passphrase-456")
    w="/workspaces/"+user["defaultWorkspaceId"]
    project=c.call("GET",w+"/projects")[0]
    p=w+"/projects/"+project["id"]
    descriptors=c.call("GET","/model-protocols")
    assert len(descriptors)>=7
    providers={}
    for auth in ["NONE","BEARER","API_KEY"]:
        credential=None
        if auth!="NONE":
            cred=c.call("POST",w+"/credentials",{"name":"fixture "+auth,"secretType":auth,"allowedOrigin":PROVIDER,"secret":"CiOnlySecretNotProduction"})
            credential=cred["id"]
            assert "secret" not in cred and "encryptedSecret" not in cred
        provider=c.call("POST",w+"/providers",{"name":"fixture "+auth,"vendorKey":"fixture","baseUrl":PROVIDER,"authMethod":auth,
             "credentialId":credential,"protocolConfig":{},"timeoutMs":10000,"enabled":True,"rowVersion":None})
        providers[auth]=(provider["id"],credential)
    models={}
    for d in descriptors:
        protocol=d["protocol"]
        model_type=next(iter(d["operations"]))
        auth="API_KEY" if protocol["key"].startswith("anthropic") else "BEARER" if protocol["key"].startswith("dashscope") else "NONE"
        m=c.call("POST",w+"/models",{"providerId":providers[auth][0],"name":protocol["key"],"externalModelId":"fixture",
          "modelType":model_type,"protocolKey":protocol["key"],"protocolVersion":protocol["version"],"protocolOptions":{},
          "capabilities":{},"modelOptions":{},"pricing":{"currency":"USD","perRequest":0.01},"enabled":True,"rowVersion":None})
        c.call("POST",p+"/model-bindings",{"modelId":m["id"],"active":True})
        inp={"query":"query","documents":["document"]} if model_type=="RERANK" else {"text":"hello"}
        run=c.call("POST",p+"/models/"+m["id"]+"/debug",{"input":inp,"audioBase64":base64.b64encode(WAV).decode() if model_type=="STT" else None,"maxOutputTokens":None},key=key())
        wait(c,p,run)
        events=event_text(c,p,run)
        assert "event: result" in events
        if model_type in {"TTS","IMAGE"}:
            payload=next(json.loads(line[6:])["payload"] for line in events.splitlines() if line.startswith("data: ") and '"artifactId"' in line)
            artifact=payload["artifactId"]
            assert c.call("GET",p+"/runs/"+run["id"]+"/artifacts/"+artifact,raw=True)
            other.call("GET",p+"/runs/"+run["id"]+"/artifacts/"+artifact,expected=404)
        models[protocol["key"]]=m
    prompt=c.call("POST",p+"/prompts",{"name":"Fixture prompt","description":"","content":"Say hello to {{name}}",
         "variables":{"name":{"type":"string","required":True}},"rowVersion":None})
    version=c.call("POST",p+"/prompts/"+prompt["id"]+"/versions",{"changeNote":"Initial","rowVersion":prompt["rowVersion"]})
    preview=c.call("POST",p+"/prompts/"+prompt["id"]+"/preview",{"versionId":version["id"],"values":{"name":"QA"}})
    assert preview["text"]=="Say hello to QA"
    # Missing type is a domain validation error, not an internal exception.
    c.call("POST",p+"/prompts",{"name":"Invalid variable","content":"{{x}}",
           "variables":{"x":{"required":True}},"rowVersion":None},expected=422)
    pinned_prompt=c.call("POST",p+"/prompts",{"name":"Version freeze QA","description":"",
             "content":"Original {{name}}","variables":{"name":{"type":"string","required":True}},"rowVersion":None})
    pinned_version=c.call("POST",p+"/prompts/"+pinned_prompt["id"]+"/versions",
                          {"changeNote":"First version","rowVersion":pinned_prompt["rowVersion"]})
    current_prompt=next(x for x in c.call("GET",p+"/prompts") if x["id"]==pinned_prompt["id"])
    edited=c.call("PATCH",p+"/prompts/"+pinned_prompt["id"],{"name":"Version freeze QA","description":"",
            "content":"Updated {{name}}","variables":{"name":{"type":"string","required":True}},
            "rowVersion":current_prompt["rowVersion"]})
    new_version=c.call("POST",p+"/prompts/"+pinned_prompt["id"]+"/versions",
                       {"changeNote":"Second version","rowVersion":edited["rowVersion"]})
    assert new_version["versionNo"]==2
    pinned=c.call("POST",p+"/prompts/"+pinned_prompt["id"]+"/preview",{"versionId":pinned_version["id"],"values":{"name":"QA"}})
    assert pinned["text"]=="Original QA"
    latest=c.call("POST",p+"/prompts/"+pinned_prompt["id"]+"/preview",{"versionId":new_version["id"],"values":{"name":"QA"}})
    assert latest["text"]=="Updated QA"
    manifest={"pluginKey":"qa.fixture","pluginVersion":"1.0.0","name":"Fixture manifest","description":"",
              "configSchema":{"type":"object","properties":{"count":{"type":"integer","minimum":1,"maximum":3}},
                              "required":["count"],"additionalProperties":False},
              "permissions":["model.invoke"],"extensionPoints":["studio.panel"]}
    invalid={**manifest,"configSchema":{"type":"object","properties":{"count":{}}}}
    c.call("POST",w+"/plugin-manifests/validate",invalid,expected=422)
    assert c.call("POST",w+"/plugin-manifests/validate",manifest)["valid"]
    entry=c.call("POST",w+"/plugin-manifests",manifest)
    c.call("POST",w+"/plugin-manifests",manifest,expected=409)
    row=next(x for x in c.call("GET",w+"/plugin-manifests") if x["id"]==entry["id"])
    assert row["status"]=="DRAFT"
    c.call("POST",w+"/plugin-manifests/"+row["id"]+"/declare",{"rowVersion":row["rowVersion"]})
    row=next(x for x in c.call("GET",w+"/plugin-manifests") if x["id"]==entry["id"])
    assert row["status"]=="DECLARED"
    c.call("POST",w+"/plugin-manifests/"+row["id"]+"/archive",{"rowVersion":row["rowVersion"]})
    assert next(x for x in c.call("GET",w+"/plugin-manifests") if x["id"]==entry["id"])["status"]=="ARCHIVED"
    print("PASS: Prompt schema rejection and immutable versions, plugin validation/duplicate/declare/archive")
    conv=c.call("POST",p+"/conversations",{"title":"Fixture conversation"})
    model=next(m for k,m in models.items() if k.startswith("openai") and m["modelType"]=="LLM")
    body={"modelId":model["id"],"text":"Hello","promptVersionId":version["id"],"variables":{"name":"QA"},"maxOutputTokens":128}
    idem=key()
    run=c.call("POST",p+"/conversations/"+conv["id"]+"/runs",body,key=idem)
    assert c.call("POST",p+"/conversations/"+conv["id"]+"/runs",body,key=idem)["id"]==run["id"]
    wait(c,p,run)
    assert "Fixture answer" in event_text(c,p,run)
    msgs=c.call("GET",p+"/conversations/"+conv["id"]+"/messages")
    assert msgs[-1]["content"]=="Fixture answer" and msgs[-1]["status"]=="COMPLETE"
    other.call("GET",p+"/runs/"+run["id"],expected=404)
    # Fixed-version references are scoped to another project in the same workspace.
    target_project=c.call("POST",w+"/projects",{"name":"Prompt reference QA","description":""},expected=201)
    target=p.rsplit("/",1)[0]+"/"+target_project["id"]
    c.call("POST",target+"/model-bindings",{"modelId":model["id"],"active":True})
    target_conv=c.call("POST",target+"/conversations",{"title":"Reference QA"})
    ref_body={"modelId":model["id"],"text":"Reference test","promptVersionId":pinned_version["id"],
              "variables":{"name":"QA"},"maxOutputTokens":32}
    c.call("POST",target+"/conversations/"+target_conv["id"]+"/runs",ref_body,key=key(),expected=404)
    c.call("POST",target+"/prompt-references",{"sourceProjectId":project["id"],"versionId":pinned_version["id"],"alias":"Pinned QA"})
    ref_run=c.call("POST",target+"/conversations/"+target_conv["id"]+"/runs",ref_body,key=key())
    wait(c,target,ref_run)
    reference=next(x for x in c.call("GET",target+"/prompt-references") if x["promptVersionId"]==pinned_version["id"])
    c.call("POST",target+"/prompt-references/"+reference["id"]+"/revoke",{"rowVersion":reference["rowVersion"]})
    c.call("POST",target+"/conversations/"+target_conv["id"]+"/runs",ref_body,key=key(),expected=404)
    assert c.call("GET",target+"/runs/"+ref_run["id"])["status"]=="SUCCEEDED"
    print("PASS: fixed Prompt reference authorization and revocation preserve historical runs")
    usage=c.call("GET",p+"/usage?from=20000101000000&to=20990101000000")
    assert len(usage)>=len(descriptors)+1 and any(x["totalTokens"]==15 for x in usage)
    assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
    # Real stream failure: the first fragment is persisted, a missing upstream terminal fails explicitly.
    partial_model=c.call("POST",w+"/models",{"providerId":providers["NONE"][0],"name":"Partial stream QA",
      "externalModelId":"partial","modelType":"LLM","protocolKey":model["protocolKey"],"protocolVersion":model["protocolVersion"],
      "protocolOptions":{},"capabilities":{},"modelOptions":{"contextWindow":512,"maxOutputTokens":32},
      "pricing":{"currency":"USD","perRequest":0.01},"enabled":True,"rowVersion":None})
    c.call("POST",target+"/model-bindings",{"modelId":partial_model["id"],"active":True})
    diagnostic=c.call("POST",target+"/models/"+partial_model["id"]+"/debug",
                      {"input":{"text":"verify"},"audioBase64":None,"maxOutputTokens":32},key=key())
    wait(c,target,diagnostic)
    # The partial conversation remains in the default project for the browser regression.
    c.call("POST",p+"/model-bindings",{"modelId":partial_model["id"],"active":True})
    partial_conv=c.call("POST",p+"/conversations",{"title":"Partial response QA"})
    cut={"modelId":partial_model["id"],"text":"stream-cut","promptVersionId":None,"variables":{},"maxOutputTokens":32}
    before=len(REQUESTS)
    partial=c.call("POST",p+"/conversations/"+partial_conv["id"]+"/runs",cut,key=key())
    c.call("POST",p+"/conversations/"+partial_conv["id"]+"/runs",cut,key=key(),expected=409)
    detail=wait(c,p,partial,"FAILED")
    assert detail["errorCode"]=="MODEL_STREAM_INTERRUPTED",detail
    full=replay_events(c,p,partial)
    assert [e["seq"] for e in full]==list(range(1,len(full)+1))
    delta=next(e for e in full if e["eventType"]=="delta")
    resumed=replay_events(c,p,partial,delta["seq"])
    assert resumed==[e for e in full if e["seq"]>delta["seq"]] and resumed[-1]["eventType"]=="terminal"
    msgs=c.call("GET",p+"/conversations/"+partial_conv["id"]+"/messages")
    assert msgs[-1]["status"]=="ERROR" and msgs[-1]["content"]=="Retained partial response"
    assert len(REQUESTS)==before+1
    c.call("POST",p+"/runs/"+partial["id"]+"/retry",{"acknowledgeUnknown":False},key=key(),expected=409)
    # The newest user input must fit; complete earlier turns are kept or dropped as a pair.
    context_conv=c.call("POST",target+"/conversations",{"title":"Context boundary QA"})
    for index in range(3):
        text=("turn-"+str(index)+" ")*23
        bounded={"modelId":partial_model["id"],"text":text,"promptVersionId":None,"variables":{},"maxOutputTokens":32}
        run_ctx=c.call("POST",target+"/conversations/"+context_conv["id"]+"/runs",bounded,key=key())
        wait(c,target,run_ctx)
        sent=FIXTURE_MESSAGES[-1]
        assert sent[-1]=={"role":"user","content":text}
        assert len(sent)%2==1 and all(sent[i]["role"]=="user" and sent[i+1]["role"]=="assistant" for i in range(0,len(sent)-1,2))
        assert sum(len(m["content"].encode()) for m in sent)+32*len(sent)+32<=512
        if index==2:
            assert len(sent)<5,"Oldest complete turn was not clipped"
    before=len(REQUESTS)
    oversized={"modelId":partial_model["id"],"text":"x"*513,"promptVersionId":None,"variables":{},"maxOutputTokens":32}
    c.call("POST",target+"/conversations/"+context_conv["id"]+"/runs",oversized,key=key(),expected=422)
    assert len(REQUESTS)==before
    print("PASS: partial output persisted, exact Last-Event-ID replay, same-conversation concurrency, explicit uncertain retry and context clipping")
    # A retry creates a new persisted run; same key cannot start another call.
    before=len(REQUESTS)
    retry_key=key()
    retry=c.call("POST",p+"/runs/"+run["id"]+"/retry",{"acknowledgeUnknown":True},key=retry_key)
    assert retry["id"]!=run["id"]
    assert c.call("POST",p+"/runs/"+run["id"]+"/retry",{"acknowledgeUnknown":True},key=retry_key)["id"]==retry["id"]
    wait(c,p,retry)
    assert len(REQUESTS)==before+1
    assert "Fixture answer" in event_text(c,p,retry)
    # Concurrent submissions using the same idempotency key must persist one run and dispatch once.
    concurrent_key=key()
    concurrent_body={"input":{"text":"concurrent"},"audioBase64":None,"maxOutputTokens":None}
    before=len(REQUESTS)
    def concurrent_debug(_):
        duplicate=Client()
        for cookie in c.jar:
            duplicate.jar.set_cookie(cookie)
        duplicate.csrf=c.csrf
        return duplicate.call("POST",p+"/models/"+model["id"]+"/debug",concurrent_body,key=concurrent_key)
    with ThreadPoolExecutor(max_workers=4) as pool:
        duplicates=list(pool.map(concurrent_debug,range(4)))
    assert len({item["id"] for item in duplicates})==1, duplicates
    wait(c,p,duplicates[0])
    assert len(REQUESTS)==before+1
    assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
    print("PASS: four concurrent idempotent submissions, one provider dispatch and budget settlement")
    # Rotation invalidates verification; the next diagnostic must use the new credential.
    rerank=next(m for m in models.values() if m["modelType"]=="RERANK")
    credential_id=providers["BEARER"][1]
    cred=next(x for x in c.call("GET",w+"/credentials") if x["id"]==credential_id)
    other_w="/workspaces/"+other_user["defaultWorkspaceId"]
    other.call("POST",other_w+"/credentials/"+credential_id+"/rotate",
               {"secret":"CiOnlyForeignSecret","rowVersion":cred["rowVersion"]},expected=404)
    foreign_space=c.call("POST","/workspaces",{"name":"Model isolation QA","description":""},expected=201)
    foreign_w="/workspaces/"+foreign_space["id"]
    foreign_p=foreign_w+"/projects/"+foreign_space["defaultProjectId"]
    c.call("POST",foreign_p+"/model-bindings",{"modelId":rerank["id"],"active":True},expected=404)
    c.call("POST",foreign_w+"/credentials/"+credential_id+"/rotate",
           {"secret":"CiOnlyForeignSecret","rowVersion":cred["rowVersion"]},expected=404)
    rotated=c.call("POST",w+"/credentials/"+credential_id+"/rotate",
                   {"secret":"CiOnlyRotatedSecretNotProduction","rowVersion":cred["rowVersion"]})
    assert rotated["secretRevision"]==cred["secretRevision"]+1 and "secret" not in rotated
    current=next(x for x in c.call("GET",w+"/models") if x["id"]==rerank["id"])
    assert current["verifyStatus"]=="UNVERIFIED"
    rerank_body={"input":{"query":"fruit","documents":["apple","mountain"]},"audioBase64":None,"maxOutputTokens":None}
    rotated_run=c.call("POST",p+"/models/"+rerank["id"]+"/debug",rerank_body,key=key())
    wait(c,p,rotated_run)
    assert FIXTURE_AUTH[-1][1]=="Bearer CiOnlyRotatedSecretNotProduction"
    current=next(x for x in c.call("GET",w+"/models") if x["id"]==rerank["id"])
    assert current["verifyStatus"]=="VERIFIED"
    revoked=c.call("POST",w+"/credentials/"+credential_id+"/revoke",{"rowVersion":rotated["rowVersion"]})
    assert revoked["status"]=="REVOKED"
    before=len(REQUESTS)
    c.call("POST",p+"/models/"+rerank["id"]+"/debug",rerank_body,expected=409,key=key())
    assert len(REQUESTS)==before
    c.call("POST",w+"/credentials/"+credential_id+"/rotate",
           {"secret":"CiOnlyCannotRestore","rowVersion":revoked["rowVersion"]},expected=409)
    c.call("POST",p+"/model-bindings",{"modelId":model["id"],"active":False})
    c.call("POST",p+"/models/"+model["id"]+"/debug",concurrent_body,expected=403,key=key())
    assert len(REQUESTS)==before
    c.call("POST",p+"/model-bindings",{"modelId":model["id"],"active":True})
    print("PASS: credential rotation uses new secret, verification invalidation, revoke, binding withdrawal and cross-scope isolation")
    # Stop a dispatched request, not merely an unclaimed queue entry.
    slow=c.call("POST",w+"/models",{"providerId":providers["NONE"][0],"name":"Slow fixture",
      "externalModelId":"slow","modelType":"LLM","protocolKey":model["protocolKey"],"protocolVersion":model["protocolVersion"],
      "protocolOptions":{},"capabilities":{},"modelOptions":{},"pricing":{"currency":"USD","perRequest":0.01},"enabled":True,"rowVersion":None})
    c.call("POST",p+"/model-bindings",{"modelId":slow["id"],"active":True})
    before=len(REQUESTS)
    pending=c.call("POST",p+"/models/"+slow["id"]+"/debug",{"input":{"text":"stop"},"audioBase64":None,"maxOutputTokens":None},key=key())
    deadline=time.monotonic()+15
    while len(REQUESTS)==before and time.monotonic()<deadline: time.sleep(.05)
    assert len(REQUESTS)>before, "slow call was not dispatched"
    c.call("POST",p+"/runs/"+pending["id"]+"/cancel",{})
    wait(c,p,pending,"CANCELLED")
    assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
    print("PASS: persisted retry, idempotent retry, cancellation after dispatch, budget slot release")
    # Real upstream refusal must retain one uncertain dispatched call, not silently retry.
    reject=c.call("POST",w+"/models",{"providerId":providers["NONE"][0],"name":"Reject fixture",
      "externalModelId":"reject","modelType":"LLM","protocolKey":model["protocolKey"],"protocolVersion":model["protocolVersion"],
      "protocolOptions":{},"capabilities":{},"modelOptions":{},"pricing":{"currency":"USD","perRequest":0.01},"enabled":True,"rowVersion":None})
    c.call("POST",p+"/model-bindings",{"modelId":reject["id"],"active":True})
    before=len(REQUESTS)
    rejected=c.call("POST",p+"/models/"+reject["id"]+"/debug",concurrent_body,key=key())
    failure=wait(c,p,rejected,"FAILED")
    assert failure["errorCode"]=="MODEL_HTTP_429",failure
    assert len(REQUESTS)==before+1
    rejected_calls=[x for x in c.call("GET",p+"/usage?from=20000101000000&to=20990101000000") if x["runId"]==rejected["id"]]
    assert len(rejected_calls)==1 and rejected_calls[0]["status"]=="UNKNOWN"
    assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
    print("PASS: provider rejection is persisted once, uncertain usage retained, slot released")
    # Only a CI-owned worker PID can be killed. Local smoke does not touch arbitrary processes.
    worker_pid=os.environ.get("PEACHAGENT_TEST_WORKER_PID")
    jar_path=os.environ.get("PEACHAGENT_TEST_WORKER_JAR")
    if worker_pid and jar_path:
        assert os.environ.get("GITHUB_ACTIONS")=="true", "Worker fault injection requires isolated GitHub Actions"
        assert Path(jar_path).is_file()
        crash=c.call("POST",w+"/models",{"providerId":providers["NONE"][0],"name":"Crash fixture",
          "externalModelId":"crash","modelType":"LLM","protocolKey":model["protocolKey"],"protocolVersion":model["protocolVersion"],
          "protocolOptions":{},"capabilities":{},"modelOptions":{},"pricing":{"currency":"USD","perRequest":0.01},"enabled":True,"rowVersion":None})
        c.call("POST",p+"/model-bindings",{"modelId":crash["id"],"active":True})
        before=len(REQUESTS)
        lost=c.call("POST",p+"/models/"+crash["id"]+"/debug",concurrent_body,key=key())
        deadline=time.monotonic()+15
        while len(REQUESTS)==before and time.monotonic()<deadline:
            time.sleep(.05)
        assert len(REQUESTS)==before+1, "Crash fixture was not dispatched"
        assert c.call("GET",p+"/runs/"+lost["id"])["status"]=="RUNNING"
        # Kill the actual worker after the external dispatch was observed.
        os.kill(int(worker_pid),signal.SIGKILL)
        queued=c.call("POST",p+"/models/"+model["id"]+"/debug",concurrent_body,key=key())
        assert queued["status"]=="QUEUED"
        recovery_log=open("worker-recovery.log","w",encoding="utf-8")
        recovery_worker=subprocess.Popen(["java","-jar",jar_path,"--spring.profiles.active=worker"],
                                         stdout=recovery_log,stderr=subprocess.STDOUT)
        ready=time.monotonic()+60
        while time.monotonic()<ready:
            assert recovery_worker.poll() is None,"Recovery worker exited"
            if "Started PeachAgentApplication" in Path("worker-recovery.log").read_text(encoding="utf-8",errors="replace"):
                break
            time.sleep(.5)
        else:
            raise AssertionError("Recovery worker startup timeout")
        wait(c,p,queued,"SUCCEEDED",timeout=70)
        interrupted=wait(c,p,lost,"INTERRUPTED",timeout=70)
        assert interrupted["errorCode"]=="WORKER_INTERRUPTED",interrupted
        assert len(REQUESTS)==before+2,"A dispatched run was replayed or queued run was duplicated"
        calls=[x for x in c.call("GET",p+"/usage?from=20000101000000&to=20990101000000") if x["runId"]==lost["id"]]
        assert len(calls)==1 and calls[0]["status"]=="UNKNOWN"
        assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
        assert "event: terminal" in event_text(c,p,lost)
        print("PASS: worker SIGKILL after dispatch, queued run survives restart, expired lease interrupted, no replay, one uncertain ledger entry")
    else:
        print("NOT RUN: process fault injection requires the isolated CI worker PID and JAR")
    policy=c.call("GET",p+"/budgets")[-1]
    limit={k:policy.get(k) for k in ["maxCalls","maxTokens","maxCost","maxConcurrency","maxRunSeconds","maxRunTokens","maxRunCost","rowVersion"]}
    limit["maxCalls"]=0
    c.call("PATCH",p+"/budgets/"+policy["id"],limit)
    before=len(REQUESTS)
    denied=c.call("POST",p+"/models/"+model["id"]+"/debug",{"input":{"text":"blocked"},"audioBase64":None,"maxOutputTokens":None},key=key())
    wait(c,p,denied,"FAILED")
    assert len(REQUESTS)==before
    print("PASS: seven local protocol routes, six model types, credential vault, artifact access, Prompt versions, real SSE chat, idempotency, usage and budget rejection")
finally:
    if recovery_worker is not None:
        recovery_worker.terminate()
        try:
            recovery_worker.wait(timeout=20)
        except subprocess.TimeoutExpired:
            recovery_worker.kill()
            recovery_worker.wait(timeout=10)
    if recovery_log is not None:
        recovery_log.close()
    server.shutdown()
