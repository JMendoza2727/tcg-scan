
(async()=>{
"use strict";

console.log("⚡ PokEX V2.2 arrancando");

let overlay=null;

for(let i=0;i<100;i++){
  overlay=document.querySelector(".pokedex-overlay");
  if(overlay) break;
  await new Promise(r=>setTimeout(r,100));
}

if(!overlay){
  console.error("PokEX V2.2: no encuentro .pokedex-overlay");
  return;
}

const content=overlay.querySelector(".pokedex-content");
const search=document.getElementById("pokedexSearch");
const value=document.getElementById("pokedexValue");
const grid=document.getElementById("pokedexGrid");
const updateStatus=document.getElementById("pokedexUpdateStatus");
const lastUpdate=document.getElementById("pokedexLastUpdate");

if(!content || !grid){
  console.error("PokEX V2.2: estructura de Pokédex incompleta");
  return;
}

const DB="tcgscan-pokedex";
const STORE="cards";

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function getAll(){
  const db=await openDB();

  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).getAll();

    req.onsuccess=()=>resolve(req.result || []);
    req.onerror=()=>reject(req.error);
  });
}

async function save(item){
  const db=await openDB();

  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

async function clearAll(){
  const db=await openDB();

  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

function money(v){
  return typeof v==="number" && Number.isFinite(v)
    ? `${v.toFixed(2)} €`
    : "—";
}

function setIdFromItem(item){
  if(item.setId) return item.setId;

  const id=String(item.id || "");

  if(!id || id.startsWith("pokexjp:"))
    return null;

  const p=id.lastIndexOf("-");

  return p>0 ? id.slice(0,p) : null;
}

/* ==========================================================
   PESTAÑAS
   ========================================================== */

const tabs=document.createElement("div");

tabs.className="v22-tabs";
tabs.innerHTML=`
  <button class="v22-tab active" data-tab="cards">🃏 Cartas</button>
  <button class="v22-tab" data-tab="sets">📦 Sets</button>
  <button class="v22-tab" data-tab="stats">📊 Estadísticas</button>
  <button class="v22-tab" data-tab="backup">💾 Backup</button>
  <button class="v22-tab" data-tab="account">☁️ Cuenta</button>
`;

content.insertBefore(tabs,content.firstChild);

const sets=document.createElement("div");
sets.className="v22-panel";
sets.id="v22Sets";

const stats=document.createElement("div");
stats.className="v22-panel";
stats.id="v22Stats";

const backup=document.createElement("div");
backup.className="v22-panel";
backup.id="v22Backup";

const account=document.createElement("div");
account.className="v22-panel";
account.id="v22Account";

content.append(sets,stats,backup,account);

function showCards(show){
  if(search) search.style.display=show ? "" : "none";
  if(value) value.style.display=show ? "" : "none";
  if(grid) grid.style.display=show ? "" : "none";
  if(updateStatus) updateStatus.style.display=show ? "" : "none";
  if(lastUpdate) lastUpdate.style.display=show ? "" : "none";
}

async function activate(name){
  tabs.querySelectorAll(".v22-tab").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.tab===name);
  });

  sets.classList.toggle("active",name==="sets");
  stats.classList.toggle("active",name==="stats");
  backup.classList.toggle("active",name==="backup");
  account.classList.toggle("active",name==="account");

  showCards(name==="cards");

  if(name==="sets") await renderSets();
  if(name==="stats") await renderStats();
  if(name==="backup") renderBackup();
  if(name==="account") renderAccount();
}

tabs.addEventListener("click",e=>{
  const btn=e.target.closest(".v22-tab");
  if(btn) activate(btn.dataset.tab);
});

/* ==========================================================
   ESTADÍSTICAS
   ========================================================== */

async function renderStats(){
  stats.innerHTML=`<div class="v22-note">Calculando estadísticas…</div>`;

  const items=await getAll();

  const totalCards=items.reduce(
    (s,x)=>s+(Number(x.quantity)||0),
    0
  );

  const totalValue=items.reduce((s,x)=>{
    const price=
      typeof x.lastPrice==="number"
        ? x.lastPrice
        : typeof x.lastTrend==="number"
          ? x.lastTrend
          : 0;

    return s+price*(Number(x.quantity)||0);
  },0);

  const expensive=[...items]
    .filter(x=>typeof (x.lastPrice ?? x.lastTrend)==="number")
    .sort(
      (a,b)=>
        (b.lastPrice ?? b.lastTrend ?? 0)-
        (a.lastPrice ?? a.lastTrend ?? 0)
    )[0];

  const rarities={};

  items.forEach(item=>{
    const r=item.rarity || "Sin rareza";
    rarities[r]=(rarities[r]||0)+(Number(item.quantity)||0);
  });

  stats.innerHTML=`
    <div class="v22-stats">
      <div class="v22-stat">
        <span>Total cartas</span>
        <strong>${totalCards}</strong>
      </div>

      <div class="v22-stat">
        <span>Distintas</span>
        <strong>${items.length}</strong>
      </div>

      <div class="v22-stat">
        <span>Valor orientativo</span>
        <strong>${money(totalValue)}</strong>
      </div>

      <div class="v22-stat">
        <span>Sets distintos</span>
        <strong>${new Set(items.map(x=>x.setName)).size}</strong>
      </div>
    </div>

    ${
      expensive ? `
        <h3 class="v22-title">💎 Carta más valiosa</h3>

        <div class="v22-row">
          <span>${expensive.name}</span>
          <strong>${money(expensive.lastPrice ?? expensive.lastTrend)}</strong>
        </div>
      ` : ""
    }

    <h3 class="v22-title">⭐ Rarezas</h3>

    ${
      Object.entries(rarities)
        .sort((a,b)=>b[1]-a[1])
        .map(([name,n])=>`
          <div class="v22-row">
            <span>${name}</span>
            <strong>${n}</strong>
          </div>
        `).join("")
    }
  `;
}

/* ==========================================================
   SETS
   ========================================================== */

async function getSet(lang,setId){
  const r=await fetch(
    `https://api.tcgdex.net/v2/${encodeURIComponent(lang)}/sets/${encodeURIComponent(setId)}`,
    {cache:"no-store"}
  );

  if(!r.ok)
    throw new Error(`Set ${setId}`);

  return await r.json();
}

async function renderSets(){
  sets.innerHTML=`<div class="v22-note">Calculando progreso…</div>`;

  const items=await getAll();

  if(!items.length){
    sets.innerHTML=`<div class="v22-note">No tienes cartas todavía.</div>`;
    return;
  }

  const groups=new Map();

  items.forEach(item=>{
    const lang=item.lang || "en";
    const setId=setIdFromItem(item);
    const key=`${lang}:${setId || item.setName}`;

    if(!groups.has(key)){
      groups.set(key,{
        lang,
        setId,
        name:item.setName || "Set desconocido",
        items:[]
      });
    }

    groups.get(key).items.push(item);
  });

  const result=[];

  for(const group of groups.values()){
    let total=null;
    let officialName=group.name;

    if(group.setId){
      try{
        const set=await getSet(group.lang,group.setId);

        officialName=set.name || officialName;

        total=Number(
          set?.cardCount?.total ||
          set?.cardCount?.official ||
          set?.cards?.length ||
          0
        ) || null;
      }catch(_){}
    }

    const owned=new Set(group.items.map(x=>x.id)).size;

    result.push({
      ...group,
      name:officialName,
      owned,
      total
    });
  }

  sets.innerHTML=result.map(x=>{
    const pct=x.total ? x.owned/x.total*100 : null;

    return `
      <div class="v22-set">
        <div class="v22-set-head">
          <strong>${x.name}</strong>

          <span>
            ${
              x.total
                ? `${x.owned}/${x.total} · ${pct.toFixed(1)}%`
                : `${x.owned} cartas`
            }
          </span>
        </div>

        ${
          pct!==null ? `
            <div class="v22-progress">
              <div style="width:${Math.min(100,pct)}%"></div>
            </div>
          ` : ""
        }
      </div>
    `;
  }).join("");
}

/* ==========================================================
   BACKUP
   ========================================================== */

async function exportBackup(){
  const cards=await getAll();

  const data={
    format:"pokex-backup",
    version:"2.2",
    exportedAt:new Date().toISOString(),
    cards
  };

  const blob=new Blob(
    [JSON.stringify(data,null,2)],
    {type:"application/json"}
  );

  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download=`PokEX-backup-${new Date().toISOString().slice(0,10)}.json`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function importBackup(file,replace){
  const data=JSON.parse(await file.text());

  if(
    data?.format!=="pokex-backup" ||
    !Array.isArray(data.cards)
  ){
    throw new Error("Archivo de backup no válido.");
  }

  if(replace)
    await clearAll();

  const current=await getAll();
  const byKey=new Map(current.map(x=>[x.key,x]));

  for(const incoming of data.cards){
    if(!incoming?.key) continue;

    if(!replace && byKey.has(incoming.key)){
      const old=byKey.get(incoming.key);

      old.quantity=Math.max(
        Number(old.quantity)||0,
        Number(incoming.quantity)||0
      );

      if(
        Number(incoming.lastCheckedAt||0)>
        Number(old.lastCheckedAt||0)
      ){
        const qty=old.quantity;
        Object.assign(old,incoming);
        old.quantity=qty;
      }

      await save(old);
    }else{
      await save(incoming);
    }
  }

  alert("✅ Backup importado.");
  location.reload();
}

function renderBackup(){
  backup.innerHTML=`
    <button class="v22-action" id="v22Export">
      ↓ Exportar backup
    </button>

    <button class="v22-action secondary" id="v22Merge">
      ↑ Importar y fusionar
    </button>

    <button class="v22-action secondary" id="v22Replace">
      ♻ Restaurar reemplazando
    </button>

    <input
      id="v22File"
      type="file"
      accept=".json,application/json"
      hidden>

    <p class="v22-note">
      El backup guarda tu colección completa.
    </p>
  `;

  const file=document.getElementById("v22File");
  let replace=false;

  document.getElementById("v22Export").onclick=exportBackup;

  document.getElementById("v22Merge").onclick=()=>{
    replace=false;
    file.click();
  };

  document.getElementById("v22Replace").onclick=()=>{
    if(!confirm("¿Reemplazar toda tu Pokédex actual?"))
      return;

    replace=true;
    file.click();
  };

  file.onchange=async()=>{
    if(!file.files?.[0]) return;

    try{
      await importBackup(file.files[0],replace);
    }catch(error){
      alert(error.message);
    }
  };
}

/* ==========================================================
   CUENTA
   ========================================================== */

function renderAccount(){
  account.innerHTML=`
    <div class="v22-note">
      <strong>☁️ PokEX Cloud</strong>
      <br><br>

      Aquí irán:
      <br>
      • cuenta PokEX
      <br>
      • sincronización iPhone/Mac/PC
      <br>
      • amigos
      <br>
      • perfiles
      <br>
      • ranking

      <br><br>

      Para activarlo falta conectar Supabase.
      La colección local y los backups ya funcionan sin cuenta.
    </div>
  `;
}

window.PokEXV22={
  getAll,
  renderStats,
  renderSets
};

console.log("✅ PokEX V2.2 cargado");
})();
