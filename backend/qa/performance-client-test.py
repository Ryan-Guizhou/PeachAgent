"""Local HTTP contract tests for the read load generator; no middleware or real credentials."""
import http.cookiejar
import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

SPEC = importlib.util.spec_from_file_location("performance_smoke", Path(__file__).with_name("performance-smoke.py"))
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/login':
            return self.respond(200, {'ok': True}, cookie='PA_SESSION=fixture; Path=/; HttpOnly')
        if self.path == '/api/v1/redirect':
            return self.respond(302, {}, location='/api/v1/records')
        if self.headers.get('Cookie') != 'PA_SESSION=fixture':
            return self.respond(401, {})
        if self.path.startswith('/api/v1/records'):
            return self.respond(200, {'path': self.path, 'port': self.client_address[1]})
        return self.respond(404, {})

    def respond(self, status, value, cookie=None, location=None):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        if location:
            self.send_header('Location', location)
        self.end_headers()
        self.wfile.write(payload)


class ReadClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        smoke.BASE = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def source(self, login=True):
        jar = http.cookiejar.CookieJar()
        if login:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))
            with opener.open(smoke.BASE + '/login') as response:
                response.read()
        return SimpleNamespace(jar=jar, csrf=None)

    def test_connection_reuse_and_query(self):
        client = smoke.ReadClient(self.source())
        try:
            self.assertEqual(client.opened_connections, 0)
            first = client.call('/records?limit=50')
            second = client.call('/records?before=20200101000000')
            self.assertEqual(first['port'], second['port'])
            self.assertEqual(second['path'], '/api/v1/records?before=20200101000000')
            self.assertEqual(client.opened_connections, 1)
        finally:
            client.close()

    def test_redirect_is_not_followed(self):
        client = smoke.ReadClient(self.source())
        try:
            with self.assertRaisesRegex(AssertionError, '302'):
                client.call('/redirect')
        finally:
            client.close()

    def test_missing_cookie_fails(self):
        client = smoke.ReadClient(self.source(False))
        try:
            with self.assertRaisesRegex(AssertionError, '401'):
                client.call('/records')
        finally:
            client.close()


if __name__ == '__main__':
    unittest.main()
