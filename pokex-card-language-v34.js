(() => {
  const DB_NAME = "tcgscan-pokedex";
  const STORE = "cards";
  const VALID = ["es", "en", "ja"];
  const FLAGS = { es: "🇪🇸", en: "🇬🇧", ja: "🇯🇵" };
  const LABELS = { es: "Español", en: "Inglés", ja: "Japonés" };

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCard(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function putCard(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function removeCard(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function emit(detail) {
    window.dispatchEvent(new CustomEvent("pokex:collection-changed", { detail }));
  }

  async function findStored(card) {
    const selected = document.getElementById("lang")?.value;
    if (VALID.includes(selected)) {
      const direct = await getCard(`${selected}:${card.id}`);
      if (direct) return direct;
    }

    const all = await getAll();
    return all.find(item => String(item.id) === String(card.id) && Number(item.quantity || 0) > 0) || null;
  }

  async function changeLanguage(item, newLang) {
    if (!item || !VALID.includes(newLang)) return item;

    const oldKey = item.key || `${item.lang || "es"}:${item.id}`;
    const oldLang = VALID.includes(item.lang) ? item.lang : oldKey.split(":", 1)[0];
    if (oldLang === newLang && item.languageVerified === true) return item;

    const newKey = `${newLang}:${item.id}`;
    const changedAt = Date.now();
    const target = newKey === oldKey ? null : await getCard(newKey);

    let next;
    if (target) {
      next = {
        ...item,
        ...target,
        key: newKey,
        lang: newLang,
        languageVerified: true,
        quantity: Math.max(0, Number(item.quantity) || 0) + Math.max(0, Number(target.quantity) || 0),
        collectionUpdatedAt: changedAt
      };

      if (Array.isArray(item.copies) || Array.isArray(target.copies)) {
        next.copies = [...(Array.isArray(target.copies) ? target.copies : []), ...(Array.isArray(item.copies) ? item.copies : [])];
        next.quantity = Math.max(next.quantity, next.copies.length);
      }
    } else {
      next = {
        ...item,
        key: newKey,
        lang: newLang,
        languageVerified: true,
        collectionUpdatedAt: changedAt
      };
    }

    // El idioma de la imagen puede seguir siendo distinto: no lo alteramos.
    // La bandera representa el idioma físico indicado por el propietario.
    await putCard(next);

    if (oldKey !== newKey) {
      await removeCard(oldKey);
      emit({ key: oldKey, item: null, deleted: true, changedAt });
    }

    emit({ key: newKey, item: next, deleted: false, changedAt });

    const selector = document.getElementById("lang");
    if (selector) selector.value = newLang;

    return next;
  }

  function style() {
    if (document.getElementById("pokexCardLanguageStyle")) return;
    const el = document.createElement("style");
    el.id = "pokexCardLanguageStyle";
    el.textContent = `
      .pokex-card-language{margin:0 0 12px;padding:13px 14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.045)}
      .pokex-card-language-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .pokex-card-language-head strong{font-size:14px}.pokex-card-language-head small{color:var(--muted);font-size:11px}
      .pokex-card-language-options{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .pokex-card-language-option{min-height:46px;padding:7px 8px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.06);color:#fff;box-shadow:none;font-size:20px;font-weight:800}
      .pokex-card-language-option.active{border-color:#f7c928;background:rgba(247,201,40,.13);box-shadow:0 0 0 1px rgba(247,201,40,.22) inset}
      .pokex-card-language-option:disabled{opacity:.55}
    `;
    document.head.appendChild(el);
  }

  async function inject(card, controls) {
    if (!card || !controls || controls.querySelector(".pokex-card-language")) return;
    const item = await findStored(card);
    if (!item) return;

    const lang = VALID.includes(item.lang) ? item.lang : "es";
    const box = document.createElement("div");
    box.className = "pokex-card-language";
    box.innerHTML = `
      <div class="pokex-card-language-head">
        <strong>Idioma de la carta</strong>
        <small>Corrige la bandera si hace falta</small>
      </div>
      <div class="pokex-card-language-options">
        ${VALID.map(code => `<button type="button" class="pokex-card-language-option ${code === lang ? "active" : ""}" data-card-lang="${code}" aria-label="${LABELS[code]}">${FLAGS[code]}</button>`).join("")}
      </div>`;

    controls.prepend(box);

    box.querySelectorAll("[data-card-lang]").forEach(button => {
      button.addEventListener("click", async () => {
        const newLang = button.dataset.cardLang;
        if (!VALID.includes(newLang) || newLang === (await findStored(card))?.lang) return;

        box.querySelectorAll("button").forEach(btn => btn.disabled = true);
        try {
          const current = await findStored(card);
          if (!current) return;
          await changeLanguage(current, newLang);
          box.querySelectorAll("[data-card-lang]").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.cardLang === newLang);
          });
        } catch (error) {
          console.warn("PokEX cambio de idioma:", error);
        } finally {
          box.querySelectorAll("button").forEach(btn => btn.disabled = false);
        }
      });
    });
  }

  function wrapAttach() {
    const original = window.tcgCollectionAttach;
    if (typeof original !== "function" || original.__pokexLanguageWrapped) return false;

    const wrapped = async function(card) {
      await original(card);
      const controls = document.querySelector("#resultBox .detail .pokedex-card-controls");
      if (!controls) return;

      await inject(card, controls);

      const observer = new MutationObserver(() => {
        if (!controls.querySelector(".pokex-card-language")) inject(card, controls);
      });
      observer.observe(controls, { childList: true });
    };

    wrapped.__pokexLanguageWrapped = true;
    window.tcgCollectionAttach = wrapped;
    return true;
  }

  style();
  if (!wrapAttach()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (wrapAttach() || tries > 80) clearInterval(timer);
    }, 100);
  }
})();
