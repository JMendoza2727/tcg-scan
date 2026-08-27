(() => {
  "use strict";

  const DB_NAME = "pokex-price-resolver";
  const STORE_NAME = "entries";
  const DB_VERSION = 1;
  const POSITIVE_TTL = 24 * 60 * 60 * 1000;
  const NEGATIVE_TTL = 24 * 60 * 60 * 1000;
  const inFlight = new Map();
  const memoryCache = new Map();

  let dbPromise = null;

  function cacheKey(card, lang) {
    return `${lang || "unknown"}:${String(card?.id || "")}`;
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
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
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(key);
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
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  function normalizeVariantKey(key) {
    const compact = String(key || "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();

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
    const source = cardmarket?.prices;
    if (!source || typeof source !== "object") return null;

    const trend = firstFinite(
      source.trendPrice,
      source.averageSellPrice,
      source.avg7,
      source.avg30
    );

    if (trend === null) return null;

    return {
      trend,
      low: finite(source.lowPrice),
      avg1: finite(source.avg1),
      avg7: finite(source.avg7),
      avg30: finite(source.avg30),
      updated: cardmarket.updatedAt || null
    };
  }

  function mapTCGplayer(tcgplayer) {
    const source = tcgplayer?.prices;
    if (!source || typeof source !== "object") return null;

    const result = {
      updated: tcgplayer.updatedAt || null,
      unit: "USD"
    };

    let found = false;

    for (const [rawKey, values] of Object.entries(source)) {
      if (!values || typeof values !== "object") continue;

      const mapped = {
        lowPrice: finite(values.low),
        midPrice: finite(values.mid),
        highPrice: finite(values.high),
        marketPrice: finite(values.market),
        directLowPrice: finite(values.directLow)
      };

      if (Object.values(mapped).every(value => value === null)) continue;

      result[normalizeVariantKey(rawKey)] = mapped;
      found = true;
    }

    return found ? result : null;
  }

  function mapExternalCard(externalCard) {
    if (!externalCard || typeof externalCard !== "object") return null;

    const cardmarket = mapCardmarket(externalCard.cardmarket);
    const tcgplayer = mapTCGplayer(externalCard.tcgplayer);

    if (!cardmarket && !tcgplayer) return null;

    return {
      pricing: {
        ...(cardmarket ? { cardmarket } : {}),
        ...(tcgplayer ? { tcgplayer } : {})
      },
      source: "Pokémon TCG API",
      matchedId: String(externalCard.id || ""),
      label: "Estimación externa de mercado"
    };
  }

  function applyResult(card, result) {
    if (!card || !result?.pricing) return false;

    card.pricing = {
      ...(card.pricing || {}),
      ...result.pricing
    };

    card._pokexExternalPrice = {
      source: result.source,
      matchedId: result.matchedId,
      label: result.label,
      resolvedAt: result.resolvedAt || Date.now()
    };

    return true;
  }

  async function resolve(card, lang = "es") {
    if (!card?.id || String(card.id).startsWith("pokexjp:")) return null;

    const key = cacheKey(card, lang);
    if (inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      const cached = await readCache(key);
      const ttl = cached?.result ? POSITIVE_TTL : NEGATIVE_TTL;

      if (cached && Date.now() - cached.savedAt < ttl) {
        return cached.result || null;
      }

      if (navigator.onLine === false) {
        return cached?.result || null;
      }

      const findExact = window.PokEXImageResolver?.findExactExternalCard;
      if (typeof findExact !== "function") return null;

      const externalCard = await findExact(card, lang);
      const mapped = mapExternalCard(externalCard);
      const result = mapped
        ? { ...mapped, resolvedAt: Date.now() }
        : null;

      await writeCache({
        key,
        savedAt: Date.now(),
        result
      });

      return result;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, task);
    return task;
  }

  window.PokEXPriceResolver = {
    resolve,
    applyResult,
    mapExternalCard
  };
})();
