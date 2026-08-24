from pathlib import Path

p = Path("app.js")
s = p.read_text(encoding="utf-8")

old = '''    let results =
      searchLocal(translatedQ);

    /*
     * Si la traducción no da resultado,
     * probamos también el texto original.
     */
    if (
      !results.length &&
      translatedQ !== q
    ) {
      results = searchLocal(q);
    }
'''

new = '''    let results =
      searchLocal(translatedQ);

    /*
     * Si la traducción no da resultado,
     * probamos también el texto original.
     */
    if (
      !results.length &&
      translatedQ !== q
    ) {
      results = searchLocal(q);
    }


    /*
     * PokEX V2.1
     * ==============================
     * En japonés consultamos SIEMPRE:
     *
     * 1. TCGdex
     * 2. PokEX JP
     *
     * y fusionamos ambas bibliotecas.
     */
    if (
      langEl.value === "ja" &&
      window.PokEXJP
    ) {

      const jpExtra =
        await window.PokEXJP.search(
          translatedQ || q
        );

      results =
        window.PokEXJP.merge(
          results,
          jpExtra
        );
    }
'''

if old not in s:
    raise SystemExit(
        "❌ No encuentro el bloque de búsqueda multilingüe."
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

print("✅ TCGdex + PokEX JP conectados al buscador")
