"""Verify actual Flyway demo data through the ordinary HTTP login and authorization paths."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080/api/v1"
ORIGIN = "http://localhost:8080"
DEMO_ADMIN = "admin@peachagent.example.invalid"
DEMO_USER = "user@peachagent.example.invalid"


class Client:
    def __init__(self):
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.csrf = None

    def call(self, method, path, data=None, expected=200):
        headers = {"Origin": ORIGIN, "Content-Type": "application/json"}
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(
            BASE + path, method=method, headers=headers,
            data=None if data is None else json.dumps(data).encode("utf-8"),
        )
        try:
            with self.opener.open(req, timeout=15) as response:
                status, body = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
        # Do not print response bodies or credentials on failure.
        assert status == expected, (method, path, status, expected)
        return json.loads(body) if body else None

    def login(self, email, demo_password, expected=200):
        info = self.call("POST", "/auth/login", {
            "email": email, "password": demo_password, "remember": False,
        }, expected)
        if expected == 200:
            self.csrf = info["csrfToken"]
            assert self.call("GET", "/auth/me")["userId"] == info["userId"]
        return info


def verify_account(client, info, role, expected_name):
    assert info["platformRole"] == role
    spaces = client.call("GET", "/workspaces")
    assert len(spaces) == 1
    space = spaces[0]
    assert space["id"] == info["defaultWorkspaceId"]
    assert space["name"] == expected_name
    projects = client.call("GET", f"/workspaces/{space['id']}/projects")
    assert len(projects) == 1
    project = projects[0]
    assert project["id"] == space["defaultProjectId"]
    budgets = client.call("GET", f"/workspaces/{space['id']}/projects/{project['id']}/budgets")
    assert {row["scopeType"]: row["maxConcurrency"] for row in budgets} == {
        "TENANT": 8, "WORKSPACE": 4, "PROJECT": 2,
    }
    assert all(row["maxRunSeconds"] == 180 for row in budgets)
    return space


def main():
    mode = sys.argv[1]
    # The strings below are public synthetic dev fixture passwords, never real credentials.
    admin_password = "PeachAgent-Dev-Admin-2026!"
    user_password = "PeachAgent-Dev-User-2026!"
    if mode == "normal":
        Client().login(DEMO_ADMIN, admin_password, 401)
        Client().login(DEMO_USER, user_password, 401)
        print("PASS: normal API contains no default login accounts")
        return

    assert mode in ("initial", "restart")
    admin, user = Client(), Client()
    ai = admin.login(DEMO_ADMIN, admin_password)
    ui = user.login(DEMO_USER, user_password)
    assert ai["tenantId"] != ui["tenantId"]
    aw = verify_account(admin, ai, "ADMIN", "默认工作空间")
    uw = verify_account(user, ui, "USER", "默认工作空间" if mode == "initial" else "Retained local edit")
    admin.call("GET", "/admin/users")
    user.call("GET", "/admin/users", expected=403)
    admin.call("GET", f"/workspaces/{uw['id']}", expected=404)
    user.call("GET", f"/workspaces/{aw['id']}", expected=404)
    Client().login(DEMO_USER, "not-the-demo-password", 401)

    if mode == "initial":
        user.call("PATCH", f"/workspaces/{uw['id']}", {
            "name": "Retained local edit", "rowVersion": uw["rowVersion"],
        })
    admin.call("POST", "/auth/logout", {}, 204)
    user.call("POST", "/auth/logout", {}, 204)
    print(f"PASS: {mode} demo login, roles, tenant isolation, default resources, and budgets")


if __name__ == "__main__":
    main()
