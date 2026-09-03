import { getApps,getApp,initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth,onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore,collection,query,where,onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const cfg=window.POKEX_FIREBASE_CONFIG||{};
const app=(cfg.apiKey&&cfg.projectId&&cfg.appId)?(getApps().length?getApp():initializeApp(cfg)):null;
const auth=app?getAuth(app):null;
const db=app?getFirestore(app):null;

let user=null;
let activeCount=0;
let incomingDocs=[];
let outgoingDocs=[];
let unsubscribeIncoming=null;
let unsubscribeOutgoing=null;

function openTrades(){
  if(!user){
    alert("Inicia sesión para ver tus intercambios.");
    return;
  }
  const trades=window.PokEXTradesV34;
  if(!trades?.showTrades){
    alert("El módulo de intercambios todavía no está disponible.");
    return;
  }
  trades.showTrades("active");
}

function recalculateActiveCount(){
  const map=new Map();
  [...incomingDocs,...outgoingDocs].forEach(item=>map.set(item.id,item));
  activeCount=[...map.values()].filter(item=>["pending","accepted"].includes(item.status)).length;
  refreshBadges();
}

function refreshBadges(){
  document.querySelectorAll("[data-trade-count]").forEach(el=>{
    el.hidden=activeCount<1;
    el.textContent=activeCount>9?"9+":String(activeCount);
  });
  const subtitle=document.querySelector("[data-trades-subtitle]");
  if(subtitle){
    subtitle.textContent=activeCount
      ? `${activeCount} intercambio${activeCount===1?"":"s"} activo${activeCount===1?"":"s"}`
      : (user?"Activos, recibidos e historial":"Inicia sesión para ver tus intercambios");
  }
}

function installHomeLauncher(){
  if(document.getElementById("pokexTradesHomeButton")){
    refreshBadges();
    return true;
  }
  const friendsButton=document.getElementById("pokexFriendsV33Button");
  if(!friendsButton)return false;

  const button=document.createElement("button");
  button.id="pokexTradesHomeButton";
  button.type="button";
  button.className="f33-launch tr34-home-launch";
  button.innerHTML=`<span class="f33-launch-icon">🔄</span><span class="f33-launch-copy"><strong>Intercambios</strong><small data-trades-subtitle>Activos, recibidos e historial</small></span><span class="f33-launch-badge" data-trade-count hidden></span><span class="f33-launch-arrow">›</span>`;
  button.addEventListener("click",openTrades);
  friendsButton.insertAdjacentElement("afterend",button);
  refreshBadges();
  return true;
}

function installFriendsTab(){
  const root=document.getElementById("pokexFriendsV33Overlay");
  const tabs=root?.querySelector(".f33-tabs");
  if(!tabs)return false;

  let btn=tabs.querySelector("[data-v34-tab='trades']");
  if(!btn){
    btn=document.createElement("button");
    btn.type="button";
    btn.dataset.v34Tab="trades";
    btn.innerHTML=`Cambios <span class="tr34-tab-badge" data-trade-count hidden></span>`;
    btn.addEventListener("click",openTrades);
    tabs.appendChild(btn);
  }
  refreshBadges();
  return true;
}

function installUI(){
  installHomeLauncher();
  installFriendsTab();
}

function stopTradeListeners(){
  unsubscribeIncoming?.();
  unsubscribeOutgoing?.();
  unsubscribeIncoming=null;
  unsubscribeOutgoing=null;
  incomingDocs=[];
  outgoingDocs=[];
  activeCount=0;
  refreshBadges();
}

function startTradeListeners(){
  stopTradeListeners();
  if(!user||!db)return;

  const incomingQuery=query(collection(db,"tradeOffers"),where("toUid","==",user.uid));
  const outgoingQuery=query(collection(db,"tradeOffers"),where("fromUid","==",user.uid));

  unsubscribeIncoming=onSnapshot(incomingQuery,snap=>{
    incomingDocs=snap.docs.map(d=>({id:d.id,...d.data()}));
    recalculateActiveCount();
  },error=>console.warn("PokEX trade badge incoming:",error));

  unsubscribeOutgoing=onSnapshot(outgoingQuery,snap=>{
    outgoingDocs=snap.docs.map(d=>({id:d.id,...d.data()}));
    recalculateActiveCount();
  },error=>console.warn("PokEX trade badge outgoing:",error));
}

const observer=new MutationObserver(()=>queueMicrotask(installUI));
observer.observe(document.body,{childList:true,subtree:true});
document.addEventListener("click",event=>{
  if(event.target.closest("#pokexFriendsV33Button"))setTimeout(installFriendsTab,60);
},true);

if(auth)onAuthStateChanged(auth,next=>{
  user=next;
  installUI();
  if(user)startTradeListeners();
  else stopTradeListeners();
});else installUI();

console.log("✅ PokEX Trades launcher v3.4 cargado");
