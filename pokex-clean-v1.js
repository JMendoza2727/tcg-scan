(() => {
  const hideExactTexts = [
    "Pokémon TCG · buscador · cámara · precios",
    "El catálogo se descargará una vez y quedará guardado en el iPhone.",
    "Tolera errores: por ejemplo, charizar.",
    "Online"
  ];

  const desiredTitle =
    '⚡ PokEX Beta <span class="pokex-version">v2.3.2</span>';

  function cleanPokEX() {
    const title = document.querySelector("h1");

    if (
      title &&
      title.innerHTML !== desiredTitle
    ) {
      title.innerHTML = desiredTitle;
    }

    document.querySelectorAll("body *").forEach(el => {
      if (el.children.length) return;

      const text =
        el.textContent
          .replace(/\s+/g, " ")
          .trim();

      if (
        hideExactTexts.some(
          target =>
            text === target ||
            text.includes(target)
        )
      ) {
        el.style.display = "none";
      }
    });
  }

  cleanPokEX();

  new MutationObserver(cleanPokEX)
    .observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );
})();
