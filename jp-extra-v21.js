(() => {

  let catalog = null;
  const byId = new Map();


  async function load() {

    if (catalog)
      return catalog;

    const r = await fetch(
      "./data/jp-catalog-v21.json?v=2350"
    );

    if (!r.ok)
      throw new Error(
        "No se pudo cargar el catálogo japonés ampliado."
      );

    catalog = await r.json();

    for (const rec of catalog) {
      if (rec.jid != null) {
        byId.set(
          String(rec.jid),
          rec
        );
      }
    }

    console.log(
      `🇯🇵 PokEX JP: ${catalog.length} cartas cargadas`
    );

    return catalog;
  }


  function text(v) {
    return String(v || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }


  function number(v) {

    const raw =
      String(v || "")
        .normalize("NFKC")
        .trim()
        .toUpperCase();

    const m =
      raw.match(/^([A-Z]*)(\d+)$/);

    if (!m)
      return raw;

    return (
      m[1] +
      String(parseInt(m[2], 10))
    );
  }


  function setCode(v) {
    return String(v || "")
      .normalize("NFKC")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }


  function parseQuery(raw) {

    const value =
      String(raw || "").trim();

    const m =
      value.match(
        /^(.*?)\s*(?:[-–—#]|n[º°]?\.?\s*)?\s*([A-Za-z]?\d{1,4})\s*\/\s*(\d{1,4})\s*$/i
      );

    if (m) {
      return {
        name: m[1].trim(),
        num: number(m[2]),
        total: m[3]
      };
    }

    return {
      name: value,
      num: "",
      total: ""
    };
  }


  function recordKey(rec) {

    const s =
      setCode(rec.s);

    const n =
      number(rec.num);

    if (s && n)
      return `${s}|${n}`;

    return `${text(rec.n)}|${n}`;
  }


  function cardSetCode(card) {

    if (card?.set?.id)
      return setCode(card.set.id);


    /*
     * En los resultados resumidos de TCGdex
     * a veces no viene set.id.
     *
     * El ID suele ser:
     *
     * M2a-044
     * DPt3-Sl-001
     *
     * Quitamos el localId del final.
     */
    const id =
      String(card?.id || "");

    const local =
      String(card?.localId || "");

    if (id && local) {

      const escaped =
        local.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const rx =
        new RegExp(
          `[-_]${escaped}$`,
          "i"
        );

      const stripped =
        id.replace(rx, "");

      if (stripped !== id)
        return setCode(stripped);
    }

    return "";
  }


  function cardKey(card) {

    const s =
      cardSetCode(card);

    const n =
      number(card?.localId);

    if (s && n)
      return `${s}|${n}`;

    return `${text(card?.name)}|${n}`;
  }


  function directImage(url) {
    return String(url || "").trim();
  }


  function toCard(rec) {

    return {
      id:
        `pokexjp:${rec.jid}`,

      name:
        rec.n || "Carta japonesa",

      localId:
        rec.num || "",

      image:
        directImage(rec.img),

      rarity:
        rec.r || "",

      category:
        rec.ct || "",

      hp:
        rec.hp || null,

      types:
        Array.isArray(rec.t)
          ? rec.t
          : [],

      pricing: {},

      set: {
        id:
          rec.s || "",

        name:
          rec.sf ||
          rec.s ||
          "Set japonés",

        series:
          rec.sr ||
          "Pokémon Japón"
      },

      _pokexJP:
        true,

      _pokexJPData:
        rec
    };
  }


  async function search(raw) {

    const data =
      await load();

    const parsed =
      parseQuery(raw);

    const wantedName =
      text(parsed.name);

    const wantedNum =
      parsed.num;


    const matches = [];


    for (const rec of data) {

      if (wantedNum) {

        if (
          number(rec.num) !==
          wantedNum
        ) {
          continue;
        }
      }


      /*
       * El nombre debe contener el texto
       * traducido.
       *
       * ピカチュウ también encuentra:
       * なみのりピカチュウ
       * そらをとぶピカチュウ
       * ピカチュウex
       */
      if (
        wantedName &&
        !text(rec.n).includes(
          wantedName
        )
      ) {
        continue;
      }


      matches.push(
        toCard(rec)
      );
    }


    return matches;
  }


  function merge(primary, extra) {

    const result = [];
    const primaryPositions =
      new Map();
    const matchedPrimary = new Set();
    const seenExtra = new Set();


    function addPrimaryPosition(key, position) {

      if (!primaryPositions.has(key)) {
        primaryPositions.set(key, []);
      }

      primaryPositions.get(key).push(position);
    }


    function extraSignature(card) {

      return [
        cardKey(card),
        text(card?.name),
        text(card?.rarity),
        directImage(card?.image)
      ].join("|");
    }


    /*
     * TCGdex continúa teniendo prioridad.
     */
    for (const card of primary || []) {

      const key =
        cardKey(card);

      addPrimaryPosition(
        key,
        result.length
      );

      result.push(card);
    }


    for (const extraCard of extra || []) {

      const key =
        cardKey(extraCard);
      const signature =
        extraSignature(extraCard);


      if (seenExtra.has(signature)) {
        continue;
      }

      seenExtra.add(signature);


      const candidates =
        primaryPositions.get(key) || [];

      let pos = candidates.find(
        candidate =>
          !matchedPrimary.has(candidate) &&
          text(result[candidate]?.name) ===
            text(extraCard?.name)
      );

      if (pos != null) {

        /*
         * La carta ya existe en TCGdex.
         * Aprovechamos la base nueva para
         * rellenar huecos.
         */
        const existing =
          result[pos];

        matchedPrimary.add(pos);


        if (
          !existing.image &&
          extraCard.image
        ) {
          existing.image =
            extraCard.image;

          existing._pokexImageSource =
            "PokEX JP";
        }


        if (
          !existing.rarity &&
          extraCard.rarity
        ) {
          existing.rarity =
            extraCard.rarity;
        }


        continue;
      }


      result.push(
        extraCard
      );
    }


    return result;
  }


  async function getCard(id) {

    await load();

    const jid =
      String(id || "")
        .replace(
          /^pokexjp:/,
          ""
        );

    const rec =
      byId.get(jid);

    return rec
      ? toCard(rec)
      : null;
  }


  window.PokEXJP = {
    load,
    search,
    merge,
    getCard
  };

})();
