import json
import urllib.request
from pathlib import Path

root = Path.cwd()

with urllib.request.urlopen(
    "https://api.tcgdex.net/v2/en/cards",
    timeout=40
) as r:
    tcgdex = json.load(r)

secondary = json.loads(
    (root / "data" / "en-catalog-v21.json")
    .read_text(encoding="utf-8")
)

missing = [
    c for c in tcgdex
    if not c.get("image")
]

print("TCGdex EN total:", len(tcgdex))
print("TCGdex EN sin imagen:", len(missing))
print("Base secundaria:", len(secondary))
