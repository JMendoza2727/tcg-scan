(() => {

  function applyLayout() {

    const scanBtn =
      document.getElementById("visualScanBtn");

    if (!scanBtn)
      return;

    const searchBtn =
      [...document.querySelectorAll("button")]
        .find(b =>
          b.textContent.trim() === "Buscar"
        );

    if (!searchBtn)
      return;


    const selector =
      ".card, .panel, .step, section";

    const searchCard =
      searchBtn.closest(selector);

    const scannerCard =
      scanBtn.closest(selector);

    if (!searchCard || !scannerCard)
      return;


    /* Evitar hacerlo dos veces */
    if (
      document.getElementById(
        "pokexScanInsideSearch"
      )
    )
      return;


    const area =
      document.createElement("div");

    area.id =
      "pokexScanInsideSearch";

    area.innerHTML = `
      <div class="pokex-or">
        <span></span>
        <b>o</b>
        <span></span>
      </div>
    `;

    area.appendChild(scanBtn);

    searchCard.appendChild(area);


    /*
     * Quitamos el bloque antiguo del scanner.
     * El iframe/IA de cámara NO está dentro de
     * este bloque en V11, así que no lo tocamos.
     */
    scannerCard.remove();

  }


  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(applyLayout, 300)
    );

  } else {

    setTimeout(applyLayout, 300);

  }

})();
