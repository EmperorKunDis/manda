#!/usr/bin/env python3
"""Bundle the viewer and its local assets into a double-clickable HTML file."""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'


def data_url(path, mime='text/javascript'):
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def build():
    modules = {
        'motor-core': data_url(WEB / 'vendor/three.core.js'),
        'motor-controls': data_url(WEB / 'vendor/controls/OrbitControls.js'),
        'motor-geometry': data_url(WEB / 'vendor/utils/BufferGeometryUtils.js'),
        'motor-disassembly': data_url(WEB / 'disassembly.js'),
    }
    three = (WEB / 'vendor/three.module.js').read_text().replace("'./three.core.js'", "'motor-core'")
    modules['three'] = 'data:text/javascript;base64,' + base64.b64encode(three.encode()).decode()
    loader = (WEB / 'vendor/loaders/GLTFLoader.js').read_text().replace(
        "'../utils/BufferGeometryUtils.js'", "'motor-geometry'")
    modules['motor-loader'] = 'data:text/javascript;base64,' + base64.b64encode(loader.encode()).decode()
    app = (WEB / 'app.js').read_text().replace(
        "'./vendor/controls/OrbitControls.js'", "'motor-controls'").replace(
        "'./vendor/loaders/GLTFLoader.js'", "'motor-loader'").replace(
        "'./disassembly.js'", "'motor-disassembly'").replace(
        "'./export/parts_metadata.json'", json.dumps(data_url(WEB / 'export/parts_metadata.json', 'application/json'))).replace(
        "'./export/syncdrive_sport.glb'", json.dumps(data_url(WEB / 'export/syncdrive_sport.glb', 'model/gltf-binary')))
    html = (WEB / 'index.html').read_text().replace(
        '<html lang="cs">', '<html lang="cs">\n<!--\nThree.js r180\n' + (WEB / 'vendor/LICENSE-three.txt').read_text() + '\n-->').replace(
        '<link rel="stylesheet" href="./style.css?v=praut-1">', '<style>' + (WEB / 'style.css').read_text() + '</style>').replace(
        '<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>',
        '<script type="importmap">' + json.dumps({'imports': modules}) + '</script>').replace(
        '<script type="module" src="./app.js"></script>',
        '<script type="module">' + app.replace('</script', '<\\/script') + '</script>')
    target = ROOT / 'Motor.html'
    target.write_text(html, encoding='utf8')
    print(f'{target} ({target.stat().st_size:,} bytes)')


if __name__ == '__main__':
    build()
