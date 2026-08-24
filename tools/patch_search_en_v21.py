from pathlib import Path

p = Path("app.js")
s = p.read_text(
    encoding="utf-8"
)

needle = '''    showSearchResults(results);'''

addition = '''    /*
     * PokEX V2.1 · catálogo inglés ampliado
     */
    if (
      langEl.value === "en" &&
      window.PokEXEN
    ) {

      const enExtra =
        await window.PokEXEN.search(
          translatedQ || q
        );

      results =
        window.PokEXEN.merge(
          results,
          enExtra
        );
    }

    showSearchResults(results);'''

if needle not in s:
    raise SystemExit(
        "No encuentro showSearchResults"
    )

s = s.replace(
    needle,
    addition,
    1
)

p.write_text(
    s,
    encoding="utf-8"
)

print(
    "✅ TCGdex + PokEX EN fusionados"
)
