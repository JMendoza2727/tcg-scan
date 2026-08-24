from pathlib import Path

p = Path("app.js")
s = p.read_text(encoding="utf-8")

start = s.index("async function openCard(id) {")

pos = s.index(
    "const card = await r.json();",
    start
)

insert_pos = (
    pos +
    len("const card = await r.json();")
)

addition = '''

    if (
      langEl.value === "en" &&
      window.PokEXENImages
    ) {

      await window.PokEXENImages
        .applyOne(card);
    }
'''

s = (
    s[:insert_pos] +
    addition +
    s[insert_pos:]
)

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ Imágenes EN conectadas a las fichas")
