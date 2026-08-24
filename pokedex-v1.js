(() => {

  const DB_NAME = "tcgscan-pokedex";
  const STORE = "cards";

  function openPokedexDB() {
    return new Promise((resolve, reject) => {
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
      req.onerror = () => reject(req.error);
    });
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


  function keyFor(card) {
    const lang =
      window.langEl?.value || "en";

    return `${lang}:${card.id}`;
  }


  async function addOne(card) {
    const key = keyFor(card);

    const existing =
      await getCard(key);

    const cm =
      card.pricing?.cardmarket || {};

    const item = existing || {
      key,
      id: card.id,
      lang: window.langEl?.value || "en",
      name: card.name,
      localId: card.localId,
      rarity: card.rarity || "",
      setName: card.set?.name || "",
      image: card.image || "",
      quantity: 0,
      addedAt: Date.now()
    };

    item.quantity += 1;

    item.lastTrend =
      cm.trend ?? item.lastTrend ?? null;

    item.priceUpdated =
      cm.updated ?? item.priceUpdated ?? null;

    await saveCard(item);

    await refreshCounter();

    return item;
  }


  async function removeOne(card) {
    const key = keyFor(card);

    const existing =
      await getCard(key);

    if (!existing)
      return null;

    existing.quantity -= 1;

    if (existing.quantity <= 0) {
      await deleteCard(key);
      await refreshCounter();
      return null;
    }

    await saveCard(existing);
    await refreshCounter();

    return existing;
  }


  function money(v) {
    if (
      typeof v !== "number" ||
      !Number.isFinite(v)
    ) return "—";

    return v.toFixed(2) + " €";
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

    </div>

    <div class="pokedex-content">

      <input id="pokedexSearch"
             class="pokedex-search"
             type="search"
             placeholder="Buscar en mi colección…">

      <div id="pokedexValue"
           class="pokedex-value">
      </div>

      <div id="pokedexGrid"
           class="pokedex-grid">
      </div>

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


  async function renderPokedex(filter = "") {
    let items =
      await getAll();

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

    const totalCards =
      items.reduce(
        (sum, x) =>
          sum + x.quantity,
        0
      );

    const totalValue =
      items.reduce(
        (sum, x) =>
          sum +
          (
            typeof x.lastTrend === "number"
              ? x.lastTrend * x.quantity
              : 0
          ),
        0
      );

    document.getElementById(
      "pokedexStats"
    ).textContent =
      `${items.length} distintas · ${totalCards} cartas`;

    document.getElementById(
      "pokedexValue"
    ).innerHTML = `
      <span>Valor orientativo de la colección</span>
      <strong>${money(totalValue)}</strong>
      <small>Según el último precio consultado de cada carta</small>
    `;


    if (!items.length) {
      grid.innerHTML = `
        <div class="pokedex-empty">
          🃏<br>
          Aún no tienes cartas aquí.
        </div>
      `;
      return;
    }


    items.forEach(item => {

      const div =
        document.createElement("button");

      div.type = "button";
      div.className = "pokedex-card";

      const image =
        item.image
          ? (
              /\.(?:jpe?g|png|webp)(?:\?.*)?$/i
                .test(item.image)
                ? item.image
                : `${item.image}/low.webp`
            )
          : "";

      div.innerHTML = `
        <div class="pokedex-img-wrap">

          ${
            image
              ? `<img src="${image}"
                      loading="lazy"
                      alt="${item.name}">`
              : `<div class="pokedex-noimg">
                   Sin imagen
                 </div>`
          }

          <span class="pokedex-qty">
            x${item.quantity}
          </span>

        </div>

        <strong>${item.name}</strong>

        <span>
          Nº ${item.localId || "—"}
        </span>

        <small>
          ${item.setName || ""}
        </small>

        <b>
          ${money(item.lastTrend)}
        </b>
      `;


      div.addEventListener(
        "click",
        async () => {

          overlay.classList.add(
            "hidden"
          );

          document.body.classList.remove(
            "pokedex-open"
          );

          if (window.langEl) {
            window.langEl.value =
              item.lang;
          }

          if (
            typeof window.openCard ===
            "function"
          ) {
            await window.openCard(
              item.id
            );
          }
        }
      );

      grid.appendChild(div);
    });
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

        await renderPokedex();
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
      e =>
        renderPokedex(
          e.target.value
        )
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
        await getCard(
          keyFor(card)
        );


      const controls =
        document.createElement("div");

      controls.className =
        "pokedex-card-controls";


      async function redraw() {
        const item =
          await getCard(
            keyFor(card)
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

})();
