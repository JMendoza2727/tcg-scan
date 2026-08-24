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
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const VERSION = "2.3.3";

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
let musicTimer = null;
let musicStep = 0;

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

async function loadProfile(uid){
  if(!uid){
    return null;
  }

  const snap =
    await getDocs(
      query(
        collection(db,"users"),
        where("__name__","==",uid)
      )
    );

  if(snap.empty){
    return null;
  }

  return {
    uid:snap.docs[0].id,
    ...snap.docs[0].data()
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
      0.08 * volume,
      musicContext.currentTime,
      0.04
    );
  }
}

function playTone(freq,duration=0.42,offset=0){
  if(
    !musicContext
    ||
    !musicGain
    ||
    musicContext.state !== "running"
  ){
    return;
  }

  const now =
    musicContext.currentTime + offset;

  const osc =
    musicContext.createOscillator();

  const gain =
    musicContext.createGain();

  osc.type = "triangle";
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(
    0.0001,
    now
  );

  gain.gain.exponentialRampToValueAtTime(
    0.22,
    now + 0.025
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + duration
  );

  osc.connect(gain);
  gain.connect(musicGain);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function musicTick(){
  const melody = [
    261.63,
    329.63,
    392.00,
    329.63,
    293.66,
    349.23,
    440.00,
    349.23,
    246.94,
    293.66,
    392.00,
    293.66,
    220.00,
    277.18,
    329.63,
    277.18
  ];

  const bass = [
    130.81,
    146.83,
    123.47,
    110.00
  ];

  const note =
    melody[
      musicStep % melody.length
    ];

  playTone(
    note,
    0.34
  );

  if(musicStep % 4 === 0){
    playTone(
      bass[
        Math.floor(
          musicStep / 4
        ) % bass.length
      ],
      0.55,
      0.03
    );
  }

  musicStep++;
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

    musicGain.connect(
      musicContext.destination
    );

    setMasterVolume(
      musicVolume()
    );
  }

  if(
    musicContext.state === "suspended"
  ){
    await musicContext.resume();
  }

  if(!musicTimer){
    musicTick();

    musicTimer =
      setInterval(
        musicTick,
        620
      );
  }

  refreshMusicButtons();
}

async function stopMusic(){
  if(musicTimer){
    clearInterval(musicTimer);
    musicTimer = null;
  }

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
        addSkeletons();
        compactFriendMenus();
        detectPokedexGrid();
        updateVersionDisplay();
        addAvatarsToFriends()
          .catch(console.warn);
      },
      80
    );
}

const observer =
  new MutationObserver(
    polishAll
  );

observer.observe(
  document.documentElement,
  {
    childList:true,
    subtree:true
  }
);

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
      if(
        musicContext
        &&
        musicContext.state === "running"
      ){
        await musicContext.suspend();
      }
    }else{
      if(
        musicContext
        &&
        musicContext.state === "suspended"
      ){
        try{
          await musicContext.resume();
        }catch{}
      }
    }
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
