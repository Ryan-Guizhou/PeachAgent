"""Verify Redis-backed Sa-Token sessions survive an API process restart."""
import json
import os
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"
ORIGIN = "http://localhost:8080"

with open(os.environ["PEACHAGENT_REDIS_SESSION_FILE"], encoding="utf-8") as source:
    session = json.load(source)

assert session.get("cookie"), "Session cookie was not captured"
assert session.get("csrfToken"), "Session CSRF token was not captured"


def call(method, path, expected):
    headers = {"Origin": ORIGIN, "Content-Type": "application/json", "Cookie": session["cookie"]}
    if method not in ("GET", "HEAD", "OPTIONS"):
        headers["X-CSRF-Token"] = session["csrfToken"]
    request = urllib.request.Request(BASE + "/api/v1" + path, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status, payload = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, payload = error.code, error.read()
    assert status == expected, (method, path, status, expected, payload[:200])
    return json.loads(payload) if payload else None


profile = call("GET", "/auth/me", 200)
assert profile["email"] == "p1-a@example.invalid", profile
call("POST", "/auth/logout", 204)
call("GET", "/auth/me", 401)
print("PASS: Redis-backed Sa-Token session survives API restart and logout invalidates it")
