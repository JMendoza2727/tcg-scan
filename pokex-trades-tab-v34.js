import { getApps,getApp,initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth,onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore,collection,getDocs,query,where } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const cfg=window.POKEX_FIREBASE_CONFIG||{};
const app=(cfg.apiKey&&cfg.projectId&&cfg.appId)?(getApps().length?getApp():initializeApp(cfg)):null;
const auth=app?getAuth(app):null;
const db=app?getFirestore(app):null;
let user=null,timer=0;

async function pendingCount(){
  if(!user||!db)return 0;
  try{
    const snap=await getDocs(query(collection(db,"tradeOffers"),where("toUid","==",user.uid)));
    return snap.docs.filter(d=>d.data()?.status==="pending").length;
  }catch{return 0;}
}

async function install(){
  const root=document.getElementById("pokexFriendsV33Overlay");
  const tabs=root?.querySelector(".f33-tabs");
  if(!tabs)return;
  let btn=tabs.querySelector("[data-v34-tab='trades']");
  if(!btn){
    btn=document.createElement("button");
    btn.type="button";
    btn.dataset.v34Tab="trades";
    btn.innerHTML=`Cambios <span class="tr34-tab-badge" hidden></span>`;
    btn.addEventListener("click",()=>window.PokEXTradesV34?.showTrades?.("active"));
    tabs.appendChild(btn);
  }
  const count=await pendingCount();
  const badge=btn.querySelector(".tr34-tab-badge");
  if(badge){badge.hidden=!count;badge.textContent=count>9?"9+":String(count);}
}

const obs=new MutationObserver(()=>queueMicrotask(install));
obs.observe(document.body,{childList:true,subtree:true});
document.addEventListener("click",e=>{if(e.target.closest("#pokexFriendsV33Button"))setTimeout(install,60);},true);

if(auth)onAuthStateChanged(auth,u=>{
  user=u;
  clearInterval(timer);
  if(u){install();timer=setInterval(install,12000);}
});

console.log("✅ PokEX Trades tab v3.4 cargado");
