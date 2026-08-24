import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path.cwd()

TCGDEX = "https://api.tcgdex.net/v2/en"


def get_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "PokEX/2.1",
            "Accept": "application/json"
        }
    )

    with urllib.request.urlopen(
        req,
        timeout=60
    ) as r:
        return json.load(r)


def norm_text(value):
    value = str(value or "").strip()

    value = unicodedata.normalize(
        "NFKD",
        value
    )

    value = "".join(
        ch for ch in value
        if not unicodedata.combining(ch)
    )

    value = value.lower()

    value = re.sub(
        r"[^a-z0-9]+",
        "",
        value
    )

    return value


def norm_number(value):
    value = str(value or "").strip().upper()

    m = re.match(
        r"^([A-Z]*)(\d+)$",
        value
    )

    if not m:
        return value

    return (
        m.group(1)
        +
        str(int(m.group(2)))
    )


def set_id_from_card(card):
    card_id = str(
        card.get("id") or ""
    )

    local_id = str(
        card.get("localId") or ""
    )

    if not card_id:
        return ""

    if local_id:
        suffix = "-" + local_id

        if card_id.lower().endswith(
            suffix.lower()
        ):
            return card_id[
                :-len(suffix)
            ]

    # Respaldo
    if "-" in card_id:
        return card_id.rsplit("-", 1)[0]

    return ""


print("Descargando TCGdex...")

cards = get_json(
    f"{TCGDEX}/cards"
)

sets = get_json(
    f"{TCGDEX}/sets"
)


set_names = {
    str(s.get("id")):
        str(s.get("name") or "")
    for s in sets
}


secondary = json.loads(
    (
        ROOT /
        "data" /
        "en-catalog-v21.json"
    ).read_text(
        encoding="utf-8"
    )
)


# Índice estricto:
# nombre + numero + nombre completo del set
strict_index = {}

# Índice alternativo:
# nombre + numero
loose_index = {}


for rec in secondary:

    name = norm_text(
        rec.get("n")
    )

    number = norm_number(
        rec.get("num")
    )

    set_name = norm_text(
        rec.get("sf")
    )

    if not name or not number:
        continue

    strict_key = (
        name,
        number,
        set_name
    )

    strict_index.setdefault(
        strict_key,
        []
    ).append(rec)


    loose_key = (
        name,
        number
    )

    loose_index.setdefault(
        loose_key,
        []
    ).append(rec)


missing = [
    card
    for card in cards
    if not card.get("image")
]


fallback = {}

strict_matches = 0
unique_matches = 0
unmatched = 0


for card in missing:

    name = norm_text(
        card.get("name")
    )

    number = norm_number(
        card.get("localId")
    )

    set_id = set_id_from_card(
        card
    )

    set_name = norm_text(
        set_names.get(
            set_id,
            ""
        )
    )


    matches = strict_index.get(
        (
            name,
            number,
            set_name
        ),
        []
    )


    selected = None
    method = None


    if len(matches) == 1:

        selected = matches[0]
        method = "set+name+number"
        strict_matches += 1

    else:

        loose = loose_index.get(
            (
                name,
                number
            ),
            []
        )

        # Solo aceptamos nombre+número
        # si existe UNA única carta posible.
        if len(loose) == 1:

            selected = loose[0]
            method = "unique-name-number"
            unique_matches += 1


    if (
        selected and
        selected.get("img")
    ):

        fallback[
            card["id"]
        ] = {
            "image":
                selected["img"],

            "source":
                "PokEX EN",

            "method":
                method
        }

    else:

        unmatched += 1


out = (
    ROOT /
    "data" /
    "en-image-fallback-v21.json"
)

out.write_text(
    json.dumps(
        fallback,
        ensure_ascii=False,
        separators=(",", ":")
    ),
    encoding="utf-8"
)


print("")
print("✅ Análisis terminado")
print(
    "TCGdex sin imagen:",
    len(missing)
)
print(
    "Coincidencia exacta set+nombre+número:",
    strict_matches
)
print(
    "Coincidencia única nombre+número:",
    unique_matches
)
print(
    "Sin coincidencia segura:",
    unmatched
)
print(
    "Imágenes recuperables:",
    len(fallback)
)
print(
    "Tamaño fallback:",
    f"{out.stat().st_size / 1024:.1f} KB"
)

print("")
print("Ejemplos:")

for card_id, info in list(
    fallback.items()
)[:10]:

    print(
        card_id,
        "→",
        info["image"]
    )

