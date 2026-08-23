const API = "https://api.tcgdex.net/v2";
const PAGE = 30;

const el = id => document.getElementById(id);
const langEl = el("lang");
const queryEl = el("query");
const searchBtn = el("searchBtn");
const photoEl = el("photo");
const cameraBtn = el("cameraBtn");
const catalogStatus = el("catalogStatus");
const cardsEl = el("cards");
const listBox = el("listBox");
const resultBox = el("resultBox");
const messageEl = el("message");
const progressBox = el("progressBox");
const progressText = el("progressText");
const progressPct = el("progressPct");
const barFill = el("barFill");
const moreBtn = el("moreBtn");
const preview = el("preview");
const netBadge = el("netBadge");
const countText = el("countText");

let catalog = [];
let currentResults = [];
let shown = 0;
let worker = null;
let workerLang = null;

function showMessage(text, error=false) {
  messageEl.textContent = text;
  messageEl.classList.remove("hidden", "error");
  if (error) messageEl.classList.add("error");
}
function hideMessage() { messageEl.classList.add("hidden"); }
function setProgress(show, text="", pct=0) {
  progressBox.classList.toggle("hidden", !show);
  progressText.textContent = text;
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  progressPct.textContent = safe + "%";
  barFill.style.width = safe + "%";
}
function normalize(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function imageUrl(base, quality="low") {
  return base ? `${base}/${quality}.webp` : "";
}
function money(v) {
  return (typeof v === "number" && Number.isFinite(v)) ? `${v.toFixed(2)} €` : "—";
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        curr[j-1] + 1,
        prev[j] + 1,
        prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = levenshtein(a,b);
  return 1 - d / Math.max(a.length,b.length);
}
function tokenScore(query, name) {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (q.length >= 3 && n.includes(q)) return 0.99;

  // Japanese / text without spaces
  if (!q.includes(" ") && !n.includes(" ")) return similarity(q,n);

  const qTokens = q.split(" ");
  const nTokens = n.split(" ");
  const scores = qTokens.map(qt => {
    let best = 0;
    for (const nt of nTokens) {
      if (nt.includes(qt) && qt.length >= 3) best = Math.max(best, .98);
      else best = Math.max(best, similarity(qt,nt));
    }
    return best;
  });
  if (scores.some(s => s < .70)) return 0;
  return scores.reduce((a,b)=>a+b,0) / scores.length;
}

function openDB() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open("tcgscan", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("catalogs")) db.createObjectStore("catalogs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction("catalogs","readonly");
    const req = tx.objectStore("catalogs").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(key,val) {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction("catalogs","readwrite");
    tx.objectStore("catalogs").put(val,key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ensureCatalog(lang) {
  catalog = [];
  catalogStatus.textContent = "Preparando catálogo…";
  const cacheKey = `cards-${lang}-v1`;
  try {
    const cached = await dbGet(cacheKey);
    if (cached && Array.isArray(cached.cards) && cached.cards.length) {
      catalog = cached.cards;
      catalogStatus.textContent = `${catalog.length.toLocaleString()} cartas cargadas desde el iPhone.`;
      return;
    }
  } catch (_) {}

  setProgress(true, "Descargando catálogo del idioma…", 12);
  const r = await fetch(`${API}/${lang}/cards`);
  if (!r.ok) throw new Error("No se pudo descargar el catálogo.");
  catalog = await r.json();
  setProgress(true, "Guardando catálogo en el iPhone…", 70);
  try { await dbPut(cacheKey, {cards: catalog, saved: Date.now()}); } catch (_) {}
  setProgress(false);
  catalogStatus.textContent = `${catalog.length.toLocaleString()} cartas guardadas en el iPhone.`;
}

function parseCardQuery(raw) {

  const text = String(raw || "").trim();

  /*
   * Ejemplos admitidos:
   *
   * Charizard ex - 125/197
   * Charizard ex 125/197
   * Charizard ex #125/197
   * Charizard ex Nº 125/197
   */

  const match = text.match(
    /^(.*?)\s*(?:[-–—#]|n[º°]?\.?\s*)?\s*([A-Za-z]?\d{1,4})\s*\/\s*(\d{1,4})\s*$/i
  );

  if (!match) {
    return {
      name: text,
      number: "",
      total: ""
    };
  }

  return {
    name: match[1].trim(),
    number: match[2].trim(),
    total: match[3].trim()
  };
}


function normalizeCardNumber(value) {

  let v = String(value || "")
    .trim()
    .toUpperCase();

  /*
   * 00125 -> 125
   * 025 -> 25
   * Mantiene cosas tipo TG01.
   */

  const m = v.match(/^([A-Z]*)(\d+)$/);

  if (!m)
    return v;

  const prefix = m[1];

  const number =
    String(
      parseInt(m[2], 10)
    );

  return prefix + number;
}


function searchLocal(q) {

  const parsed =
    parseCardQuery(q);

  const searchedNumber =
    normalizeCardNumber(
      parsed.number
    );

  const results = [];


  for (const card of catalog) {

    const cardNumber =
      normalizeCardNumber(
        card.localId
      );


    /*
     * Si el usuario ha escrito número,
     * exigimos que coincida.
     */
    if (
      searchedNumber &&
      cardNumber !== searchedNumber
    ) {
      continue;
    }


    /*
     * Si únicamente escribe 125/197,
     * enseñamos todas las cartas Nº125.
     */
    if (!parsed.name) {

      results.push({
        card,
        score: 1
      });

      continue;
    }


    const score =
      tokenScore(
        parsed.name,
        card.name
      );


    /*
     * Con número exacto podemos ser
     * algo más permisivos con el nombre.
     */
    const minimum =
      searchedNumber
      ? 0.55
      : 0.70;


    if (score >= minimum) {

      results.push({
        card,
        score:
          searchedNumber
          ? score + 1
          : score
      });
    }
  }


  results.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.card.name)
        .localeCompare(
          String(b.card.name)
        )
  );


  return results.map(
    result => result.card
  );
}


function resetContent() {
  hideMessage();
  resultBox.classList.add("hidden");
  resultBox.innerHTML = "";
  listBox.classList.add("hidden");
  cardsEl.innerHTML = "";
  moreBtn.classList.add("hidden");
}

function renderTile(card, target=cardsEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cardTile";

  const src = imageUrl(card.image,"low");
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.loading = "lazy";
    img.alt = card.name || "Carta";
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.textContent = "Sin imagen";
      img.replaceWith(ph);
    };
    button.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.textContent = "Sin imagen";
    button.appendChild(ph);
  }

  const name = document.createElement("strong");
  name.textContent = card.name || "Carta";
  button.appendChild(name);

  const num = document.createElement("span");
  num.className = "small";
  num.textContent = `Nº ${card.localId ?? "—"}`;
  button.appendChild(num);

  button.addEventListener("click", () => openCard(card.id));
  target.appendChild(button);
}

function renderNext() {
  const end = Math.min(shown + PAGE, currentResults.length);
  for (let i=shown; i<end; i++) renderTile(currentResults[i]);
  shown = end;
  moreBtn.classList.toggle("hidden", shown >= currentResults.length);
}

function showSearchResults(results) {
  currentResults = results;
  shown = 0;
  cardsEl.innerHTML = "";
  listBox.classList.remove("hidden");
  countText.textContent = `${results.length} carta${results.length === 1 ? "" : "s"} encontrada${results.length === 1 ? "" : "s"}`;
  if (!results.length) {
    showMessage("No he encontrado cartas. Prueba otra escritura.");
    listBox.classList.add("hidden");
    return;
  }
  renderNext();
}

async function doSearch() {
  const q = queryEl.value.trim();
  if (!langEl.value || q.length < 2) return;
  resetContent();
  try {
    if (!catalog.length) await ensureCatalog(langEl.value);
    const results = searchLocal(q);
    showSearchResults(results);
  } catch (e) {
    setProgress(false);
    showMessage(e.message || "Error buscando cartas.", true);
  }
}

async function openCard(id) {
  resetContent();
  setProgress(true, "Cargando ficha y precios…", 35);
  try {
    const r = await fetch(`${API}/${langEl.value}/cards/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error("No se pudo cargar la carta.");
    const card = await r.json();
    setProgress(false);
    preview.classList.add("hidden");
    renderDetail(card);
  } catch (e) {
    setProgress(false);
    showMessage(e.message, true);
  }
}

function renderDetail(card) {
  const cm = card.pricing?.cardmarket || {};
  resultBox.innerHTML = "";
  resultBox.classList.remove("hidden");

  const box = document.createElement("article");
  box.className = "detail";

  const grid = document.createElement("div");
  grid.className = "detailGrid";

  const left = document.createElement("div");
  if (card.image) {
    const img = document.createElement("img");
    img.className = "detailImg";
    img.src = imageUrl(card.image,"high");
    img.alt = card.name || "Carta";
    left.appendChild(img);
  }

  const right = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = card.name || "Carta";
  right.appendChild(title);

  const meta = [
    `📦 ${card.set?.name || "Set desconocido"}`,
    `🔢 Nº ${card.localId ?? "—"}`,
    `⭐ ${card.rarity || "Rareza no indicada"}`
  ];
  for (const m of meta) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = m;
    right.appendChild(p);
  }

  const gridPrices = document.createElement("div");
  gridPrices.className = "priceGrid";
  const prices = [
    ["Tendencia", money(cm.trend), true],
    ["Mínimo", money(cm.low), false],
    ["Media 7 días", money(cm.avg7), false],
    ["Media 30 días", money(cm.avg30), false]
  ];
  for (const [label,value,main] of prices) {
    const p = document.createElement("div");
    p.className = "price" + (main ? " main" : "");
    p.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    gridPrices.appendChild(p);
  }
  right.appendChild(gridPrices);

  const updated = document.createElement("p");
  updated.className = "muted";
  updated.textContent = cm.updated
    ? `Cardmarket · actualizado ${new Date(cm.updated).toLocaleString()}`
    : "Sin precio Cardmarket disponible para esta carta.";
  right.appendChild(updated);

  grid.append(left,right);
  box.appendChild(grid);
  resultBox.appendChild(box);
  window.scrollTo({top: 0, behavior: "smooth"});
}

function loadImage(file) {
  return new Promise((resolve,reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({img,url});
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la foto.")); };
    img.src = url;
  });
}

async function getWorker(lang) {
  const ocrLang = lang === "ja" ? "jpn" : (lang === "es" ? "spa" : "eng");
  if (worker && workerLang === ocrLang) return worker;
  if (worker) {
    try { await worker.terminate(); } catch (_) {}
  }
  workerLang = ocrLang;
  worker = await Tesseract.createWorker(ocrLang, 1, {
    logger: m => {
      if (m.status === "recognizing text") {
        const pct = Math.round((m.progress || 0) * 100);
        setProgress(true, "Leyendo la carta en el iPhone…", pct);
      } else if (m.status) {
        setProgress(true, "Preparando OCR local…", Math.round((m.progress || 0) * 25));
      }
    }
  });
  return worker;
}

function cleanOCR(s) {
  return String(s || "")
    .replace(/[|_[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cropAndProcess(img, xR, yR, wR, hR, mode="gray", scale=4) {
  const sx = Math.max(0, Math.round(img.naturalWidth * xR));
  const sy = Math.max(0, Math.round(img.naturalHeight * yR));
  const sw = Math.max(1, Math.round(img.naturalWidth * wR));
  const sh = Math.max(1, Math.round(img.naturalHeight * hR));

  const maxW = 2200;
  const outW = Math.min(maxW, Math.max(500, sw * scale));
  const ratio = outW / sw;
  const outH = Math.max(100, Math.round(sh * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", {willReadFrequently: true});
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  const d = imageData.data;

  // Grises + contraste. En "bw" hacemos umbral; en "invert" invertimos.
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.9 + 128));

    if (mode === "bw") g = g > 142 ? 255 : 0;
    if (mode === "invert") g = 255 - g;

    d[i] = d[i+1] = d[i+2] = g;
    d[i+3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function recognizeLine(ocr, canvas, whitelist="") {
  const params = {
    tessedit_pageseg_mode: "7",
    preserve_interword_spaces: "1"
  };
  if (whitelist) params.tessedit_char_whitelist = whitelist;
  else params.tessedit_char_whitelist = "";

  await ocr.setParameters(params);
  const r = await ocr.recognize(canvas);
  return cleanOCR(r.data.text);
}

function extractNumber(texts) {
  const joined = texts.join("\n");

  // Acepta 125/094, 125 / 94, 125/094H, etc.
  const m = joined.match(/(?:^|\D)([A-Za-z]?\d{1,4})\s*[\/|]\s*(\d{1,4})(?:\D|$)/i);
  if (!m) return {local: "", total: ""};

  return {
    local: normalize(m[1]),
    total: normalize(m[2])
  };
}

function usableNameStrings(texts) {
  const junk = [
    /^stage\s*\d/i, /^basic$/i, /^hp\s*\d/i, /^trainer$/i,
    /^pokemon$/i, /^pokémon$/i
  ];

  const out = new Set();

  for (const raw of texts) {
    const line = cleanOCR(raw)
      .replace(/\b(?:HP|PS)\s*\d+\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (line.length < 2 || line.length > 55) continue;
    if (junk.some(rx => rx.test(line))) continue;

    out.add(line);

    // Quitamos ruido típico de la izquierda ("STAGE 2", símbolos, etc.).
    const stripped = line
      .replace(/^(?:stage\s*[12]|basic|básico|basico)\s*/i, "")
      .trim();
    if (stripped.length >= 2) out.add(stripped);
  }

  return [...out];
}

function rankFromOCR(nameTexts, numberTexts) {
  const names = usableNameStrings(nameTexts);
  const number = extractNumber([...nameTexts, ...numberTexts]);

  const ranked = [];

  for (const card of catalog) {
    let bestName = 0;

    for (const candidate of names) {
      bestName = Math.max(bestName, tokenScore(candidate, card.name));
    }

    const exactNumber =
      number.local &&
      normalize(card.localId) === number.local;

    // No dejamos que una lectura absurda gane solo por ser una palabra corta.
    if (bestName < .46 && !exactNumber) continue;

    let score = bestName;
    if (exactNumber) score += .42;

    ranked.push({
      card,
      score,
      bestName,
      exactNumber
    });
  }

  ranked.sort((a,b) =>
    b.score - a.score ||
    Number(b.exactNumber) - Number(a.exactNumber)
  );

  return {
    ranked,
    names,
    number
  };
}

function showCandidates(result) {
  resetContent();

  const ranked = result.ranked || [];
  const top = ranked.slice(0, 8);

  const readName = result.names?.length
    ? result.names.slice(0, 3).join(" · ")
    : "no legible";

  const readNumber = result.number?.local
    ? `${result.number.local}/${result.number.total || "?"}`
    : "no legible";

  if (!top.length) {
    showMessage(
      `No he podido identificarla. OCR nombre: ${readName}. Número: ${readNumber}. ` +
      `Prueba otra foto o usa el buscador.`,
      true
    );
    return;
  }

  showMessage(
    `No voy a inventarme una carta. He leído: ${readName}. ` +
    `Número: ${readNumber}. Elige entre estas coincidencias:`
  );

  currentResults = top.map(x => x.card);
  shown = 0;
  cardsEl.innerHTML = "";
  listBox.classList.remove("hidden");
  countText.textContent = "Posibles coincidencias";
  renderNext();
  moreBtn.classList.add("hidden");
}

async function identifyPhoto(file) {
  resetContent();

  const previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.classList.remove("hidden");

  try {
    if (!catalog.length) await ensureCatalog(langEl.value);
    if (!window.Tesseract) throw new Error("No se pudo cargar el OCR local.");

    const {img,url} = await loadImage(file);
    const ocr = await getWorker(langEl.value);

    // Zona precisa del nombre: evita dibujo, ataques y texto inferior.
    const nameGray = cropAndProcess(img, .10, .015, .70, .14, "gray", 5);
    const nameBW   = cropAndProcess(img, .10, .015, .70, .14, "bw", 5);
    const nameInv  = cropAndProcess(img, .10, .015, .70, .14, "invert", 5);

    // Una banda superior más amplia sirve de respaldo para diseños especiales.
    const topWide  = cropAndProcess(img, .02, .00, .94, .19, "gray", 4);

    // Número: normalmente está en el borde inferior, principalmente a la izquierda.
    const numGray  = cropAndProcess(img, .00, .83, .62, .17, "gray", 5);
    const numBW    = cropAndProcess(img, .00, .83, .62, .17, "bw", 5);

    setProgress(true, "Leyendo el nombre…", 15);

    const nameTexts = [];
    for (const c of [nameGray, nameBW, nameInv, topWide]) {
      try {
        const t = await recognizeLine(ocr, c);
        if (t) nameTexts.push(t);
      } catch (_) {}
    }

    setProgress(true, "Leyendo el número…", 68);

    const numberTexts = [];
    const numberWhitelist =
      "0123456789/|ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    for (const c of [numGray, numBW]) {
      try {
        const t = await recognizeLine(ocr, c, numberWhitelist);
        if (t) numberTexts.push(t);
      } catch (_) {}
    }

    URL.revokeObjectURL(url);

    setProgress(true, "Comparando con el catálogo…", 94);
    const result = rankFromOCR(nameTexts, numberTexts);
    const ranked = result.ranked;

    setProgress(false);

    if (!ranked.length) {
      showCandidates(result);
      return;
    }

    const first = ranked[0];
    const second = ranked[1];
    const gap = first.score - (second?.score ?? 0);

    // Mucho más estricto: solo abre sola cuando de verdad hay evidencia.
    const strongName = first.bestName >= .91;
    const strongNumberAndName = first.exactNumber && first.bestName >= .78;
    const clearGap = gap >= .15 && first.bestName >= .86;

    if (strongName || strongNumberAndName || clearGap) {
      preview.classList.add("hidden");
      URL.revokeObjectURL(previewUrl);
      await openCard(first.card.id);
    } else {
      showCandidates(result);
    }

  } catch (e) {
    setProgress(false);
    showMessage(e.message || "No se pudo analizar la foto.", true);
  }
}

langEl.addEventListener("change", async () => {
  resetContent();
  catalog = [];
  queryEl.disabled = !langEl.value;
  searchBtn.disabled = !langEl.value;
  photoEl.disabled = !langEl.value;
  cameraBtn.classList.toggle("disabled", !langEl.value);
  queryEl.placeholder = langEl.value === "ja" ? "リザードン、ピカチュウ…" : "Charizard, Pikachu…";
  if (!langEl.value) {
    catalogStatus.textContent = "El catálogo se descargará una vez y quedará guardado en el iPhone.";
    return;
  }
  try {
    await ensureCatalog(langEl.value);
  } catch (e) {
    setProgress(false);
    showMessage(e.message, true);
  }
});

searchBtn.addEventListener("click", doSearch);
queryEl.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
moreBtn.addEventListener("click", renderNext);
photoEl.addEventListener("change", () => {
  const f = photoEl.files?.[0];
  if (f && langEl.value) identifyPhoto(f);
  photoEl.value = "";
});

function updateNetwork() {
  netBadge.textContent = navigator.onLine ? "Online" : "Sin conexión";
}
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
updateNetwork();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}


/* ===== COLLECTORVISION ===== */

const visualScanBtn =
  document.getElementById("visualScanBtn");

const visualScanner =
  document.getElementById("visualScanner");

const scannerFrame =
  document.getElementById("scannerFrame");

const closeScannerBtn =
  document.getElementById("closeScannerBtn");

let pokemonProductMap = null;

/* CollectorVision se mantiene cargado desde que abre la app */
if (scannerFrame) {
  scannerFrame.src = "./scanner/";
}


async function loadPokemonProductMap() {

  if (pokemonProductMap)
    return pokemonProductMap;

  const r = await fetch("./pokemon-map.json");

  if (!r.ok)
    throw new Error("No se pudo cargar el mapa Pokémon");

  pokemonProductMap = await r.json();

  return pokemonProductMap;
}


visualScanBtn?.addEventListener("click", () => {

  if (!langEl.value) {
    showMessage("Primero selecciona el idioma.", true);
    return;
  }

  visualScanner.classList.remove("hidden");

  scannerFrame.src = "./scanner/";

});


closeScannerBtn?.addEventListener("click", () => {

  visualScanner.classList.add("hidden");

});


window.addEventListener("message", async event => {

  if (event.origin !== window.location.origin)
    return;

  const data = event.data;

  if (!data || data.type !== "tcgscan-match")
    return;

  visualScanner.classList.add("hidden");

  const pct =
    Math.round(Number(data.score) * 1000) / 10;

  showMessage(
    `✅ ${data.cardName} detectada con ${pct}%`
  );

  try {

    const map =
      await loadPokemonProductMap();

    const product =
      map[String(data.cardId)];

    /*
      CollectorVision devuelve ID TCGplayer.
      Usamos nombre + número de coleccionista
      para encontrar la carta equivalente en TCGdex.
    */

    const name =
      product?.name || data.cardName;

    const number =
      String(product?.number || "")
        .split("/")[0]
        .trim();

    const r =
      await fetch(
        "https://api.tcgdex.net/v2/en/cards?name="
        + encodeURIComponent(name)
      );

    if (!r.ok)
      throw new Error("TCGdex no respondió");

    let matches =
      await r.json();

    if (number) {

      const exact =
        matches.filter(card =>
          String(card.localId)
            .replace(/^0+/, "")
          ===
          String(number)
            .replace(/^0+/, "")
        );

      if (exact.length)
        matches = exact;
    }

    if (matches.length === 1) {

      await openCard(matches[0].id);

      return;
    }

    if (matches.length > 1) {

      currentResults = matches;

      shown = 0;

      cardsEl.innerHTML = "";

      listBox.classList.remove("hidden");

      countText.textContent =
        "He encontrado varias ediciones posibles";

      renderNext();

      return;
    }

    queryEl.value =
      data.cardName || name;

    await doSearch();

  } catch (e) {

    console.error(e);

    queryEl.value =
      data.cardName || "";

    await doSearch();

  }

});


/* ===== ESTADO DE PRECARGA DEL SCANNER ===== */

let tcgScannerReady = false;

window.addEventListener("message", event => {

  if (event.origin !== window.location.origin)
    return;

  if (event.data?.type !== "tcgscan-ready")
    return;

  tcgScannerReady = true;

  if (visualScanBtn) {
    visualScanBtn.disabled = false;
    visualScanBtn.innerHTML = "⚡ Escanear carta";
  }

  console.log("✅ CollectorVision preparado");
});
