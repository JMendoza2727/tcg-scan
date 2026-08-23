
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


  button.disabled = true;

  button.textContent =
    "⏳ Preparando cámara…";


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

  frame.src =
    "./scanner/?v=11";


  const close =
    document.createElement("button");

  close.id =
    "cv11Close";

  close.type =
    "button";

  close.textContent =
    "←";


  overlay.appendChild(frame);

  overlay.appendChild(close);

  document.body.appendChild(overlay);


  let ready = false;


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
      180
    );

  }


  frame.addEventListener(
    "load",
    () => {

      setTimeout(
        poll,
        150
      );

    }
  );


  /* Por si Safari carga muy rápido */
  setTimeout(
    poll,
    300
  );


  /* =====================================
     ABRIR CAMARA
     ===================================== */

  button.addEventListener(
    "click",
    () => {

      if (!ready)
        return;


      overlay.classList.remove(
        "cv11-hidden"
      );


      document.body.classList.add(
        "cv11-camera-open"
      );


      const cameraButton =
        badge();


      if (
        cameraButton &&
        !cameraIsRunning()
      ) {

        cameraButton.click();

      }

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

