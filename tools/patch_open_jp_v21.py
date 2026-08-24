from pathlib import Path

p = Path("app.js")
s = p.read_text(encoding="utf-8")

needle = '''async function openCard(id) {
'''

replacement = '''async function openCard(id) {

  /*
   * Carta procedente exclusivamente
   * del catálogo japonés ampliado.
   */
  if (
    String(id).startsWith("pokexjp:") &&
    window.PokEXJP
  ) {

    resetContent();

    setProgress(
      true,
      "Cargando carta japonesa…",
      40
    );

    try {

      const card =
        await window.PokEXJP.getCard(id);

      if (!card)
        throw new Error(
          "No se pudo cargar la carta japonesa."
        );

      setProgress(false);

      preview.classList.add(
        "hidden"
      );

      renderDetail(card);

      return;

    } catch (e) {

      setProgress(false);

      showMessage(
        e.message ||
        "Error cargando carta japonesa.",
        true
      );

      return;
    }
  }

'''

if needle not in s:
    raise SystemExit(
        "❌ No encuentro openCard."
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

print("✅ Fichas JP adicionales habilitadas")
