"""Real API/Worker/MySQL/Redis execution against a local protocol fixture.
External vendor availability/credentials are intentionally not claimed by this test.
"""
import base64
import http.cookiejar
import io
import json
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"
PROVIDER = "http://127.0.0.1:18081"
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}
REQUESTS = []
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
        if path.endswith("/chat/completions"):
            obj = json.loads(raw)
            if obj.get("model") == "slow":
                time.sleep(4)
            events = [{"choices":[{"delta":{"content":"Fixture answer"}}]},
                      {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}]
            try: self.reply(("".join("data: "+json.dumps(x)+"\n\n" for x in events)+"data: [DONE]\n\n").encode(),"text/event-stream")
            except BrokenPipeError: pass
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
def wait(c,p,run,expected="SUCCEEDED"):
    for _ in range(160):
        detail=c.call("GET",p+"/runs/"+run["id"])
        if detail["status"] in TERMINAL:
            assert detail["status"]==expected,detail
            return detail
        time.sleep(.25)
    raise AssertionError(("Run timeout",run))
def event_text(c,p,r):
    data=c.call("GET",p+"/runs/"+r["id"]+"/events",raw=True).decode()
    assert "event: terminal" in data,data[:500]
    return data

server=ThreadingHTTPServer(("127.0.0.1",18081),Provider)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    c=Client();user=c.login("p1-b@example.invalid","CI-only-test-passphrase-123")
    other=Client();other.login("p1-a@example.invalid","CI-only-reset-passphrase-456")
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
    usage=c.call("GET",p+"/usage?from=20000101000000&to=20990101000000")
    assert len(usage)>=len(descriptors)+1 and any(x["totalTokens"]==15 for x in usage)
    assert all(x["inflightCount"]==0 for x in c.call("GET",p+"/budgets"))
    # A retry creates a new persisted run; same key cannot start another call.
    before=len(REQUESTS)
    retry_key=key()
    retry=c.call("POST",p+"/runs/"+run["id"]+"/retry",{"acknowledgeUnknown":True},key=retry_key)
    assert retry["id"]!=run["id"]
    assert c.call("POST",p+"/runs/"+run["id"]+"/retry",{"acknowledgeUnknown":True},key=retry_key)["id"]==retry["id"]
    wait(c,p,retry)
    assert len(REQUESTS)==before+1
    assert "Fixture answer" in event_text(c,p,retry)
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
    server.shutdown()
