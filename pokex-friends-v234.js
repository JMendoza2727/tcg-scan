import {
  getApps,
  getApp,
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const config = window.POKEX_FIREBASE_CONFIG;

const app = getApps().length
  ? getApp()
  : initializeApp(config);

const auth = getAuth(app);
const db = getFirestore(app);

const DB_NAME = "tcgscan-pokedex";
const STORE_NAME = "cards";

let myProfile = null;

function esc(v){
  return String(v ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function money(v){
  return Number(v || 0).toFixed(2) + " €";
}

function lower(v){
  return String(v || "").trim().toLowerCase();
}

async function profile(uid){
  const snap = await getDoc(
    doc(db,"users",uid)
  );

  return snap.exists()
    ? { uid:snap.id, ...snap.data() }
    : null;
}

async function refreshMe(){
  const user = auth.currentUser;

  if(!user){
    myProfile = null;
    return null;
  }

  myProfile = await profile(user.uid);

  return myProfile;
}

function removeOverlay(){
  document.querySelector(".v234-overlay")?.remove();
}

function makeOverlay(){
  removeOverlay();

  const overlay = document.createElement("div");
  overlay.className = "v234-overlay";

  overlay.innerHTML = `
    <div class="v234-box">
      <div class="v234-head">
        <h2>👥 Amigos</h2>
        <button class="v234-close">✕</button>
      </div>

      <div class="v234-body">
        <div class="v234-tabs">
          <button class="v234-tab active"
                  data-tab="friends">
            Mis amigos
          </button>

          <button class="v234-tab"
                  data-tab="search">
            Buscar
          </button>

          <button class="v234-tab"
                  data-tab="requests">
            Solicitudes
          </button>

          <button class="v234-tab"
                  data-tab="ranking">
            Ranking
          </button>

          <button class="v234-tab"
                  data-tab="blocked">
            Bloqueados
          </button>
        </div>

        <div id="v234-content"></div>
      </div>
    </div>
  `;

  overlay.querySelector(".v234-close").onclick =
    removeOverlay;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay){
      removeOverlay();
    }
  });

  document.body.appendChild(overlay);

  overlay
    .querySelectorAll(".v234-tab")
    .forEach(btn=>{
      btn.onclick = ()=>{
        overlay
          .querySelectorAll(".v234-tab")
          .forEach(x=>x.classList.remove("active"));

        btn.classList.add("active");

        const tab = btn.dataset.tab;

        if(tab === "friends") renderFriends();
        if(tab === "search") renderSearch();
        if(tab === "requests") renderRequests();
        if(tab === "ranking") renderRanking();
        if(tab === "blocked") renderBlocked();
      };
    });

  return overlay;
}

function content(){
  return document.querySelector("#v234-content");
}

function status(text){
  content().innerHTML =
    `<div class="v234-status">${text}</div>`;
}

async function getRequests(direction){
  const user = auth.currentUser;

  if(!user) return [];

  const q = direction === "incoming"
    ? query(
        collection(db,"friendRequests"),
        where("toUid","==",user.uid)
      )
    : query(
        collection(db,"friendRequests"),
        where("fromUid","==",user.uid)
      );

  const snap = await getDocs(q);

  return snap.docs.map(d=>({
    id:d.id,
    ...d.data()
  }));
}

async function ensureLinks(req){
  const id1 = `${req.fromUid}__${req.toUid}`;
  const id2 = `${req.toUid}__${req.fromUid}`;

  const ref1 = doc(db,"friendLinks",id1);
  const ref2 = doc(db,"friendLinks",id2);

  const [a,b] = await Promise.all([
    getDoc(ref1),
    getDoc(ref2)
  ]);

  if(a.exists() && b.exists()){
    return;
  }

  const fromProfile = await profile(req.fromUid);
  const toProfile = await profile(req.toUid);

  const batch = writeBatch(db);

  if(!a.exists()){
    batch.set(ref1,{
      ownerUid:req.fromUid,
      friendUid:req.toUid,
      friendUsername:
        toProfile?.username
        || req.toUsername
        || "Usuario",
      requestId:req.id,
      createdAt:serverTimestamp()
    });
  }

  if(!b.exists()){
    batch.set(ref2,{
      ownerUid:req.toUid,
      friendUid:req.fromUid,
      friendUsername:
        fromProfile?.username
        || req.fromUsername
        || "Usuario",
      requestId:req.id,
      createdAt:serverTimestamp()
    });
  }

  await batch.commit();
}

async function repairAccepted(){
  const [incoming,outgoing] = await Promise.all([
    getRequests("incoming"),
    getRequests("outgoing")
  ]);

  const accepted = [
    ...incoming,
    ...outgoing
  ].filter(r=>r.status === "accepted");

  const seen = new Set();

  for(const req of accepted){
    if(seen.has(req.id)) continue;
    seen.add(req.id);

    try{
      await ensureLinks(req);
    }catch(error){
      console.warn(
        "PokEX repair friendship",
        req.id,
        error
      );
    }
  }
}

async function friendLinks(){
  const user = auth.currentUser;

  if(!user) return [];

  const snap = await getDocs(
    query(
      collection(db,"friendLinks"),
      where("ownerUid","==",user.uid)
    )
  );

  return snap.docs.map(d=>({
    id:d.id,
    ...d.data()
  }));
}

async function getOwnBlocks(){
  const user = auth.currentUser;

  if(!user) return [];

  const snap = await getDocs(
    query(
      collection(db,"blocks"),
      where("blockerUid","==",user.uid)
    )
  );

  return snap.docs.map(d=>({
    id:d.id,
    ...d.data()
  }));
}

async function blockedIdsByMe(){
  const rows = await getOwnBlocks();

  return new Set(
    rows.map(x=>x.blockedUid)
  );
}

async function blockUser(uid){
  const me = auth.currentUser;

  if(!me || !uid || uid === me.uid){
    return;
  }

  const other = await profile(uid);

  if(
    !confirm(
      `¿Bloquear a @${other?.username || "este usuario"}?\n\nNo podrá enviarte solicitudes mientras siga bloqueado.`
    )
  ){
    return;
  }

  const refs = [
    doc(
      db,
      "friendRequests",
      `${me.uid}__${uid}`
    ),
    doc(
      db,
      "friendRequests",
      `${uid}__${me.uid}`
    ),
    doc(
      db,
      "friendLinks",
      `${me.uid}__${uid}`
    ),
    doc(
      db,
      "friendLinks",
      `${uid}__${me.uid}`
    )
  ];

  const snaps = await Promise.all(
    refs.map(ref=>getDoc(ref))
  );

  const batch = writeBatch(db);

  batch.set(
    doc(
      db,
      "blocks",
      `${me.uid}__${uid}`
    ),
    {
      blockerUid:me.uid,
      blockedUid:uid,
      blockedUsername:
        other?.username || "Usuario",
      createdAt:serverTimestamp()
    }
  );

  snaps.forEach((snap,i)=>{
    if(snap.exists()){
      batch.delete(refs[i]);
    }
  });

  await batch.commit();

  alert("⛔ Usuario bloqueado.");

  document
    .querySelector(
      '.v234-tab[data-tab="blocked"]'
    )
    ?.click();
}

async function unblockUser(uid){
  const me = auth.currentUser;

  if(!me) return;

  await deleteDoc(
    doc(
      db,
      "blocks",
      `${me.uid}__${uid}`
    )
  );

  alert("✅ Usuario desbloqueado.");

  renderBlocked();
}

async function renderBlocked(){
  status("Cargando bloqueados…");

  try{
    const blocks = await getOwnBlocks();

    if(!blocks.length){
      status("No tienes usuarios bloqueados.");
      return;
    }

    const rows = [];

    for(const block of blocks){
      let p = null;

      try{
        p = await profile(block.blockedUid);
      }catch{}

      rows.push({
        ...block,
        profile:p
      });
    }

    content().innerHTML = rows.map(row=>`
      <div class="v234-card">
        <div class="v234-user">
          @${esc(
            row.profile?.username
            || row.blockedUsername
            || "Usuario"
          )}
        </div>

        <div class="v234-muted">
          ⛔ Bloqueado
        </div>

        <div class="v234-actions">
          <button class="v234-btn v234-blue"
                  data-unblock="${esc(row.blockedUid)}">
            Desbloquear
          </button>
        </div>
      </div>
    `).join("");

    content()
      .querySelectorAll("[data-unblock]")
      .forEach(btn=>{
        btn.onclick =
          ()=>unblockUser(btn.dataset.unblock);
      });

  }catch(error){
    console.error(error);

    status(
      "❌ Error cargando bloqueados: "
      + esc(error.message)
    );
  }
}

async function renderFriends(){
  status("Cargando amigos…");

  try{
    await repairAccepted();

    const links = await friendLinks();
    const blocked = await blockedIdsByMe();

    const validLinks =
      links.filter(
        x=>!blocked.has(x.friendUid)
      );

    if(!validLinks.length){
      status("Todavía no tienes amigos.");
      return;
    }

    const rows = [];

    for(const link of validLinks){
      const p = await profile(link.friendUid);

      if(!p) continue;

      rows.push({
        ...link,
        profile:p
      });
    }

    if(!rows.length){
      status("Todavía no tienes amigos.");
      return;
    }

    content().innerHTML = rows.map(row=>`
      <div class="v234-card">
        <div class="v234-user">
          @${esc(
            row.profile.username
            || row.friendUsername
            || "Usuario"
          )}
        </div>

        <div class="v234-muted">
          ${Number(row.profile.distinctCount || 0)}
          cartas distintas ·
          ${money(row.profile.collectionValue)}
        </div>

        <div class="v234-actions">
          <button class="v234-btn v234-blue"
                  data-view="${esc(row.friendUid)}">
            Ver colección
          </button>

          <button class="v234-btn v234-blue"
                  data-compare="${esc(row.friendUid)}">
            Comparar
          </button>

          <button class="v234-btn v234-red"
                  data-delete="${esc(row.friendUid)}">
            Eliminar amigo
          </button>

          <button class="v234-btn v234-red"
                  data-block="${esc(row.friendUid)}">
            ⛔ Bloquear
          </button>
        </div>
      </div>
    `).join("");

    content()
      .querySelectorAll("[data-view]")
      .forEach(btn=>{
        btn.onclick =
          ()=>showCollection(btn.dataset.view);
      });

    content()
      .querySelectorAll("[data-compare]")
      .forEach(btn=>{
        btn.onclick =
          ()=>compareCollection(btn.dataset.compare);
      });

    content()
      .querySelectorAll("[data-delete]")
      .forEach(btn=>{
        btn.onclick =
          ()=>removeFriend(btn.dataset.delete);
      });

    content()
      .querySelectorAll("[data-block]")
      .forEach(btn=>{
        btn.onclick =
          ()=>blockUser(btn.dataset.block);
      });

  }catch(error){
    console.error(error);

    status(
      "❌ Error cargando amigos: "
      + esc(error.message)
    );
  }
}

function chooseOnePerUsername(users){
  const groups = new Map();

  for(const u of users){
    const key =
      lower(u.usernameLower || u.username)
      || u.uid;

    if(!groups.has(key)){
      groups.set(key,[]);
    }

    groups.get(key).push(u);
  }

  const result = [];

  for(const group of groups.values()){
    group.sort((a,b)=>{
      const value =
        Number(b.collectionValue || 0)
        - Number(a.collectionValue || 0);

      if(value !== 0) return value;

      return (
        Number(b.cardsCount || 0)
        - Number(a.cardsCount || 0)
      );
    });

    result.push(group[0]);
  }

  return result;
}

async function renderSearch(){
  content().innerHTML = `
    <div class="v234-search">
      <input id="v234-search-input"
             class="v234-input"
             placeholder="Buscar usuario">

      <button id="v234-search-btn"
              class="v234-btn v234-yellow">
        Buscar
      </button>
    </div>

    <div id="v234-search-results"></div>
  `;

  const input =
    document.querySelector("#v234-search-input");

  const button =
    document.querySelector("#v234-search-btn");

  const run = async ()=>{
    const term = lower(input.value);

    if(!term) return;

    const area =
      document.querySelector("#v234-search-results");

    area.innerHTML =
      `<div class="v234-status">Buscando…</div>`;

    try{
      await refreshMe();

      const snap = await getDocs(
        query(
          collection(db,"users"),
          where("usernameLower",">=",term),
          where("usernameLower","<=",term + "\uf8ff"),
          orderBy("usernameLower"),
          limit(30)
        )
      );

      let users = snap.docs.map(d=>({
        uid:d.id,
        ...d.data()
      }));

      users = chooseOnePerUsername(users);

      const ownUid =
        auth.currentUser?.uid || "";

      const ownName =
        lower(
          myProfile?.usernameLower
          || myProfile?.username
        );

      const blocked =
        await blockedIdsByMe();

      users = users.filter(u=>{
        const candidateName =
          lower(
            u.usernameLower
            || u.username
          );

        return (
          u.uid !== ownUid
          &&
          candidateName !== ownName
          &&
          !blocked.has(u.uid)
        );
      });

      if(!users.length){
        area.innerHTML = `
          <div class="v234-status">
            No hay otros usuarios con ese nombre.
          </div>
        `;
        return;
      }

      const links = await friendLinks();

      const friendIds =
        new Set(
          links.map(x=>x.friendUid)
        );

      const incoming =
        await getRequests("incoming");

      const outgoing =
        await getRequests("outgoing");

      area.innerHTML = users.map(u=>{
        let action = `
          <button class="v234-btn v234-yellow"
                  data-add="${esc(u.uid)}"
                  data-name="${esc(u.username || "Usuario")}">
            Añadir
          </button>
        `;

        if(friendIds.has(u.uid)){
          action = `
            <button class="v234-btn v234-green"
                    disabled>
              ✓ Amigo
            </button>
          `;
        }

        if(
          outgoing.some(
            r=>
              r.toUid === u.uid
              && r.status === "pending"
          )
        ){
          action = `
            <button class="v234-btn v234-blue"
                    disabled>
              Solicitud enviada
            </button>
          `;
        }

        if(
          incoming.some(
            r=>
              r.fromUid === u.uid
              && r.status === "pending"
          )
        ){
          action = `
            <button class="v234-btn v234-green"
                    data-go-requests="1">
              Tienes una solicitud
            </button>
          `;
        }

        return `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(u.username || "Usuario")}
            </div>

            <div class="v234-muted">
              ${Number(u.distinctCount || 0)}
              cartas distintas
            </div>

            <div class="v234-actions">
              ${action}
            </div>
          </div>
        `;
      }).join("");

      area
        .querySelectorAll("[data-add]")
        .forEach(btn=>{
          btn.onclick =
            ()=>sendRequest(
              btn.dataset.add,
              btn.dataset.name
            );
        });

      area
        .querySelectorAll("[data-go-requests]")
        .forEach(btn=>{
          btn.onclick = ()=>{
            document
              .querySelector(
                '.v234-tab[data-tab="requests"]'
              )
              ?.click();
          };
        });

    }catch(error){
      console.error(error);

      area.innerHTML = `
        <div class="v234-status">
          ❌ ${esc(error.message)}
        </div>
      `;
    }
  };

  button.onclick = run;

  input.addEventListener("keydown",e=>{
    if(e.key === "Enter"){
      run();
    }
  });
}

async function sendRequest(uid,username){
  const me = auth.currentUser;

  if(!me) return;

  await refreshMe();

  if(
    uid === me.uid
    ||
    lower(username)
      === lower(
        myProfile?.usernameLower
        || myProfile?.username
      )
  ){
    alert("No puedes añadirte a ti mismo.");
    return;
  }

  const blocked =
    await blockedIdsByMe();

  if(blocked.has(uid)){
    alert(
      "Ese usuario está en tu lista de bloqueados."
    );
    return;
  }

  const link = await getDoc(
    doc(
      db,
      "friendLinks",
      `${me.uid}__${uid}`
    )
  );

  if(link.exists()){
    alert("Ya sois amigos.");
    return;
  }

  const reverseId =
    `${uid}__${me.uid}`;

  const reverse =
    await getDoc(
      doc(
        db,
        "friendRequests",
        reverseId
      )
    );

  if(
    reverse.exists()
    && reverse.data().status === "pending"
  ){
    alert(
      "Ese usuario ya te ha enviado una solicitud."
    );

    document
      .querySelector(
        '.v234-tab[data-tab="requests"]'
      )
      ?.click();

    return;
  }

  const id =
    `${me.uid}__${uid}`;

  const ref =
    doc(db,"friendRequests",id);

  const old =
    await getDoc(ref);

  if(old.exists()){
    if(old.data().status === "pending"){
      alert("Ya has enviado una solicitud.");
      return;
    }

    await deleteDoc(ref);
  }

  try{
    await setDoc(ref,{
      fromUid:me.uid,
      toUid:uid,
      fromUsername:
        myProfile?.username || "Usuario",
      toUsername:
        username || "Usuario",
      status:"pending",
      createdAt:serverTimestamp()
    });

    alert("✅ Solicitud enviada.");

    renderSearch();

  }catch(error){
    console.error(error);

    if(
      String(error?.code || "")
        .includes("permission-denied")
    ){
      alert(
        "No se puede enviar una solicitud a este usuario."
      );
    }else{
      alert(
        "❌ "
        + error.message
      );
    }
  }
}

async function renderRequests(){
  status("Cargando solicitudes…");

  try{
    await refreshMe();

    const [incomingRaw,outgoingRaw] =
      await Promise.all([
        getRequests("incoming"),
        getRequests("outgoing")
      ]);

    const blocked =
      await blockedIdsByMe();

    const pendingIn = [];
    const pendingOut = [];

    for(const r of incomingRaw){
      if(r.status !== "pending"){
        continue;
      }

      if(
        !r.fromUid
        ||
        r.fromUid === auth.currentUser.uid
        ||
        blocked.has(r.fromUid)
      ){
        try{
          await deleteDoc(
            doc(
              db,
              "friendRequests",
              r.id
            )
          );
        }catch{}

        continue;
      }

      let other = null;

      try{
        other =
          await profile(r.fromUid);
      }catch{}

      if(!other?.username){
        try{
          await deleteDoc(
            doc(
              db,
              "friendRequests",
              r.id
            )
          );
        }catch{}

        continue;
      }

      if(
        lower(other.usernameLower || other.username)
        ===
        lower(
          myProfile?.usernameLower
          || myProfile?.username
        )
      ){
        try{
          await deleteDoc(
            doc(
              db,
              "friendRequests",
              r.id
            )
          );
        }catch{}

        continue;
      }

      pendingIn.push({
        ...r,
        resolvedUsername:other.username
      });
    }

    for(const r of outgoingRaw){
      if(r.status !== "pending"){
        continue;
      }

      if(
        !r.toUid
        ||
        r.toUid === auth.currentUser.uid
        ||
        blocked.has(r.toUid)
      ){
        try{
          await deleteDoc(
            doc(
              db,
              "friendRequests",
              r.id
            )
          );
        }catch{}

        continue;
      }

      let other = null;

      try{
        other =
          await profile(r.toUid);
      }catch{}

      if(!other?.username){
        try{
          await deleteDoc(
            doc(
              db,
              "friendRequests",
              r.id
            )
          );
        }catch{}

        continue;
      }

      pendingOut.push({
        ...r,
        resolvedUsername:other.username
      });
    }

    let html = "";

    if(pendingIn.length){
      html += `
        <div class="v234-muted"
             style="margin-bottom:8px">
          RECIBIDAS
        </div>
      `;

      html += pendingIn.map(r=>`
        <div class="v234-card">
          <div class="v234-user">
            @${esc(r.resolvedUsername)}
          </div>

          <div class="v234-muted">
            Quiere ser tu amigo
          </div>

          <div class="v234-actions">
            <button class="v234-btn v234-green"
                    data-accept="${esc(r.id)}"
                    title="Aceptar">
              ✓ Aceptar
            </button>

            <button class="v234-btn v234-red"
                    data-reject="${esc(r.id)}"
                    title="Rechazar">
              ✕ Rechazar
            </button>

            <button class="v234-btn v234-red"
                    data-block-request="${esc(r.fromUid)}"
                    title="Bloquear">
              ⛔ Bloquear
            </button>
          </div>
        </div>
      `).join("");
    }

    if(pendingOut.length){
      html += `
        <div class="v234-muted"
             style="margin:15px 0 8px">
          ENVIADAS
        </div>
      `;

      html += pendingOut.map(r=>`
        <div class="v234-card">
          <div class="v234-user">
            @${esc(r.resolvedUsername)}
          </div>

          <div class="v234-muted">
            Solicitud pendiente
          </div>
        </div>
      `).join("");
    }

    if(!html){
      html = `
        <div class="v234-status">
          No tienes solicitudes pendientes.
        </div>
      `;
    }

    content().innerHTML = html;

    content()
      .querySelectorAll("[data-accept]")
      .forEach(btn=>{
        btn.onclick =
          ()=>acceptRequest(
            btn.dataset.accept
          );
      });

    content()
      .querySelectorAll("[data-reject]")
      .forEach(btn=>{
        btn.onclick =
          ()=>rejectRequest(
            btn.dataset.reject
          );
      });

    content()
      .querySelectorAll("[data-block-request]")
      .forEach(btn=>{
        btn.onclick =
          ()=>blockUser(
            btn.dataset.blockRequest
          );
      });

  }catch(error){
    console.error(error);

    status(
      "❌ "
      + esc(error.message)
    );
  }
}

async function acceptRequest(id){
  const ref =
    doc(db,"friendRequests",id);

  const snap =
    await getDoc(ref);

  if(!snap.exists()) return;

  const req = {
    id,
    ...snap.data()
  };

  const fromProfile =
    await profile(req.fromUid);

  const toProfile =
    await profile(req.toUid);

  const batch =
    writeBatch(db);

  batch.update(ref,{
    status:"accepted",
    respondedAt:serverTimestamp()
  });

  batch.set(
    doc(
      db,
      "friendLinks",
      `${req.fromUid}__${req.toUid}`
    ),
    {
      ownerUid:req.fromUid,
      friendUid:req.toUid,
      friendUsername:
        toProfile?.username
        || req.toUsername
        || "Usuario",
      requestId:id,
      createdAt:serverTimestamp()
    }
  );

  batch.set(
    doc(
      db,
      "friendLinks",
      `${req.toUid}__${req.fromUid}`
    ),
    {
      ownerUid:req.toUid,
      friendUid:req.fromUid,
      friendUsername:
        fromProfile?.username
        || req.fromUsername
        || "Usuario",
      requestId:id,
      createdAt:serverTimestamp()
    }
  );

  await batch.commit();

  alert("Ahora sois amigos.");

  document
    .querySelector(
      '.v234-tab[data-tab="friends"]'
    )
    ?.click();
}

async function rejectRequest(id){
  if(
    !confirm(
      "¿Rechazar esta solicitud?"
    )
  ){
    return;
  }

  await deleteDoc(
    doc(
      db,
      "friendRequests",
      id
    )
  );

  alert("✕ Solicitud rechazada.");

  renderRequests();
}

async function removeFriend(uid){
  if(
    !confirm(
      "¿Seguro que quieres eliminar a este amigo?"
    )
  ){
    return;
  }

  const me = auth.currentUser;

  if(!me) return;

  const refs = [
    doc(
      db,
      "friendLinks",
      `${me.uid}__${uid}`
    ),
    doc(
      db,
      "friendLinks",
      `${uid}__${me.uid}`
    ),
    doc(
      db,
      "friendRequests",
      `${me.uid}__${uid}`
    ),
    doc(
      db,
      "friendRequests",
      `${uid}__${me.uid}`
    )
  ];

  const snaps =
    await Promise.all(
      refs.map(r=>getDoc(r))
    );

  const batch =
    writeBatch(db);

  snaps.forEach((snap,i)=>{
    if(snap.exists()){
      batch.delete(refs[i]);
    }
  });

  await batch.commit();

  alert("Amigo eliminado.");

  renderFriends();
}

function dedupeRanking(users){
  const groups = new Map();

  for(const u of users){
    if(!u.username) continue;

    const key =
      lower(
        u.usernameLower
        || u.username
      );

    if(!groups.has(key)){
      groups.set(key,[]);
    }

    groups.get(key).push(u);
  }

  const result = [];

  for(const group of groups.values()){
    group.sort((a,b)=>{
      const valueDiff =
        Number(b.collectionValue || 0)
        - Number(a.collectionValue || 0);

      if(valueDiff !== 0){
        return valueDiff;
      }

      return (
        Number(b.cardsCount || 0)
        - Number(a.cardsCount || 0)
      );
    });

    result.push(group[0]);
  }

  result.sort(
    (a,b)=>
      Number(b.collectionValue || 0)
      - Number(a.collectionValue || 0)
  );

  return result;
}

async function renderRanking(){
  status("Cargando ranking…");

  try{
    const [
      snap,
      links,
      blocked
    ] = await Promise.all([
      getDocs(
        query(
          collection(db,"users"),
          orderBy("collectionValue","desc"),
          limit(50)
        )
      ),
      friendLinks(),
      blockedIdsByMe()
    ]);

    const friendIds =
      new Set(
        links.map(x=>x.friendUid)
      );

    let users =
      snap.docs.map(d=>({
        uid:d.id,
        ...d.data()
      }));

    users =
      dedupeRanking(users)
        .filter(
          u=>!blocked.has(u.uid)
        );

    if(!users.length){
      status("Todavía no hay usuarios en el ranking.");
      return;
    }

    content().innerHTML =
      users.map((u,i)=>{
        const isFriend =
          friendIds.has(u.uid);

        const isMe =
          u.uid === auth.currentUser?.uid;

        return `
          <div class="v234-rank">
            <strong>#${i+1}</strong>

            <div>
              <strong>
                @${esc(u.username)}
              </strong>

              <div class="v234-muted">
                ${
                  isMe
                    ? "👤 Tú · "
                    : isFriend
                      ? "👥 Amigo · "
                      : ""
                }
                ${Number(u.distinctCount || 0)}
                distintas ·
                ${Number(u.cardsCount || 0)}
                cartas
              </div>
            </div>

            <strong>
              ${money(u.collectionValue)}
            </strong>
          </div>
        `;
      }).join("");

  }catch(error){
    console.error(error);

    status(
      "❌ "
      + esc(error.message)
    );
  }
}

async function remoteCards(uid){
  const snap =
    await getDocs(
      collection(
        db,
        "users",
        uid,
        "cards"
      )
    );

  return snap.docs
    .map(d=>d.data())
    .filter(
      x=>x && !x.deleted && x.item
    );
}

function itemName(item){
  return (
    item?.name
    || item?.card?.name
    || item?.cardName
    || "Carta"
  );
}

function itemImage(item){
  const img =
    item?.image
    || item?.imageUrl
    || item?.card?.image
    || "";

  if(typeof img === "string"){
    return img;
  }

  return (
    img?.large
    || img?.high
    || img?.small
    || ""
  );
}

function itemQty(item){
  if(Number.isFinite(Number(item?.quantity))){
    return Number(item.quantity);
  }

  if(Number.isFinite(Number(item?.qty))){
    return Number(item.qty);
  }

  if(Array.isArray(item?.copies)){
    return Math.max(1,item.copies.length);
  }

  return 1;
}

function cardsHTML(rows){
  if(!rows.length){
    return `
      <div class="v234-status">
        No hay cartas para mostrar.
      </div>
    `;
  }

  return `
    <div class="v234-grid">
      ${rows.slice(0,100).map(row=>{
        const item = row.item || {};
        const image = itemImage(item);

        return `
          <div class="v234-mini">
            ${
              image
                ? `<img src="${esc(image)}" loading="lazy">`
                : ""
            }

            <strong>
              ${esc(itemName(item))}
            </strong>

            x${itemQty(item)}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function showCollection(uid){
  const p =
    await profile(uid);

  const rows =
    await remoteCards(uid);

  const old =
    content().innerHTML;

  content().innerHTML = `
    <button class="v234-btn v234-blue"
            id="v234-back"
            style="margin-bottom:12px">
      ← Volver
    </button>

    <div class="v234-card">
      <div class="v234-user">
        @${esc(p?.username || "Usuario")}
      </div>

      <div class="v234-muted">
        ${rows.length} cartas distintas
      </div>
    </div>

    ${cardsHTML(rows)}
  `;

  document.querySelector("#v234-back").onclick =
    ()=>renderFriends();
}

function openLocalDB(){
  return new Promise((resolve,reject)=>{
    const req =
      indexedDB.open(DB_NAME);

    req.onerror =
      ()=>reject(req.error);

    req.onsuccess = ()=>{
      const database =
        req.result;

      if(
        !database.objectStoreNames.contains(
          STORE_NAME
        )
      ){
        database.close();
        reject(
          new Error(
            "No se encontró Mi Pokédex local."
          )
        );
        return;
      }

      resolve(database);
    };
  });
}

async function localCards(){
  const database =
    await openLocalDB();

  return new Promise((resolve,reject)=>{
    const tx =
      database.transaction(
        STORE_NAME,
        "readonly"
      );

    const store =
      tx.objectStore(STORE_NAME);

    const req =
      store.openCursor();

    const rows = [];

    req.onerror =
      ()=>reject(req.error);

    req.onsuccess = ()=>{
      const cursor =
        req.result;

      if(!cursor) return;

      rows.push({
        key:String(cursor.key),
        item:cursor.value
      });

      cursor.continue();
    };

    tx.oncomplete = ()=>{
      database.close();
      resolve(rows);
    };
  });
}

async function compareCollection(uid){
  const p =
    await profile(uid);

  const [mine,theirs] =
    await Promise.all([
      localCards(),
      remoteCards(uid)
    ]);

  const mineKeys =
    new Set(
      mine.map(x=>x.key)
    );

  const theirKeys =
    new Set(
      theirs.map(x=>String(x.key))
    );

  const common =
    [...mineKeys]
      .filter(k=>theirKeys.has(k));

  const onlyMine =
    mine.filter(
      x=>!theirKeys.has(x.key)
    );

  const onlyTheirs =
    theirs.filter(
      x=>!mineKeys.has(String(x.key))
    );

  content().innerHTML = `
    <button class="v234-btn v234-blue"
            id="v234-back"
            style="margin-bottom:12px">
      ← Volver
    </button>

    <div class="v234-card">
      <div class="v234-user">
        Tú vs @${esc(p?.username || "Usuario")}
      </div>
    </div>

    <div class="v234-compare">
      <div>
        <strong>${common.length}</strong>
        En común
      </div>

      <div>
        <strong>${onlyMine.length}</strong>
        Solo tú
      </div>

      <div>
        <strong>${onlyTheirs.length}</strong>
        Solo amigo
      </div>
    </div>

    <div class="v234-card">
      <strong>
        Cartas que tiene @${esc(p?.username || "Usuario")}
        y tú no
      </strong>

      ${cardsHTML(onlyTheirs)}
    </div>
  `;

  document.querySelector("#v234-back").onclick =
    ()=>renderFriends();
}

async function openFriends(){
  if(!auth.currentUser){
    alert(
      "Primero inicia sesión en tu cuenta PokEX."
    );
    return;
  }

  await refreshMe();

  makeOverlay();

  renderFriends();
}

function replaceFriendsButton(){
  let old =
    document.querySelector(
      "#v23-friends-home"
    );

  if(!old){
    old = [
      ...document.querySelectorAll("button")
    ].find(btn=>{
      if(
        btn.closest(
          ".v23-overlay,.v234-overlay"
        )
      ){
        return false;
      }

      const text =
        btn.textContent
          .replace(/\s+/g," ")
          .trim();

      return (
        text.includes("Amigos")
        &&
        (
          btn.classList.contains(
            "v23-home-btn"
          )
          ||
          text.startsWith("👥")
        )
      );
    });
  }

  if(!old) return false;

  if(old.dataset.friends234 === "1"){
    return true;
  }

  const fresh =
    old.cloneNode(true);

  fresh.dataset.friends234 = "1";

  old.replaceWith(fresh);

  fresh.addEventListener(
    "click",
    openFriends
  );

  return true;
}

setTimeout(replaceFriendsButton,300);
setTimeout(replaceFriendsButton,1000);
setTimeout(replaceFriendsButton,2500);

auth.onAuthStateChanged(()=>{
  setTimeout(
    replaceFriendsButton,
    250
  );
});

window.PokEXFriends234 = {
  open:openFriends,
  repair:repairAccepted
};

console.log(
  "✅ PokEX Amigos v2.3.4 cargado"
);
