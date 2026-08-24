from pathlib import Path
import re

p = Path("app.js")
s = p.read_text(encoding="utf-8")

pattern = re.compile(
    r'function\s+imageUrl\s*\(\s*base\s*,\s*quality\s*\)\s*\{.*?\}',
    re.S
)

m = pattern.search(s)

if not m:
    raise SystemExit("❌ No encuentro function imageUrl(base, quality)")

old = m.group(0)

new = r'''function imageUrl(base, quality) {

  const value =
    String(base || "").trim();

  if (!value)
    return "";

  /*
   * Nueva base japonesa:
   * si ya es una imagen completa,
   * la usamos directamente.
   */
  if (
    /\.(?:jpe?g|png|webp)(?:\?.*)?$/i
      .test(value)
  ) {
    return value;
  }

  return `${value}/${quality}.webp`;
}'''

s = s[:m.start()] + new + s[m.end():]

p.write_text(
    s,
    encoding="utf-8"
)

print("✅ PokEX acepta imágenes directas JP")
