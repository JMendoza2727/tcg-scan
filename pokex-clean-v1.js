(() => {

  const hideExactTexts = [
    "Pokémon TCG · buscador · cámara · precios",
    "El catálogo se descargará una vez y quedará guardado en el iPhone.",
    "Tolera errores: por ejemplo, charizar.",
    "Online"
  ];

  function cleanPokEX() {

    /* Nombre principal */
    document.querySelectorAll("h1").forEach(el => {
      el.innerHTML = '⚡ PokEX Beta <span class="pokex-version">v2.2</span>';
    });

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
