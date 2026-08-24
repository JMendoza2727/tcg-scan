from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = root / "app.js"

s = app.read_text(encoding="utf-8")

insert_before = 'function showMessage(text, error=false) {'

jp_code = r'''
/* =========================================================
   PokEX V2.1 · fallback japonés
   ========================================================= */

let jpCatalogV21 = null;
const jpFallbackMapV21 = new Map();

async function loadJapaneseCatalogV21() {

  if (jpCatalogV21)
    return jpCatalogV21;

  const r = await fetch("./data/jp-catalog-v21.json?v=1");

  if (!r.ok)
    throw new Error("No se pudo cargar el catálogo japonés extendido.");

  jpCatalogV21 = await r.json();

  return jpCatalogV21;
}

function normalizeTextV21(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSetV21(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}

function jpRecordToCardV21(rec) {

  const id = `pokexjp:${rec.jid}`;

  const card = {
    id,
    name: rec.n || "Carta japonesa",
    image: rec.img || "",
    localId: rec.num || "",
    rarity: rec.r || "",
    category: rec.ct || "",
    hp: rec.hp || "",
    illustrator: "",
    variants: {},
    pricing: {},
    types: Array.isArray(rec.t) ? rec.t : [],
    weaknesses: [],
    resistances: [],
    retreat: 0,
    set: {
      id: rec.s || "",
      name: rec.sf || rec.s || "Set japonés",
      series: rec.sr || "Pokémon Japón",
      cardCount: {
        official: None if False else None,
        total: None
      }
    },
    _pokexJP: true,
    _pokexJPData: rec
  };

  jpFallbackMapV21.set(id, card);
  return card;
}

function jpNumberMatchesV21(a, b) {
  return normalizeCardNumber(a) === normalizeCardNumber(b);
}

async function searchJapaneseFallbackV21(query) {

  const data = await loadJapaneseCatalogV21();

  const parsed = parseCardQuery(query);
  const searchedNumber = normalizeCardNumber(parsed.number);
  const translatedName = await translatePokemonQueryV21(parsed.name || query, "ja");
  const wanted = normalizeTextV21(translatedName);

  let results = data
    .filter(rec => {
      const name = normalizeTextV21(rec.n);
      if (!wanted || !name.includes(wanted))
        return false;

      if (searchedNumber) {
        return jpNumberMatchesV21(rec.num, searchedNumber);
      }

      return true;
    })
    .map(rec => {
      const score = tokenScore(translatedName, rec.n || "");
      return { rec, score };
    })
    .sort((a, b) => {
      if (searchedNumber) {
        const aExact = jpNumberMatchesV21(a.rec.num, searchedNumber) ? 1 : 0;
        const bExact = jpNumberMatchesV21(b.rec.num, searchedNumber) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }

      return b.score - a.score;
    })
    .slice(0, 200)
    .map(x => jpRecordToCardV21(x.rec));

  return results;
}

async function findJapaneseRecordForCardV21(card) {

  const data = await loadJapaneseCatalogV21();

  const translatedName = await translatePokemonQueryV21(card.name || "", "ja");
  const wantedName = normalizeTextV21(translatedName);
  const wantedNumber = normalizeCardNumber(card.localId || "");
  const wantedSetId = normalizeSetV21(card?.set?.id || "");
  const wantedSetName = normalizeSetV21(card?.set?.name || "");

  let matches = data.filter(rec => {
    const sameName =
      normalizeTextV21(rec.n) === wantedName;

    if (!sameName)
      return false;

    if (wantedNumber && !jpNumberMatchesV21(rec.num, wantedNumber))
      return false;

    return true;
  });

  if (!matches.length)
    return null;

  if (wantedSetId || wantedSetName) {
    const bySet = matches.filter(rec => {
      const recSet = normalizeSetV21(rec.s);
      const recSetName = normalizeSetV21(rec.sf);
      return (
        (wantedSetId && recSet === wantedSetId) ||
        (wantedSetName && recSetName === wantedSetName)
      );
    });

    if (bySet.length)
      matches = bySet;
  }

  return matches[0] || null;
}

async function enrichJapaneseFallbackV21(card) {

  if (langEl.value !== "ja")
    return card;

  const rec = await findJapaneseRecordForCardV21(card);

  if (!rec)
    return card;

  if (!card.image && rec.img)
    card.image = rec.img;

  if (!card.rarity && rec.r)
    card.rarity = rec.r;

  if (!card.hp && rec.hp)
    card.hp = rec.hp;

  if ((!card.types || !card.types.length) && Array.isArray(rec.t))
    card.types = rec.t;

  card._pokexJP = true;
  card._pokexJPData = rec;

  return card;
}

async function getJapaneseFallbackCardByIdV21(id) {

  if (jpFallbackMapV21.has(id))
    return jpFallbackMapV21.get(id);

  const data = await loadJapaneseCatalogV21();
  const jid = String(id).replace("pokexjp:", "");

  const rec = data.find(x => String(x.jid) === jid);

  if (!rec)
    return null;

  return jpRecordToCardV21(rec);
}
'''

if insert_before not in s:
    raise SystemExit("No encuentro el punto de inserción del fallback japonés.")

s = s.replace(insert_before, jp_code + "\n" + insert_before, 1)

old_search = '''
    let results =
      searchLocal(translatedQ);

    /*
     * Si la traducción no da resultado,
     * probamos también el texto original.
     */
    if (
      !results.length &&
      translatedQ !== q
    ) {
      results = searchLocal(q);
    }
'''

new_search = '''
    let results =
      searchLocal(translatedQ);

    /*
     * Si la traducción no da resultado,
     * probamos también el texto original.
     */
    if (
      !results.length &&
      translatedQ !== q
    ) {
      results = searchLocal(q);
    }

    if (
      !results.length &&
      langEl.value === "ja"
    ) {
      results =
        await searchJapaneseFallbackV21(
          translatedQ || q
        );
    }
'''

if old_search not in s:
    raise SystemExit("No encuentro el bloque de búsqueda actual.")

s = s.replace(old_search, new_search, 1)

open_fn = 'async function openCard(id) {\n'
open_insert = '''async function openCard(id) {

  if (String(id).startsWith("pokexjp:")) {
    resetContent();
    setProgress(true, "Cargando ficha japonesa…", 40);

    try {
      const card =
        await getJapaneseFallbackCardByIdV21(id);

      if (!card)
        throw new Error("No se pudo cargar la carta japonesa.");

      setProgress(false);
      preview.classList.add("hidden");
      renderDetail(card);
      return;

    } catch (e) {
      setProgress(false);
      showMessage(e.message || "Error cargando carta japonesa.", true);
      return;
    }
  }

'''

if open_fn not in s:
    raise SystemExit("No encuentro openCard.")

s = s.replace(open_fn, open_insert, 1)

old_card = '    const card = await r.json();\n'
new_card = '''    const card = await r.json();

    if (langEl.value === "ja") {
      await enrichJapaneseFallbackV21(card);
    }
'''

if old_card not in s:
    raise SystemExit("No encuentro la carga de carta TCGdex.")

s = s.replace(old_card, new_card, 1)

app.write_text(s, encoding="utf-8")
print("✅ Fallback japonés V2.1 instalado en app.js")
