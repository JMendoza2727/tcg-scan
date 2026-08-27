import {
  getApps,
  getApp,
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  getFirestore,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const VERSION = "3.0";

const config =
  window.POKEX_FIREBASE_CONFIG || null;

const app =
  getApps().length
    ? getApp()
    : initializeApp(config);

const auth = getAuth(app);
const db = getFirestore(app);

const avatarChoices = [
  "⚡",
  "🔥",
  "💧",
  "🌿",
  "🌙",
  "⭐",
  "🎴",
  "👻",
  "🐉",
  "🧠"
];

let currentUser = null;
let currentProfile = null;
let requestUnsubscribe = null;

const avatarCache =
  new Map();

let polishTimer = null;

let musicContext = null;
let musicGain = null;
let musicFilter = null;
let musicCompressor = null;
let musicTimer = null;
let musicStep = 0;
let musicNextNoteTime = 0;
const musicVoices = new Set();

const MUSIC_STEP_SECONDS = 0.165;
const MUSIC_LOOKAHEAD_MS = 400;
const MUSIC_SCHEDULE_AHEAD = 1.0;

const MUSIC_KEY =
  "pokex_music_enabled";

const VOLUME_KEY =
  "pokex_music_volume";

function esc(v){
  return String(v ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function lower(v){
  return String(v || "")
    .trim()
    .toLowerCase();
}

function updateHomeAccountAvatar(){
  const avatar =
    document.querySelector(
      "#v23AccountButton .pokex-account-avatar"
    );

  if(!avatar){
    return;
  }

  avatar.textContent =
    currentUser
      ? currentProfile?.avatar || "⚡"
      : "👤";
}

async function loadProfile(uid){
  if(!uid){
    return null;
  }

  const snap =
    await getDoc(
      doc(db,"users",uid)
    );

  if(!snap.exists()){
    return null;
  }

  return {
    uid:snap.id,
    ...snap.data()
  };
}

async function loadAvatarForUsername(username){
  const key =
    lower(username);

  if(!key){
    return "⚡";
  }

  if(avatarCache.has(key)){
    return avatarCache.get(key);
  }

  try{
    const snap =
      await getDocs(
        query(
          collection(db,"users"),
          where("usernameLower","==",key)
        )
      );

    if(snap.empty){
      avatarCache.set(key,"⚡");
      return "⚡";
    }

    const users =
      snap.docs.map(d=>d.data());

    users.sort(
      (a,b)=>
        Number(b.collectionValue || 0)
        -
        Number(a.collectionValue || 0)
    );

    const avatar =
      users[0]?.avatar || "⚡";

    avatarCache.set(key,avatar);

    return avatar;

  }catch{
    return "⚡";
  }
}

function setRequestBadge(count){
  const home =
    document.querySelector(
      "#v23-friends-home"
    );

  if(home){
    let badge =
      home.querySelector(
        ".v231-request-badge"
      );

    if(count > 0){
      if(!badge){
        badge =
          document.createElement("span");

        badge.className =
          "v231-request-badge";

        home.appendChild(badge);
      }

      badge.textContent =
        count > 99 ? "99+" : String(count);

    }else{
      badge?.remove();
    }
  }

  const requestTab =
    document.querySelector(
      '.v234-tab[data-tab="requests"], .v234-tab[data-f232="requests"]'
    );

  if(requestTab){
    let badge =
      requestTab.querySelector(
        ".v231-request-badge"
      );

    if(count > 0){
      if(!badge){
        badge =
          document.createElement("span");

        badge.className =
          "v231-request-badge";

        requestTab.appendChild(badge);
      }

      badge.textContent =
        count > 99 ? "99+" : String(count);

    }else{
      badge?.remove();
    }
  }
}

function watchRequests(){
  if(requestUnsubscribe){
    requestUnsubscribe();
    requestUnsubscribe = null;
  }
}

function musicEnabled(){
  return (
    localStorage.getItem(MUSIC_KEY)
    === "1"
  );
}

function musicVolume(){
  const n =
    Number(
      localStorage.getItem(VOLUME_KEY)
      ?? 18
    );

  return Math.max(
    0,
    Math.min(100,n)
  );
}

function setMasterVolume(value){
  localStorage.setItem(
    VOLUME_KEY,
    String(value)
  );

  if(musicGain){
    const volume =
      Number(value) / 100;

    musicGain.gain.setTargetAtTime(
      0.18 * volume,
      musicContext.currentTime,
      0.06
    );
  }
}

function chipTone(
  freq,
  duration = 0.12,
  when = 0,
  type = "square",
  level = 0.10,
  detune = 0
){
  if(
    !musicContext
    ||
    !musicGain
    ||
    musicContext.state !== "running"
    ||
    !freq
  ){
    return;
  }

  const now = Math.max(
    musicContext.currentTime,
    when || musicContext.currentTime
  );

  const osc =
    musicContext.createOscillator();

  const gain =
    musicContext.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(
    freq,
    now
  );

  osc.detune.setValueAtTime(
    detune,
    now
  );

  gain.gain.setValueAtTime(
    0.0001,
    now
  );

  gain.gain.linearRampToValueAtTime(
    level,
    now + 0.014
  );

  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, level * 0.68),
    now + Math.max(0.03, duration * 0.62)
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + duration + 0.035
  );

  osc.connect(gain);
  gain.connect(musicGain);

  osc.start(now);
  osc.stop(
    now + duration + 0.055
  );

  musicVoices.add(osc);

  osc.addEventListener(
    "ended",
    () => musicVoices.delete(osc),
    { once: true }
  );
}

const POKEX_NOTES = {
  C3:130.81,
  D3:146.83,
  E3:164.81,
  F3:174.61,
  G3:196.00,
  A3:220.00,
  B3:246.94,

  C4:261.63,
  D4:293.66,
  E4:329.63,
  F4:349.23,
  G4:392.00,
  A4:440.00,
  B4:493.88,

  C5:523.25,
  D5:587.33,
  E5:659.25,
  F5:698.46,
  G5:783.99,
  A5:880.00
};

/*
  PokEX Route Theme
  Melodía original inspirada en RPG portátiles de 8 bits.
*/

const POKEX_LEAD = [
  "E5", null, "G5", null,
  "A5", "G5", "E5", "D5",

  "E5", null, "D5", "C5",
  "D5", null, "G4", null,

  "C5", "D5", "E5", null,
  "G5", "E5", "D5", null,

  "A4", "C5", "D5", "E5",
  "D5", null, "G4", null,

  "E5", "G5", "A5", null,
  "G5", "E5", "D5", "E5",

  "C5", null, "D5", "E5",
  "G5", null, "E5", null,

  "A4", "C5", "E5", "D5",
  "C5", "A4", "G4", null,

  "C5", "D5", "E5", "G5",
  "E5", "D5", "C5", null
];

const POKEX_ARP = [
  ["C4","E4","G4","E4"],
  ["A3","C4","E4","C4"],
  ["F3","A3","C4","A3"],
  ["G3","B3","D4","B3"]
];

const POKEX_BASS = [
  "C3",
  "A3",
  "F3",
  "G3"
];

function musicTick(when){

  const step =
    musicStep % POKEX_LEAD.length;

  const section =
    Math.floor(step / 16) % 4;

  const beat =
    step % 4;

  const leadName =
    POKEX_LEAD[step];

  if(leadName){
    chipTone(
      POKEX_NOTES[leadName],
      0.16,
      when,
      "triangle",
      0.11
    );

    chipTone(
      POKEX_NOTES[leadName],
      0.14,
      when + 0.006,
      "sine",
      0.032,
      5
    );
  }

  const arpName =
    POKEX_ARP[section][beat];

  chipTone(
    POKEX_NOTES[arpName],
    0.13,
    when + 0.018,
    "triangle",
    0.046
  );

  if(step % 4 === 0){

    chipTone(
      POKEX_NOTES[
        POKEX_BASS[section]
      ],
      0.31,
      when,
      "triangle",
      0.13
    );

    chipTone(
      82,
      0.055,
      when,
      "sine",
      0.05
    );
  }

  if(step % 4 === 2){
    chipTone(
      920,
      0.028,
      when,
      "sine",
      0.02
    );
  }

  musicStep++;
}

function scheduleMusic(){
  if(
    !musicContext ||
    musicContext.state !== "running"
  ){
    return;
  }

  const current =
    musicContext.currentTime;

  if(
    !musicNextNoteTime ||
    musicNextNoteTime <
      current - MUSIC_STEP_SECONDS
  ){
    musicNextNoteTime =
      current + 0.045;
  }

  const horizon =
    current + MUSIC_SCHEDULE_AHEAD;

  while(musicNextNoteTime < horizon){
    musicTick(musicNextNoteTime);
    musicNextNoteTime +=
      MUSIC_STEP_SECONDS;
  }
}

async function startMusic(){
  if(!musicEnabled()){
    return;
  }

  if(!musicContext){
    musicContext =
      new (
        window.AudioContext
        ||
        window.webkitAudioContext
      )();

    musicGain =
      musicContext.createGain();

    musicFilter =
      musicContext.createBiquadFilter();

    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 3600;
    musicFilter.Q.value = 0.65;

    musicCompressor =
      musicContext.createDynamicsCompressor();

    musicCompressor.threshold.value = -22;
    musicCompressor.knee.value = 16;
    musicCompressor.ratio.value = 3;
    musicCompressor.attack.value = 0.012;
    musicCompressor.release.value = 0.2;

    musicGain.connect(musicFilter);
    musicFilter.connect(musicCompressor);
    musicCompressor.connect(
      musicContext.destination
    );

    setMasterVolume(
      musicVolume()
    );
  }

  if(
    musicContext.state !== "running"
  ){
    await musicContext.resume();
  }

  if(!musicTimer){
    musicNextNoteTime =
      musicContext.currentTime + 0.045;

    scheduleMusic();

    musicTimer =
      setInterval(
        scheduleMusic,
        MUSIC_LOOKAHEAD_MS
      );
  }

  refreshMusicButtons();
}

async function stopMusic(){
  if(musicTimer){
    clearInterval(musicTimer);
    musicTimer = null;
  }

  musicNextNoteTime = 0;

  for(const voice of musicVoices){
    try{
      voice.stop();
    }catch{}
  }

  musicVoices.clear();

  if(
    musicContext
    &&
    musicContext.state === "running"
  ){
    await musicContext.suspend();
  }

  refreshMusicButtons();
}

async function toggleMusic(){
  if(musicEnabled()){
    localStorage.setItem(
      MUSIC_KEY,
      "0"
    );

    await stopMusic();
  }else{
    localStorage.setItem(
      MUSIC_KEY,
      "1"
    );

    await startMusic();
  }

  refreshMusicButtons();
}

function refreshMusicButtons(){
  document
    .querySelectorAll(
      ".v231-music-btn"
    )
    .forEach(btn=>{
      const on =
        musicEnabled();

      btn.classList.toggle(
        "on",
        on
      );

      btn.textContent =
        on
          ? "🎵 Activada"
          : "🔇 Desactivada";

      btn.setAttribute(
        "aria-pressed",
        String(on)
      );
    });

  document
    .querySelectorAll(
      ".v231-volume"
    )
    .forEach(slider=>{
      slider.value =
        String(
          musicVolume()
        );
    });
}

async function saveAvatar(avatar){
  if(!currentUser){
    return;
  }

  await setDoc(
    doc(
      db,
      "users",
      currentUser.uid
    ),
    {
      avatar,
      updatedAt:serverTimestamp()
    },
    {
      merge:true
    }
  );

  if(currentProfile){
    currentProfile.avatar =
      avatar;
  }

  avatarCache.clear();

  updateHomeAccountAvatar();
  polishAll();
}

function injectAccountSettings(){
  if(!currentUser){
    return;
  }

  const overlays =
    [
      ...document.querySelectorAll(
        ".v23-overlay"
      )
    ];

  for(const overlay of overlays){
    const buttons =
      [
        ...overlay.querySelectorAll(
          "button"
        )
      ];

    const logout =
      buttons.find(
        b=>
          b.textContent
            .toLowerCase()
            .includes("cerrar sesión")
      );

    if(!logout){
      continue;
    }

    const userEl =
      overlay.querySelector(
        ".v23-user"
      );

    if(
      userEl
      &&
      !userEl.querySelector(
        ".v231-avatar"
      )
    ){
      const avatar =
        document.createElement("span");

      avatar.className =
        "v231-avatar";

      avatar.textContent =
        currentProfile?.avatar
        || "⚡";

      userEl.prepend(avatar);
    }

    if(
      overlay.querySelector(
        ".v231-settings"
      )
    ){
      continue;
    }

    const settings =
      document.createElement("div");

    settings.className =
      "v231-settings";

    settings.innerHTML = `
      <h3>Personalización</h3>

      <div class="v23-muted">
        Avatar PokEX
      </div>

      <div class="v231-avatar-picker">
        ${avatarChoices.map(a=>`
          <button
            class="v231-avatar-option ${
              a === (
                currentProfile?.avatar
                || "⚡"
              )
                ? "active"
                : ""
            }"
            data-avatar="${esc(a)}">
            ${esc(a)}
          </button>
        `).join("")}
      </div>

      <div class="v231-setting-line">
        <div>
          <strong>Música de fondo</strong>
          <div class="v23-muted">
            Chiptune original · v${VERSION}
          </div>
        </div>

        <button
          class="v231-music-btn"
          type="button">
        </button>
      </div>

      <input
        class="v231-volume"
        type="range"
        min="0"
        max="100"
        step="1"
        aria-label="Volumen de música">
    `;

    logout.parentNode.insertBefore(
      settings,
      logout
    );

    settings
      .querySelectorAll(
        "[data-avatar]"
      )
      .forEach(btn=>{
        btn.onclick =
          async ()=>{
            await saveAvatar(
              btn.dataset.avatar
            );

            settings
              .querySelectorAll(
                "[data-avatar]"
              )
              .forEach(x=>
                x.classList.toggle(
                  "active",
                  x === btn
                )
              );

            const avatar =
              userEl?.querySelector(
                ".v231-avatar"
              );

            if(avatar){
              avatar.textContent =
                btn.dataset.avatar;
            }
          };
      });

    settings
      .querySelector(
        ".v231-music-btn"
      )
      .onclick =
        toggleMusic;

    settings
      .querySelector(
        ".v231-volume"
      )
      .oninput =
        e=>
          setMasterVolume(
            e.target.value
          );

    refreshMusicButtons();
  }
}

function addSkeletons(){
  document
    .querySelectorAll(
      ".v234-status"
    )
    .forEach(el=>{
      const text =
        el.textContent
          .trim()
          .toLowerCase();

      if(
        !text.startsWith("cargando")
        ||
        el.querySelector(
          ".v231-skeleton"
        )
      ){
        return;
      }

      const original =
        el.textContent.trim();

      el.innerHTML = `
        <div>${esc(original)}</div>

        <div class="v231-skeleton">
          <div class="v231-skeleton-row"></div>
          <div class="v231-skeleton-row"></div>
          <div class="v231-skeleton-row"></div>
        </div>
      `;
    });
}

function compactFriendMenus(){
  document
    .querySelectorAll(
      ".v234-card"
    )
    .forEach(card=>{
      if(
        card.querySelector(
          ".v231-more"
        )
      ){
        return;
      }

      const remove =
        card.querySelector(
          "[data-delete]"
        );

      const block =
        card.querySelector(
          "[data-block]"
        );

      if(
        !remove
        &&
        !block
      ){
        return;
      }

      const actions =
        (remove || block)
          ?.parentElement;

      if(!actions){
        return;
      }

      const details =
        document.createElement(
          "details"
        );

      details.className =
        "v231-more";

      const summary =
        document.createElement(
          "summary"
        );

      summary.textContent =
        "⋯";

      const menu =
        document.createElement(
          "div"
        );

      menu.className =
        "v231-more-menu";

      if(remove){
        menu.appendChild(remove);
      }

      if(block){
        menu.appendChild(block);
      }

      details.appendChild(summary);
      details.appendChild(menu);

      actions.appendChild(details);
    });
}

async function addAvatarsToFriends(){
  if(!currentUser){
    return;
  }

  const users =
    [
      ...document.querySelectorAll(
        ".v234-user"
      )
    ];

  for(const el of users){
    if(
      el.querySelector(
        ".v231-avatar"
      )
    ){
      continue;
    }

    const username =
      el.textContent
        .trim()
        .replace(/^@/,"");

    if(!username){
      continue;
    }

    const avatarText =
      await loadAvatarForUsername(
        username
      );

    if(
      el.querySelector(
        ".v231-avatar"
      )
    ){
      continue;
    }

    const avatar =
      document.createElement("span");

    avatar.className =
      "v231-avatar";

    avatar.textContent =
      avatarText;

    el.prepend(avatar);
  }

  const ranks =
    [
      ...document.querySelectorAll(
        ".v234-rank"
      )
    ];

  for(const row of ranks){
    if(
      row.querySelector(
        ".v231-avatar"
      )
    ){
      continue;
    }

    const usernameEl =
      [
        ...row.querySelectorAll(
          "strong"
        )
      ].find(
        x=>
          x.textContent
            .trim()
            .startsWith("@")
      );

    if(!usernameEl){
      continue;
    }

    const username =
      usernameEl.textContent
        .trim()
        .replace(/^@/,"");

    const avatarText =
      await loadAvatarForUsername(
        username
      );

    const avatar =
      document.createElement("span");

    avatar.className =
      "v231-avatar";

    avatar.textContent =
      avatarText;

    usernameEl.prepend(avatar);
  }
}

function detectPokedexGrid(){
  const search =
    [
      ...document.querySelectorAll(
        "input"
      )
    ].find(input=>
      String(
        input.placeholder || ""
      )
      .toLowerCase()
      .includes(
        "buscar en mi colección"
      )
    );

  if(!search){
    return;
  }

  let root =
    search.parentElement;

  for(let i=0;i<5;i++){
    if(
      !root
      ||
      root === document.body
    ){
      break;
    }

    const text =
      root.innerText || "";

    if(
      text.includes(
        "Mi Pokédex"
      )
      ||
      root.querySelector(
        ".pokedex-nav"
      )
    ){
      break;
    }

    root =
      root.parentElement;
  }

  root =
    root || document.body;

  const images =
    [
      ...root.querySelectorAll(
        "img"
      )
    ].filter(img=>{
      if(
        img.closest(
          ".v23-overlay,.v234-overlay"
        )
      ){
        return false;
      }

      return !!img.getAttribute(
        "src"
      );
    });

  const cards = [];

  for(const img of images){
    let node =
      img.parentElement;

    let card =
      null;

    for(let depth=0;depth<7;depth++){
      if(
        !node
        ||
        node === root
      ){
        break;
      }

      const text =
        node.innerText || "";

      if(
        /\d+[.,]\d{2}\s*€/.test(
          text
        )
        &&
        text.length < 700
      ){
        card = node;
        break;
      }

      node =
        node.parentElement;
    }

    if(
      card
      &&
      !cards.includes(card)
    ){
      cards.push(card);
    }
  }

  if(!cards.length){
    return;
  }

  for(const card of cards){
    card.classList.add(
      "v231-pokedex-card"
    );
  }

  const groups =
    new Map();

  for(const card of cards){
    const parent =
      card.parentElement;

    if(!parent){
      continue;
    }

    if(!groups.has(parent)){
      groups.set(
        parent,
        0
      );
    }

    groups.set(
      parent,
      groups.get(parent) + 1
    );
  }

  let bestParent =
    null;

  let bestCount =
    0;

  for(const [parent,count] of groups){
    if(count > bestCount){
      bestCount = count;
      bestParent = parent;
    }
  }

  if(bestParent){
    bestParent.classList.add(
      "v231-pokedex-grid"
    );
  }
}

function updateVersionDisplay(){
  document
    .querySelectorAll(
      ".v23-stat"
    )
    .forEach(stat=>{
      const text =
        stat.textContent
          .toLowerCase();

      if(
        !text.includes(
          "versión vista"
        )
      ){
        return;
      }

      const strong =
        stat.querySelector(
          "strong"
        );

      if(
        strong
        &&
        strong.textContent.trim()
        !== `v${VERSION}`
      ){
        strong.textContent =
          `v${VERSION}`;
      }
    });
}

function polishAll(){
  clearTimeout(polishTimer);

  polishTimer =
    setTimeout(
      ()=>{
        injectAccountSettings();
        updateVersionDisplay();
        updateHomeAccountAvatar();
      },
      80
    );
}

window.addEventListener(
  "pokex:account-button-ready",
  updateHomeAccountAvatar
);

const accountOverlay =
  document.getElementById(
    "pokexAccountOverlay"
  );

if(accountOverlay){
  new MutationObserver(
    polishAll
  ).observe(
    accountOverlay,
    {
      childList:true,
      subtree:true
    }
  );
}

onAuthStateChanged(
  auth,
  async user=>{
    currentUser = user;
    currentProfile = null;
    avatarCache.clear();

    if(user){
      try{
        currentProfile =
          await loadProfile(
            user.uid
          );

        await setDoc(
          doc(
            db,
            "users",
            user.uid
          ),
          {
            lastSeenVersion:VERSION,
            updatedAt:serverTimestamp()
          },
          {
            merge:true
          }
        );

        if(
          musicEnabled()
        ){
          const resumeOnGesture =
            async ()=>{
              document.removeEventListener(
                "pointerdown",
                resumeOnGesture,
                true
              );

              await startMusic();
            };

          document.addEventListener(
            "pointerdown",
            resumeOnGesture,
            true
          );
        }

      }catch(error){
        console.warn(
          "PokEX UI profile:",
          error
        );
      }
    }else{
      await stopMusic();
    }

    watchRequests();
    polishAll();
  }
);

document.addEventListener(
  "visibilitychange",
  async ()=>{
    if(!musicEnabled()){
      return;
    }

    if(document.hidden){
      await stopMusic();
    }else{
      try{
        await startMusic();
      }catch{}
    }
  }
);

let musicPausedForScanner = false;

new MutationObserver(
  async ()=>{
    const scannerOpen =
      document.body.classList.contains(
        "cv11-camera-open"
      );

    if(scannerOpen){
      if(musicEnabled()){
        musicPausedForScanner = true;
        await stopMusic();
      }
      return;
    }

    if(
      musicPausedForScanner &&
      musicEnabled() &&
      !document.hidden
    ){
      musicPausedForScanner = false;
      try{
        await startMusic();
      }catch{}
    }
  }
).observe(
  document.body,
  {
    attributes:true,
    attributeFilter:["class"]
  }
);

window.PokEXMobile231 = {
  VERSION,
  toggleMusic,
  startMusic,
  stopMusic,
  polish:polishAll
};

polishAll();

console.log(
  "✅ PokEX Mobile Polish v2.3.1 cargado"
);
