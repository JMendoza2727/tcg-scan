
(() => {

  /* =====================================
     ELIMINAR TODO EL SCANNER ANTIGUO
     ===================================== */

  document
    .querySelectorAll(".cv-preparing")
    .forEach(x => x.remove());


  const oldWrapper =
    document.getElementById("visualScanner");

  if (oldWrapper)
    oldWrapper.remove();


  const oldFrame =
    document.getElementById("scannerFrame");

  if (oldFrame)
    oldFrame.remove();


  /* =====================================
     BOTÓN PRINCIPAL LIMPIO
     ===================================== */

  const oldButton =
    document.getElementById("visualScanBtn");

  if (!oldButton)
    return;


  const button =
    oldButton.cloneNode(true);

  oldButton.replaceWith(button);


  button.disabled = false;

  button.textContent =
    "⚡ Escanear carta";


  /* =====================================
     INDICADOR DE PRECARGA
     ===================================== */

  const preparing =
    document.createElement("div");

  preparing.id =
    "cv11Preparing";

  preparing.innerHTML = `

    <div class="cv11-loading-head">

      <span id="cv11Text">
        Preparando reconocimiento…
      </span>

      <strong id="cv11Pct">
        0%
      </strong>

    </div>

    <div class="cv11-bar">

      <div id="cv11Fill"></div>

    </div>

  `;


  button.insertAdjacentElement(
    "afterend",
    preparing
  );

  preparing.style.display =
    "none";


  const text =
    preparing.querySelector(
      "#cv11Text"
    );

  const percentage =
    preparing.querySelector(
      "#cv11Pct"
    );

  const fill =
    preparing.querySelector(
      "#cv11Fill"
    );


  /* =====================================
     CREAR OVERLAY NUEVO DESDE CERO
     ===================================== */

  const overlay =
    document.createElement("div");

  overlay.id =
    "cv11Overlay";

  overlay.className =
    "cv11-hidden";


  const frame =
    document.createElement("iframe");

  frame.id =
    "cv11Frame";

  frame.allow =
    "camera";

  frame.title =
    "Escáner de cartas PokEX";

  const shield =
    document.createElement("div");

  shield.id =
    "cv11Shield";

  shield.innerHTML = `
    <div class="cv11-shield-card">
      <div class="cv11-shield-logo" aria-hidden="true">⚡</div>
      <div class="cv11-shield-kicker">PokEX Scanner</div>
      <h2>Preparando la cámara</h2>
      <p id="cv11ShieldText">Cargando reconocimiento visual…</p>

      <div class="cv11-shield-progress" aria-hidden="true">
        <div id="cv11ShieldFill"></div>
      </div>

      <div class="cv11-shield-meta">
        <span>Motor visual</span>
        <strong id="cv11ShieldPct">0%</strong>
      </div>

      <button
        id="cv11StartCamera"
        type="button"
        hidden>
        Activar cámara
      </button>
    </div>
  `;

  const close =
    document.createElement("button");

  close.id =
    "cv11Close";

  close.type =
    "button";

  close.textContent =
    "←";


  overlay.appendChild(frame);

  overlay.appendChild(shield);

  overlay.appendChild(close);

  document.body.appendChild(overlay);


  let ready = false;
  let started = false;

  const shieldText =
    shield.querySelector(
      "#cv11ShieldText"
    );

  const shieldPercentage =
    shield.querySelector(
      "#cv11ShieldPct"
    );

  const shieldFill =
    shield.querySelector(
      "#cv11ShieldFill"
    );

  const startCameraButton =
    shield.querySelector(
      "#cv11StartCamera"
    );


  /* =====================================
     ACCESO AL SCANNER INTERNO
     ===================================== */

  function doc() {

    try {

      return frame.contentDocument;

    } catch {

      return null;

    }
  }


  function badge() {

    return doc()
      ?.getElementById(
        "camera-badge"
      );
  }


  function cameraIsRunning() {

    const video =
      doc()?.querySelector("video");

    const stream =
      video?.srcObject;

    if (!stream)
      return false;


    return stream
      .getVideoTracks()
      .some(
        track =>
          track.readyState === "live"
      );
  }


  function brandScannerDocument() {

    const inside = doc();

    if (
      !inside ||
      inside.getElementById(
        "pokexScannerBrand"
      )
    ) {
      return;
    }

    const style =
      inside.createElement("style");

    style.id =
      "pokexScannerBrand";

    style.textContent = `
      .app-bar__title {
        font-size: 0 !important;
      }

      .app-bar__title::after {
        content: "PokEX Scanner";
        font-size: 18px;
        font-weight: 850;
        letter-spacing: -.02em;
      }

      .icon-button--debug {
        display: none !important;
      }
    `;

    inside.head?.appendChild(style);
  }


  function setShieldProgress(
    value,
    message
  ) {

    const n = Math.max(
      0,
      Math.min(100, Number(value) || 0)
    );

    shieldPercentage.textContent =
      `${Math.round(n)}%`;

    shieldFill.style.width =
      `${n}%`;

    if (message) {
      shieldText.textContent = message;
    }
  }


  function showShield(
    message = "Preparando la cámara…"
  ) {
    shield.classList.remove(
      "cv11-shield-hidden"
    );

    shieldText.textContent = message;
  }


  function hideShield() {
    shield.classList.add(
      "cv11-shield-hidden"
    );
  }


  function waitForCamera(
    attempt = 0
  ) {

    if (cameraIsRunning()) {
      setShieldProgress(
        100,
        "Cámara preparada"
      );

      setTimeout(
        hideShield,
        160
      );

      return;
    }

    if (attempt >= 80) {
      shieldText.textContent =
        "No se pudo abrir la cámara. Inténtalo de nuevo.";

      startCameraButton.hidden = false;
      startCameraButton.disabled = false;
      startCameraButton.textContent =
        "Reintentar";

      return;
    }

    setTimeout(
      () => waitForCamera(attempt + 1),
      125
    );
  }


  /* =====================================
     PROGRESO
     ===================================== */

  function statusText(raw) {

    const value =
      String(raw || "")
        .toLowerCase();


    if (value.includes("corner"))
      return "Preparando detector de carta…";


    if (value.includes("embedder"))
      return "Cargando reconocimiento visual…";


    if (value.includes("catalog"))
      return "Cargando catálogo Pokémon…";


    if (value.includes("dewarp"))
      return "Preparando cámara…";


    return "Preparando reconocimiento…";
  }


  function poll() {

    const inside =
      doc();


    if (inside) {

      brandScannerDocument();

      const p =
        inside.getElementById(
          "loading-percent"
        );


      const message =
        inside.getElementById(
          "loading-message"
        );


      let n =
        parseInt(
          p?.textContent || "0",
          10
        );


      if (!Number.isFinite(n))
        n = 0;


      n =
        Math.max(
          0,
          Math.min(100, n)
        );


      percentage.textContent =
        n + "%";


      fill.style.width =
        n + "%";


      text.textContent =
        statusText(
          message?.textContent
        );

      setShieldProgress(
        n,
        statusText(
          message?.textContent
        )
      );


      const cameraButton =
        badge();


      if (
        cameraButton &&
        !cameraButton.disabled &&
        cameraButton.textContent
          .toLowerCase()
          .includes("tap to start")
      ) {

        ready = true;


        percentage.textContent =
          "100%";


        fill.style.width =
          "100%";


        text.textContent =
          "Cámara preparada";

        setShieldProgress(
          100,
          "Reconocimiento preparado"
        );

        startCameraButton.hidden = false;
        startCameraButton.disabled = false;
        startCameraButton.textContent =
          "Activar cámara";


        button.disabled =
          false;


        button.textContent =
          "⚡ Escanear carta";


        setTimeout(() => {

          preparing.style.display =
            "none";

        }, 500);


        return;
      }

    }


    setTimeout(
      poll,
      250
    );

  }


  frame.addEventListener(
    "load",
    () => {

      if (started) {
        setTimeout(
          poll,
          150
        );
      }

    }
  );


  /* =====================================
     ABRIR CAMARA
     ===================================== */

  button.addEventListener(
    "click",
    () => {

      showShield(
        started
          ? "Abriendo la cámara…"
          : "Cargando reconocimiento visual…"
      );

      startCameraButton.hidden = true;

      overlay.classList.remove(
        "cv11-hidden"
      );


      document.body.classList.add(
        "cv11-camera-open"
      );


      if (!started) {

        started = true;

        preparing.style.display =
          "block";

        button.disabled = true;

        button.textContent =
          "⏳ Preparando cámara…";

        frame.src =
          "./scanner/?v=11";

        return;
      }


      if (!ready)
        return;


      const cameraButton =
        badge();


      if (
        cameraButton &&
        !cameraIsRunning()
      ) {

        cameraButton.click();

        waitForCamera();

      } else if (cameraIsRunning()) {

        hideShield();

      }

    }
  );


  startCameraButton.addEventListener(
    "click",
    () => {

      const cameraButton = badge();

      if (!cameraButton) {
        shieldText.textContent =
          "La cámara aún no está preparada.";
        return;
      }

      startCameraButton.disabled = true;
      startCameraButton.textContent =
        "Abriendo cámara…";

      shieldText.textContent =
        "Concediendo acceso a la cámara…";

      cameraButton.click();
      waitForCamera();
    }
  );


  /* =====================================
     CERRAR CAMARA
     ===================================== */

  function closeCamera() {

    const cameraButton =
      badge();


    /*
     * Solo detenemos la cámara física.
     *
     * La IA, modelos y catálogo
     * permanecen cargados.
     */

    if (
      cameraButton &&
      cameraIsRunning()
    ) {

      cameraButton.click();

    }


    overlay.classList.add(
      "cv11-hidden"
    );


    document.body.classList.remove(
      "cv11-camera-open"
    );

  }


  close.addEventListener(
    "click",
    closeCamera
  );


  /* =====================================
     CARTA RECONOCIDA
     ===================================== */

  window.addEventListener(
    "message",
    event => {

      if (
        event.origin !==
        window.location.origin
      )
        return;


      if (
        event.data?.type ===
        "tcgscan-match"
      ) {

        closeCamera();

      }

    }
  );


  console.log(
    "✅ Scanner V11 iniciado"
  );

})();



/* ===== BLOQUEO DEL ESCÁNER SIN IDIOMA ===== */

(() => {

  const allowedLanguages = ["es", "en", "ja"];

  const language =
    document.getElementById("lang");

  const scanButton =
    document.getElementById("visualScanBtn");

  if (!language || !scanButton)
    return;


  function validLanguage() {

    return allowedLanguages.includes(
      language.value
    );
  }


  function updateScannerLanguageState() {

    /*
     * Si CollectorVision aún está preparando,
     * respetamos su estado disabled.
     *
     * Cuando ya muestra "Escanear carta",
     * bloqueamos/desbloqueamos según idioma.
     */

    const scannerReady =
      scanButton.textContent
        .toLowerCase()
        .includes("escanear carta");


    if (!validLanguage()) {

      scanButton.disabled = true;

      if (scannerReady) {
        scanButton.textContent =
          "🌐 Selecciona un idioma";
      }

      return;
    }


    /*
     * Si antes estaba bloqueado por idioma
     * y el motor ya está preparado.
     */
    if (
      scanButton.textContent
        .includes("Selecciona un idioma")
    ) {

      scanButton.disabled = false;

      scanButton.textContent =
        "⚡ Escanear carta";
    }
  }


  language.addEventListener(
    "change",
    updateScannerLanguageState
  );


  /*
   * V11 cambia el botón cuando termina
   * de cargar. Observamos ese cambio.
   */
  const observer =
    new MutationObserver(
      updateScannerLanguageState
    );


  observer.observe(
    scanButton,
    {
      childList: true,
      characterData: true,
      subtree: true
    }
  );


  updateScannerLanguageState();

})();
