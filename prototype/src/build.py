"""Create the offline, dependency-free HTML deliverable from this source tree."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')

def style(match):
    name = match.group(1)
    return '<style>\n/* ' + name + ' */\n' + (root / name).read_text(encoding='utf-8') + '\n</style>'

def script(match):
    name = match.group(1)
    content = (root / name).read_text(encoding='utf-8')
    if '</script' in content.lower():
        raise ValueError('Unexpected closing script token in ' + name)
    return '<script>\n/* ' + name + ' */\n' + content + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([\w.-]+)">', style, html)
html = re.sub(r'<script src="([\w.-]+)"></script>', script, html)
target = root.parent / 'OTRYX_Studio.html'
target.write_text(html, encoding='utf-8')
print(f'Created {target.name} ({target.stat().st_size:,} bytes).')
