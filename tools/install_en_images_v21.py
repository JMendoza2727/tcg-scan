from pathlib import Path
import re

p = Path("index.html")
s = p.read_text(encoding="utf-8")

s = re.sub(
    r'<script[^>]*en-images-v21\.js[^>]*></script>',
    '',
    s
)

m = re.search(
    r'<script[^>]*src=["\'][^"\']*app\.js[^"\']*["\'][^>]*></script>',
    s
)

if not m:
    raise SystemExit("❌ No encuentro app.js")

tag = m.group(0)

s = s.replace(
    tag,
    '<script src="./en-images-v21.js?v=212"></script>\n' + tag,
    1
)

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ Respaldo EN conectado")
