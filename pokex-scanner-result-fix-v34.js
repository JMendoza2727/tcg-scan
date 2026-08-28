(() => {
  const LEARNED_MAP_KEY = "pokex-scanner-tcgdex-map-v1";

  function readLearnedMap() {
    try {
      const value = JSON.parse(localStorage.getItem(LEARNED_MAP_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  }

  function remember(scannerId, tcgdexId) {
    if (!scannerId || !tcgdexId) return;
    try {
      const map = readLearnedMap();
      map[String(scannerId)] = String(tcgdexId);
      localStorage.setItem(LEARNED_MAP_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function clearPreviousResult() {
    try {
      resetContent();
    } catch (_) {
      const result = document.getElementById("resultBox");
      const list = document.getElementById("listBox");
      const cards = document.getElementById("cards");
      const more = document.getElementById("moreBtn");
      const message = document.getElementById("message");
      if (result) {
        result.innerHTML = "";
        result.classList.add("hidden");
      }
      list?.classList.add("hidden");
      if (cards) cards.innerHTML = "";
      more?.classList.add("hidden");
      message?.classList.add("hidden");
    }
  }

  function closeScannerOverlay() {
    document.getElementById("visualScanner")?.classList.add("hidden");
    document.getElementById("cv11Overlay")?.classList.add("cv11-hidden");
    document.body.classList.remove("cv11-camera-open");
  }

  function normalizedNumber(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^0+(?=\d)/, "");
  }

  async function fetchCandidates(language, name) {
    if (!language || !name) return [];
    const response = await fetch(
      `https://api.tcgdex.net/v2/${language}/cards?name=${encodeURIComponent(name)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function handleMatch(data) {
    clearPreviousResult();
    closeScannerOverlay();

    const score = Math.round(Number(data.score) * 1000) / 10;
    showMessage(`✅ ${data.cardName || "Carta"} detectada con ${score}%`);

    const selectedLanguage =
      document.getElementById("lang")?.value || "es";

    const learned = readLearnedMap()[String(data.cardId || "")];
    if (learned) {
      try {
        const check = await fetch(
          `https://api.tcgdex.net/v2/${selectedLanguage}/cards/${encodeURIComponent(learned)}`,
          { cache: "no-store" }
        );
        if (check.ok) {
          await openCard(learned);
          return;
        }
      } catch (_) {}
    }

    let product = null;
    try {
      const response = await fetch("./pokemon-map.json", { cache: "force-cache" });
      if (response.ok) {
        const map = await response.json();
        product = map?.[String(data.cardId)];
      }
    } catch (_) {}

    const parsed = parseCardQuery(product?.name || data.cardName || "");
    const englishName = parsed.name || String(data.cardName || "").trim();
    const number = normalizedNumber(product?.number || parsed.number);

    let selectedName = englishName;
    if (selectedLanguage !== "en") {
      try {
        selectedName = await translatePokemonQueryV21(englishName, selectedLanguage);
        selectedName = parseCardQuery(selectedName).name || selectedName;
      } catch (_) {}
    }

    const searches = [];
    searches.push([selectedLanguage, selectedName]);
    if (selectedLanguage !== "en") searches.push(["en", englishName]);

    let matches = [];
    for (const [language, name] of searches) {
      try {
        const found = await fetchCandidates(language, name);
        if (found.length) {
          matches = found;
          break;
        }
      } catch (_) {}
    }

    if (number && matches.length) {
      const exact = matches.filter(card =>
        normalizedNumber(card.localId) === number
      );
      if (exact.length) matches = exact;
    }

    if (matches.length === 1) {
      remember(data.cardId, matches[0].id);
      await openCard(matches[0].id);
      return;
    }

    if (matches.length > 1) {
      currentResults = matches;
      shown = 0;
      cardsEl.innerHTML = "";
      listBox.classList.remove("hidden");
      countText.textContent = number
        ? "He encontrado varias ediciones con ese número"
        : "Elige la edición exacta una vez";
      renderNext();
      moreBtn.classList.add("hidden");

      // Si falta el mapa exacto del catálogo del escáner, PokEX aprende la
      // edición que el usuario elija. En siguientes escaneos del mismo cardId
      // abrirá directamente esa carta en lugar de volver a listar ediciones.
      const tiles = [...cardsEl.querySelectorAll(".cardTile")];
      tiles.forEach((tile, index) => {
        const candidate = matches[index];
        if (!candidate) return;
        tile.addEventListener("click", () => {
          remember(data.cardId, candidate.id);
        }, { capture: true, once: true });
      });
      return;
    }

    queryEl.value = `${selectedName} ${number}`.trim();
    await doSearch();
  }

  // Captura el resultado antes del handler histórico de app.js. Así evitamos
  // que dos rutas distintas rendericen a la vez la ficha y los candidatos.
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "tcgscan-match") return;

    event.stopImmediatePropagation();
    handleMatch(event.data).catch(error => {
      console.error("PokEX scanner result fix:", error);
      clearPreviousResult();
      showMessage("No se pudo resolver la edición exacta. Prueba de nuevo.", true);
    });
  }, true);
})();
