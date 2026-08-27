(() => {
  "use strict";

  const TCGDEX_API = "https://api.tcgdex.net/v2";
  const POKEMON_TCG_API = "https://api.pokemontcg.io/v2/cards";
  const DB_NAME = "pokex-image-resolver";
  const STORE_NAME = "entries";
  const DB_VERSION = 1;
  const POSITIVE_TTL = 180 * 24 * 60 * 60 * 1000;
  const NEGATIVE_TTL = 7 * 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 4500;
  const CACHE_SCHEMA = "v242";
  const inFlight = new Map();
  const memoryCache = new Map();
  const externalCardCache = new Map();

  let dbPromise = null;
  let namesPromise = null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

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

  function cacheKey(card, lang) {
    return `${CACHE_SCHEMA}:${lang || "unknown"}:${String(card?.id || "")}`;
  }

  function imageLanguage(image) {
    const value = String(image || "");

    if (/images\.pokemontcg\.io\//i.test(value))
      return "en";

    const tcgdex = value.match(
      /assets\.tcgdex\.net\/([a-z]{2})(?:\/|$)/i
    );

    return tcgdex
      ? tcgdex[1].toLocaleLowerCase()
      : null;
  }

  function isImageCompatible(
    image,
    lang,
    kind = "exact"
  ) {
    if (
      !image ||
      kind === "reference" ||
      kind === "translated"
    )
      return true;

    const detected =
      imageLanguage(image);

    return !detected ||
      !lang ||
      detected ===
        String(lang).toLocaleLowerCase();
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
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const entry = request.result || null;
        if (entry) memoryCache.set(key, entry);
        resolve(entry);
      };
      request.onerror = () => resolve(null);
    });
  }

  async function writeCache(entry) {
    memoryCache.set(entry.key, entry);
    const db = await openDatabase();
    if (!db) return;

    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
    } catch (_) {}
  }

  function applyResult(card, result) {
    if (!card || !result?.image) return false;

    if (
      result.kind === "exact" ||
      result.kind === "translated"
    ) {
      if (
        result.cardId &&
        normalize(result.cardId) !==
          normalize(card.id)
      ) {
        return false;
      }

      if (
        result.localId &&
        card.localId &&
        normalizeNumber(result.localId) !==
          normalizeNumber(card.localId)
      ) {
        return false;
      }

      if (
        result.setId &&
        card.set?.id &&
        normalize(result.setId) !==
          normalize(card.set.id)
      ) {
        return false;
      }

      if (
        result.kind === "exact" &&
        result.requestedLanguage &&
        result.language !==
          result.requestedLanguage
      ) {
        return false;
      }

      if (
        result.kind === "translated" &&
        (
          !result.requestedLanguage ||
          !result.language ||
          result.language ===
            result.requestedLanguage
        )
      ) {
        return false;
      }

      if (
        !isImageCompatible(
          result.image,
          result.requestedLanguage,
          result.kind
        )
      ) {
        return false;
      }
    }

    card._pokexResolvedImage = result;

    if (
      result.kind === "exact" ||
      result.kind === "translated"
    ) {
      card.image = result.image;
      card._pokexImageSource = result.source;
    } else {
      card._pokexReferenceImage = result.image;
    }

    return true;
  }

  async function hydrate(cards, defaultLang = "es") {
    const items = Array.isArray(cards) ? cards : [];
    const missing = items.filter(card =>
      card?.id && !card.image && !card._pokexReferenceImage
    );

    if (!missing.length) return 0;

    let entries = [];
    const db = await openDatabase();

    if (db) {
      entries = await new Promise(resolve => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    }

    const indexed = new Map(entries.map(entry => [entry.key, entry]));
    let hydrated = 0;

    for (const card of missing) {
      const key = cacheKey(card, card.lang || defaultLang);
      const entry = memoryCache.get(key) || indexed.get(key);

      if (
        entry?.result &&
        Date.now() - entry.savedAt < POSITIVE_TTL &&
        applyResult(card, entry.result)
      ) {
        memoryCache.set(key, entry);
        hydrated += 1;
      }
    }

    return hydrated;
  }

  async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "default",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveFromTCGdex(card, lang) {
    const id = String(card?.id || "");
    if (!id || id.startsWith("pokexjp:")) return null;

    const requestedLanguage =
      String(lang || "es")
        .toLocaleLowerCase();

    async function resolveLanguage(
      imageLanguage,
      kind
    ) {
      const url =
        `${TCGDEX_API}/${imageLanguage}/cards/` +
        encodeURIComponent(id);

      const data = await fetchJson(url);

      if (
        !data?.image ||
        normalize(data.id) !== normalize(id) ||
        (
          card.localId &&
          normalizeNumber(data.localId) !==
            normalizeNumber(card.localId)
        ) ||
        (
          card.set?.id &&
          data.set?.id &&
          normalize(data.set.id) !==
            normalize(card.set.id)
        )
      ) {
        return null;
      }

      return {
        image: data.image,
        kind,
        source: "TCGdex",
        language: imageLanguage,
        requestedLanguage,
        cardId: data.id,
        localId: data.localId,
        setId: data.set?.id || null,
        label:
          kind === "translated"
            ? `Misma carta · imagen ${imageLanguage.toUpperCase()}`
            : `Carta exacta · imagen ${imageLanguage.toUpperCase()}`
      };
    }

    const primary =
      await resolveLanguage(
        requestedLanguage,
        "exact"
      );

    if (primary) return primary;

    if (requestedLanguage === "en")
      return null;

    return await resolveLanguage(
      "en",
      "translated"
    );
  }

  async function loadNames() {
    if (namesPromise) return namesPromise;

    namesPromise = fetch("./pokemon-names-v2.1.json?v=2410", {
      cache: "force-cache"
    })
      .then(response => response.ok ? response.json() : [])
      .catch(() => []);

    return namesPromise;
  }

  async function identifyPokemon(card, lang) {
    const name = String(card?.name || "");
    const normalizedName = normalize(name);
    if (!normalizedName) return null;

    const names = await loadNames();
    const candidates = [];

    for (const pokemon of names) {
      for (const language of [lang, "es", "en", "ja"]) {
        const alias = String(pokemon?.[language] || "");
        const normalizedAlias = normalize(alias);
        if (!normalizedAlias || !normalizedName.includes(normalizedAlias)) continue;

        candidates.push({ pokemon, alias, length: normalizedAlias.length });
      }
    }

    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || null;
  }

  function replacePokemonName(cardName, match) {
    const englishName = String(match?.pokemon?.en || "").trim();
    const alias = String(match?.alias || "").trim();
    if (!englishName || !alias) return String(cardName || "");

    const position = String(cardName).toLocaleLowerCase()
      .indexOf(alias.toLocaleLowerCase());

    if (position < 0) return englishName;

    return (
      String(cardName).slice(0, position) +
      englishName +
      String(cardName).slice(position + alias.length)
    ).trim();
  }

  function lucenePhrase(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"");
  }

  async function findExactExternalCard(card, lang, pokemonMatch = null) {
    const id = String(card?.id || "");
    if (!id || id.startsWith("pokexjp:")) return null;

    const key = `${lang || "unknown"}:${id}`;
    if (externalCardCache.has(key)) return externalCardCache.get(key);

    const task = (async () => {
      const direct = await fetchJson(
        `${POKEMON_TCG_API}/${encodeURIComponent(id)}`
      );

      if (
        direct?.data &&
        normalize(direct.data.id) === normalize(id) &&
        (
          !card.localId ||
          normalizeNumber(direct.data.number) === normalizeNumber(card.localId)
        )
      ) {
        return direct.data;
      }

      const match = pokemonMatch || await identifyPokemon(card, lang);
      if (!card.localId) return null;

      const englishCardName = match
        ? replacePokemonName(card.name, match)
        : (lang === "en" ? String(card.name || "").trim() : "");
      if (!englishCardName) return null;

      const query = `name:"${lucenePhrase(englishCardName)}" number:${lucenePhrase(card.localId)}`;
      const params = new URLSearchParams({ q: query, pageSize: "12" });
      const response = await fetchJson(`${POKEMON_TCG_API}?${params}`);
      const candidates = Array.isArray(response?.data) ? response.data : [];
      const wantedName = normalize(englishCardName);
      const wantedNumber = normalizeNumber(card.localId);
      const wantedCardId = normalize(card.id);
      const wantedSetId = normalize(card?.set?.id);
      const wantedSetName = normalize(card?.set?.name);

      const exact = candidates.filter(candidate =>
        normalize(candidate?.name) === wantedName &&
        normalizeNumber(candidate?.number) === wantedNumber &&
        (
          (wantedCardId && normalize(candidate?.id) === wantedCardId) ||
          (wantedSetId && normalize(candidate?.set?.id) === wantedSetId) ||
          (wantedSetName && normalize(candidate?.set?.name) === wantedSetName)
        )
      );

      return exact.length === 1 ? exact[0] : null;
    })();

    externalCardCache.set(key, task);
    return task;
  }

  async function resolveFromPokemonTCG(card, lang, pokemonMatch) {
    const exact = await findExactExternalCard(card, lang, pokemonMatch);
    if (!exact?.images) return null;

    const image = exact.images.large || exact.images.small;
    if (!image) return null;

    return {
      image,
      kind:
        lang === "en"
          ? "exact"
          : "translated",
      source: "Pokémon TCG API",
      language: "en",
      requestedLanguage: lang,
      cardId: exact.id,
      localId: exact.number,
      setId: exact.set?.id || null,
      label:
        lang === "en"
          ? "Carta exacta · imagen alternativa"
          : "Misma carta · imagen EN"
    };
  }

  function resolveSpeciesArtwork(pokemonMatch) {
    const id = Number(pokemonMatch?.pokemon?.id);
    if (!Number.isInteger(id) || id < 1) return null;

    return {
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
      kind: "reference",
      source: "PokéAPI sprites",
      language: null,
      label: "Ilustración del Pokémon · no es la carta exacta"
    };
  }

  async function resolveUncached(card, lang) {
    const tcgdex = await resolveFromTCGdex(card, lang);
    if (tcgdex) return tcgdex;

    const pokemonMatch = await identifyPokemon(card, lang);
    const pokemonTCG = await resolveFromPokemonTCG(card, lang, pokemonMatch);
    if (pokemonTCG) return pokemonTCG;

    return resolveSpeciesArtwork(pokemonMatch);
  }

  async function resolve(card, lang = "es") {
    const key = cacheKey(card, lang);
    if (!card?.id) return null;
    if (inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      const cached = await readCache(key);
      const ttl = cached?.result ? POSITIVE_TTL : NEGATIVE_TTL;

      if (cached && Date.now() - cached.savedAt < ttl) {
        return cached.result || null;
      }

      const result = await resolveUncached(card, lang);
      await writeCache({ key, savedAt: Date.now(), result: result || null });
      return result;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, task);
    return task;
  }

  window.PokEXImageResolver = {
    resolve,
    hydrate,
    applyResult,
    findExactExternalCard,
    isImageCompatible
  };
})();
