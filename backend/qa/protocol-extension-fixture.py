"""Isolated HTTP fixture for an independently discovered protocol adapter."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading

CALLS=0
LOCK=threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):
        pass

    def reply(self,status,body):
        data=json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(data)))
        self.send_header("X-Request-ID","qa-native-fixture")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path=="/health":
            self.reply(200,{"status":"UP"})
        elif self.path=="/count":
            with LOCK:
                self.reply(200,{"count":CALLS})
        else:
            self.reply(404,{})

    def do_POST(self):
        global CALLS
        if self.path!="/qa/completion" or self.headers.get("Authorization") or self.headers.get("x-api-key"):
            self.reply(400,{"error":"Invalid protocol route"})
            return
        value=json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if value!={"model":"fixture-native","text":"extension test","prefix":"QA:","repeat":2}:
            self.reply(422,{"error":"Invalid fixture request"})
            return
        with LOCK:
            CALLS+=1
        self.reply(200,{"text":(value["prefix"]+value["text"])*value["repeat"],"inputTokens":4,"outputTokens":2})


if __name__=="__main__":
    assert os.environ.get("PEACHAGENT_ISOLATED_PROTOCOL_TEST")=="1"
    ThreadingHTTPServer(("127.0.0.1",18081),Handler).serve_forever()
