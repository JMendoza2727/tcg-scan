import json
import urllib.request
from pathlib import Path

fallback = json.loads(
    Path("data/en-image-fallback-v21.json").read_text(encoding="utf-8")
)

with urllib.request.urlopen(
    "https://api.tcgdex.net/v2/en/cards",
    timeout=40
) as r:
    cards = json.load(r)

by_id = {
    c["id"]: c
    for c in cards
}

print("\nPRUEBA ESTAS CARTAS EN POKEX:\n")

shown = 0

for card_id in fallback:
    card = by_id.get(card_id)

    if not card:
        continue

    print(
        f'{card["name"]} - {card.get("localId","?")}   [{card_id}]'
    )

    shown += 1

    if shown >= 15:
        break
