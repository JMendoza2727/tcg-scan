from pathlib import Path

p = Path("app.js")
s = p.read_text(
    encoding="utf-8"
)

needle = '''async function openCard(id) {'''

replacement = '''async function openCard(id) {

  if (
    String(id).startsWith("pokexen:") &&
    window.PokEXEN
  ) {

    resetContent();

    setProgress(
      true,
      "Cargando carta…",
      40
    );

    try {

      const card =
        await window.PokEXEN
          .getCard(id);

      if (!card)
        throw new Error(
          "No se pudo cargar la carta."
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
        e.message,
        true
      );

      return;
    }
  }

'''

if needle not in s:
    raise SystemExit(
        "No encuentro openCard"
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

print("✅ Cartas EN adicionales habilitadas")
