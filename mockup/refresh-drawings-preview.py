"""Export the read-only illustration review from the single shared SVG library."""
import html
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from japita.drawings_library import drawing_svg, library

manifest = library()
groups = list(dict.fromkeys(d["group"] for d in manifest["drawings"]))
sections = []
for group in groups:
    cards = []
    for drawing in manifest["drawings"]:
        if drawing["group"] != group:
            continue
        svg = drawing_svg(drawing["key"])
        for color in manifest["palette"].values():
            svg = svg.replace('"' + color["color"] + '"', '"var(' + color["token"] + ')"')
        svg = svg.replace('<svg ', '<svg aria-hidden="true" ')
        revised = '<span class="revised">Revised</span>' if drawing.get('revised') else ''
        cards.append('<article><h3>' + html.escape(drawing["name"]) + revised + '</h3><div class="sizes">'
                     '<figure class="small">' + svg + '<figcaption>48px</figcaption></figure>'
                     '<figure class="large">' + svg + '<figcaption>128px</figcaption></figure></div>'
                     '<p>' + ('Supplied reference' if drawing["reference"] else 'Library') + ' · '
                     + html.escape(' · '.join(drawing["aliases"])) + '</p></article>')
    sections.append('<section><h2>' + html.escape(group) + '</h2><div class="grid">' + ''.join(cards) + '</div></section>')
css = """
:root{--aj-yolk:#F4BC2B;--aj-container:#3A332B;--aj-chili:#E0482B;--aj-ink:#1E1B18;color-scheme:light}
*{box-sizing:border-box}body{margin:0;padding:32px;background:#F5F4F0;color:var(--aj-ink);font:15px/1.5 system-ui,sans-serif}main{max-width:1200px;margin:auto}header{border-bottom:2px solid var(--aj-ink);padding-bottom:20px}h1{font-size:32px;margin:4px 0}h2{margin:32px 0 12px}h3{font-size:15px;margin:0}p{color:#625B52}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px}article{padding:18px 0;border-bottom:1px solid #D8D2C8}.sizes{display:flex;align-items:end;justify-content:space-evenly;gap:28px;min-height:180px}figure{margin:16px 0 0;text-align:center}svg{display:block;overflow:visible;margin:0 auto 12px}.small svg{width:48px;height:48px;transform:scale(1.2)}.large svg{width:128px;height:128px}.sizes figcaption{font-size:12px;color:#625B52}article p{font-size:12px;overflow-wrap:anywhere}@media(max-width:480px){body{padding:20px}.grid{grid-template-columns:1fr}}
"""
css += '.revised{display:inline-block;margin-left:8px;padding:1px 5px;border:1px solid #D8D2C8;border-radius:4px;font:500 11px/1.4 system-ui,sans-serif;color:#625B52}'
logo = (ROOT / 'mockup/assets/japita-logo-ajitama-flat.svg').read_text(encoding="utf-8")
logo = logo.replace('<svg ', '<svg role="img" aria-label="Japita" ')
revised_count = sum(bool(d.get('revised')) for d in manifest['drawings'])
document = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Japita product drawings review</title><style>' + css + '</style><main><header>' + logo + '<p>Japita · illustration review</p><h1>Product drawing library</h1><p>' + str(len(manifest["drawings"])) + ' drawings · ' + str(revised_count) + ' revised · 48px and 128px. Product photos remain unchanged pending approval.</p></header>' + ''.join(sections) + '</main></html>\n'
target = ROOT / 'mockup/drawings-preview.html'
target.write_text(document, encoding="utf-8")
print(target)
