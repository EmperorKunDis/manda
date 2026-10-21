#!/usr/bin/env python3
"""Local, dependency-free HTTP server for the offline 3D study."""
import hashlib
import http.server
import json
import os
from pathlib import Path
import socket
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
IDENTITY=hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]
STATE=Path(tempfile.gettempdir())/f'manda-syncdrive-{IDENTITY}.json'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(WEB),**kwargs)
    def do_GET(self):
        if self.path=='/__syncdrive_health':
            body=json.dumps({'identity':IDENTITY,'root':str(ROOT)}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            return
        return super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

def main():
    try:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',18876),Handler)
    except OSError:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    port=server.server_address[1]
    data={'identity':IDENTITY,'port':port,'pid':os.getpid(),'root':str(ROOT)}
    temporary=STATE.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data),encoding='utf8')
    temporary.replace(STATE)
    print(f'http://127.0.0.1:{port}/',flush=True)
    try:server.serve_forever(poll_interval=.25)
    finally:
        server.server_close()
        try:
            if json.loads(STATE.read_text()).get('pid')==os.getpid():STATE.unlink()
        except (OSError,ValueError):pass

if __name__=='__main__':main()
