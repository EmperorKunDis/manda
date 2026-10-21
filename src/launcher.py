#!/usr/bin/env python3
"""Open existing SyncDrive server or start a fresh isolated one."""
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
IDENTITY=hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]
STATE=Path(tempfile.gettempdir())/f'manda-syncdrive-{IDENTITY}.json'
LOG=Path(tempfile.gettempdir())/f'manda-syncdrive-{IDENTITY}.log'

def active_port():
    try:
        info=json.loads(STATE.read_text(encoding='utf8'))
        if info.get('identity')!=IDENTITY:return None
        port=int(info['port'])
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/__syncdrive_health',timeout=.5) as response:
            health=json.load(response)
        return port if health.get('identity')==IDENTITY and health.get('root')==str(ROOT) else None
    except (OSError,ValueError,KeyError,TimeoutError):return None

def main():
    # The standalone bundle also works when local HTTP servers are unavailable.
    offline = ROOT / 'Motor.html'
    if offline.is_file():
        print(f'Otevírám {offline}')
        return subprocess.run(['open', str(offline)], check=False).returncode
    port=active_port()
    if port is None:
        with LOG.open('a',encoding='utf8') as log:
            subprocess.Popen([sys.executable,str(ROOT/'src'/'serve.py')],cwd=str(ROOT),
                             stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
        for _ in range(60):
            time.sleep(.1)
            port=active_port()
            if port is not None:break
    if port is None:
        print(f'Server se nepodařilo spustit. Podrobnosti: {LOG}',file=sys.stderr)
        return 1
    url=f'http://127.0.0.1:{port}/'
    print(f'Otevírám {url}')
    subprocess.run(['open',url],check=False)
    return 0

if __name__=='__main__':raise SystemExit(main())
