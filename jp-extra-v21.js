(() => {
  let catalog = null;
  const byId = new Map();

  async function load() {
    if (catalog) return catalog;

    const r = await fetch("./data/jp-catalog-v21.json?v=3210");
    if (!r.ok) throw new Error("No se pudo cargar el catálogo japonés ampliado.");

    catalog = await r.json();
    for (const rec of catalog) {
      if (rec.jid != null) byId.set(String(rec.jid), rec);
    }

    console.log(`🇯🇵 PokEX JP: ${catalog.length} cartas cargadas`);
    return catalog;
  }

  function text(v) {
    return String(v || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
  }

  function number(v) {
    const raw = String(v || "").normalize("NFKC").trim().toUpperCase();
    const m = raw.match(/^([A-Z]*)(\d+)$/);
    if (!m) return raw;
    return m[1] + String(parseInt(m[2], 10));
  }

  function setCode(v) {
    return String(v || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "");
  }

  function parseQuery(raw) {
    const value = String(raw || "").trim();
    const m = value.match(/(?:^|\s)(?:[-–—#]|n[º°]?\.?\s*)?([A-Za-z]{0,4}\d{1,4}[A-Za-z]?)\s*\/\s*(\d{1,4})(?=\s|$)/i);

    if (m) {
      return {
        name: `${value.slice(0, m.index)} ${value.slice(m.index + m[0].length)}`.trim(),
        num: number(m[1]),
        total: m[2]
      };
    }

    const numbers = [...value.matchAll(/(?:^|\s)(?:#|n[º°]?\.?\s*)?(\d{1,4})(?=\s|$)/gi)];
    if (numbers.length) {
      const last = numbers[numbers.length - 1];
      return {
        name: `${value.slice(0, last.index)} ${value.slice(last.index + last[0].length)}`.trim(),
        num: number(last[1]),
        total: ""
      };
    }

    return { name: value, num: "", total: "" };
  }

  function cardSetCode(card) {
    if (card?.set?.id) return setCode(card.set.id);

    const id = String(card?.id || "");
    const local = String(card?.localId || "");
    if (id && local) {
      const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stripped = id.replace(new RegExp(`[-_]${escaped}$`, "i"), "");
      if (stripped !== id) return setCode(stripped);
    }
    return "";
  }

  function cardKey(card) {
    const s = cardSetCode(card);
    const n = number(card?.localId);
    if (s && n) return `${s}|${n}`;
    return `${text(card?.name)}|${n}`;
  }

  function directImage(url) {
    return String(url || "").trim();
  }

  function toCard(rec) {
    return {
      id: `pokexjp:${rec.jid}`,
      name: rec.n || "Carta japonesa",
      localId: rec.num || "",
      image: directImage(rec.img),
      rarity: rec.r || "",
      category: rec.ct || "",
      hp: rec.hp || null,
      types: Array.isArray(rec.t) ? rec.t : [],
      pricing: {},
      set: {
        id: rec.s || "",
        name: rec.sf || rec.s || "Set japonés",
        series: rec.sr || "Pokémon Japón"
      },
      _pokexJP: true,
      _pokexJPData: rec
    };
  }

  async function search(raw) {
    const data = await load();
    const parsed = parseQuery(raw);
    const wantedName = text(parsed.name);
    const wantedNum = parsed.num;
    const matches = [];

    for (const rec of data) {
      if (wantedNum && number(rec.num) !== wantedNum) continue;

      const searchable = text([rec.n, rec.s, rec.sf, rec.sr].filter(Boolean).join(" "));
      if (wantedName && !searchable.includes(wantedName)) continue;
      matches.push(toCard(rec));
    }

    return matches;
  }

  function merge(primary, extra) {
    const result = [];
    const primaryPositions = new Map();
    const matchedPrimary = new Set();
    const seenExtra = new Set();

    function addPrimaryPosition(key, position) {
      if (!primaryPositions.has(key)) primaryPositions.set(key, []);
      primaryPositions.get(key).push(position);
    }

    function extraSignature(card) {
      return [
        cardKey(card),
        text(card?.name),
        text(card?.rarity),
        directImage(card?.image),
        String(card?._pokexJPData?.jid ?? "")
      ].join("|");
    }

    for (const card of primary || []) {
      const key = cardKey(card);
      addPrimaryPosition(key, result.length);
      result.push(card);
    }

    for (const extraCard of extra || []) {
      const key = cardKey(extraCard);
      const signature = extraSignature(extraCard);
      if (seenExtra.has(signature)) continue;
      seenExtra.add(signature);

      const candidates = primaryPositions.get(key) || [];
      const pos = candidates.find(candidate =>
        !matchedPrimary.has(candidate) &&
        text(result[candidate]?.name) === text(extraCard?.name)
      );

      if (pos != null) {
        const existing = result[pos];
        matchedPrimary.add(pos);

        if (!existing.image && extraCard.image) {
          existing.image = extraCard.image;
          existing._pokexImageSource = "PokEX JP";
        }
        if (!existing.rarity && extraCard.rarity) existing.rarity = extraCard.rarity;
        continue;
      }

      result.push(extraCard);
    }

    return result;
  }

  function coverage(primary) {
    if (!catalog) return null;
    const extra = catalog.map(toCard);
    const merged = merge(primary || [], extra);
    return {
      primary: Array.isArray(primary) ? primary.length : 0,
      extra: catalog.length,
      total: merged.length,
      additional: Math.max(0, merged.length - (Array.isArray(primary) ? primary.length : 0))
    };
  }

  async function getCard(id) {
    await load();
    const jid = String(id || "").replace(/^pokexjp:/, "");
    const rec = byId.get(jid);
    return rec ? toCard(rec) : null;
  }

  window.PokEXJP = { load, search, merge, coverage, getCard };
})();
