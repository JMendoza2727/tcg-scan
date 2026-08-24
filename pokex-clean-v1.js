(() => {

  const hideExactTexts = [
    "Pokémon TCG · buscador · cámara · precios",
    "El catálogo se descargará una vez y quedará guardado en el iPhone.",
    "Tolera errores: por ejemplo, charizar.",
    "Online"
  ];

  function cleanPokEX() {

    /* Nombre principal */
    const title = document.querySelector("h1");
    const desiredTitle =
      '⚡ PokEX Beta <span class="pokex-version">v2.2</span>';

    if (
      title &&
      title.innerHTML !== desiredTitle
    ) {
      title.innerHTML = desiredTitle;
    }

    /* Quitar textos secundarios */
    document.querySelectorAll("body *").forEach(el => {

      if (el.children.length)
        return;

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
