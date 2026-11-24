"""Isolated process and middleware recovery checks, never run against production."""
import http.cookiejar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"
JAR = os.environ.get("PEACHAGENT_TEST_API_JAR", "")
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}
REQUESTS = {}
LOCK = threading.Lock()
RELEASE = threading.Event()


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                 urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def call(self, method, path, data=None, expected=200, key=None):
        headers = {"Origin": ORIGIN, "Content-Type": "application/json"}
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        if key:
            headers["Idempotency-Key"] = key
        request = urllib.request.Request(BASE + "/api/v1" + path, method=method,
                  data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            with self.opener.open(request, timeout=45) as response:
                status, body = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
        assert status == expected, (method, path, status, expected, body[:200])
        return json.loads(body) if body else None

    def login(self):
        user = self.call("POST", "/auth/login", {"email":"p1-b@example.invalid",
                         "password":"CI-only-test-passphrase-123","remember":False})
        self.csrf = user["csrfToken"]
        return user


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        marker = payload["messages"][-1]["content"]
        with LOCK:
            REQUESTS[marker] = REQUESTS.get(marker, 0) + 1
        if marker == "api-restart":
            time.sleep(3)
        if marker == "database-outage":
            RELEASE.wait(65)
        body = (b'data: {"choices":[{"delta":{"content":"Recovery fixture"}}]}\n\n'
                b'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n'
                b'data: [DONE]\n\n')
        try:
            self.send_response(200)
            self.send_header("Content-Type","text/event-stream")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


def compose(*args):
    subprocess.run(["docker","compose","-f","compose.dev.yml",*args],check=True,timeout=150)


def wait_health(proc):
    end = time.monotonic()+90
    while time.monotonic()<end:
        assert proc.poll() is None, "Restarted API exited"
        try:
            with urllib.request.urlopen(BASE+"/actuator/health",timeout=3) as response:
                if json.load(response).get("status")=="UP":
                    return
        except OSError:
            pass
        time.sleep(.5)
    raise AssertionError("API health timeout")


def wait_dispatch(marker):
    end=time.monotonic()+20
    while time.monotonic()<end:
        with LOCK:
            if REQUESTS.get(marker,0):
                assert REQUESTS[marker]==1
                return
        time.sleep(.05)
    raise AssertionError(("Provider dispatch timeout",marker))


def wait_run(client, scope, run, expected, timeout=70):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        detail=client.call("GET",scope+"/runs/"+run["id"])
        if detail["status"] in TERMINAL:
            assert detail["status"]==expected,detail
            return detail
        time.sleep(.25)
    raise AssertionError(("Run terminal timeout",run["id"]))


def fail_closed(client,path):
    request=urllib.request.Request(BASE+"/api/v1"+path,headers={"Origin":ORIGIN})
    try:
        with client.opener.open(request,timeout=45) as response:
            raise AssertionError(("Protected API succeeded during middleware outage",response.status))
    except urllib.error.HTTPError as error:
        assert error.code in {401,403,500,502,503,504},error.code
    except (urllib.error.URLError,TimeoutError,ConnectionError):
        # A connection failure is not a successful authorization.
        pass


def submit(client,p,model,marker):
    return client.call("POST",p+"/models/"+model+"/debug",
                       {"input":{"text":marker},"audioBase64":None,"maxOutputTokens":32},
                       key=uuid.uuid4().hex)


def main():
    assert os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("PEACHAGENT_ISOLATED_FAULT_TEST")=="1"
    assert os.environ.get("DB_URL")=="jdbc:mysql://127.0.0.1:3306/peachagent" and Path(JAR).is_file()
    pid=int(os.environ["PEACHAGENT_TEST_API_PID"])
    args=Path("/proc/"+str(pid)+"/cmdline").read_bytes().split(b"\0")
    assert b"--spring.profiles.active=api" in args and os.fsencode(JAR) in args,"Refuse to kill non-QA API"
    server=ThreadingHTTPServer(("127.0.0.1",18081),Fixture)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    api=None
    log=None
    try:
        client=Client()
        user=client.login()
        w="/workspaces/"+user["defaultWorkspaceId"]
        # Use a fresh real project so rollover fixtures and default budget limits are not reused.
        project=client.call("POST",w+"/projects",{"name":"Middleware recovery QA","description":""},201)
        p=w+"/projects/"+project["id"]
        provider=client.call("POST",w+"/providers",{"name":"Middleware QA fixture","vendorKey":"fixture",
                     "baseUrl":"http://127.0.0.1:18081","authMethod":"NONE","credentialId":None,
                     "protocolConfig":{},"timeoutMs":60000,"enabled":True,"rowVersion":None})
        model=client.call("POST",w+"/models",{"providerId":provider["id"],"name":"Middleware QA LLM",
                    "externalModelId":"fault","modelType":"LLM","protocolKey":"openai.chat-completions","protocolVersion":"v1",
                    "protocolOptions":{},"capabilities":{},"modelOptions":{"maxOutputTokens":32},
                    "pricing":{"currency":"USD","perRequest":.01},"enabled":True,"rowVersion":None})
        client.call("POST",p+"/model-bindings",{"modelId":model["id"],"active":True})
        run=submit(client,p,model["id"],"api-restart")
        wait_dispatch("api-restart")
        os.kill(pid,signal.SIGKILL)
        log=open("api-recovery.log","w",encoding="utf-8")
        api=subprocess.Popen(["java","-jar",JAR,"--spring.profiles.active=api",
                              "--spring.web.resources.static-locations=file:"+str(Path("frontend/dist").resolve())+"/"],
                              stdout=log,stderr=subprocess.STDOUT)
        wait_health(api)
        client=Client()
        client.login()
        wait_run(client,p,run,"SUCCEEDED")
        assert REQUESTS["api-restart"]==1
        print("PASS: API process SIGKILL/restart does not interrupt or replay a dispatched Worker run",flush=True)

        # Redis is temporarily unavailable: protected requests must not succeed.
        compose("stop","-t","2","redis")
        try:
            fail_closed(client,"/auth/me")
        finally:
            compose("up","-d","--wait","redis")
        client=Client()
        client.login()
        assert client.call("GET",p+"/runs/"+run["id"])["status"]=="SUCCEEDED"
        print("PASS: Redis outage fails closed; login and persisted runs recover",flush=True)

        lost=submit(client,p,model["id"],"database-outage")
        wait_dispatch("database-outage")
        compose("stop","-t","2","mysql")
        try:
            fail_closed(client,p+"/runs/"+lost["id"])
            # Ensure the original 30-second lease has expired while DB remains unavailable.
            time.sleep(35)
        finally:
            RELEASE.set()
            compose("up","-d","--wait","mysql")
        client=Client()
        client.login()
        detail=wait_run(client,p,lost,"INTERRUPTED",timeout=90)
        assert detail["errorCode"]=="WORKER_INTERRUPTED" and REQUESTS["database-outage"]==1,detail
        records=client.call("GET",p+"/usage?from=20000101000000&to=20990101000000")
        ledger=[row for row in records if row["runId"]==lost["id"]]
        assert len(ledger)==1 and ledger[0]["status"]=="UNKNOWN"
        assert all(row["inflightCount"]==0 for row in client.call("GET",p+"/budgets"))
        print("PASS: MySQL outage expires a dispatched lease, retains exactly one uncertain ledger, releases slots",flush=True)

        # Recreate the actual containers, retaining named volumes, then authenticate afresh.
        compose("up","-d","--force-recreate","--wait","mysql","redis")
        client=Client()
        client.login()
        assert client.call("GET",p+"/runs/"+run["id"])["status"]=="SUCCEEDED"
        assert client.call("GET",p+"/runs/"+lost["id"])["status"]=="INTERRUPTED"
        final=submit(client,p,model["id"],"after-recreate")
        wait_run(client,p,final,"SUCCEEDED")
        assert REQUESTS["after-recreate"]==1
        assert all(row["inflightCount"]==0 for row in client.call("GET",p+"/budgets"))
        print("PASS: named-volume container recreation preserves runs and new Runtime execution succeeds",flush=True)
    finally:
        RELEASE.set()
        if api is not None:
            api.terminate()
            try:
                api.wait(timeout=20)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait(timeout=10)
        if log is not None:
            log.close()
        server.shutdown()
        server.server_close()


if __name__=="__main__":
    main()
