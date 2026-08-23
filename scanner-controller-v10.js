
(() => {

  const wrapper =
    document.getElementById("visualScanner");

  const originalFrame =
    document.getElementById("scannerFrame");

  const originalButton =
    document.getElementById("visualScanBtn");


  if (!originalFrame || !originalButton) {
    console.error("TCG Scan: scanner no encontrado");
    return;
  }


  /* ======================================
     QUITAR LISTENERS DE VERSIONES ANTIGUAS
     ====================================== */

  const button =
    originalButton.cloneNode(true);

  originalButton.replaceWith(button);


  /* ======================================
     SACAR COLLECTORVISION DE LA INTERFAZ
     ====================================== */

  const frame = originalFrame;

  document.body.appendChild(frame);

  frame.removeAttribute("style");
  frame.className = "cv-engine-frame";


  /*
   * Eliminamos completamente el viejo
   * contenedor visible.
   */
  if (wrapper) {
    wrapper.remove();
  }


  /*
   * Solo asignamos URL si alguna versión
   * anterior lo dejó vacío.
   */
  if (
    !frame.getAttribute("src") ||
    frame.getAttribute("src") === "about:blank"
  ) {

    frame.src =
      "./scanner/?catalog=v2&v=10";
  }


  /* ======================================
     UI DE PRECARGA
     ====================================== */

  const preparing =
    document.createElement("div");

  preparing.className =
    "cv-preparing";

  preparing.innerHTML = `
    <div class="cv-preparing-head">
      <span id="cvPreparingText">
        Preparando reconocimiento…
      </span>

      <strong id="cvPreparingPct">
        0%
      </strong>
    </div>

    <div class="cv-preparing-bar">
      <div
        id="cvPreparingFill"
        class="cv-preparing-fill">
      </div>
    </div>
  `;

  button.insertAdjacentElement(
    "afterend",
    preparing
  );


  const text =
    preparing.querySelector(
      "#cvPreparingText"
    );

  const pct =
    preparing.querySelector(
      "#cvPreparingPct"
    );

  const fill =
    preparing.querySelector(
      "#cvPreparingFill"
    );


  /* ======================================
     BOTÓN CERRAR CÁMARA
     ====================================== */

  const close =
    document.createElement("button");

  close.type = "button";
  close.className = "cv-engine-close";
  close.textContent = "←";
  close.hidden = true;

  document.body.appendChild(close);


  /* ======================================
     ESTADO
     ====================================== */

  let ready = false;
  let cameraOpen = false;


  button.disabled = true;

  button.textContent =
    "⏳ Preparando escáner…";


  function innerDocument() {

    try {

      return frame.contentDocument;

    } catch {

      return null;
    }
  }


  function innerBadge() {

    return innerDocument()
      ?.getElementById(
        "camera-badge"
      );
  }


  function translateStatus(value) {

    const s =
      String(value || "")
        .toLowerCase();

    if (s.includes("embedder"))
      return "Cargando reconocimiento visual…";

    if (s.includes("catalog"))
      return "Cargando catálogo Pokémon…";

    if (s.includes("corner"))
      return "Preparando detector de carta…";

    if (s.includes("dewarp"))
      return "Preparando corrección de perspectiva…";

    if (s.includes("scanner ready"))
      return "Escáner preparado";

    return "Preparando cámara…";
  }


  /* ======================================
     LEER PROGRESO DEL IFRAME OCULTO
     ====================================== */

  function pollEngine() {

    const doc =
      innerDocument();

    if (doc) {

      const innerPct =
        doc.getElementById(
          "loading-percent"
        );

      const innerMessage =
        doc.getElementById(
          "loading-message"
        );

      const badge =
        innerBadge();


      let number =
        parseInt(
          innerPct?.textContent || "0",
          10
        );


      if (!Number.isFinite(number))
        number = 0;


      number =
        Math.max(
          0,
          Math.min(
            100,
            number
          )
        );


      pct.textContent =
        number + "%";

      fill.style.width =
        number + "%";

      text.textContent =
        translateStatus(
          innerMessage?.textContent
        );


      /*
       * CollectorVision solo permite pulsar
       * la cámara cuando TODO ha terminado.
       */
      if (
        badge &&
        !badge.disabled &&
        badge.textContent
          .toLowerCase()
          .includes("tap to start")
      ) {

        ready = true;

        pct.textContent = "100%";
        fill.style.width = "100%";

        text.textContent =
          "Cámara preparada";

        button.disabled = false;

        button.textContent =
          "⚡ Escanear carta";


        setTimeout(() => {

          preparing.style.display =
            "none";

        }, 600);

      }

    }


    if (!ready) {

      setTimeout(
        pollEngine,
        180
      );
    }
  }


  frame.addEventListener(
    "load",
    () => {

      setTimeout(
        pollEngine,
        200
      );
    }
  );


  /*
   * Por si el iframe ya estaba cargando
   * antes de iniciar este controlador.
   */
  pollEngine();


  /* ======================================
     ABRIR
     ====================================== */

  function openCamera() {

    if (!ready)
      return;


    cameraOpen = true;

    frame.classList.add(
      "cv-engine-active"
    );

    close.hidden = false;

    document.body.classList.add(
      "cv-camera-open"
    );


    /*
     * El click del usuario sobre nuestro
     * botón inicia realmente getUserMedia.
     */
    const badge =
      innerBadge();


    if (
      badge &&
      !badge.dataset.cameraLive
    ) {

      badge.click();
    }
  }


  button.addEventListener(
    "click",
    openCamera
  );


  /* ======================================
     CERRAR
     ====================================== */

  function closeCamera() {

    if (!cameraOpen)
      return;


    const badge =
      innerBadge();


    /*
     * Apaga SOLO la cámara.
     *
     * CollectorVision, modelos y catálogo
     * siguen vivos dentro del iframe.
     */
    if (
      badge &&
      badge.dataset.cameraLive
    ) {

      badge.click();
    }


    cameraOpen = false;

    frame.classList.remove(
      "cv-engine-active"
    );

    close.hidden = true;

    document.body.classList.remove(
      "cv-camera-open"
    );
  }


  close.addEventListener(
    "click",
    closeCamera
  );


  /*
   * Al reconocer una carta:
   * cerrar cámara automáticamente.
   */
  window.addEventListener(
    "message",
    event => {

      if (
        event.origin !==
        window.location.origin
      ) return;


      if (
        event.data?.type ===
        "tcgscan-match"
      ) {

        closeCamera();
      }
    }
  );


  console.log(
    "✅ TCG Scan V10 scanner iniciado"
  );

})();

