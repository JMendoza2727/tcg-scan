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

const LOCAL_DB = "tcgscan-pokedex";
const LOCAL_STORE = "cards";

let meProfile = null;

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function money(v) {
  return Number(v || 0).toFixed(2) + " €";
}

async function getProfile(uid) {
  if (!uid) return null;

  const snap = await getDoc(
    doc(db, "users", uid)
  );

  return snap.exists()
    ? { uid: snap.id, ...snap.data() }
    : null;
}

async function refreshMe() {
  const user = auth.currentUser;

  if (!user) {
    meProfile = null;
    return null;
  }

  meProfile = await getProfile(user.uid);
  return meProfile;
}

function overlay() {
  document.querySelector(".pokex232-friends")?.remove();

  const el = document.createElement("div");

  el.className = "v234-overlay pokex232-friends";

  el.innerHTML = `
    <div class="v234-box">
      <div class="v234-head">
        <h2>👥 Amigos</h2>
        <button class="v234-close">✕</button>
      </div>

      <div class="v234-body">
        <div class="v234-tabs">
          <button class="v234-tab active" data-f232="friends">
            Mis amigos
          </button>

          <button class="v234-tab" data-f232="search">
            Buscar
          </button>

          <button class="v234-tab" data-f232="requests">
            Solicitudes
          </button>

          <button class="v234-tab" data-f232="ranking">
            Ranking
          </button>

          <button class="v234-tab" data-f232="blocked">
            Bloqueados
          </button>
        </div>

        <div id="f232-content"></div>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector(".v234-close").onclick =
    () => el.remove();

  el.addEventListener("click", e => {
    if (e.target === el) el.remove();
  });

  el.querySelectorAll("[data-f232]").forEach(btn => {
    btn.onclick = () => {
      el.querySelectorAll("[data-f232]")
        .forEach(x => x.classList.remove("active"));

      btn.classList.add("active");

      const tab = btn.dataset.f232;

      if (tab === "friends") renderFriends();
      if (tab === "search") renderSearch();
      if (tab === "requests") renderRequests();
      if (tab === "ranking") renderRanking();
      if (tab === "blocked") renderBlocked();
    };
  });

  return el;
}

function area() {
  return document.querySelector("#f232-content");
}

function status(text) {
  area().innerHTML =
    `<div class="v234-status">${text}</div>`;
}

async function getMyLinks() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const snap = await getDocs(
    query(
      collection(db, "friendLinks"),
      where("ownerUid", "==", uid)
    )
  );

  const seen = new Set();

  return snap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .filter(x => {
      if (!x.friendUid) return false;
      if (x.friendUid === uid) return false;
      if (seen.has(x.friendUid)) return false;

      seen.add(x.friendUid);
      return true;
    });
}

async function incomingRequests() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const snap = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("toUid", "==", uid)
    )
  );

  return snap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .filter(x => x.status === "pending");
}

async function outgoingRequests() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const snap = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("fromUid", "==", uid)
    )
  );

  return snap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .filter(x => x.status === "pending");
}

async function myBlocks() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const snap = await getDocs(
    query(
      collection(db, "blocks"),
      where("blockerUid", "==", uid)
    )
  );

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function canonicalUserByName(name) {
  const key = lower(name);

  if (!key) return null;

  const usernameSnap = await getDoc(
    doc(db, "usernames", key)
  );

  if (!usernameSnap.exists()) {
    return null;
  }

  const data = usernameSnap.data();

  if (!data.uid) {
    return null;
  }

  const p = await getProfile(data.uid);

  if (!p) {
    return null;
  }

  return p;
}

async function isCanonicalProfile(profile) {
  if (!profile?.uid || !profile?.username) {
    return false;
  }

  try {
    const snap = await getDoc(
      doc(
        db,
        "usernames",
        lower(profile.usernameLower || profile.username)
      )
    );

    return (
      snap.exists()
      &&
      snap.data().uid === profile.uid
    );
  } catch {
    return false;
  }
}

async function renderFriends() {
  status("Cargando amigos…");

  try {
    const links = await getMyLinks();

    if (!links.length) {
      status("Todavía no tienes amigos.");
      return;
    }

    const rows = [];

    for (const link of links) {
      const p = await getProfile(link.friendUid);

      if (!p) continue;

      if (!(await isCanonicalProfile(p))) {
        continue;
      }

      rows.push(p);
    }

    if (!rows.length) {
      status("Todavía no tienes amigos.");
      return;
    }

    area().innerHTML = rows.map(p => `
      <div class="v234-card">
        <div class="v234-user">
          @${esc(p.username)}
        </div>

        <div class="v234-muted">
          ${Number(p.distinctCount || 0)}
          distintas ·
          ${Number(p.cardsCount || 0)}
          cartas ·
          ${money(p.collectionValue)}
        </div>

        <div class="v234-actions">
          <button class="v234-btn v234-blue"
                  data-fview="${esc(p.uid)}">
            Ver colección
          </button>

          <button class="v234-btn v234-blue"
                  data-fcompare="${esc(p.uid)}">
            Comparar
          </button>

          <details class="v231-more">
            <summary>⋯</summary>

            <div class="v231-more-menu">
              <button class="v234-btn v234-red"
                      data-fremove="${esc(p.uid)}">
                Eliminar amigo
              </button>

              <button class="v234-btn v234-red"
                      data-fblock="${esc(p.uid)}">
                ⛔ Bloquear
              </button>
            </div>
          </details>
        </div>
      </div>
    `).join("");

    area().querySelectorAll("[data-fview]")
      .forEach(btn => {
        btn.onclick =
          () => showCollection(btn.dataset.fview);
      });

    area().querySelectorAll("[data-fcompare]")
      .forEach(btn => {
        btn.onclick =
          () => compareCollection(btn.dataset.fcompare);
      });

    area().querySelectorAll("[data-fremove]")
      .forEach(btn => {
        btn.onclick =
          () => removeFriend(btn.dataset.fremove);
      });

    area().querySelectorAll("[data-fblock]")
      .forEach(btn => {
        btn.onclick =
          () => blockUser(btn.dataset.fblock);
      });

  } catch (error) {
    console.error(error);
    status("❌ " + esc(error.message));
  }
}

function renderSearch() {
  area().innerHTML = `
    <div class="v234-search">
      <input
        id="f232-search"
        class="v234-input"
        placeholder="Buscar usuario">

      <button
        id="f232-search-btn"
        class="v234-btn v234-yellow">
        Buscar
      </button>
    </div>

    <div id="f232-search-result"></div>
  `;

  const input =
    document.querySelector("#f232-search");

  const result =
    document.querySelector("#f232-search-result");

  const run = async () => {
    const name = input.value.trim();

    if (!name) return;

    result.innerHTML =
      `<div class="v234-status">Buscando…</div>`;

    try {
      await refreshMe();

      const found =
        await canonicalUserByName(name);

      if (!found) {
        result.innerHTML =
          `<div class="v234-status">
             No existe @${esc(name)}.
           </div>`;
        return;
      }

      if (found.uid === auth.currentUser.uid) {
        result.innerHTML =
          `<div class="v234-status">
             👤 Ese eres tú.
           </div>`;
        return;
      }

      const blocks = await myBlocks();

      if (
        blocks.some(
          x => x.blockedUid === found.uid
        )
      ) {
        result.innerHTML =
          `<div class="v234-status">
             ⛔ @${esc(found.username)}
             está bloqueado.
           </div>`;
        return;
      }

      const friends = await getMyLinks();

      if (
        friends.some(
          x => x.friendUid === found.uid
        )
      ) {
        result.innerHTML = `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(found.username)}
            </div>

            <div class="v234-muted">
              ✓ Ya sois amigos
            </div>
          </div>
        `;
        return;
      }

      const incoming = await incomingRequests();

      if (
        incoming.some(
          x => x.fromUid === found.uid
        )
      ) {
        result.innerHTML = `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(found.username)}
            </div>

            <div class="v234-muted">
              Te ha enviado una solicitud.
            </div>

            <button class="v234-btn v234-green"
                    id="f232-go-requests">
              Ver solicitud
            </button>
          </div>
        `;

        document.querySelector("#f232-go-requests")
          .onclick = () => {
            document
              .querySelector(
                '[data-f232="requests"]'
              )
              ?.click();
          };

        return;
      }

      const outgoing = await outgoingRequests();

      if (
        outgoing.some(
          x => x.toUid === found.uid
        )
      ) {
        result.innerHTML = `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(found.username)}
            </div>

            <div class="v234-muted">
              Solicitud pendiente.
            </div>
          </div>
        `;

        return;
      }

      result.innerHTML = `
        <div class="v234-card">
          <div class="v234-user">
            @${esc(found.username)}
          </div>

          <div class="v234-muted">
            ${Number(found.distinctCount || 0)}
            cartas distintas
          </div>

          <button
            id="f232-add"
            class="v234-btn v234-yellow"
            style="width:100%;margin-top:10px">
            Añadir amigo
          </button>
        </div>
      `;

      document.querySelector("#f232-add")
        .onclick =
          () => sendRequest(found);

    } catch (error) {
      console.error(error);

      result.innerHTML =
        `<div class="v234-status">
           ❌ ${esc(error.message)}
         </div>`;
    }
  };

  document.querySelector("#f232-search-btn")
    .onclick = run;

  input.onkeydown = e => {
    if (e.key === "Enter") {
      run();
    }
  };
}

async function sendRequest(found) {
  const me = auth.currentUser;

  if (!me || !found) return;

  const reverseId =
    `${found.uid}__${me.uid}`;

  const reverse = await getDoc(
    doc(db, "friendRequests", reverseId)
  );

  if (
    reverse.exists()
    &&
    reverse.data().status === "pending"
  ) {
    document
      .querySelector('[data-f232="requests"]')
      ?.click();

    return;
  }

  const id =
    `${me.uid}__${found.uid}`;

  const ref =
    doc(db, "friendRequests", id);

  const old = await getDoc(ref);

  if (old.exists()) {
    await deleteDoc(ref);
  }

  await setDoc(ref, {
    fromUid: me.uid,
    toUid: found.uid,
    fromUsername:
      meProfile?.username || "Usuario",
    toUsername:
      found.username,
    status: "pending",
    createdAt: serverTimestamp()
  });

  alert("✅ Solicitud enviada.");

  renderSearch();
}

async function renderRequests() {
  status("Cargando solicitudes…");

  try {
    const [incoming, outgoing] =
      await Promise.all([
        incomingRequests(),
        outgoingRequests()
      ]);

    let html = "";

    if (incoming.length) {
      html += `
        <div class="v234-muted"
             style="margin-bottom:8px">
          RECIBIDAS
        </div>
      `;

      for (const r of incoming) {
        const p = await getProfile(r.fromUid);

        if (!p) continue;
        if (!(await isCanonicalProfile(p))) continue;

        html += `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(p.username)}
            </div>

            <div class="v234-muted">
              Quiere ser tu amigo
            </div>

            <div class="v234-actions">
              <button class="v234-btn v234-green"
                      data-faccept="${esc(r.id)}">
                ✓
              </button>

              <button class="v234-btn v234-red"
                      data-freject="${esc(r.id)}">
                ✕
              </button>

              <button class="v234-btn v234-red"
                      data-fblockrequest="${esc(r.fromUid)}">
                ⛔
              </button>
            </div>
          </div>
        `;
      }
    }

    if (outgoing.length) {
      html += `
        <div class="v234-muted"
             style="margin:15px 0 8px">
          ENVIADAS
        </div>
      `;

      for (const r of outgoing) {
        const p = await getProfile(r.toUid);

        if (!p) continue;
        if (!(await isCanonicalProfile(p))) continue;

        html += `
          <div class="v234-card">
            <div class="v234-user">
              @${esc(p.username)}
            </div>

            <div class="v234-muted">
              Esperando respuesta
            </div>

            <button class="v234-btn v234-red"
                    data-fcancel="${esc(r.id)}"
                    style="margin-top:8px">
              Cancelar solicitud
            </button>
          </div>
        `;
      }
    }

    area().innerHTML =
      html ||
      `<div class="v234-status">
         No tienes solicitudes pendientes.
       </div>`;

    area().querySelectorAll("[data-faccept]")
      .forEach(btn => {
        btn.onclick =
          () => acceptRequest(btn.dataset.faccept);
      });

    area().querySelectorAll("[data-freject]")
      .forEach(btn => {
        btn.onclick =
          () => rejectRequest(btn.dataset.freject);
      });

    area().querySelectorAll("[data-fcancel]")
      .forEach(btn => {
        btn.onclick =
          async () => {
            await deleteDoc(
              doc(
                db,
                "friendRequests",
                btn.dataset.fcancel
              )
            );

            renderRequests();
          };
      });

    area().querySelectorAll("[data-fblockrequest]")
      .forEach(btn => {
        btn.onclick =
          () => blockUser(btn.dataset.fblockrequest);
      });

  } catch (error) {
    console.error(error);
    status("❌ " + esc(error.message));
  }
}

async function acceptRequest(id) {
  const requestRef =
    doc(db, "friendRequests", id);

  const snap =
    await getDoc(requestRef);

  if (!snap.exists()) return;

  const r = snap.data();

  if (
    r.toUid !== auth.currentUser.uid
    ||
    r.status !== "pending"
  ) {
    return;
  }

  const from =
    await getProfile(r.fromUid);

  const to =
    await getProfile(r.toUid);

  if (!from || !to) {
    alert("❌ Uno de los perfiles ya no existe.");
    return;
  }

  await updateDoc(
    requestRef,
    {
      status: "accepted",
      respondedAt: serverTimestamp()
    }
  );

  const batch = writeBatch(db);

  batch.set(
    doc(
      db,
      "friendLinks",
      `${r.fromUid}__${r.toUid}`
    ),
    {
      ownerUid: r.fromUid,
      friendUid: r.toUid,
      friendUsername: to.username,
      createdAt: serverTimestamp()
    }
  );

  batch.set(
    doc(
      db,
      "friendLinks",
      `${r.toUid}__${r.fromUid}`
    ),
    {
      ownerUid: r.toUid,
      friendUid: r.fromUid,
      friendUsername: from.username,
      createdAt: serverTimestamp()
    }
  );

  await batch.commit();

  await deleteDoc(requestRef);

  alert("✅ Ahora sois amigos.");

  document
    .querySelector('[data-f232="friends"]')
    ?.click();
}

async function rejectRequest(id) {
  await deleteDoc(
    doc(db, "friendRequests", id)
  );

  renderRequests();
}

async function removeFriend(uid) {
  if (
    !confirm("¿Eliminar a este amigo?")
  ) {
    return;
  }

  const me = auth.currentUser.uid;

  const refs = [
    doc(
      db,
      "friendLinks",
      `${me}__${uid}`
    ),
    doc(
      db,
      "friendLinks",
      `${uid}__${me}`
    )
  ];

  const snaps =
    await Promise.all(
      refs.map(x => getDoc(x))
    );

  const batch = writeBatch(db);

  snaps.forEach((snap, i) => {
    if (snap.exists()) {
      batch.delete(refs[i]);
    }
  });

  await batch.commit();

  renderFriends();
}

async function blockUser(uid) {
  const me = auth.currentUser;

  if (!me || !uid) return;

  const p = await getProfile(uid);

  if (
    !confirm(
      `¿Bloquear a @${p?.username || "este usuario"}?`
    )
  ) {
    return;
  }

  const possible = [
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
      possible.map(x => getDoc(x))
    );

  const batch = writeBatch(db);

  batch.set(
    doc(
      db,
      "blocks",
      `${me.uid}__${uid}`
    ),
    {
      blockerUid: me.uid,
      blockedUid: uid,
      blockedUsername:
        p?.username || "Usuario",
      createdAt: serverTimestamp()
    }
  );

  snaps.forEach((snap, i) => {
    if (snap.exists()) {
      batch.delete(possible[i]);
    }
  });

  await batch.commit();

  alert("⛔ Usuario bloqueado.");

  document
    .querySelector('[data-f232="blocked"]')
    ?.click();
}

async function renderBlocked() {
  status("Cargando bloqueados…");

  try {
    const blocks = await myBlocks();

    if (!blocks.length) {
      status("No tienes usuarios bloqueados.");
      return;
    }

    const rows = [];

    for (const b of blocks) {
      const p = await getProfile(b.blockedUid);

      rows.push({
        ...b,
        profile: p
      });
    }

    area().innerHTML = rows.map(x => `
      <div class="v234-card">
        <div class="v234-user">
          @${esc(
            x.profile?.username
            ||
            x.blockedUsername
            ||
            "Usuario"
          )}
        </div>

        <button class="v234-btn v234-blue"
                data-funblock="${esc(x.blockedUid)}"
                style="margin-top:10px">
          Desbloquear
        </button>
      </div>
    `).join("");

    area().querySelectorAll("[data-funblock]")
      .forEach(btn => {
        btn.onclick =
          async () => {
            await deleteDoc(
              doc(
                db,
                "blocks",
                `${auth.currentUser.uid}__${btn.dataset.funblock}`
              )
            );

            renderBlocked();
          };
      });

  } catch (error) {
    console.error(error);
    status("❌ " + esc(error.message));
  }
}

async function renderRanking() {
  status("Cargando ranking…");

  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        orderBy("collectionValue", "desc"),
        limit(50)
      )
    );

    const friends = await getMyLinks();

    const friendIds =
      new Set(
        friends.map(x => x.friendUid)
      );

    const blocks = await myBlocks();

    const blockedIds =
      new Set(
        blocks.map(x => x.blockedUid)
      );

    const rows = [];

    for (const d of snap.docs) {
      const p = {
        uid: d.id,
        ...d.data()
      };

      if (!p.username) continue;

      if (blockedIds.has(p.uid)) {
        continue;
      }

      if (!(await isCanonicalProfile(p))) {
        continue;
      }

      rows.push(p);
    }

    if (!rows.length) {
      status("Todavía no hay ranking.");
      return;
    }

    area().innerHTML =
      rows.map((p, i) => {
        const mine =
          p.uid === auth.currentUser.uid;

        const friend =
          friendIds.has(p.uid);

        return `
          <div class="v234-rank">
            <strong>#${i + 1}</strong>

            <div>
              <strong>
                @${esc(p.username)}
              </strong>

              <div class="v234-muted">
                ${
                  mine
                    ? "👤 Tú · "
                    : friend
                      ? "👥 Amigo · "
                      : ""
                }
                ${Number(p.distinctCount || 0)}
                distintas ·
                ${Number(p.cardsCount || 0)}
                cartas
              </div>
            </div>

            <strong>
              ${money(p.collectionValue)}
            </strong>
          </div>
        `;
      }).join("");

  } catch (error) {
    console.error(error);
    status("❌ " + esc(error.message));
  }
}

async function remoteCards(uid) {
  const snap = await getDocs(
    collection(
      db,
      "users",
      uid,
      "cards"
    )
  );

  return snap.docs
    .map(d => d.data())
    .filter(
      x =>
        x
        &&
        !x.deleted
        &&
        x.item
    );
}

function itemName(item) {
  return (
    item?.name
    ||
    item?.card?.name
    ||
    item?.cardName
    ||
    "Carta"
  );
}

function itemImage(item) {
  const image =
    item?.image
    ||
    item?.imageUrl
    ||
    item?.card?.image
    ||
    "";

  if (typeof image === "string") {
    return image;
  }

  return (
    image?.large
    ||
    image?.high
    ||
    image?.small
    ||
    ""
  );
}

function itemQty(item) {
  if (
    Number.isFinite(
      Number(item?.quantity)
    )
  ) {
    return Number(item.quantity);
  }

  if (
    Number.isFinite(
      Number(item?.qty)
    )
  ) {
    return Number(item.qty);
  }

  if (Array.isArray(item?.copies)) {
    return Math.max(
      1,
      item.copies.length
    );
  }

  return 1;
}

function cardsHTML(rows) {
  if (!rows.length) {
    return `
      <div class="v234-status">
        No hay cartas para mostrar.
      </div>
    `;
  }

  return `
    <div class="v234-grid">
      ${rows.slice(0, 120).map(row => {
        const item = row.item || {};
        const image = itemImage(item);

        return `
          <div class="v234-mini">
            ${
              image
                ? `<img
                     src="${esc(image)}"
                     loading="lazy">`
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

async function showCollection(uid) {
  try {
    const p = await getProfile(uid);
    const rows = await remoteCards(uid);

    area().innerHTML = `
      <button
        id="f232-back"
        class="v234-btn v234-blue"
        style="margin-bottom:12px">
        ← Volver
      </button>

      <div class="v234-card">
        <div class="v234-user">
          @${esc(p?.username || "Usuario")}
        </div>

        <div class="v234-muted">
          ${rows.length}
          cartas distintas
        </div>
      </div>

      ${cardsHTML(rows)}
    `;

    document.querySelector("#f232-back")
      .onclick = renderFriends;

  } catch (error) {
    status(
      "❌ No se pudo abrir la colección: "
      + esc(error.message)
    );
  }
}

function openLocalDB() {
  return new Promise((resolve, reject) => {
    const req =
      indexedDB.open(LOCAL_DB);

    req.onerror =
      () => reject(req.error);

    req.onsuccess = () => {
      const database = req.result;

      if (
        !database.objectStoreNames.contains(
          LOCAL_STORE
        )
      ) {
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

async function localCards() {
  const database =
    await openLocalDB();

  return new Promise((resolve, reject) => {
    const tx =
      database.transaction(
        LOCAL_STORE,
        "readonly"
      );

    const store =
      tx.objectStore(LOCAL_STORE);

    const req =
      store.openCursor();

    const rows = [];

    req.onerror =
      () => reject(req.error);

    req.onsuccess = () => {
      const cursor = req.result;

      if (!cursor) return;

      rows.push({
        key: String(cursor.key),
        item: cursor.value
      });

      cursor.continue();
    };

    tx.oncomplete = () => {
      database.close();
      resolve(rows);
    };
  });
}

async function compareCollection(uid) {
  try {
    const p = await getProfile(uid);

    const [mine, theirs] =
      await Promise.all([
        localCards(),
        remoteCards(uid)
      ]);

    const mineKeys =
      new Set(
        mine.map(x => String(x.key))
      );

    const theirKeys =
      new Set(
        theirs.map(x => String(x.key))
      );

    const common =
      [...mineKeys]
        .filter(
          k => theirKeys.has(k)
        );

    const onlyMine =
      mine.filter(
        x => !theirKeys.has(String(x.key))
      );

    const onlyTheirs =
      theirs.filter(
        x => !mineKeys.has(String(x.key))
      );

    area().innerHTML = `
      <button
        id="f232-back"
        class="v234-btn v234-blue"
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
          Cartas que tiene
          @${esc(p?.username || "Usuario")}
          y tú no
        </strong>

        ${cardsHTML(onlyTheirs)}
      </div>
    `;

    document.querySelector("#f232-back")
      .onclick = renderFriends;

  } catch (error) {
    status(
      "❌ No se pudo comparar: "
      + esc(error.message)
    );
  }
}

async function openFriends() {
  if (!auth.currentUser) {
    alert(
      "Primero inicia sesión en tu cuenta PokEX."
    );

    return;
  }

  await refreshMe();

  overlay();

  renderFriends();
}

function installButton() {
  const old =
    document.querySelector(
      "#v23-friends-home"
    );

  if (!old) return;

  if (
    old.dataset.friends232 === "1"
  ) {
    return;
  }

  const fresh =
    old.cloneNode(true);

  fresh.dataset.friends232 = "1";

  old.replaceWith(fresh);

  fresh.onclick =
    openFriends;
}

setInterval(
  installButton,
  1000
);

onAuthStateChanged(
  auth,
  async user => {
    if (user) {
      await refreshMe();
    } else {
      meProfile = null;
    }

    setTimeout(
      installButton,
      100
    );
  }
);

window.PokEXFriends232 = {
  open: openFriends
};

console.log(
  "✅ PokEX Friends Reset v2.3.2"
);
