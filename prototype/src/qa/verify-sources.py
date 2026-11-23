"""Verify self-contained source syntax, CSS tokens, and generated control markup."""
from pathlib import Path
import json
import re
import subprocess
import sys
from collections import Counter

root = Path(__file__).resolve().parent.parent
for source in root.glob('*.js'):
    result = subprocess.run(['node', '--check', str(source)], capture_output=True, text=True)
    if result.returncode:
        print(result.stderr)
        raise SystemExit(result.returncode)
print('PASS: JavaScript syntax for every application module.')
css = '\n'.join(p.read_text(encoding='utf-8') for p in root.glob('*.css'))
defined = set(re.findall(r'(--[\w-]+)\s*:', css))
used = set(re.findall(r'var\(\s*(--[\w-]+)', css))
missing = used - defined
if missing:
    raise SystemExit('Undefined CSS tokens: ' + ', '.join(sorted(missing)))
print('PASS: All CSS custom properties resolve to shared or component-owned tokens.')
def balanced_css(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    quote = None
    escaped = False
    stack = []
    for char in text:
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char in '{(':
            stack.append(char)
        elif char in '})':
            if not stack or stack.pop() != {'}':'{', ')':'('}[char]:
                return False
    return not stack and quote is None

for source in root.glob('*.css'):
    if not balanced_css(source.read_text(encoding='utf-8')):
        raise SystemExit('Unbalanced CSS delimiters: ' + source.name)
print('PASS: CSS delimiter integrity (not a browser CSS parser).')
for source in root.glob('*.js'):
    text = source.read_text(encoding='utf-8')
    if re.search(r'\b(?:alert|confirm|prompt)\s*\(', text):
        raise SystemExit('Native product dialog call: ' + source.name)
    if re.search(r'\beval\s*\(|new\s+Function\s*\(', text):
        raise SystemExit('Uncontrolled expression evaluation: ' + source.name)
print('PASS: No native product dialog calls or uncontrolled eval.')
snapshots = Path(__file__).resolve().parent / '.generated' / 'expanded-rendered.json'
if snapshots.exists():
    from html.parser import HTMLParser
    class ControlParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.ids = Counter()
            self.labels = []
            self.controls = []
            self.forms = []
            self.buttons = []
            self.label_depth = 0
        def handle_starttag(self, tag, attrs):
            attr = dict(attrs)
            if attr.get('id'):
                self.ids[attr['id']] += 1
            if tag == 'label':
                self.label_depth += 1
                if attr.get('for'):
                    self.labels.append(attr['for'])
            if tag in ('input','select','textarea') and attr.get('type') != 'hidden':
                self.controls.append((tag, attr, bool(self.label_depth)))
            if tag == 'button':
                self.buttons.append(attr)
            if tag == 'form':
                self.forms.append(attr)
        def handle_endtag(self, tag):
            if tag == 'label':
                self.label_depth = max(0, self.label_depth-1)
        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)
    problems = []
    pages = json.loads(snapshots.read_text(encoding='utf-8'))
    for page in pages:
        parser = ControlParser()
        parser.feed(page['html'])
        dup = [k for k, n in parser.ids.items() if n > 1]
        if dup:
            problems.append((page['route'], 'duplicate IDs', dup))
        for target in parser.labels:
            if target not in parser.ids:
                problems.append((page['route'], 'missing label target', target))
        for button in parser.buttons:
            if not ('data-action' in button or 'data-go' in button or 'disabled' in button or button.get('type') == 'submit'):
                problems.append((page['route'], 'button without action', str(button)[:120]))
        for form in parser.forms:
            if 'novalidate' not in form:
                problems.append((page['route'], 'missing novalidate', form.get('id')))
        for tag, attr, in_label in parser.controls:
            if not (attr.get('aria-label') or attr.get('aria-labelledby') or in_label or attr.get('id') in parser.labels):
                problems.append((page['route'], 'unlabelled control', tag + ': ' + str(attr)[:120]))
    if problems:
        print(json.dumps(problems, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    print(f'PASS: {len(pages)} rendered pages have unique IDs, label targets, named controls and app-owned forms.')
else:
    raise SystemExit('Missing rendered snapshots. Run node qa/integration.cjs from prototype/src before running python qa/verify-sources.py.')
print('NOTE: These checks do not verify browser layout, pointer behavior or focus.')
