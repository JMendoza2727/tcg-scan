import { getApps,getApp,initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth,onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore,collection,getDocs,doc,getDoc,setDoc,addDoc,updateDoc,serverTimestamp,query,where,onSnapshot,runTransaction } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const cfg=window.POKEX_FIREBASE_CONFIG||{};
const app=(cfg.apiKey&&cfg.projectId&&cfg.appId)?(getApps().length?getApp():initializeApp(cfg)):null;
const auth=app?getAuth(app):null;
const db=app?getFirestore(app):null;

let user=null;
let currentFriendUid="";
let currentFriendName="Entrenador";
let mine=[];
let friend=[];
let unsubTrades=[];
let tradeCache=[];

const qty=v=>Math.max(0,Number(v)||0);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const imageURL=image=>{const v=String(image||"").trim();if(!v)return"";return /\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i.test(v)?v:`${v}/low.webp`;};
const identity=x=>`${String(x?.lang||"").toLowerCase()}|${String(x?.id||"").toLowerCase()}|${String(x?.localId||"").toLowerCase()}|${String(x?.setName||"").toLowerCase()}`;
const price=x=>Number.isFinite(Number(x?.lastPrice))?Number(x.lastPrice):(Number.isFinite(Number(x?.lastTrend))?Number(x.lastTrend):0);
const cardKey=x=>String(x?.docId||x?.id||`${x?.lang||"es"}_${x?.setId||x?.setName||"set"}_${x?.localId||x?.name||"card"}`).replaceAll("/","_").slice(0,500);
const safeCard=x=>({
  docId:cardKey(x),
  id:x?.id||"",
  localId:x?.localId||"",
  setId:x?.setId||"",
  setName:x?.setName||"",
  name:x?.name||"Carta Pokémon",
  image:x?.image||"",
  lang:x?.lang||"es",
  rarity:x?.rarity||"",
  lastPrice:Number.isFinite(Number(x?.lastPrice))?Number(x.lastPrice):null,
  lastTrend:Number.isFinite(Number(x?.lastTrend))?Number(x.lastTrend):null
});

async function cardsFor(uid){
  if(!db||!uid)return[];
  const snap=await getDocs(collection(db,"users",uid,"cards"));
  return snap.docs.map(d=>({docId:d.id,...d.data()})).filter(x=>qty(x.quantity)>0);
}

async function username(uid){
  try{
    const s=await getDoc(doc(db,"users",uid));
    return s.exists()?(s.data().username||s.data().displayName||"Entrenador"):"Entrenador";
  }catch{
    return "Entrenador";
  }
}

async function isFriend(uid){
  if(!user||!uid)return false;
  const s=await getDoc(doc(db,"friendLinks",`${user.uid}__${uid}`));
  return s.exists();
}

function setCurrentFriend(uid,name=""){
  const next=String(uid||"");
  if(!next||next===user?.uid)return false;
  if(next!==currentFriendUid){
    currentFriendUid=next;
    mine=[];
    friend=[];
  }
  if(String(name||"").trim()) currentFriendName=String(name).trim();
  return true;
}

function overlay(){
  let root=document.getElementById("pokexTradesV34");
  if(root)return root;
  root=document.createElement("div");
  root.id="pokexTradesV34";
  root.className="tr34-overlay hidden";
  root.innerHTML=`<section class="tr34-sheet"><header class="tr34-head"><div><small>PokEX · Intercambios</small><strong data-title>Intercambios</strong></div><button class="tr34-x" type="button" aria-label="Cerrar">×</button></header><div class="tr34-body" data-body></div></section>`;
  document.body.appendChild(root);
  root.querySelector(".tr34-x").onclick=()=>root.classList.add("hidden");
  return root;
}

function openOverlay(title,html){
  const root=overlay();
  root.querySelector("[data-title]").textContent=title;
  const body=root.querySelector("[data-body]");
  body.classList.remove("tr34-builder-body");
  body.innerHTML=html;
  root.classList.remove("hidden");
  return body;
}

function mini(card,label){
  const src=imageURL(card?.image);
  return `<div class="tr34-mini">${src?`<img src="${esc(src)}" alt="${esc(card?.name||"Carta")}">`:""}<strong>${esc(card?.name||"Carta")}</strong><small>${esc(label||"")}${card?.localId?` · #${esc(card.localId)}`:""}</small></div>`;
}

function statusLabel(s){
  return ({pending:"Pendiente",accepted:"Aceptado",rejected:"Rechazado",cancelled:"Cancelado",countered:"Contraoferta enviada",completed:"Completado"})[s]||s||"Pendiente";
}

async function comparison(){
  if(!user||!currentFriendUid)return null;
  const uid=currentFriendUid;
  const [myCards,friendCards,name]=await Promise.all([
    cardsFor(user.uid),
    cardsFor(uid),
    username(uid)
  ]);
  if(currentFriendUid!==uid)return null;

  mine=myCards;
  friend=friendCards;
  currentFriendName=name||currentFriendName;

  const mineSet=new Set(mine.map(identity));
  const friendSet=new Set(friend.map(identity));
  const theirsForMe=friend.filter(x=>qty(x.quantity)>1&&!mineSet.has(identity(x)));
  const mineForThem=mine.filter(x=>qty(x.quantity)>1&&!friendSet.has(identity(x)));
  return {theirsForMe,mineForThem,mineSet,friendSet};
}

async function showPossible(){
  try{
    const c=await comparison();
    if(!c)throw new Error("No se pudo identificar la colección del amigo.");

    const body=openOverlay(`Cambios con @${currentFriendName}`,`<h3 class="tr34-picker-title">Intercambios posibles</h3><p class="tr34-picker-help">PokEX cruza vuestras colecciones. Priorizamos cartas repetidas que al otro le faltan.</p><div class="tr34-list" data-list></div>`);
    const list=body.querySelector("[data-list]");

    if(!c.theirsForMe.length&&!c.mineForThem.length){
      list.innerHTML=`<div class="tr34-empty"><strong>Aún no hay un cambio perfecto</strong>Seguid añadiendo cartas; PokEX lo detectará automáticamente.</div>`;
      return;
    }

    const pairs=[];
    for(const wanted of c.theirsForMe.slice(0,12)){
      const offer=c.mineForThem.slice().sort((a,b)=>Math.abs(price(a)-price(wanted))-Math.abs(price(b)-price(wanted)))[0];
      pairs.push({wanted,offer});
    }

    list.innerHTML=pairs.map((p,i)=>`<article class="tr34-offer"><div class="tr34-pair">${mini(p.offer,p.offer?"Tú ofreces":"Elige una tuya")}<div class="tr34-arrow">↔</div>${mini(p.wanted,`@${esc(currentFriendName)} tiene ×${qty(p.wanted.quantity)}`)}</div><div class="tr34-actions"><button class="tr34-primary" data-propose="${i}">Proponer intercambio</button></div></article>`).join("");
    list.querySelectorAll("[data-propose]").forEach(button=>{
      button.onclick=()=>startProposal(pairs[Number(button.dataset.propose)].wanted,pairs[Number(button.dataset.propose)].offer);
    });
  }catch(e){
    openOverlay("Intercambios",`<div class="tr34-empty"><strong>No se pudo comparar</strong>${esc(e?.message||"Inténtalo de nuevo.")}</div>`);
  }
}

async function showPossibleFor(uid,name){
  if(!setCurrentFriend(uid,name))return;
  return showPossible();
}

async function startProposal(wanted,prefOffer=null,parentTradeId=""){
  try{
    if(!await isFriend(currentFriendUid))throw new Error("Solo puedes intercambiar con amigos aceptados.");
    const c=await comparison();
    if(!c)throw new Error("No se pudo cargar la colección del amigo.");

    const candidates=mine.slice().sort((a,b)=>{
      const af=!c.friendSet.has(identity(a))?1:0;
      const bf=!c.friendSet.has(identity(b))?1:0;
      return (qty(b.quantity)>1?2:0)+bf-(qty(a.quantity)>1?2:0)-af
        || Math.abs(price(a)-price(wanted))-Math.abs(price(b)-price(wanted));
    });

    let selected=prefOffer?cardKey(prefOffer):"";
    const body=openOverlay(`Propuesta a @${currentFriendName}`,`<div class="tr34-builder-scroll"><h3 class="tr34-picker-title">¿Qué carta ofreces?</h3><p class="tr34-picker-help">Quieres <b>${esc(wanted.name)}</b>. Las repetidas y las que le faltan a @${esc(currentFriendName)} aparecen primero.</p><div class="tr34-picker" data-picker></div></div><div class="tr34-builder-actions"><button class="tr34-secondary" data-cancel>Cancelar</button><button class="tr34-primary" data-send disabled>Enviar propuesta</button></div>`);
    body.classList.add("tr34-builder-body");

    const picker=body.querySelector("[data-picker]");
    picker.innerHTML=candidates.map(x=>{
      const src=imageURL(x.image);
      const good=qty(x.quantity)>1||!c.friendSet.has(identity(x));
      return `<button class="tr34-pick ${cardKey(x)===selected?"selected":""}" type="button" data-key="${esc(cardKey(x))}">${good?`<span class="tr34-chip">${qty(x.quantity)>1?`×${qty(x.quantity)} repetida`:"Le falta"}</span>`:""}${src?`<img src="${esc(src)}" alt="${esc(x.name)}">`:""}<div><strong>${esc(x.name)}</strong><small>${esc(x.setName||"")} · ${(price(x)||0).toFixed(2)} €</small></div></button>`;
    }).join("");

    const send=body.querySelector("[data-send]");
    const refresh=()=>{
      picker.querySelectorAll(".tr34-pick").forEach(x=>x.classList.toggle("selected",x.dataset.key===selected));
      send.disabled=!selected;
    };
    refresh();

    picker.onclick=e=>{
      const button=e.target.closest("[data-key]");
      if(!button)return;
      selected=button.dataset.key;
      refresh();
    };

    body.querySelector("[data-cancel]").onclick=()=>overlay().classList.add("hidden");
    send.onclick=async()=>{
      const offered=candidates.find(x=>cardKey(x)===selected);
      if(!offered)return;
      send.disabled=true;
      send.textContent="Enviando…";
      try{
        await addDoc(collection(db,"tradeOffers"),{
          fromUid:user.uid,
          toUid:currentFriendUid,
          status:"pending",
          offeredCard:safeCard(offered),
          wantedCard:safeCard(wanted),
          parentTradeId:parentTradeId||"",
          confirmedBy:{},
          appliedBy:{},
          createdAt:serverTimestamp(),
          updatedAt:serverTimestamp()
        });
        overlay().classList.add("hidden");
        await showTrades("active");
      }catch(e){
        send.disabled=false;
        send.textContent="Enviar propuesta";
        alert(`No se pudo enviar: ${e?.message||e}`);
      }
    };
  }catch(e){
    openOverlay("Intercambio",`<div class="tr34-empty"><strong>No se puede preparar el cambio</strong>${esc(e?.message||"Inténtalo de nuevo.")}</div>`);
  }
}

async function startProposalFor(uid,name,wanted,prefOffer=null,parentTradeId=""){
  if(!setCurrentFriend(uid,name))return;
  return startProposal(wanted,prefOffer,parentTradeId);
}

function tradeCard(t){
  const incoming=t.toUid===user?.uid;
  const other=incoming?t.fromName:t.toName;
  const actions=[];

  if(t.status==="pending"&&incoming){
    actions.push(`<button class="tr34-primary" data-accept="${t.id}">Aceptar</button><button class="tr34-secondary" data-counter="${t.id}">Contraoferta</button><button class="tr34-danger" data-reject="${t.id}">Rechazar</button>`);
  }else if(t.status==="pending"&&!incoming){
    actions.push(`<button class="tr34-danger" data-canceltrade="${t.id}">Cancelar propuesta</button>`);
  }

  if(t.status==="accepted"){
    const mineConfirmed=!!t.confirmedBy?.[user.uid];
    const otherUid=incoming?t.fromUid:t.toUid;
    const otherConfirmed=!!t.confirmedBy?.[otherUid];

    if(!mineConfirmed)actions.push(`<button class="tr34-primary" data-confirm="${t.id}">Confirmar intercambio físico</button>`);
    else actions.push(`<button class="tr34-secondary" disabled>✓ Tú ya confirmaste</button>`);

    return `<article class="tr34-offer"><div class="tr34-offer-top"><strong>${incoming?`@${esc(other)} te propone`:`Propuesta a @${esc(other)}`}</strong><span class="tr34-status accepted">Aceptado</span></div><div class="tr34-pair">${mini(t.offeredCard,incoming?`Recibes de @${esc(other)}`:"Tú entregas")}<div class="tr34-arrow">↔</div>${mini(t.wantedCard,incoming?"Tú entregas":`Recibes de @${esc(other)}`)}</div><div class="tr34-actions">${actions.join("")}</div><div class="tr34-note">${mineConfirmed&&otherConfirmed?"Los dos habéis confirmado. PokEX está aplicando el cambio en ambas colecciones.":mineConfirmed?"Esperando a que la otra persona confirme la entrega física.":otherConfirmed?"La otra persona ya confirmó. Confirma solo cuando el intercambio físico esté hecho.":"Confirmad ambos únicamente cuando os hayáis entregado las cartas en persona."}</div></article>`;
  }

  return `<article class="tr34-offer"><div class="tr34-offer-top"><strong>${incoming?`De @${esc(other)}`:`Para @${esc(other)}`}</strong><span class="tr34-status ${esc(t.status)}">${esc(statusLabel(t.status))}</span></div><div class="tr34-pair">${mini(t.offeredCard,incoming?"Recibes":"Tú ofreces")}<div class="tr34-arrow">↔</div>${mini(t.wantedCard,incoming?"Tú entregas":"Tú quieres")}</div>${actions.length?`<div class="tr34-actions">${actions.join("")}</div>`:""}</article>`;
}

async function loadTradeNames(list){
  const ids=[...new Set(list.flatMap(t=>[t.fromUid,t.toUid]))];
  const names=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await username(id)])));
  return list.map(t=>({...t,fromName:names[t.fromUid]||"Entrenador",toName:names[t.toUid]||"Entrenador"}));
}

async function queryTrades(){
  if(!user)return[];
  const [a,b]=await Promise.all([
    getDocs(query(collection(db,"tradeOffers"),where("fromUid","==",user.uid))),
    getDocs(query(collection(db,"tradeOffers"),where("toUid","==",user.uid)))
  ]);
  const map=new Map();
  [...a.docs,...b.docs].forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
  return loadTradeNames([...map.values()].sort((x,y)=>Number(y.createdAt?.seconds||0)-Number(x.createdAt?.seconds||0)));
}

function emptyTradeHtml(tab){
  const copy={
    active:["Sin intercambios activos","No tienes propuestas pendientes ni intercambios esperando confirmación."],
    received:["Sin propuestas recibidas","Cuando un amigo te envíe una propuesta, aparecerá aquí."],
    history:["Sin historial de intercambios","Los intercambios terminados, rechazados o cancelados aparecerán aquí."]
  }[tab]||["Sin intercambios","No hay intercambios en esta sección."];
  return `<div class="tr34-empty"><strong>${copy[0]}</strong>${copy[1]}</div>`;
}

async function showTrades(tab="active"){
  const body=openOverlay("Mis intercambios",`<div class="tr34-tabs"><button data-tab="active" class="${tab==="active"?"active":""}">Activos</button><button data-tab="received" class="${tab==="received"?"active":""}">Recibidos</button><button data-tab="history" class="${tab==="history"?"active":""}">Historial</button></div><div class="tr34-list" data-list><div class="tr34-empty">Cargando…</div></div>`);
  body.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>showTrades(button.dataset.tab));
  const target=body.querySelector("[data-list]");

  try{
    tradeCache=await queryTrades();
    let list=tradeCache;
    if(tab==="active")list=list.filter(t=>["pending","accepted"].includes(t.status));
    if(tab==="received")list=list.filter(t=>t.toUid===user.uid&&t.status==="pending");
    if(tab==="history")list=list.filter(t=>!["pending","accepted"].includes(t.status));
    target.innerHTML=list.length?list.map(tradeCard).join(""):emptyTradeHtml(tab);
    bindTradeActions(target);
  }catch(e){
    console.warn("PokEX trades load:",e);
    target.innerHTML=`<div class="tr34-empty"><strong>No se pudieron cargar los intercambios</strong>Inténtalo de nuevo en unos segundos.</div>`;
  }
}

function bindTradeActions(root){
  root.querySelectorAll("[data-accept]").forEach(button=>button.onclick=()=>tradeStatus(button.dataset.accept,"accepted"));
  root.querySelectorAll("[data-reject]").forEach(button=>button.onclick=()=>tradeStatus(button.dataset.reject,"rejected"));
  root.querySelectorAll("[data-canceltrade]").forEach(button=>button.onclick=()=>tradeStatus(button.dataset.canceltrade,"cancelled"));
  root.querySelectorAll("[data-confirm]").forEach(button=>button.onclick=()=>confirmPhysical(button.dataset.confirm));
  root.querySelectorAll("[data-counter]").forEach(button=>button.onclick=async()=>{
    const t=tradeCache.find(x=>x.id===button.dataset.counter);
    if(!t)return;
    await updateDoc(doc(db,"tradeOffers",t.id),{status:"countered",updatedAt:serverTimestamp()});
    setCurrentFriend(t.fromUid,t.fromName);
    await startProposal(t.offeredCard,t.wantedCard,t.id);
  });
}

async function tradeStatus(id,status){
  try{
    await updateDoc(doc(db,"tradeOffers",id),{status,updatedAt:serverTimestamp()});
    await showTrades("active");
  }catch(e){
    alert(`No se pudo actualizar: ${e?.message||e}`);
  }
}

async function confirmPhysical(id){
  try{
    await updateDoc(doc(db,"tradeOffers",id),{[`confirmedBy.${user.uid}`]:true,updatedAt:serverTimestamp()});
    await maybeApplyTrade(id);
    await showTrades("active");
  }catch(e){
    alert(`No se pudo confirmar: ${e?.message||e}`);
  }
}

async function updateProfileStats(){
  const cards=await cardsFor(user.uid);
  const cardsCount=cards.reduce((sum,x)=>sum+qty(x.quantity),0);
  const distinctCount=cards.length;
  const collectionValue=cards.reduce((sum,x)=>sum+price(x)*qty(x.quantity),0);
  await setDoc(doc(db,"users",user.uid),{cardsCount,distinctCount,collectionValue,updatedAt:serverTimestamp()},{merge:true});
}

async function mutateOwnCard(card,delta){
  const key=cardKey(card);
  const ref=doc(db,"users",user.uid,"cards",key);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    const existing=snap.exists()?snap.data():null;
    const next=qty(existing?.quantity)+delta;
    if(next<=0){
      if(snap.exists())tx.delete(ref);
      return;
    }
    const payload={...(existing||safeCard(card)),quantity:next,updatedAt:serverTimestamp()};
    delete payload.docId;
    tx.set(ref,payload,{merge:true});
  });
  await mutateLocal(card,delta);
}

async function mutateLocal(card,delta){
  try{
    await new Promise((resolve,reject)=>{
      const req=indexedDB.open("tcgscan-pokedex");
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const dbx=req.result;
        const tx=dbx.transaction("cards","readwrite");
        const store=tx.objectStore("cards");
        const key=card.id||card.docId;
        const get=store.get(key);
        get.onsuccess=()=>{
          const existing=get.result;
          const next=qty(existing?.quantity)+delta;
          if(next<=0){
            try{store.delete(key);}catch{}
          }else{
            const payload={...(existing||card),id:card.id||card.docId,quantity:next};
            delete payload.docId;
            try{store.put(payload);}catch{}
          }
        };
        tx.oncomplete=()=>{
          dbx.close();
          resolve();
        };
        tx.onerror=()=>reject(tx.error);
      };
    });
    document.dispatchEvent(new CustomEvent("pokex:collection-changed"));
  }catch(e){
    console.warn("PokEX trade local sync:",e);
  }
}

async function maybeApplyTrade(id){
  const ref=doc(db,"tradeOffers",id);
  const snap=await getDoc(ref);
  if(!snap.exists())return;

  const t={id:snap.id,...snap.data()};
  if(t.status!=="accepted")return;

  const both=!!t.confirmedBy?.[t.fromUid]&&!!t.confirmedBy?.[t.toUid];
  if(!both||t.appliedBy?.[user.uid])return;

  const outgoing=user.uid===t.fromUid?t.offeredCard:t.wantedCard;
  const incoming=user.uid===t.fromUid?t.wantedCard:t.offeredCard;
  await mutateOwnCard(outgoing,-1);
  await mutateOwnCard(incoming,1);
  await updateProfileStats();
  await updateDoc(ref,{[`appliedBy.${user.uid}`]:true,updatedAt:serverTimestamp()});

  const after=(await getDoc(ref)).data();
  if(after?.appliedBy?.[t.fromUid]&&after?.appliedBy?.[t.toUid]){
    await updateDoc(ref,{status:"completed",completedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
}

async function applyReadyTrades(){
  if(!user)return;
  try{
    const list=await queryTrades();
    for(const t of list.filter(x=>x.status==="accepted"&&x.confirmedBy?.[x.fromUid]&&x.confirmedBy?.[x.toUid]&&!x.appliedBy?.[user.uid])){
      await maybeApplyTrade(t.id);
    }
  }catch(e){
    console.warn("PokEX pending trade apply:",e);
  }
}

function stopTradeWatchers(){
  unsubTrades.forEach(unsub=>{try{unsub();}catch{}});
  unsubTrades=[];
}

function watchTrades(){
  stopTradeWatchers();
  if(!user)return;
  const onChange=()=>applyReadyTrades();
  const onError=()=>{};
  unsubTrades=[
    onSnapshot(query(collection(db,"tradeOffers"),where("fromUid","==",user.uid)),onChange,onError),
    onSnapshot(query(collection(db,"tradeOffers"),where("toUid","==",user.uid)),onChange,onError)
  ];
}

if(auth){
  onAuthStateChanged(auth,u=>{
    user=u;
    currentFriendUid="";
    currentFriendName="Entrenador";
    mine=[];
    friend=[];
    tradeCache=[];
    if(u){
      watchTrades();
      setTimeout(applyReadyTrades,800);
    }else{
      stopTradeWatchers();
    }
  });
}

window.PokEXTradesV34={showTrades,showPossibleFor,startProposalFor};
console.log("✅ PokEX Trades v3.4 cargado");
