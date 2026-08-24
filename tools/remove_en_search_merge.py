from pathlib import Path
import re

p = Path("app.js")
s = p.read_text(encoding="utf-8")

pattern = re.compile(
    r'''
    \s*/\*
     \s*\*\s*PokEX\s+V2\.1\s*·\s*catálogo\s+inglés\s+ampliado
     .*?
    \n\s*\}
    \s*
    (?=showSearchResults\(results\);)
    ''',
    re.S | re.X
)

new, count = pattern.subn("\n", s, count=1)

if count != 1:
    raise SystemExit(
        "❌ No he localizado exactamente el bloque EN del buscador."
    )

p.write_text(new, encoding="utf-8")

print("✅ Catálogo EN quitado de los resultados")
print("✅ Se mantiene disponible para rescatar imágenes")
