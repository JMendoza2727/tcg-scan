(() => {
  "use strict";

  const resolver = window.PokEXImageResolver;
  if (!resolver?.resolve || !resolver?.applyResult) return;

  const originalResolve = resolver.resolve.bind(resolver);
  const originalHydrate = resolver.hydrate?.bind(resolver);
  const probeCache = new Map();
  const fallbackCache = new Map();

  function normalizeNumber(value) {
    const raw = String(value || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^#/, "");
    const match = raw.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
    if (!match) return raw;
    return `${match[1]}${Number(match[2])}${match[3]}`;
  }

  function assetUrl(base, quality = "low") {
    const value = String(base || "").trim();
    if (!value) return "";
    if (/^(?:data:|blob:)/i.test(value) || /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value)) {
      return value;
    }
    return `${value.replace(/\/$/, "")}/${quality}.webp`;
  }

  function imageLoads(base) {
    const url = assetUrl(base, "low");
    if (!url) return Promise.resolve(false);
    if (probeCache.has(url)) return probeCache.get(url);

    const task = new Promise(resolve => {
      const image = new Image();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(Boolean(ok));
      };
      const timer = setTimeout(() => finish(false), 3500);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });

    probeCache.set(url, task);
    return task;
  }

  async function fetchEnglishFallback(card, requestedLanguage = "es") {
    const id = String(card?.id || "").trim();
    if (!id || id.startsWith("pokexjp:")) return null;

    const key = `${requestedLanguage}:${id}`;
    if (fallbackCache.has(key)) return fallbackCache.get(key);

    const task = (async () => {
      try {
        const response = await fetch(
          `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );
        if (!response.ok) return null;

        const data = await response.json();
        if (!data?.image) return null;
        if (String(data.id || "") !== id) return null;
        if (
          card?.localId &&
          normalizeNumber(data.localId) !== normalizeNumber(card.localId)
        ) {
          return null;
        }
        if (!(await imageLoads(data.image))) return null;

        return {
          image: data.image,
          kind: requestedLanguage === "en" ? "exact" : "translated",
          source: "TCGdex",
          language: "en",
          requestedLanguage,
          cardId: data.id,
          localId: data.localId,
          setId: data.set?.id || null,
          label:
            requestedLanguage === "en"
              ? "Carta exacta · imagen EN"
              : "Misma carta · imagen EN"
        };
      } catch (_) {
        return null;
      }
    })();

    fallbackCache.set(key, task);
    return task;
  }

  async function resilientResolve(card, lang = "es") {
    const requestedLanguage = String(lang || "es").toLowerCase();
    const primary = await originalResolve(card, requestedLanguage);

    if (primary?.image && (await imageLoads(primary.image))) {
      return primary;
    }

    const english = await fetchEnglishFallback(card, requestedLanguage);
    if (english) return english;

    return primary?.image ? null : primary;
  }

  async function persistCollectionItem(item) {
    if (!item?.key || !window.indexedDB) return;
    try {
      const request = indexedDB.open("tcgscan-pokedex", 1);
      const db = await new Promise(resolve => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      });
      if (!db || !db.objectStoreNames.contains("cards")) return;
      await new Promise(resolve => {
        const tx = db.transaction("cards", "readwrite");
        tx.objectStore("cards").put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch (_) {}
  }

  async function repairItem(item, defaultLang) {
    if (!item?.id) return false;

    const storedImage = item.image || item._pokexReferenceImage || "";
    if (storedImage && (await imageLoads(storedImage))) return false;

    const lang = item.lang || defaultLang || "es";
    const result = await resilientResolve(item, lang);
    if (!result?.image) return false;

    const applied = resolver.applyResult(item, result);
    if (!applied) return false;

    item.image = result.image;
    item.imageKind = result.kind || item.imageKind || "exact";
    item.imageLanguage = result.language || item.imageLanguage || lang;
    await persistCollectionItem(item);
    return true;
  }

  async function resilientHydrate(cards, defaultLang = "es") {
    const items = Array.isArray(cards) ? cards : [];
    let hydrated = 0;

    if (originalHydrate) {
      try {
        hydrated += Number(await originalHydrate(items, defaultLang)) || 0;
      } catch (_) {}
    }

    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          if (await repairItem(items[index], defaultLang)) hydrated += 1;
        } catch (_) {}
      }
    });

    await Promise.all(workers);
    return hydrated;
  }

  resolver.resolve = resilientResolve;
  resolver.hydrate = resilientHydrate;

  // Última red de seguridad para imágenes TCGdex ya pintadas en pantalla.
  document.addEventListener(
    "error",
    event => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.pokexImageFallbackTried === "1") return;

      const src = String(img.currentSrc || img.src || "");
      if (!/assets\.tcgdex\.net\/(?:es|ja)\//i.test(src)) return;

      const english = src.replace(
        /assets\.tcgdex\.net\/(?:es|ja)\//i,
        "assets.tcgdex.net/en/"
      );
      if (english === src) return;

      img.dataset.pokexImageFallbackTried = "1";
      img.src = english;
    },
    true
  );
})();
