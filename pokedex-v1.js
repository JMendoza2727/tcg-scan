(() => {

  const DB_NAME = "tcgscan-pokedex";
  const STORE = "cards";
  const PAGE_SIZE = 100;

  let dbPromise = null;
  let viewItems = [];
  let filteredItems = [];
  let renderedItems = 0;
  let searchTimer = null;

  function openPokedexDB() {
    if (dbPromise)
      return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, {
            keyPath: "key"
          });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });

    return dbPromise;
  }

  function notifyCollectionChanged(detail) {
    window.dispatchEvent(
      new CustomEvent(
        "pokex:collection-changed",
        { detail }
      )
    );
  }


  async function getAll() {
    const db = await openPokedexDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }


  async function getCard(key) {
    const db = await openPokedexDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }


  async function saveCard(item) {
    const db = await openPokedexDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");

      tx.objectStore(STORE).put(item);

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }


  async function deleteCard(key) {
    const db = await openPokedexDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");

      tx.objectStore(STORE).delete(key);

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }


  function selectedLanguage() {
    const value =
      document.getElementById("lang")?.value;

    return ["es", "en", "ja"].includes(value)
      ? value
      : "es";
  }

  function languageFromImage(image) {
    if (window.PokEXImageResolver?.imageLanguage) {
      return window.PokEXImageResolver.imageLanguage(image);
    }

    const match = String(image || "").match(
      /assets\.tcgdex\.net\/(es|en|ja)(?:\/|$)/i
    );

    if (match) return match[1].toLowerCase();
    if (/images\.pokemontcg\.io\//i.test(String(image || ""))) return "en";
    return null;
  }

  function storedLanguage(item) {
    if (
      item?.languageVerified === true &&
      ["es", "en", "ja"].includes(item.lang)
    ) {
      return item.lang;
    }

    if (item?.imageKind !== "translated" && item?.imageKind !== "reference") {
      const detected = languageFromImage(item?.image);
      if (detected) return detected;
    }

    if (/[぀-ヿ㐀-鿿]/u.test(`${item?.name || ""} ${item?.setName || ""}`)) {
      return "ja";
    }

    return ["es", "en", "ja"].includes(item?.lang)
      ? item.lang
      : null;
  }

  function keyFor(card, language = selectedLanguage()) {
    return `${language}:${card.id}`;
  }

  function normalizedIdentityText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  async function findStoredCard(card, language = selectedLanguage()) {
    const direct = await getCard(keyFor(card, language));
    if (direct) return direct;

    const items = await getAll();
    const wantedName = normalizedIdentityText(card?.name);
    const wantedSet = normalizedIdentityText(card?.set?.name);
    const wantedNumber = String(card?.localId ?? "");

    return items.find(item =>
      String(item.id || "") === String(card?.id || "") &&
      String(item.localId ?? "") === wantedNumber &&
      normalizedIdentityText(item.name) === wantedName &&
      normalizedIdentityText(item.setName) === wantedSet &&
      (
        item.languageVerified !== true ||
        storedLanguage(item) === language
      )
    ) || null;
  }


  async function addOne(card) {

    const language = selectedLanguage();

    const key =
      keyFor(card, language);


    const existing =
      await findStoredCard(card, language);


    /*
     * Obtiene:
     *
     * Cardmarket → EUR
     *
     * o
     *
     * TCGplayer USD
     *     ↓
     * cambio ECB
     *     ↓
     * EUR
     */
    const pricing =
      window.PokEXPricing
        ?.getStoredPrice
        ? await window.PokEXPricing
            .getStoredPrice(card, language)
        : null;


    const item =
      existing || {

        key,

        id:
          card.id,

        lang:
          language,

        languageVerified:
          true,

        name:
          card.name,

        localId:
          card.localId,

        rarity:
          card.rarity || "",

        setName:
          card.set?.name || "",

        image:
          card.image ||
          card._pokexReferenceImage ||
          "",

        imageKind:
          card._pokexResolvedImage?.kind ||
          "exact",

        imageLanguage:
          card._pokexResolvedImage
            ?.language ||
          language,

        quantity:
          0,

        addedAt:
          Date.now()
      };

    item.lang = language;
    item.languageVerified = true;


    /*
     * Refrescamos datos básicos
     * cada vez que añadimos.
     */
    item.name =
      card.name ||
      item.name;


    item.localId =
      card.localId ??
      item.localId;


    item.rarity =
      card.rarity ||
      item.rarity ||
      "";


    item.setName =
      card.set?.name ||
      item.setName ||
      "";


    item.image =
      card.image ||
      card._pokexReferenceImage ||
      item.image ||
      "";

    item.imageKind =
      card._pokexResolvedImage?.kind ||
      item.imageKind ||
      "exact";

    item.imageLanguage =
      card._pokexResolvedImage
        ?.language ||
      item.imageLanguage ||
      item.lang;


    item.quantity += 1;

    const changedAt = Date.now();
    item.collectionUpdatedAt =
      changedAt;


    if (
      pricing &&
      typeof pricing.value ===
        "number" &&
      Number.isFinite(
        pricing.value
      ) &&
      pricing.currency ===
        "EUR"
    ) {

      /*
       * Campo nuevo.
       */
      item.lastPrice =
        pricing.value;

      item.priceCurrency =
        "EUR";

      item.priceSource =
        pricing.source;

      item.priceLanguage =
        item.lang;

      item.priceExternal =
        Boolean(
          card._pokexExternalPrice
        );

      item.priceVariant =
        pricing.variantLabel ||
        null;

      item.priceUpdated =
        pricing.updated ??
        item.priceUpdated ??
        null;


      /*
       * Compatibilidad total con
       * Mi Pokédex V1.
       *
       * Aunque el nombre histórico
       * sea lastTrend, aquí guardamos
       * el valor orientativo final
       * SIEMPRE en euros.
       */
      item.lastTrend =
        pricing.value;


      /*
       * Conservamos el precio original
       * cuando venía de TCGplayer.
       */
      if (
        pricing.originalCurrency ===
        "USD"
      ) {

        item.originalPrice =
          pricing.originalValue;

        item.originalCurrency =
          "USD";

        item.fxRate =
          pricing.fxRate ??
          null;

        item.fxDate =
          pricing.fxDate ??
          null;

      } else {

        item.originalPrice =
          null;

        item.originalCurrency =
          null;

        item.fxRate =
          null;

        item.fxDate =
          null;
      }

      const history =
        await window.PokEXPriceResolver
          ?.recordHistory?.(
            card,
            language,
            pricing
          );

      item.priceHistoryMin =
        history?.min ??
        item.priceHistoryMin ??
        pricing.value;

      item.priceHistoryMax =
        history?.max ??
        item.priceHistoryMax ??
        pricing.value;

      item.priceHistoryCount =
        history?.count ??
        item.priceHistoryCount ??
        1;
    }


    await saveCard(item);

    await refreshCounter();

    notifyCollectionChanged({
      key: item.key,
      item,
      deleted: false,
      changedAt
    });

    return item;
  }


  async function removeOne(card) {
    const language = selectedLanguage();

    const existing =
      await findStoredCard(card, language);

    if (!existing)
      return null;

    const key = existing.key;

    existing.quantity -= 1;

    const changedAt = Date.now();
    existing.collectionUpdatedAt =
      changedAt;

    if (existing.quantity <= 0) {
      await deleteCard(key);
      await refreshCounter();

      notifyCollectionChanged({
        key,
        item: null,
        deleted: true,
        changedAt
      });

      return null;
    }

    await saveCard(existing);
    await refreshCounter();

    notifyCollectionChanged({
      key,
      item: existing,
      deleted: false,
      changedAt
    });

    return existing;
  }


  function moneyCurrency(
    value,
    currency = "EUR"
  ) {

    if (
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      return "—";
    }

    if (currency === "USD") {
      return `$${value.toFixed(2)}`;
    }

    return `${value.toFixed(2)} €`;
  }


  function money(v) {
    return moneyCurrency(
      v,
      "EUR"
    );
  }


  function getItemPrice(item) {

    if (
      typeof item.lastPrice ===
        "number" &&
      Number.isFinite(
        item.lastPrice
      )
    ) {
      return {
        value:
          item.lastPrice,

        currency:
          item.priceCurrency ||
          "EUR"
      };
    }

    /*
     * Cartas guardadas antes
     * de este cambio.
     */
    if (
      typeof item.lastTrend ===
        "number" &&
      Number.isFinite(
        item.lastTrend
      )
    ) {
      return {
        value:
          item.lastTrend,

        currency: "EUR"
      };
    }

    return null;
  }


  function moneyItem(item) {

    const price =
      getItemPrice(item);

    if (!price)
      return "—";

    return moneyCurrency(
      price.value,
      price.currency
    );
  }


  /* ===============================
     BOTÓN PRINCIPAL
     =============================== */

  const nav = document.createElement("div");

  nav.className = "pokedex-nav";

  nav.innerHTML = `
    <button id="openPokedex"
            type="button"
            class="pokedex-main-btn">
      🗂️ Mi Pokédex
      <span id="pokedexCount">0</span>
    </button>
  `;

  const wrap =
    document.querySelector(".wrap");

  if (wrap) {
    wrap.prepend(nav);
  }


  /* ===============================
     PANTALLA POKÉDEX
     =============================== */

  const overlay =
    document.createElement("div");

  overlay.className =
    "pokedex-overlay hidden";

  overlay.innerHTML = `
    <div class="pokedex-header">

      <button id="closePokedex"
              class="pokedex-close"
              type="button">
        ←
      </button>

      <div>
        <strong>Mi Pokédex</strong>
        <span id="pokedexStats">
          Tu colección Pokémon
        </span>
      </div>

      <div class="pokedex-update-wrap">
        <button id="updatePokedex"
                class="pokedex-update-btn"
                type="button">
          ⟳ Actualizar
        </button>
        <small class="pokedex-update-help">
          Actualiza imágenes y precios de tu colección
        </small>
      </div>

    </div>

    <div class="pokedex-content">

      <input id="pokedexSearch"
             class="pokedex-search"
             type="search"
             placeholder="Buscar en mi colección…">

      <div id="pokedexUpdateStatus"
           class="pokedex-update-status"
           hidden>
      </div>

      <div id="pokedexLastUpdate"
           class="pokedex-last-update">
      </div>

      <div id="pokedexValue"
           class="pokedex-value">
      </div>

      <div id="pokedexGrid"
           class="pokedex-grid">
      </div>

      <button id="pokedexMore"
              class="pokedex-more"
              type="button"
              hidden>
        Cargar más
      </button>

    </div>
  `;

  document.body.appendChild(overlay);


  async function refreshCounter() {
    const items =
      await getAll();

    const total =
      items.reduce(
        (sum, x) =>
          sum + (x.quantity || 0),
        0
      );

    const count =
      document.getElementById(
        "pokedexCount"
      );

    if (count)
      count.textContent = total;

    return items;
  }


  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }


  function renderPokedexPage() {
    const grid =
      document.getElementById(
        "pokedexGrid"
      );

    const more =
      document.getElementById(
        "pokedexMore"
      );

    const end = Math.min(
      renderedItems + PAGE_SIZE,
      filteredItems.length
    );

    const fragment =
      document.createDocumentFragment();

    for (
      let i = renderedItems;
      i < end;
      i++
    ) {
      const item = filteredItems[i];

      const div =
        document.createElement("button");

      div.type = "button";
      div.className = "pokedex-card";
      div.dataset.pokedexKey = item.key;

      const storedImage =
        item.image ||
        item._pokexReferenceImage ||
        "";

      const compatibleImage =
        !window.PokEXImageResolver
          ?.isImageCompatible ||
        window.PokEXImageResolver
          .isImageCompatible(
            storedImage,
            item.lang,
            item.imageKind || "exact"
          );

      const image =
        storedImage && compatibleImage
          ? (
              /\.(?:jpe?g|png|webp)(?:\?.*)?$/i
                .test(storedImage)
                ? storedImage
                : `${storedImage}/low.webp`
            )
          : "";

      const referenceImage =
        item.imageKind === "reference" ||
        item._pokexResolvedImage?.kind === "reference";

      const translatedImage =
        item.imageKind === "translated";

      const imageBadge =
        referenceImage
          ? "Referencia"
          : translatedImage
            ? `Imagen ${String(
                item.imageLanguage || "en"
              ).toUpperCase()}`
            : "";

      div.innerHTML = `
        <div class="pokedex-img-wrap">
          ${
            image
              ? `<img src="${escapeHTML(image)}"
                      loading="lazy"
                      decoding="async"
                      alt="${escapeHTML(item.name || "Carta")}">`
              : `<div class="pokedex-noimg">Sin imagen</div>`
          }
          ${imageBadge ? `<span class="pokedex-reference">${escapeHTML(imageBadge)}</span>` : ""}
          <span class="pokedex-qty">x${item.quantity}</span>
        </div>
        <strong>${escapeHTML(item.name || "Carta")}</strong>
        <span>Nº ${escapeHTML(item.localId || "—")}</span>
        <small>${escapeHTML(item.setName || "")}</small>
        <b>${moneyItem(item)}</b>
      `;

      fragment.appendChild(div);
    }

    grid.appendChild(fragment);
    renderedItems = end;
    more.hidden =
      renderedItems >= filteredItems.length;
  }


  async function renderPokedex(
    filter = "",
    reload = false
  ) {
    if (reload || !viewItems.length) {
      viewItems = await getAll();

      for (const item of viewItems) {
        const inferred = storedLanguage(item);
        if (inferred) item.lang = inferred;
      }

      if (window.PokEXImageResolver?.hydrate) {
        await window.PokEXImageResolver.hydrate(
          viewItems,
          selectedLanguage()
        );
      }
    }

    let items = [...viewItems];

    const q =
      String(filter)
        .trim()
        .toLowerCase();

    if (q) {
      items = items.filter(item =>
        `${item.name} ${item.setName} ${item.localId}`
          .toLowerCase()
          .includes(q)
      );
    }

    items.sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    );

    const grid =
      document.getElementById(
        "pokedexGrid"
      );

    grid.innerHTML = "";
    renderedItems = 0;

    const totalCards =
      items.reduce(
        (sum, x) =>
          sum + x.quantity,
        0
      );

    const totals = {
      EUR: 0,
      USD: 0
    };

    for (const item of items) {

      const price =
        getItemPrice(item);

      if (!price)
        continue;

      const currency =
        price.currency === "USD"
          ? "USD"
          : "EUR";

      totals[currency] +=
        price.value *
        item.quantity;
    }


    document.getElementById(
      "pokedexStats"
    ).textContent =
      `${items.length} distintas · ${totalCards} cartas`;


    const totalParts = [];

    if (totals.EUR > 0) {
      totalParts.push(
        moneyCurrency(
          totals.EUR,
          "EUR"
        )
      );
    }

    if (totals.USD > 0) {
      totalParts.push(
        moneyCurrency(
          totals.USD,
          "USD"
        )
      );
    }


    document.getElementById(
      "pokedexValue"
    ).innerHTML = `
      <span>
        Valor orientativo de la colección
      </span>

      <strong>
        ${totalParts.length
          ? totalParts.join(" · ")
          : "—"}
      </strong>

      <small>

      </small>
    `;


    if (!items.length) {
      grid.innerHTML = `
        <div class="pokedex-empty">
          🃏<br>
          Aún no tienes cartas aquí.
        </div>
      `;

      document.getElementById(
        "pokedexMore"
      ).hidden = true;

      return;
    }

    filteredItems = items;
    renderPokedexPage();
  }


  document
    .getElementById("openPokedex")
    ?.addEventListener(
      "click",
      async () => {

        overlay.classList.remove(
          "hidden"
        );

        document.body.classList.add(
          "pokedex-open"
        );

        await renderPokedex("", true);
      }
    );


  document
    .getElementById("closePokedex")
    ?.addEventListener(
      "click",
      () => {

        overlay.classList.add(
          "hidden"
        );

        document.body.classList.remove(
          "pokedex-open"
        );
      }
    );


  document
    .getElementById("pokedexSearch")
    ?.addEventListener(
      "input",
      e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(
          () => renderPokedex(
            e.target.value
          ),
          140
        );
      }
    );


  document
    .getElementById("pokedexMore")
    ?.addEventListener(
      "click",
      renderPokedexPage
    );


  document
    .getElementById("pokedexGrid")
    ?.addEventListener(
      "click",
      async event => {
        const cardButton =
          event.target.closest(
            "[data-pokedex-key]"
          );

        if (!cardButton)
          return;

        const item = viewItems.find(
          card =>
            card.key ===
            cardButton.dataset.pokedexKey
        );

        if (!item)
          return;

        overlay.classList.add("hidden");
        document.body.classList.remove(
          "pokedex-open"
        );

        let itemLanguage =
          storedLanguage(item) ||
          selectedLanguage();

        if (item.languageVerified !== true) {
          try {
            const fresh = await loadFreshPokedexCard(item);
            itemLanguage =
              fresh?._pokexLanguage ||
              itemLanguage;
            item.lang = itemLanguage;
            item.languageVerified = true;
            await saveCard(item);
          } catch (_) {}
        }

        const language =
          document.getElementById("lang");

        if (language) {
          language.value = itemLanguage;
        }

        if (
          typeof window.openCard ===
          "function"
        ) {
          await window.openCard(item.id);
        }
      }
    );


  document
    .getElementById("pokedexGrid")
    ?.addEventListener(
      "error",
      event => {
        const image = event.target;

        if (!(image instanceof HTMLImageElement))
          return;

        const placeholder =
          document.createElement("div");

        placeholder.className =
          "pokedex-noimg";

        placeholder.textContent =
          "Sin imagen";

        image.replaceWith(placeholder);
      },
      true
    );


  /* ===============================
     BOTONES EN FICHA DE CARTA
     =============================== */

  window.tcgCollectionAttach =
    async function(card) {

      const detail =
        document.querySelector(
          "#resultBox .detail"
        );

      if (!detail)
        return;

      detail
        .querySelector(
          ".pokedex-card-controls"
        )
        ?.remove();


      const current =
        await findStoredCard(
          card,
          selectedLanguage()
        );


      const controls =
        document.createElement("div");

      controls.className =
        "pokedex-card-controls";


      async function redraw() {
        const item =
          await findStoredCard(
            card,
            selectedLanguage()
          );

        controls.innerHTML = `
          ${
            item
              ? `
                <div class="owned-card">
                  ✅ En tu Pokédex:
                  <strong>x${item.quantity}</strong>
                </div>

                <div class="owned-actions">

                  <button type="button"
                          id="addPokedexOne">
                    + Añadir otra
                  </button>

                  <button type="button"
                          id="removePokedexOne"
                          class="pokedex-remove">
                    − Quitar una
                  </button>

                </div>
              `
              : `
                <button type="button"
                        id="addPokedexOne"
                        class="add-pokedex">
                  ➕ Añadir a mi Pokédex
                </button>
              `
          }
        `;


        controls
          .querySelector(
            "#addPokedexOne"
          )
          ?.addEventListener(
            "click",
            async () => {

              await addOne(card);
              await redraw();
            }
          );


        controls
          .querySelector(
            "#removePokedexOne"
          )
          ?.addEventListener(
            "click",
            async () => {

              await removeOne(card);
              await redraw();
            }
          );
      }


      detail.appendChild(
        controls
      );

      await redraw();
    };


  refreshCounter();



  /* =========================================================
     ACTUALIZAR MI POKÉDEX
     ========================================================= */

  const POKEDEX_TCGDEX_API =
    "https://api.tcgdex.net/v2";

  const POKEDEX_LAST_UPDATE =
    "pokex-pokedex-last-update-v21";


  function sleep(ms) {
    return new Promise(
      resolve => setTimeout(resolve, ms)
    );
  }


  function formatLastUpdate(value) {

    if (!value)
      return "";

    const date =
      new Date(Number(value));

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    return (
      "Última actualización: " +
      date.toLocaleString()
    );
  }


  function renderLastUpdate() {

    const el =
      document.getElementById(
        "pokedexLastUpdate"
      );

    if (!el)
      return;

    let value = null;

    try {
      value =
        localStorage.getItem(
          POKEDEX_LAST_UPDATE
        );
    } catch (_) {}

    el.textContent =
      formatLastUpdate(value);
  }


  function setUpdateStatus(
    text,
    type = ""
  ) {

    const el =
      document.getElementById(
        "pokedexUpdateStatus"
      );

    if (!el)
      return;

    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className =
        "pokedex-update-status";
      return;
    }

    el.hidden = false;

    el.className =
      "pokedex-update-status" +
      (
        type
          ? ` ${type}`
          : ""
      );

    el.textContent = text;
  }


  async function completePokedexMissingPrice(
    card,
    lang
  ) {

    if (
      !card ||
      window.PokEXPricing
        ?.getPreferredPrice?.(card, lang) ||
      !window.PokEXPriceResolver
        ?.resolve
    ) {
      return;
    }


    try {
      const result =
        await window.PokEXPriceResolver
          .resolve(card, lang);

      window.PokEXPriceResolver
        .applyResult?.(card, result);
    } catch (_) {}
  }


  async function loadFreshPokedexCard(
    item
  ) {

    /*
     * Cartas japonesas que solo existen
     * en nuestro catálogo complementario.
     */
    if (
      String(item.id || "")
        .startsWith("pokexjp:")
    ) {

      if (
        !window.PokEXJP ||
        typeof window.PokEXJP.getCard !==
          "function"
      ) {
        throw new Error(
          "Catálogo japonés no disponible"
        );
      }

      const card = await window.PokEXJP
        .getCard(item.id);

      if (card) card._pokexLanguage = "ja";

      if (
        card &&
        !card.image &&
        window.PokEXImageResolver?.resolve
      ) {
        try {
          const result = await window.PokEXImageResolver.resolve(card, "ja");
          window.PokEXImageResolver.applyResult?.(card, result);
        } catch (_) {}
      }

      await completePokedexMissingPrice(
        card,
        "ja"
      );

      return card;
    }


    const exactImageLanguage =
      item.imageKind !== "translated" &&
      item.imageKind !== "reference"
        ? languageFromImage(item.image)
        : null;

    const trustedLanguage =
      item.languageVerified === true
        ? storedLanguage(item)
        : exactImageLanguage;

    const languageOrder = trustedLanguage
      ? [trustedLanguage]
      : /[぀-ヿ㐀-鿿]/u.test(
          `${item.name || ""} ${item.setName || ""}`
        )
        ? ["ja", "en", "es"]
        : ["es", "en", "ja"];

    let card = null;
    let lang = null;
    let firstIdentityMatch = null;

    for (const candidateLanguage of languageOrder) {
      const response = await fetch(
        `${POKEDEX_TCGDEX_API}/` +
        `${encodeURIComponent(candidateLanguage)}/cards/` +
        `${encodeURIComponent(item.id)}`,
        { cache: "no-store" }
      );

      if (!response.ok) continue;

      const candidate = await response.json();

      try {
        assertSamePokedexCard(item, candidate);
      } catch (_) {
        continue;
      }

      if (!firstIdentityMatch) {
        firstIdentityMatch = {
          card: candidate,
          lang: candidateLanguage
        };
      }

      const sameName =
        !item.name ||
        normalizedIdentityText(item.name) ===
          normalizedIdentityText(candidate.name);

      const sameSet =
        !item.setName ||
        normalizedIdentityText(item.setName) ===
          normalizedIdentityText(candidate.set?.name);

      if (sameName && sameSet) {
        card = candidate;
        lang = candidateLanguage;
        break;
      }
    }

    if (!card && firstIdentityMatch) {
      card = firstIdentityMatch.card;
      lang = firstIdentityMatch.lang;
    }

    if (!card || !lang) {
      throw new Error("No se encontró la ficha en su idioma");
    }

    card._pokexLanguage = lang;


    /*
     * Recuperador de imágenes EN
     * que ya usamos en PokEX.
     */
    if (
      lang === "en" &&
      window.PokEXENImages &&
      typeof window.PokEXENImages
        .applyOne === "function"
    ) {

      try {

        await window.PokEXENImages
          .applyOne(card);

      } catch (_) {}
    }

    if (
      !card.image &&
      window.PokEXImageResolver?.resolve
    ) {
      try {
        const result = await window.PokEXImageResolver.resolve(card, lang);
        window.PokEXImageResolver.applyResult?.(card, result);
      } catch (_) {}
    }


    await completePokedexMissingPrice(
      card,
      lang
    );


    return card;
  }


  function normalizedCardNumber(value) {
    const normalized =
      String(value ?? "")
        .normalize("NFKC")
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/^#/, "");

    return normalized.replace(
      /(^|\D)0+(?=\d)/g,
      "$1"
    );
  }


  function assertSamePokedexCard(
    item,
    card
  ) {
    const storedId =
      String(item?.id || "");

    const freshId =
      String(card?.id || "");

    if (
      storedId &&
      freshId &&
      storedId !== freshId
    ) {
      throw new Error(
        "La fuente devolvió otra carta"
      );
    }

    const storedNumber =
      normalizedCardNumber(
        item?.localId
      );

    const freshNumber =
      normalizedCardNumber(
        card?.localId
      );

    if (
      storedNumber &&
      freshNumber &&
      storedNumber !== freshNumber
    ) {
      throw new Error(
        "El número de carta no coincide"
      );
    }
  }


  async function updateEntirePokedex() {

    const button =
      document.getElementById(
        "updatePokedex"
      );

    if (!button)
      return;


    const items =
      await getAll();


    if (!items.length) {

      setUpdateStatus(
        "No tienes cartas para actualizar."
      );

      return;
    }


    button.disabled = true;
    button.textContent =
      "⟳ Actualizando…";


    let updatedPrices = 0;
    let recoveredImages = 0;
    let changedImages = 0;
    let withoutPrice = 0;
    let errors = 0;


    const total =
      items.length;


    for (
      let i = 0;
      i < items.length;
      i++
    ) {

      const item =
        items[i];


      setUpdateStatus(
        `Actualizando ${i + 1} / ${total} · ${item.name || "Carta"}`
      );


      try {

        const card =
          await loadFreshPokedexCard(
            item
          );


        if (!card) {
          throw new Error(
            "Carta no encontrada"
          );
        }

        assertSamePokedexCard(
          item,
          card
        );

        const resolvedLanguage =
          card._pokexLanguage ||
          storedLanguage(item) ||
          "es";

        item.lang = resolvedLanguage;
        item.languageVerified = true;


        /*
         * --------------------------
         * PRECIO
         * --------------------------
         */

        const oldPrice =
          typeof item.lastPrice ===
            "number"
            ? item.lastPrice
            : (
                typeof item.lastTrend ===
                  "number"
                  ? item.lastTrend
                  : null
              );


        let pricing = null;


        if (
          window.PokEXPricing &&
          typeof window.PokEXPricing
            .getStoredPrice ===
            "function"
        ) {

          pricing =
            await window.PokEXPricing
              .getStoredPrice(
                card,
                resolvedLanguage
              );
        }


        if (
          pricing &&
          pricing.currency === "EUR" &&
          typeof pricing.value ===
            "number" &&
          Number.isFinite(
            pricing.value
          )
        ) {

          const newPrice =
            pricing.value;


          if (
            oldPrice === null ||
            Math.abs(
              oldPrice - newPrice
            ) >= 0.005
          ) {
            updatedPrices += 1;
          }


          item.lastPrice =
            newPrice;

          /*
           * Compatibilidad con V1.
           */
          item.lastTrend =
            newPrice;

          item.priceCurrency =
            "EUR";

          item.priceSource =
            pricing.source ||
            null;

          item.priceLanguage =
            resolvedLanguage;

          item.priceExternal =
            Boolean(
              card._pokexExternalPrice
            );

          item.priceVariant =
            pricing.variantLabel ||
            null;

          item.priceUpdated =
            pricing.updated ||
            Date.now();


          if (
            pricing.originalCurrency ===
            "USD"
          ) {

            item.originalPrice =
              pricing.originalValue;

            item.originalCurrency =
              "USD";

            item.fxRate =
              pricing.fxRate ??
              null;

            item.fxDate =
              pricing.fxDate ??
              null;

          } else {

            item.originalPrice =
              null;

            item.originalCurrency =
              null;

            item.fxRate =
              null;

            item.fxDate =
              null;
          }

          const history =
            await window.PokEXPriceResolver
              ?.recordHistory?.(
                card,
                resolvedLanguage,
                pricing
              );

          item.priceHistoryMin =
            history?.min ??
            item.priceHistoryMin ??
            newPrice;

          item.priceHistoryMax =
            history?.max ??
            item.priceHistoryMax ??
            newPrice;

          item.priceHistoryCount =
            history?.count ??
            item.priceHistoryCount ??
            1;

        } else {

          /*
           * No eliminamos el último precio
           * conocido si hoy la fuente no
           * devuelve precio.
           */
          withoutPrice += 1;
        }


        /*
         * --------------------------
         * IMAGEN
         * --------------------------
         */

        const oldImage =
          item.image || "";

        const candidateImage =
          card.image ||
          card._pokexReferenceImage ||
          "";

        const candidateKind =
          card._pokexResolvedImage?.kind ||
          "exact";

        const candidateLanguage =
          card._pokexResolvedImage
            ?.language ||
          item.lang;

        const oldImageCompatible =
          !window.PokEXImageResolver
            ?.isImageCompatible ||
          window.PokEXImageResolver
            .isImageCompatible(
              oldImage,
              item.lang,
              item.imageKind || "exact"
            );

        const newImage =
          (
            !window.PokEXImageResolver
              ?.isImageCompatible ||
            window.PokEXImageResolver
              .isImageCompatible(
                candidateImage,
                item.lang,
                candidateKind
              )
          )
            ? candidateImage
            : "";


        if (
          newImage &&
          (
            newImage !== oldImage ||
            candidateKind !==
              item.imageKind ||
            candidateLanguage !==
              item.imageLanguage
          )
        ) {

          if (!oldImage) {
            recoveredImages += 1;
          } else if (
            newImage !== oldImage
          ) {
            changedImages += 1;
          }

          item.image =
            newImage;

          item.imageKind =
            candidateKind;

          item.imageLanguage =
            candidateLanguage;
        } else if (
          oldImage &&
          !oldImageCompatible
        ) {
          item.image = "";
          item.imageKind = "exact";
          item.imageLanguage =
            item.lang;
          changedImages += 1;
        }


        /*
         * v3.2: recuperar imagen o precio nunca
         * reescribe nombre, número, rareza o set.
         */


        item.lastCheckedAt =
          Date.now();


        /*
         * Cantidad NO se toca.
         */
        await saveCard(item);


      } catch (error) {

        errors += 1;

        console.warn(
          "PokEX update:",
          item?.name,
          error
        );
      }


      /*
       * Pequeña pausa para no disparar
       * cientos de peticiones seguidas.
       */
      if (
        i < items.length - 1
      ) {
        await sleep(120);
      }
    }


    const now =
      Date.now();


    try {

      localStorage.setItem(
        POKEDEX_LAST_UPDATE,
        String(now)
      );

    } catch (_) {}


    renderLastUpdate();

    await refreshCounter();


    const search =
      document.getElementById(
        "pokedexSearch"
      );


    await renderPokedex(
      search?.value || "",
      true
    );

    notifyCollectionChanged({
      full: true,
      changedAt: Date.now()
    });


    const parts = [
      `${updatedPrices} precios`,
      `${recoveredImages} imágenes recuperadas`
    ];


    if (changedImages) {
      parts.push(
        `${changedImages} imágenes renovadas`
      );
    }


    if (withoutPrice) {
      parts.push(
        `${withoutPrice} sin precio nuevo`
      );
    }


    if (errors) {
      parts.push(
        `${errors} errores`
      );
    }


    setUpdateStatus(
      `✅ Actualización terminada · ${parts.join(" · ")}`,
      errors
        ? "warning"
        : "success"
    );


    button.disabled = false;
    button.textContent =
      "⟳ Actualizar";
  }


  const updatePokedexButton =
    document.getElementById(
      "updatePokedex"
    );


  if (updatePokedexButton) {

    updatePokedexButton
      .addEventListener(
        "click",
        updateEntirePokedex
      );
  }


  renderLastUpdate();


  window.addEventListener(
    "pokex:collection-reloaded",
    async () => {
      await refreshCounter();

      if (
        !overlay.classList.contains(
          "hidden"
        )
      ) {
        const search =
          document.getElementById(
            "pokedexSearch"
          );

        await renderPokedex(
          search?.value || "",
          true
        );
      }
    }
  );


})();
