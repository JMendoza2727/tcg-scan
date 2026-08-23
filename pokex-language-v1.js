(() => {

  function startLanguage() {

    const lang =
      document.getElementById("lang");

    if (!lang)
      return;

    const valid =
      ["es", "en", "ja"];

    if (!valid.includes(lang.value)) {
      lang.value = "es";
    }

    /*
     * Avisamos al código original de PokEX
     * para que cargue automáticamente
     * el catálogo del idioma seleccionado.
     */
    lang.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(startLanguage, 100)
    );
  } else {
    setTimeout(startLanguage, 100);
  }

})();
