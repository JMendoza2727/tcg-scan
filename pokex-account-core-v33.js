import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const cfg = window.POKEX_FIREBASE_CONFIG || {};
const app = getApps().length ? getApp() : initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

const AVATARS = ["😎","🤠","🥷","🧙","🦸","🧑‍🚀","🤖","👻","🧑‍🎤","🧑‍💻"];
const DEFAULT_AVATAR = "😎";
const MUSIC_KEY = "pokex_music_enabled";
const VOLUME_KEY = "pokex_music_volume";

let user = null;
let profile = null;
let overlay = null;
let overlayObserver = null;
let injectTimer = 0;
let injecting = false;

const esc = value => String(value ?? "")
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;");

function selectedAvatar(){
  return AVATARS.includes(profile?.avatar) ? profile.avatar : DEFAULT_AVATAR;
}

async function loadProfile(){
  if(!user) return null;
  try{
    const snap = await getDoc(doc(db,"users",user.uid));
    return snap.exists() ? {uid:snap.id,...snap.data()} : null;
  }catch{
    return null;
  }
}

function removePersistentSyncMessage(){
  overlay?.querySelector("#v23AccountMessage")?.remove();
}

function prepareTemporarySyncMessage(event){
  const button = event.target.closest?.("#v23SyncNow");
  if(!button || !overlay) return;

  if(!overlay.querySelector("#v23AccountMessage")){
    const temp = document.createElement("div");
    temp.id = "v23AccountMessage";
    temp.className = "v23-message";
    temp.dataset.pokexTemporarySyncMessage = "1";
    button.parentElement?.appendChild(temp);
  }
}

function discardTemporarySyncMessage(event){
  if(!event.target.closest?.("#v23SyncNow")) return;
  queueMicrotask(()=>{
    overlay?.querySelector("#v23AccountMessage")?.remove();
  });
}

async function saveAvatar(value){
  if(!user || !AVATARS.includes(value)) return;
  try{
    await setDoc(doc(db,"users",user.uid),{
      avatar:value,
      updatedAt:serverTimestamp()
    },{merge:true});
    profile = {...(profile || {}),avatar:value};

    overlay?.querySelectorAll(".v231-avatar-option").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.avatar===value);
    });
    overlay?.querySelectorAll(".v23-user .v231-avatar").forEach(el=>{
      el.textContent=value;
    });
  }catch(error){
    console.warn("PokEX account avatar:",error);
  }
}

function refreshFallbackMusic(settings){
  const button=settings?.querySelector(".v231-music-btn");
  const slider=settings?.querySelector(".v231-volume");
  if(button){
    const on=localStorage.getItem(MUSIC_KEY)==="1";
    button.classList.toggle("on",on);
    button.textContent=on?"🎵 Activada":"🔇 Desactivada";
    button.setAttribute("aria-pressed",String(on));
  }
  if(slider){
    slider.value=String(Math.max(0,Math.min(100,Number(localStorage.getItem(VOLUME_KEY)??18))));
  }
}

function buildFallbackSettings(logout){
  if(!user || !logout || overlay?.querySelector(".v231-settings")) return;

  const settings=document.createElement("div");
  settings.className="v231-settings";
  settings.dataset.pokexAccountCore="1";
  settings.innerHTML=`
    <h3>Personalización</h3>
    <div class="v23-muted">Avatar PokEX</div>
    <div class="v231-avatar-picker">
      ${AVATARS.map(a=>`<button type="button" class="v231-avatar-option ${a===selectedAvatar()?"active":""}" data-avatar="${esc(a)}">${esc(a)}</button>`).join("")}
    </div>
    <div class="v231-setting-line">
      <div><strong>Música de fondo</strong><div class="v23-muted">PokEX · v3.3</div></div>
      <button class="v231-music-btn" type="button"></button>
    </div>
    <input class="v231-volume" type="range" min="0" max="100" step="1" aria-label="Volumen de música">
  `;

  logout.parentNode?.insertBefore(settings,logout);

  settings.querySelectorAll("[data-avatar]").forEach(btn=>{
    btn.addEventListener("click",()=>saveAvatar(btn.dataset.avatar));
  });

  settings.querySelector(".v231-music-btn")?.addEventListener("click",async()=>{
    try{
      if(window.PokEXMobile231?.toggleMusic){
        await window.PokEXMobile231.toggleMusic();
      }else{
        const on=localStorage.getItem(MUSIC_KEY)==="1";
        localStorage.setItem(MUSIC_KEY,on?"0":"1");
      }
    }catch{}
    refreshFallbackMusic(settings);
  });

  settings.querySelector(".v231-volume")?.addEventListener("input",event=>{
    localStorage.setItem(VOLUME_KEY,String(event.target.value));
  });

  refreshFallbackMusic(settings);
}

function findLogout(){
  if(!overlay) return null;
  return [...overlay.querySelectorAll("button")].find(button=>
    button.textContent.trim().toLowerCase().includes("cerrar sesión")
  ) || null;
}

function ensureAccountUI(){
  clearTimeout(injectTimer);
  injectTimer=setTimeout(async()=>{
    if(injecting || !overlay || overlay.classList.contains("hidden") || !user) return;
    injecting=true;
    try{
      removePersistentSyncMessage();

      // Primero dejamos que el módulo original haga su trabajo y conserve sus handlers de audio.
      try{ window.PokEXMobile231?.polish?.(); }catch{}

      // Si por el orden de carga no lo ha podido insertar, usamos un fallback acotado.
      await new Promise(resolve=>setTimeout(resolve,100));
      if(!overlay.querySelector(".v231-settings")){
        buildFallbackSettings(findLogout());
      }

      // El módulo Techno detecta automáticamente .v231-setting-line.
      window.dispatchEvent(new Event("resize"));
    }finally{
      injecting=false;
    }
  },40);
}

function attachOverlay(node){
  if(!node || node===overlay) return;
  overlay=node;
  overlayObserver?.disconnect();

  overlay.addEventListener("click",prepareTemporarySyncMessage,true);
  overlay.addEventListener("click",discardTemporarySyncMessage,false);

  overlayObserver=new MutationObserver(()=>ensureAccountUI());
  overlayObserver.observe(overlay,{childList:true,subtree:true});
  ensureAccountUI();
}

function locateOverlay(){
  const found=document.getElementById("pokexAccountOverlay");
  if(found){
    attachOverlay(found);
    return true;
  }
  return false;
}

if(!locateOverlay()){
  const finder=new MutationObserver(()=>{
    if(locateOverlay()) finder.disconnect();
  });
  finder.observe(document.body,{childList:true,subtree:true});
}

onAuthStateChanged(auth,async nextUser=>{
  user=nextUser;
  profile=nextUser?await loadProfile():null;
  ensureAccountUI();
});

console.log("✅ PokEX Account Core v3.3 cargado");
