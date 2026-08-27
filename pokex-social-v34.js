import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const VERSION = "3.4";
const cfg = window.POKEX_FIREBASE_CONFIG || {};
const configured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = configured ? (getApps().length ? getApp() : initializeApp(cfg)) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

let user = null;
let profileCache = new Map();
let currentMetric = "value";
let friendsModalObserver = null;

const esc = value => String(value ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;");

const rid = (a,b) => `${a}__${b}`;
const money = value => `${(Number(value)||0).toFixed(2)} €`;
const qty = value => Math.max(0, Number(value)||0);
const nameOf = p => p?.username || p?.displayName || "Entrenador";
const avatarOf = p => String(p?.avatar || "").trim() || "😎";
const flagOf = lang => lang === "en" ? "🇬🇧" : lang === "ja" ? "🇯🇵" : "🇪🇸";

function imageURL(image){
  const value = String(image || "").trim();
  if(!value) return "";
  if(/\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i.test(value)) return value;
  return `${value}/low.webp`;
}

function applyVersion(){
  document.title = `PokEX ${VERSION}`;
  document.querySelectorAll(".pokex-version").forEach(el => el.textContent = `v${VERSION}`);
}

async function profile(uid, fresh=false){
  if(!uid || !db) return null;
  if(!fresh && profileCache.has(uid)) return profileCache.get(uid);
  const snap = await getDoc(doc(db,"users",uid));
  const data = snap.exists() ? {uid:snap.id,...snap.data()} : null;
  if(data) profileCache.set(uid,data);
  return data;
}

async function links(){
  if(!user || !db) return [];
  const snap = await getDocs(query(collection(db,"friendLinks"),where("ownerUid","==",user.uid)));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function isFriend(uid){
  if(!user || !uid || uid === user.uid) return false;
  const snap = await getDoc(doc(db,"friendLinks",rid(user.uid,uid)));
  return snap.exists() && snap.data()?.ownerUid === user.uid && snap.data()?.friendUid === uid;
}

async function friendProfiles(){
  const currentLinks = await links();
  const list = (await Promise.all(currentLinks.map(item=>profile(item.friendUid,true)))).filter(Boolean);
  return list;
}

function metricValue(p,metric=currentMetric){
  if(metric === "cards") return qty(p?.cardsCount);
  if(metric === "distinct") return qty(p?.distinctCount);
  return Number(p?.collectionValue)||0;
}

function metricLabel(metric=currentMetric){
  if(metric === "cards") return "cartas";
  if(metric === "distinct") return "distintas";
  return "valor";
}

function metricDisplay(p,metric=currentMetric){
  if(metric === "cards") return `${qty(p?.cardsCount)} cartas`;
  if(metric === "distinct") return `${qty(p?.distinctCount)} distintas`;
  return money(p?.collectionValue);
}

function installRankTab(){
  const root = document.getElementById("pokexFriendsV33Overlay");
  if(!root) return false;
  const tabs = root.querySelector(".f33-tabs");
  if(!tabs) return false;
  if(!tabs.querySelector("[data-v34-tab='ranking']")){
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.v34Tab = "ranking";
    button.textContent = "Rankings";
    button.addEventListener("click",async()=>{
      tabs.querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button));
      await renderRankings();
    });
    tabs.appendChild(button);
  }
  installFriendDecorObserver(root);
  decorateFriendCards();
  return true;
}

function installFriendDecorObserver(root){
  if(friendsModalObserver) return;
  const body = root.querySelector("#f33Body");
  if(!body) return;
  friendsModalObserver = new MutationObserver(()=>queueMicrotask(decorateFriendCards));
  friendsModalObserver.observe(body,{childList:true,subtree:true});
}

function decorateFriendCards(){
  const root = document.getElementById("pokexFriendsV33Overlay");
  if(!root || root.classList.contains("hidden")) return;
  root.querySelectorAll(".f33-user-card").forEach(card=>{
    if(card.querySelector(".f34-view")) return;
    const source = card.querySelector("[data-remove],[data-block]");
    const uid = source?.dataset.remove || source?.dataset.block || "";
    if(!uid) return;
    let actions = card.querySelector(".f33-actions");
    if(!actions){ actions=document.createElement("div"); actions.className="f33-actions"; card.appendChild(actions); }
    const view = document.createElement("button");
    view.type="button";
    view.className="f33-soft f34-view";
    view.textContent="Ver colección";
    view.addEventListener("click",()=>openFriendProfile(uid));
    actions.insertBefore(view,actions.firstChild);
    card.querySelector(".f33-user-main")?.addEventListener("click",event=>{
      if(event.target.closest("button,.f33-actions")) return;
      openFriendProfile(uid);
    });
  });
  const sectionText = [...root.querySelectorAll(".f33-section-head small")].find(el=>el.textContent.includes("Colecciones y rankings"));
  if(sectionText) sectionText.textContent="Toca un entrenador para ver su colección.";
}

function rankingState(html){
  const body = document.getElementById("f33Body");
  if(body) body.innerHTML = html;
}

async function renderRankings(){
  if(!user) return rankingState(`<div class="f34-state"><span>🔐</span><strong>Inicia sesión</strong><p>Necesitas una cuenta para competir con tus amigos.</p></div>`);
  rankingState(`<div class="f33-loading">Calculando rankings…</div>`);
  try{
    const [mine,friends] = await Promise.all([profile(user.uid,true),friendProfiles()]);
    const all = [mine,...friends].filter(Boolean);
    const sorted = all.sort((a,b)=>metricValue(b)-metricValue(a) || nameOf(a).localeCompare(nameOf(b)));
    const podium = sorted.slice(0,3);
    const order = podium.length === 3 ? [podium[1],podium[0],podium[2]] : podium;
    const medalForOriginalRank = rank => rank===1?"🥇":rank===2?"🥈":"🥉";
    const originalRank = p => sorted.findIndex(x=>x.uid===p.uid)+1;

    rankingState(`
      <div class="f33-section-head"><div><strong>Rankings de amigos</strong><small>${friends.length} amigo${friends.length===1?"":"s"} + tú</small></div></div>
      <div class="f34-rank-tools">
        <button type="button" data-metric="value" class="${currentMetric==="value"?"active":""}">💰 Valor</button>
        <button type="button" data-metric="cards" class="${currentMetric==="cards"?"active":""}">🃏 Cartas</button>
        <button type="button" data-metric="distinct" class="${currentMetric==="distinct"?"active":""}">⭐ Distintas</button>
      </div>
      ${order.length?`<div class="f34-podium">${order.map(p=>{
        const rank=originalRank(p);return `<article class="f34-podium-card ${rank===1?"first":""}" data-rank-uid="${esc(p.uid)}"><span class="f34-medal">${medalForOriginalRank(rank)}</span><span class="f34-podium-avatar">${esc(avatarOf(p))}</span><strong>@${esc(nameOf(p))}</strong><small>#${rank} en ${esc(metricLabel())}</small><b>${esc(metricDisplay(p))}</b></article>`;
      }).join("")}</div>`:""}
      <div class="f34-ranking-list">${sorted.map((p,index)=>`<article class="f34-rank-row ${p.uid===user.uid?"me":"clickable"}" data-rank-uid="${esc(p.uid)}"><span class="f34-position">#${index+1}</span><span class="f34-rank-avatar">${esc(avatarOf(p))}</span><div class="f34-rank-user"><strong>@${esc(nameOf(p))}</strong><small>${p.uid===user.uid?"Tú":"Amigo PokEX"}</small></div><span class="f34-rank-value">${esc(metricDisplay(p))}</span></article>`).join("")}</div>
    `);

    document.querySelectorAll("#f33Body [data-metric]").forEach(button=>button.addEventListener("click",async()=>{
      currentMetric=button.dataset.metric;
      await renderRankings();
    }));
    document.querySelectorAll("#f33Body [data-rank-uid]").forEach(row=>row.addEventListener("click",()=>{
      const uid=row.dataset.rankUid;
      if(uid && uid!==user.uid) openFriendProfile(uid);
    }));
  }catch(error){
    console.warn("PokEX rankings v3.4:",error);
    rankingState(`<div class="f34-state"><span>⚠️</span><strong>No se pudieron cargar los rankings</strong><p>${esc(error?.message||"Inténtalo de nuevo en unos segundos.")}</p></div>`);
  }
}

function profileOverlay(){
  let root=document.getElementById("pokexFriendProfileV34");
  if(root) return root;
  root=document.createElement("div");
  root.id="pokexFriendProfileV34";
  root.className="f34-overlay hidden";
  root.innerHTML=`<section class="f34-sheet" role="dialog" aria-modal="true" aria-label="Colección de amigo"><header class="f34-head"><div class="f34-head-main"><span class="f34-head-avatar" data-avatar>😎</span><div class="f34-head-copy"><small>Entrenador PokEX</small><strong data-name>@Entrenador</strong></div></div><button class="f34-close" type="button" aria-label="Cerrar">×</button></header><div class="f34-body" data-body></div></section>`;
  document.body.appendChild(root);
  root.querySelector(".f34-close").onclick=closeFriendProfile;
  root.addEventListener("click",event=>{if(event.target===root) closeFriendProfile();});
  return root;
}

function closeFriendProfile(){
  document.getElementById("pokexFriendProfileV34")?.classList.add("hidden");
}

async function friendCards(uid){
  if(!await isFriend(uid)) throw new Error("Esta colección solo está disponible para amigos aceptados.");
  const snap=await getDocs(collection(db,"users",uid,"cards"));
  return snap.docs.map(d=>({docId:d.id,...d.data()})).filter(item=>qty(item.quantity)>0);
}

function cardPrice(item){
  if(Number.isFinite(Number(item?.lastPrice))) return Number(item.lastPrice);
  if(Number.isFinite(Number(item?.lastTrend))) return Number(item.lastTrend);
  return null;
}

function renderCollectionCards(container,cards,filter=""){
  const q=String(filter||"").trim().toLowerCase();
  const filtered=cards.filter(item=>!q || `${item.name||""} ${item.setName||""} ${item.localId||""}`.toLowerCase().includes(q));
  const grid=container.querySelector("[data-cards]");
  const count=container.querySelector("[data-visible-count]");
  if(count) count.textContent=`${filtered.length} carta${filtered.length===1?"":"s"} distintas`;
  if(!grid) return;
  if(!filtered.length){grid.innerHTML=`<div class="f34-state" style="grid-column:1/-1"><span>🔎</span><strong>Sin resultados</strong><p>No hay cartas que coincidan con esa búsqueda.</p></div>`;return;}
  grid.innerHTML=filtered
    .sort((a,b)=>(cardPrice(b)||0)-(cardPrice(a)||0) || String(a.name||"").localeCompare(String(b.name||"")))
    .map(item=>{
      const price=cardPrice(item); const total=price===null?null:price*qty(item.quantity); const src=imageURL(item.image);
      return `<article class="f34-card"><div class="f34-card-media">${src?`<img loading="lazy" src="${esc(src)}" alt="${esc(item.name||"Carta Pokémon")}">`:`<div class="f34-card-placeholder">🃏</div>`}<span class="f34-lang">${flagOf(item.lang)}</span><span class="f34-qty">×${qty(item.quantity)}</span></div><div class="f34-card-copy"><strong>${esc(item.name||"Carta Pokémon")}</strong><small>${esc(item.setName||"Expansión desconocida")}${item.localId?` · #${esc(item.localId)}`:""}</small><div class="f34-card-price"><span>${price===null?"Sin precio":`${money(price)} c/u`}</span><b>${total===null?"—":money(total)}</b></div></div></article>`;
    }).join("");
}

async function openFriendProfile(uid){
  if(!user || !uid || uid===user.uid) return;
  const root=profileOverlay();
  root.classList.remove("hidden");
  const body=root.querySelector("[data-body]");
  body.innerHTML=`<div class="f33-loading">Cargando colección…</div>`;
  try{
    const allowed=await isFriend(uid);
    if(!allowed) throw new Error("Ya no sois amigos o no tienes permiso para ver esta colección.");
    const [p,cards]=await Promise.all([profile(uid,true),friendCards(uid)]);
    if(!p) throw new Error("No se pudo cargar el perfil de este entrenador.");
    root.querySelector("[data-avatar]").textContent=avatarOf(p);
    root.querySelector("[data-name]").textContent=`@${nameOf(p)}`;
    const actualCount=cards.reduce((sum,item)=>sum+qty(item.quantity),0);
    const actualDistinct=cards.length;
    const actualValue=cards.reduce((sum,item)=>sum+(cardPrice(item)||0)*qty(item.quantity),0);
    const cardsCount=Number.isFinite(Number(p.cardsCount))?Number(p.cardsCount):actualCount;
    const distinct=Number.isFinite(Number(p.distinctCount))?Number(p.distinctCount):actualDistinct;
    const value=Number.isFinite(Number(p.collectionValue))?Number(p.collectionValue):actualValue;
    body.innerHTML=`
      <div class="f34-profile-stats"><div class="f34-stat"><span>Cartas</span><strong>${cardsCount}</strong></div><div class="f34-stat"><span>Distintas</span><strong>${distinct}</strong></div><div class="f34-stat"><span>Valor</span><strong>${money(value)}</strong></div></div>
      <div class="f34-collection-head"><div><strong>Colección</strong><small data-visible-count>${cards.length} cartas distintas</small></div><small>Solo lectura</small></div>
      <input class="f34-search" type="search" autocomplete="off" placeholder="Buscar en su colección…" aria-label="Buscar en colección de amigo">
      <div class="f34-cards" data-cards></div>`;
    renderCollectionCards(body,cards,"");
    body.querySelector(".f34-search")?.addEventListener("input",event=>renderCollectionCards(body,cards,event.target.value));
  }catch(error){
    console.warn("PokEX friend collection v3.4:",error);
    body.innerHTML=`<div class="f34-state"><span>🔒</span><strong>No se puede abrir esta colección</strong><p>${esc(error?.message||"No tienes acceso a esta colección.")}</p></div>`;
  }
}

function findFriendsModalUntilReady(){
  if(installRankTab()) return;
  const finder=new MutationObserver(()=>{if(installRankTab()) finder.disconnect();});
  finder.observe(document.body,{childList:true,subtree:true});
}

document.addEventListener("click",event=>{
  if(event.target.closest("#pokexFriendsV33Button")) setTimeout(installRankTab,0);
},true);

applyVersion();
findFriendsModalUntilReady();

if(auth){
  onAuthStateChanged(auth,next=>{
    user=next;
    profileCache.clear();
    applyVersion();
    if(document.getElementById("pokexFriendsV33Overlay")) installRankTab();
  });
}

window.PokEXSocialV34={openFriendProfile,renderRankings,version:VERSION};
console.log("✅ PokEX Social v3.4 cargado");
