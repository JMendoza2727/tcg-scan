from pathlib import Path

p = Path("app.js")
s = p.read_text(encoding="utf-8")

needle = '''    showSearchResults(results);'''

replacement = '''    /*
     * PokEX V2.1:
     * completamos imágenes inglesas faltantes
     * sin modificar el catálogo ni los resultados.
     */
    if (
      langEl.value === "en" &&
      window.PokEXENImages
    ) {

      await window.PokEXENImages
        .apply(results);
    }

    showSearchResults(results);'''

if needle not in s:
    raise SystemExit(
        "❌ No encuentro showSearchResults(results)"
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

print("✅ Imágenes EN conectadas al buscador")
