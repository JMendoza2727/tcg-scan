from pathlib import Path
import re

p = Path("index.html")
s = p.read_text(encoding="utf-8")

s = re.sub(
    r'<script[^>]*jp-extra-v21\.js[^>]*></script>',
    '',
    s
)

marker = re.search(
    r'<script[^>]*src=["\'][^"\']*app\.js[^"\']*["\'][^>]*></script>',
    s
)

if not marker:
    raise SystemExit(
        "❌ No encuentro el script app.js"
    )

tag = marker.group(0)

s = s.replace(
    tag,
    '<script src="./jp-extra-v21.js?v=211"></script>\n' +
    tag,
    1
)

s = re.sub(
    r'app\.js\?v=[^"\']+',
    'app.js?v=211',
    s
)

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ PokEX JP cargado antes de app.js")
