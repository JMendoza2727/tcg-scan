from pathlib import Path

p = Path("pokedex-v1.js")
s = p.read_text(encoding="utf-8")

old = '''      const image =
        item.image
          ? `${item.image}/low.webp`
          : "";
'''

new = '''      const image =
        item.image
          ? (
              /\.(?:jpe?g|png|webp)(?:\\?.*)?$/i
                .test(item.image)
                ? item.image
                : `${item.image}/low.webp`
            )
          : "";
'''

if old not in s:
    raise SystemExit(
        "❌ No encuentro el bloque de imagen de Mi Pokédex."
    )

s = s.replace(
    old,
    new,
    1
)

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ Mi Pokédex acepta imágenes JP")
