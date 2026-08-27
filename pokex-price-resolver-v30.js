(() => {
  "use strict";

  const API = "https://api.tcgdex.net/v2";
  const DB_NAME = "pokex-price-resolver";
  const STORE_NAME = "entries";
  const HISTORY_STORE = "history";
  const DB_VERSION = 2;
  const POSITIVE_TTL = 24 * 60 * 60 * 1000;
  const NEGATIVE_TTL = 6 * 60 * 60 * 1000;
  const CACHE_SCHEMA = "v321-language";
  const inFlight = new Map();
  const memoryCache = new Map();
  let dbPromise = null;

  function cacheKey(card, lang) {
    return `${CACHE_SCHEMA}:${lang || "unknown"}:${String(card?.id || "")}`;
  }

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function firstFinite(...values) {
    for (const value of values) {
      const number = finite(value);
      if (number !== null) return number;
    }
    return null;
  }

  function openDatabase() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(resolve => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
        if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    return dbPromise;
  }

  async function readCache(key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    const db = await openDatabase();
    if (!db) return null;

    return new Promise(resolve => {
      try {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => {
          const entry = request.result || null;
          if (entry) memoryCache.set(key, entry);
          resolve(entry);
        };
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function writeCache(entry) {
    memoryCache.set(entry.key, entry);
    const db = await openDatabase();
    if (!db) return;

    await new Promise(resolve => {
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(entry);
        transaction.oncomplete = resolve;
        transaction.onerror = resolve;
        transaction.onabort = resolve;
      } catch (_) {
        resolve();
      }
    });
  }

  function historyKey(card, lang) {
    return `${String(lang || "unknown").toLocaleLowerCase()}:${String(card?.id || "")}`;
  }

  function summarizeHistory(entry) {
    const samples = Array.isArray(entry?.samples)
      ? entry.samples.filter(sample => finite(sample?.value) !== null)
      : [];
    if (!samples.length) return null;

    const values = samples.map(sample => Number(sample.value));
    const latest = samples[samples.length - 1];
    return {
      current: Number(latest.value),
      min: Math.min(...values),
      max: Math.max(...values),
      count: samples.length,
      firstAt: samples[0].at,
      lastAt: latest.at,
      currency: latest.currency || "EUR",
      source: latest.source || null
    };
  }

  async function readHistory(card, lang) {
    if (!card?.id) return null;
    const db = await openDatabase();
    if (!db) return null;
    const key = historyKey(card, lang);

    return new Promise(resolve => {
      try {
        const request = db.transaction(HISTORY_STORE, "readonly").objectStore(HISTORY_STORE).get(key);
        request.onsuccess = () => resolve(summarizeHistory(request.result));
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function recordHistory(card, lang, price) {
    const value = finite(price?.value);
    if (!card?.id || value === null || price?.currency !== "EUR") return readHistory(card, lang);

    const db = await openDatabase();
    if (!db) return null;
    const key = historyKey(card, lang);

    return new Promise(resolve => {
      try {
        const transaction = db.transaction(HISTORY_STORE, "readwrite");
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.get(key);
        let savedEntry = null;

        request.onsuccess = () => {
          const entry = request.result || { key, samples: [] };
          const samples = Array.isArray(entry.samples) ? entry.samples : [];
          const sourceUpdated = price.updated || null;
          const latest = samples[samples.length - 1];
          const duplicate = latest &&
            Math.abs(Number(latest.value) - value) < 0.005 &&
            latest.source === (price.source || null) &&
            latest.sourceUpdated === sourceUpdated;

          if (!duplicate) {
            samples.push({
              value,
              currency: "EUR",
              source: price.source || null,
              variant: price.variantKey || null,
              sourceUpdated,
              at: Date.now()
            });
          }

          entry.samples = samples.slice(-365);
          entry.updatedAt = Date.now();
          savedEntry = entry;
          store.put(entry);
        };

        request.onerror = () => resolve(null);
        transaction.oncomplete = () => resolve(summarizeHistory(savedEntry));
        transaction.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function normalizeVariantKey(key) {
    const compact = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const known = {
      normal: "normal",
      holofoil: "holofoil",
      reverseholofoil: "reverse-holofoil",
      "1steditionnormal": "1st-edition",
      "1steditionholofoil": "1st-edition-holofoil",
      unlimitednormal: "unlimited",
      unlimitedholofoil: "unlimited-holofoil"
    };
    if (known[compact]) return known[compact];
    return String(key || "variant")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  function mapCardmarket(cardmarket) {
    const source = cardmarket?.prices || cardmarket;
    if (!source || typeof source !== "object") return null;

    const trend = firstFinite(
      source.trend,
      source.trendPrice,
      source.averageSellPrice,
      source.avg,
      source.avg7,
      source.avg30
    );
    if (trend === null) return null;

    return {
      trend,
      low: firstFinite(source.low, source.lowPrice),
      avg1: finite(source.avg1),
      avg7: finite(source.avg7),
      avg30: finite(source.avg30),
      updated: cardmarket.updated || cardmarket.updatedAt || null
    };
  }

  function mapTCGplayer(tcgplayer) {
    const source = tcgplayer?.prices || tcgplayer;
    if (!source || typeof source !== "object") return null;

    const result = { updated: tcgplayer.updated || tcgplayer.updatedAt || null, unit: "USD" };
    let found = false;

    for (const [rawKey, values] of Object.entries(source)) {
      if (!values || typeof values !== "object") continue;
      const mapped = {
        lowPrice: firstFinite(values.lowPrice, values.low),
        midPrice: firstFinite(values.midPrice, values.mid),
        highPrice: firstFinite(values.highPrice, values.high),
        marketPrice: firstFinite(values.marketPrice, values.market),
        directLowPrice: firstFinite(values.directLowPrice, values.directLow)
      };
      if (Object.values(mapped).every(value => value === null)) continue;
      result[normalizeVariantKey(rawKey)] = mapped;
      found = true;
    }

    return found ? result : null;
  }

  function mapExternalCard(externalCard) {
    if (!externalCard || typeof externalCard !== "object") return null;
    const cardmarket = mapCardmarket(externalCard.cardmarket || externalCard.pricing?.cardmarket);
    const tcgplayer = mapTCGplayer(externalCard.tcgplayer || externalCard.pricing?.tcgplayer);
    if (!cardmarket && !tcgplayer) return null;

    return {
      pricing: {
        ...(cardmarket ? { cardmarket } : {}),
        ...(tcgplayer ? { tcgplayer } : {})
      },
      source: externalCard.pricing ? "TCGdex" : "Pokémon TCG API",
      matchedId: String(externalCard.id || ""),
      label: "Estimación externa de mercado"
    };
  }

  function applyResult(card, result) {
    if (!card || !result?.pricing) return false;
    card.pricing = { ...(card.pricing || {}), ...result.pricing };
    card._pokexExternalPrice = {
      source: result.source,
      matchedId: result.matchedId,
      label: result.label,
      resolvedAt: result.resolvedAt || Date.now()
    };
    return true;
  }

  function exactJapaneseId(card) {
    const rawId = String(card?.id || "");
    if (rawId && !rawId.startsWith("pokexjp:")) return rawId;

    const setId = String(card?.set?.id || card?._pokexJPData?.s || "").trim();
    const localId = String(card?.localId || card?._pokexJPData?.num || "").trim();
    if (!setId || !localId) return "";
    return `${setId}-${localId}`;
  }

  async function fetchJapaneseExact(card) {
    const id = exactJapaneseId(card);
    if (!id) return null;

    try {
      const response = await fetch(`${API}/ja/cards/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) return null;
      const candidate = await response.json();
      if (String(candidate?.id || "").toLocaleLowerCase() !== id.toLocaleLowerCase()) return null;
      return candidate;
    } catch (_) {
      return null;
    }
  }

  async function resolve(card, lang = "es") {
    if (!card?.id) return null;

    const requestedLanguage = String(lang || "es").toLocaleLowerCase();
    if (!["en", "ja"].includes(requestedLanguage)) return null;

    const key = cacheKey(card, requestedLanguage);
    if (inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      const cached = await readCache(key);
      const ttl = cached?.result ? POSITIVE_TTL : NEGATIVE_TTL;
      if (cached && Date.now() - cached.savedAt < ttl) return cached.result || null;
      if (navigator.onLine === false) return cached?.result || null;

      let externalCard = null;

      if (requestedLanguage === "ja") {
        externalCard = await fetchJapaneseExact(card);
      } else {
        const findExact = window.PokEXImageResolver?.findExactExternalCard;
        if (typeof findExact === "function") {
          externalCard = await findExact(card, requestedLanguage);
        }
      }

      const mapped = mapExternalCard(externalCard);
      const result = mapped ? { ...mapped, resolvedAt: Date.now() } : null;
      await writeCache({ key, savedAt: Date.now(), result });
      return result;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, task);
    return task;
  }

  window.PokEXPriceResolver = {
    resolve,
    applyResult,
    mapExternalCard,
    recordHistory,
    readHistory
  };
})();
