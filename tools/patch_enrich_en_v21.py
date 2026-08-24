from pathlib import Path

p = Path("app.js")
s = p.read_text(
    encoding="utf-8"
)

needle = '''    const card = await r.json();'''

replacement = '''    const card = await r.json();

    if (
      langEl.value === "en" &&
      window.PokEXEN &&
      !card.image
    ) {

      await window.PokEXEN
        .enrich(card);
    }'''

if needle not in s:
    raise SystemExit(
        "No encuentro const card = await r.json()"
    )

s = s.replace(
    needle,
    replacement,
    1
)

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ Fallback de imagen EN instalado")
