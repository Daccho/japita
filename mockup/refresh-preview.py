"""Update the committed preview using the editable fragment, keeping its sandbox and CSP."""

import argparse
import base64
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
START = '<!-- JAPITA_MOCKUP_START -->'
END = '<!-- JAPITA_MOCKUP_END -->'
IMAGE_START = '/* JAPITA_IMAGES_START */'
IMAGE_END = '/* JAPITA_IMAGES_END */'


def embed_images(fragment):
    if fragment.count(IMAGE_START) != 1 or fragment.count(IMAGE_END) != 1:
        raise ValueError('Mockup must contain exactly one image asset block.')
    assets = {
        image.stem: 'data:image/webp;base64,' + base64.b64encode(image.read_bytes()).decode('ascii')
        for image in sorted((ROOT / 'assets').glob('*.webp'))
    }
    required = {'japita-logo', 'kumo-demo-logo', 'fresh-noodles', 'frozen-noodles'}
    if not required.issubset(assets):
        raise ValueError('Required mockup images are missing from mockup/assets/.')
    before, rest = fragment.split(IMAGE_START, 1)
    _, after = rest.split(IMAGE_END, 1)
    return before + IMAGE_START + '\n      const imageAssets = ' + json.dumps(assets, separators=(',', ':')) + ';\n      ' + IMAGE_END + after


class DocumentPolicy(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csp = []
        self.sandbox = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.csp.append(attrs['content'])
        if tag == 'iframe' and attrs.get('id') == 'codex-visualization':
            self.sandbox = attrs.get('sandbox')


def policy(document):
    result = DocumentPolicy()
    result.feed(document)
    return result


def refresh(check=False):
    preview = ROOT / 'index.html'
    existing = preview.read_text(encoding='utf-8')
    source = ROOT / 'japita-workspace.html'
    saved_fragment = source.read_text(encoding='utf-8').strip()
    fragment = embed_images(saved_fragment)
    match = re.search(r'\bdata-srcdoc="([^"]*)"', existing)
    if not match:
        raise ValueError('Preview must contain the sandboxed data-srcdoc iframe.')
    inner = html.unescape(match.group(1))
    if inner.count(START) != 1 or inner.count(END) != 1:
        raise ValueError('Preview must contain exactly one pair of mockup source markers.')
    before, rest = inner.split(START, 1)
    _, after = rest.split(END, 1)
    updated_inner = before + START + '\n' + fragment + '\n' + END + after
    updated = existing[:match.start(1)] + html.escape(updated_inner, quote=True) + existing[match.end(1):]
    outer_before, outer_after = policy(existing), policy(updated)
    inner_before, inner_after = policy(inner), policy(updated_inner)
    if outer_before.sandbox != 'allow-scripts' or outer_after.sandbox != 'allow-scripts':
        raise ValueError('The iframe sandbox must remain allow-scripts.')
    if not outer_before.csp or outer_before.csp != outer_after.csp:
        raise ValueError('The outer Content-Security-Policy changed.')
    if not inner_before.csp or inner_before.csp != inner_after.csp:
        raise ValueError('The iframe Content-Security-Policy changed.')
    if check:
        if updated != existing or fragment != saved_fragment:
            raise SystemExit('Preview is out of date. Run python mockup/refresh-preview.py.')
        print('Preview matches its source; iframe sandbox and both CSPs are intact.')
    else:
        if fragment != saved_fragment:
            source.write_text(fragment + '\n', encoding='utf-8')
        preview.write_text(updated, encoding='utf-8')
        print(preview)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify without writing files.')
    refresh(check=parser.parse_args().check)
