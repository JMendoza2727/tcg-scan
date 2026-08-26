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
  const FALLBACK_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ja"];
  const inFlight = new Map();
  const memoryCache = new Map();

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
    return `${lang || "unknown"}:${String(card?.id || "")}`;
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

  async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "force-cache",
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

    const languages = FALLBACK_LANGUAGES.filter(item => item !== lang);
    const responses = await Promise.all(
      languages.map(async language => {
        const url = `${TCGDEX_API}/${language}/cards/${encodeURIComponent(id)}`;
        const data = await fetchJson(url);
        return data?.image ? { data, language } : null;
      })
    );

    const match = responses.find(Boolean);
    if (!match) return null;

    return {
      image: match.data.image,
      kind: "exact",
      source: "TCGdex",
      language: match.language,
      label: `Carta exacta · imagen ${match.language.toUpperCase()}`
    };
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

  async function resolveFromPokemonTCG(card, lang, pokemonMatch) {
    if (!pokemonMatch || !card?.localId) return null;

    const englishCardName = replacePokemonName(card.name, pokemonMatch);
    const query = `name:"${lucenePhrase(englishCardName)}" number:${lucenePhrase(card.localId)}`;
    const params = new URLSearchParams({
      q: query,
      pageSize: "12",
      select: "id,name,number,set,images"
    });

    const response = await fetchJson(`${POKEMON_TCG_API}?${params}`);
    const candidates = Array.isArray(response?.data) ? response.data : [];
    const wantedName = normalize(englishCardName);
    const wantedNumber = normalizeNumber(card.localId);

    let exact = candidates.filter(candidate =>
      normalize(candidate?.name) === wantedName &&
      normalizeNumber(candidate?.number) === wantedNumber &&
      (candidate?.images?.large || candidate?.images?.small)
    );

    const wantedCardId = normalize(card?.id);
    const wantedSetId = normalize(card?.set?.id);
    const wantedSetName = normalize(card?.set?.name);
    const byIdentity = exact.filter(candidate =>
      (wantedCardId && normalize(candidate?.id) === wantedCardId) ||
      (wantedSetId && normalize(candidate?.set?.id) === wantedSetId) ||
      (wantedSetName && normalize(candidate?.set?.name) === wantedSetName)
    );

    exact = byIdentity;

    if (exact.length !== 1) return null;

    return {
      image: exact[0].images.large || exact[0].images.small,
      kind: "exact",
      source: "Pokémon TCG API",
      language: "en",
      label: "Carta exacta · imagen alternativa"
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

  window.PokEXImageResolver = { resolve };
})();
