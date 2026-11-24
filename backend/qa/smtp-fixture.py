"""Loopback-only SMTP inbox for disposable integration tests; never used by the application runtime."""
import email
from email import policy
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import socketserver
import threading
import uuid

HOST = "127.0.0.1"
SMTP_PORT = 1025
HTTP_PORT = 8025
MAX_MESSAGE_BYTES = 1024 * 1024
MESSAGES = deque(maxlen=1024)
LOCK = threading.Lock()


class SmtpHandler(socketserver.StreamRequestHandler):
    """Minimal SMTP transport for real verification mail, with no outbound delivery."""

    def reply(self, line):
        self.wfile.write((line + "\r\n").encode("ascii"))
        self.wfile.flush()

    def handle(self):
        self.request.settimeout(15)
        recipients = []
        sender = False
        self.reply("220 localhost PeachAgent test SMTP")
        while True:
            raw = self.rfile.readline(8193)
            if not raw or len(raw) > 8192:
                return
            command = raw.decode("ascii", errors="replace").strip()
            upper = command.upper()
            if upper.startswith(("EHLO ", "HELO ")):
                self.reply("250 localhost")
            elif upper.startswith("MAIL FROM:"):
                sender = True
                recipients.clear()
                self.reply("250 OK")
            elif upper.startswith("RCPT TO:") and sender:
                match = re.match(r"RCPT TO:\s*<([^<>]+)>", command, re.IGNORECASE)
                if not match or len(recipients) >= 10:
                    self.reply("501 Invalid recipient")
                    continue
                recipients.append(match.group(1))
                self.reply("250 OK")
            elif upper == "DATA" and sender and recipients:
                self.reply("354 End data with <CRLF>.<CRLF>")
                data = bytearray()
                while True:
                    line = self.rfile.readline(MAX_MESSAGE_BYTES + 1)
                    if not line:
                        return
                    if line in (b".\r\n", b".\n"):
                        break
                    if line.startswith(b".."):
                        line = line[1:]
                    data.extend(line)
                    if len(data) > MAX_MESSAGE_BYTES:
                        self.reply("552 Message too large")
                        return
                message = email.message_from_bytes(bytes(data), policy=policy.default)
                plain = message.get_body(preferencelist=("plain",))
                text = plain.get_content() if plain else ""
                with LOCK:
                    MESSAGES.appendleft({
                        "ID": uuid.uuid4().hex,
                        "To": [{"Address": address} for address in recipients],
                        "Text": text,
                    })
                sender = False
                recipients.clear()
                self.reply("250 Queued locally")
            elif upper == "RSET":
                sender = False
                recipients.clear()
                self.reply("250 OK")
            elif upper == "NOOP":
                self.reply("250 OK")
            elif upper == "QUIT":
                self.reply("221 Bye")
                return
            else:
                self.reply("503 Unsupported command or sequence")


class SmtpServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class InboxHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        # Never log verification codes or email contents.
        pass

    def do_GET(self):
        with LOCK:
            if self.path == "/api/v1/messages":
                result = {"messages": [{"ID": x["ID"], "To": x["To"]} for x in MESSAGES]}
            elif self.path.startswith("/api/v1/message/"):
                message_id = self.path.rsplit("/", 1)[-1]
                result = next((dict(x) for x in MESSAGES if x["ID"] == message_id), None)
            else:
                result = None
        if result is None:
            self.send_error(404)
            return
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    if os.environ.get("PEACHAGENT_TEST_SMTP") != "1":
        raise SystemExit("Explicit test-only opt-in required")
    with SmtpServer((HOST, SMTP_PORT), SmtpHandler) as smtp:
        with ThreadingHTTPServer((HOST, HTTP_PORT), InboxHandler) as inbox:
            threading.Thread(target=smtp.serve_forever, daemon=True).start()
            inbox.serve_forever()


if __name__ == "__main__":
    main()
