import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp-ptcg" / "data_en"
OUT = ROOT / "data" / "en-catalog-v21.json"

cards = []
errors = 0

files = list(SOURCE.rglob("*.json"))

print(f"Archivos encontrados: {len(files)}")

for i, path in enumerate(files, 1):

    try:
        data = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

        # Por si algún fichero contiene lista
        items = (
            data
            if isinstance(data, list)
            else [data]
        )

        for c in items:

            if not isinstance(c, dict):
                continue

            name = str(
                c.get("name") or ""
            ).strip()

            number = str(
                c.get("number") or ""
            ).strip()

            if not name:
                continue

            cards.append({
                "n": name,
                "s": str(
                    c.get("set_code") or ""
                ).strip(),
                "sf": str(
                    c.get("set_full_name") or
                    c.get("set_name") or ""
                ).strip(),
                "sr": str(
                    c.get("series") or ""
                ).strip(),
                "num": number,
                "total": c.get("set_total"),
                "img": str(
                    c.get("img") or ""
                ).strip(),
                "r": str(
                    c.get("rarity") or ""
                ).strip(),
                "ct": str(
                    c.get("card_type") or ""
                ).strip(),
                "hp": c.get("hp"),
                "t": c.get("types") or [],
                "stage": str(
                    c.get("stage") or ""
                ).strip(),
                "url": str(
                    c.get("url") or ""
                ).strip(),
            })

    except Exception as exc:
        errors += 1
        print(
            f"ERROR {path.name}: {exc}"
        )


# Quitar duplicados exactos
unique = {}
for card in cards:

    key = (
        card["n"].lower(),
        card["s"].upper(),
        str(card["num"]).upper(),
        str(card["total"])
    )

    # Si hay duplicados, preferimos el que tenga imagen
    previous = unique.get(key)

    if (
        previous is None or
        (
            not previous.get("img")
            and card.get("img")
        )
    ):
        unique[key] = card


cards = list(unique.values())

cards.sort(
    key=lambda x: (
        x["n"].lower(),
        x["s"],
        str(x["num"])
    )
)


OUT.write_text(
    json.dumps(
        cards,
        ensure_ascii=False,
        separators=(",", ":")
    ),
    encoding="utf-8"
)

print("")
print("✅ Catálogo inglés PokEX creado")
print(f"   Cartas: {len(cards)}")
print(f"   Errores: {errors}")
print(
    f"   Tamaño: {OUT.stat().st_size / 1024 / 1024:.2f} MB"
)
print(f"   Ruta: {OUT}")
