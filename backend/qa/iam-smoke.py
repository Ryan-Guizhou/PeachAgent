"""Real HTTP + SMTP + MySQL/Redis identity checks. Only ephemeral CI credentials."""
import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def call(self, method, path, data=None, expected=200, origin=ORIGIN, csrf=True):
        headers = {"Origin": origin, "Content-Type": "application/json"}
        if csrf and self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(BASE + "/api/v1" + path, method=method,
                data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            with self.opener.open(req, timeout=15) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        assert status == expected, (method, path, status, expected, payload[:200])
        return json.loads(payload) if payload else None

def read_code(email, exclude=None):
    # Mailpit may still be warming up on a busy runner. Do not regenerate or bypass the challenge.
    for _ in range(120):
        with urllib.request.urlopen("http://127.0.0.1:8025/api/v1/messages", timeout=3) as response:
            messages = json.load(response).get("messages", [])
        for item in messages:
            if any(x.get("Address") == email for x in item.get("To", [])):
                with urllib.request.urlopen("http://127.0.0.1:8025/api/v1/message/" + item["ID"]) as response:
                    msg = json.load(response)
                match = re.search(r"\b[A-Za-z0-9_-]{43}\b", msg.get("Text", ""))
                if match and match.group() != exclude:
                    return match.group()
        time.sleep(0.5)
    raise AssertionError("Verification email not received")

def register(email):
    c = Client()
    c.call("POST", "/auth/email-challenges", {"email": email, "purpose": "REGISTER"}, 202)
    code = read_code(email)
    data = {"email": email, "token": code, "password": "CI-only-test-passphrase-123", "displayName": "QA", "currency": "USD"}
    c.call("POST", "/auth/register", data, 201)
    c.call("POST", "/auth/register", data, 422)
    login = c.call("POST", "/auth/login", {"email": email.upper(), "password": data["password"], "remember": False})
    c.csrf = login["csrfToken"]
    return c, login

a, ai = register("p1-a@example.invalid")
b, bi = register("p1-b@example.invalid")
assert ai["tenantId"] != bi["tenantId"]
aw, bw = ai["defaultWorkspaceId"], bi["defaultWorkspaceId"]
a.call("GET", "/workspaces/" + bw, expected=404)
b.call("GET", "/workspaces/" + aw + "/projects", expected=404)
a.call("POST", "/workspaces", {"name": "Second"}, 403, csrf=False)
a.call("POST", "/workspaces", {"name": "Second"}, 403, origin="https://other.invalid")
w = a.call("POST", "/workspaces", {"name": "Second"}, 201)
p = a.call("POST", "/workspaces/" + w["id"] + "/projects", {"name": "Second project"}, 201)
a.call("GET", "/workspaces/" + aw + "/projects/" + p["id"], expected=404)
a.call("PATCH", "/workspaces/" + w["id"], {"name": "Changed", "rowVersion": w["rowVersion"]})
a.call("PATCH", "/workspaces/" + w["id"], {"name": "Stale", "rowVersion": w["rowVersion"]}, 409)
a.call("POST", "/workspaces/" + aw + "/archive", {"rowVersion": 0}, 409)
a.call("POST", "/workspaces/" + w["id"] + "/projects/" + p["id"] + "/archive", {"rowVersion": p["rowVersion"]})
old_code = read_code("p1-a@example.invalid")
a.call("POST", "/auth/email-challenges", {"email":"p1-a@example.invalid","purpose":"RESET"}, 202)
new_code = read_code("p1-a@example.invalid", old_code)
a.call("POST", "/auth/password-reset", {"email":"p1-a@example.invalid","token":new_code,"password":"CI-only-reset-passphrase-456"}, 204)
a.call("GET", "/auth/me", expected=401)
a.call("POST", "/auth/login", {"email":"p1-a@example.invalid","password":"CI-only-test-passphrase-123","remember":False}, 401)
new_login=a.call("POST","/auth/login",{"email":"p1-a@example.invalid","password":"CI-only-reset-passphrase-456","remember":False})
a.csrf=new_login["csrfToken"]
a.call("GET","/admin/users",expected=403)
a.call("POST", "/auth/logout", {}, 204)
a.call("GET", "/auth/me", expected=401)
print("PASS: SMTP registration, one-time challenge, real cookie session, two tenants, workspace/project isolation, CSRF, optimistic lock, archive, password recovery and logout")
