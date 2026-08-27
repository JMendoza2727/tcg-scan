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
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const VERSION = "3.3";
const cfg = window.POKEX_FIREBASE_CONFIG || {};
const configured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = configured
  ? (getApps().length ? getApp() : initializeApp(cfg))
  : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

let currentUser = null;
let currentProfile = null;
let requestUnsubscribe = null;
let pendingCount = 0;
let activeTab = "friends";
let busy = false;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 24);
}

function avatar(profile) {
  const value = String(profile?.avatar || "").trim();
  return value || "😎";
}

function profileName(profile) {
  return profile?.username || "Entrenador";
}

function money(value) {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number.toFixed(2) : "0.00"} €`;
}

function friendLinkId(ownerUid, friendUid) {
  return `${ownerUid}__${friendUid}`;
}

function requestId(fromUid, toUid) {
  return `${fromUid}__${toUid}`;
}

function blockId(blockerUid, blockedUid) {
  return `${blockerUid}__${blockedUid}`;
}

function overlay() {
  let el = document.getElementById("pokexFriendsV33Overlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "pokexFriendsV33Overlay";
  el.className = "f33-overlay hidden";
  el.innerHTML = `
    <section class="f33-sheet" role="dialog" aria-modal="true" aria-label="Amigos PokEX">
      <header class="f33-head">
        <div>
          <small>PokEX Social</small>
          <strong>Amigos</strong>
        </div>
        <button class="f33-close" type="button" data-f33-close aria-label="Cerrar">×</button>
      </header>
      <nav class="f33-tabs" aria-label="Secciones de amigos">
        <button type="button" class="active" data-f33-tab="friends">Amigos</button>
        <button type="button" data-f33-tab="search">Buscar</button>
        <button type="button" data-f33-tab="requests">
          Solicitudes <span class="f33-tab-badge" data-f33-request-count hidden></span>
        </button>
      </nav>
      <div class="f33-body" id="f33Body"></div>
    </section>
  `;

  document.body.appendChild(el);

  el.querySelector("[data-f33-close]")?.addEventListener("click", closeFriends);
  el.addEventListener("click", event => {
    if (event.target === el) closeFriends();
  });

  el.querySelectorAll("[data-f33-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.f33Tab;
      el.querySelectorAll("[data-f33-tab]").forEach(item => {
        item.classList.toggle("active", item === button);
      });
      renderActiveTab();
    });
  });

  refreshBadges();
  return el;
}

function setModalOpen(open) {
  document.documentElement.classList.toggle("f33-modal-open", open);
  document.body.classList.toggle("f33-modal-open", open);
}

function closeFriends() {
  const el = document.getElementById("pokexFriendsV33Overlay");
  if (!el) return;
  el.classList.add("hidden");
  setModalOpen(false);
}

async function openFriends(tab = "friends") {
  activeTab = tab;
  const el = overlay();
  el.classList.remove("hidden");
  setModalOpen(true);

  el.querySelectorAll("[data-f33-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.f33Tab === activeTab);
  });

  await renderActiveTab();
}

function installLauncher() {
  if (document.getElementById("pokexFriendsV33Button")) return;

  const nav = document.querySelector(".pokedex-nav");
  if (!nav) {
    window.setTimeout(installLauncher, 160);
    return;
  }

  const button = document.createElement("button");
  button.id = "pokexFriendsV33Button";
  button.type = "button";
  button.className = "f33-launch";
  button.innerHTML = `
    <span class="f33-launch-icon" aria-hidden="true">👥</span>
    <span class="f33-launch-copy">
      <strong>Amigos</strong>
      <small data-f33-launch-subtitle>Conecta con otros entrenadores</small>
    </span>
    <span class="f33-launch-badge" data-f33-request-count hidden></span>
    <span class="f33-launch-arrow" aria-hidden="true">›</span>
  `;
  button.addEventListener("click", () => openFriends(pendingCount ? "requests" : "friends"));
  nav.insertAdjacentElement("afterend", button);
}

function refreshBadges() {
  document.querySelectorAll("[data-f33-request-count]").forEach(el => {
    el.hidden = pendingCount < 1;
    el.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
  });

  const subtitle = document.querySelector("[data-f33-launch-subtitle]");
  if (subtitle) {
    subtitle.textContent = pendingCount
      ? `${pendingCount} solicitud${pendingCount === 1 ? "" : "es"} pendiente${pendingCount === 1 ? "" : "s"}`
      : (currentUser ? "Tus amigos PokEX" : "Inicia sesión para usar Amigos");
  }
}

function body() {
  return document.getElementById("f33Body");
}

function renderState(message, detail = "") {
  const holder = body();
  if (!holder) return;
  holder.innerHTML = `
    <div class="f33-state">
      <div class="f33-state-icon">👥</div>
      <strong>${esc(message)}</strong>
      ${detail ? `<p>${esc(detail)}</p>` : ""}
    </div>
  `;
}

async function loadProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

async function friendLinks() {
  if (!currentUser) return [];
  const snap = await getDocs(
    query(
      collection(db, "friendLinks"),
      where("ownerUid", "==", currentUser.uid)
    )
  );
  return snap.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function blockedUsers() {
  if (!currentUser) return [];
  const snap = await getDocs(
    query(
      collection(db, "blocks"),
      where("blockerUid", "==", currentUser.uid)
    )
  );
  return snap.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function pendingIncoming() {
  if (!currentUser) return [];
  const snap = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("toUid", "==", currentUser.uid)
    )
  );
  return snap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.status === "pending");
}

async function pendingOutgoing() {
  if (!currentUser) return [];
  const snap = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("fromUid", "==", currentUser.uid)
    )
  );
  return snap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.status === "pending");
}

async function searchUser(usernameRaw) {
  const usernameLower = normalizeUsername(usernameRaw);
  if (usernameLower.length < 3) {
    throw new Error("Escribe al menos 3 caracteres del usuario exacto.");
  }

  const usernameSnap = await getDoc(doc(db, "usernames", usernameLower));
  if (!usernameSnap.exists()) return null;

  const uid = usernameSnap.data()?.uid;
  if (!uid || uid === currentUser?.uid) return null;
  return loadProfile(uid);
}

async function relationshipState(otherUid) {
  const [link, outgoing, incoming, blocked] = await Promise.all([
    getDoc(doc(db, "friendLinks", friendLinkId(currentUser.uid, otherUid))),
    getDoc(doc(db, "friendRequests", requestId(currentUser.uid, otherUid))),
    getDoc(doc(db, "friendRequests", requestId(otherUid, currentUser.uid))),
    getDoc(doc(db, "blocks", blockId(currentUser.uid, otherUid)))
  ]);

  return {
    friend: link.exists(),
    outgoing: outgoing.exists() && outgoing.data()?.status === "pending",
    incoming: incoming.exists() && incoming.data()?.status === "pending",
    blocked: blocked.exists()
  };
}

async function sendRequest(profile) {
  if (!currentUser || !profile?.uid || busy) return;
  busy = true;
  try {
    const state = await relationshipState(profile.uid);
    if (state.blocked) throw new Error("Primero desbloquea a este usuario.");
    if (state.friend) throw new Error("Ya sois amigos.");
    if (state.incoming) {
      await acceptRequest({
        id: requestId(profile.uid, currentUser.uid),
        fromUid: profile.uid,
        toUid: currentUser.uid
      });
      return;
    }
    if (state.outgoing) return;

    await setDoc(
      doc(db, "friendRequests", requestId(currentUser.uid, profile.uid)),
      {
        fromUid: currentUser.uid,
        toUid: profile.uid,
        status: "pending",
        createdAt: Date.now()
      }
    );
  } finally {
    busy = false;
  }
}

async function acceptRequest(request) {
  if (!currentUser || busy) return;
  busy = true;
  try {
    const batch = writeBatch(db);
    const requestRef = doc(db, "friendRequests", request.id);

    batch.set(
      requestRef,
      {
        status: "accepted",
        acceptedAt: Date.now()
      },
      { merge: true }
    );

    batch.set(
      doc(db, "friendLinks", friendLinkId(request.fromUid, request.toUid)),
      {
        ownerUid: request.fromUid,
        friendUid: request.toUid,
        createdAt: Date.now()
      }
    );

    batch.set(
      doc(db, "friendLinks", friendLinkId(request.toUid, request.fromUid)),
      {
        ownerUid: request.toUid,
        friendUid: request.fromUid,
        createdAt: Date.now()
      }
    );

    await batch.commit();
  } finally {
    busy = false;
  }
}

async function rejectRequest(request) {
  if (!currentUser || busy) return;
  busy = true;
  try {
    await deleteDoc(doc(db, "friendRequests", request.id));
  } finally {
    busy = false;
  }
}

async function removeFriend(otherUid) {
  if (!currentUser || !otherUid || busy) return;
  if (!window.confirm("¿Eliminar a este usuario de tus amigos?")) return;

  busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "friendLinks", friendLinkId(currentUser.uid, otherUid)));
    batch.delete(doc(db, "friendLinks", friendLinkId(otherUid, currentUser.uid)));

    const requestA = doc(db, "friendRequests", requestId(currentUser.uid, otherUid));
    const requestB = doc(db, "friendRequests", requestId(otherUid, currentUser.uid));
    const [snapA, snapB] = await Promise.all([getDoc(requestA), getDoc(requestB)]);
    if (snapA.exists()) batch.delete(requestA);
    if (snapB.exists()) batch.delete(requestB);

    await batch.commit();
  } finally {
    busy = false;
  }
}

async function blockUser(otherUid) {
  if (!currentUser || !otherUid || busy) return;
  if (!window.confirm("¿Bloquear a este usuario? Se eliminará de tus amigos y no podrá enviarte solicitudes.")) return;

  busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, "blocks", blockId(currentUser.uid, otherUid)),
      {
        blockerUid: currentUser.uid,
        blockedUid: otherUid,
        createdAt: Date.now()
      }
    );
    batch.delete(doc(db, "friendLinks", friendLinkId(currentUser.uid, otherUid)));
    batch.delete(doc(db, "friendLinks", friendLinkId(otherUid, currentUser.uid)));

    const requestA = doc(db, "friendRequests", requestId(currentUser.uid, otherUid));
    const requestB = doc(db, "friendRequests", requestId(otherUid, currentUser.uid));
    const [snapA, snapB] = await Promise.all([getDoc(requestA), getDoc(requestB)]);
    if (snapA.exists()) batch.delete(requestA);
    if (snapB.exists()) batch.delete(requestB);

    await batch.commit();
  } finally {
    busy = false;
  }
}

async function unblockUser(otherUid) {
  if (!currentUser || !otherUid || busy) return;
  busy = true;
  try {
    await deleteDoc(doc(db, "blocks", blockId(currentUser.uid, otherUid)));
  } finally {
    busy = false;
  }
}

function profileRow(profile, actions = "") {
  return `
    <article class="f33-user-card">
      <div class="f33-user-main">
        <span class="f33-avatar" aria-hidden="true">${esc(avatar(profile))}</span>
        <div class="f33-user-copy">
          <strong>@${esc(profileName(profile))}</strong>
          <small>${Number(profile?.cardsCount || 0)} cartas · ${money(profile?.collectionValue)}</small>
        </div>
      </div>
      ${actions ? `<div class="f33-actions">${actions}</div>` : ""}
    </article>
  `;
}

async function renderFriendsTab() {
  const holder = body();
  if (!holder) return;
  holder.innerHTML = `<div class="f33-loading">Cargando amigos…</div>`;

  const [links, blocks] = await Promise.all([friendLinks(), blockedUsers()]);
  const profiles = await Promise.all(links.map(link => loadProfile(link.friendUid)));
  const blockedProfiles = await Promise.all(blocks.map(item => loadProfile(item.blockedUid)));

  const valid = profiles.filter(Boolean);
  holder.innerHTML = `
    <div class="f33-section-head">
      <div>
        <strong>${valid.length} amigo${valid.length === 1 ? "" : "s"}</strong>
        <small>Las colecciones y rankings llegarán en la siguiente fase.</small>
      </div>
    </div>
    ${valid.length
      ? `<div class="f33-list">${valid.map(profile => profileRow(
          profile,
          `<button type="button" class="f33-soft" data-f33-remove="${esc(profile.uid)}">Eliminar</button>
           <button type="button" class="f33-danger" data-f33-block="${esc(profile.uid)}">Bloquear</button>`
        )).join("")}</div>`
      : `<div class="f33-empty"><span>🤝</span><strong>Aún no tienes amigos</strong><p>Busca a otro entrenador por su @usuario.</p><button type="button" class="f33-primary" data-f33-go-search>Buscar entrenador</button></div>`}
    ${blockedProfiles.filter(Boolean).length
      ? `<details class="f33-blocked"><summary>Usuarios bloqueados (${blockedProfiles.filter(Boolean).length})</summary><div class="f33-list">${blockedProfiles.filter(Boolean).map(profile => profileRow(profile, `<button type="button" class="f33-soft" data-f33-unblock="${esc(profile.uid)}">Desbloquear</button>`)).join("")}</div></details>`
      : ""}
  `;

  holder.querySelector("[data-f33-go-search]")?.addEventListener("click", () => {
    activeTab = "search";
    overlay().querySelector('[data-f33-tab="search"]')?.click();
  });
  holder.querySelectorAll("[data-f33-remove]").forEach(button => {
    button.addEventListener("click", async () => {
      await removeFriend(button.dataset.f33Remove);
      await renderFriendsTab();
    });
  });
  holder.querySelectorAll("[data-f33-block]").forEach(button => {
    button.addEventListener("click", async () => {
      await blockUser(button.dataset.f33Block);
      await renderFriendsTab();
    });
  });
  holder.querySelectorAll("[data-f33-unblock]").forEach(button => {
    button.addEventListener("click", async () => {
      await unblockUser(button.dataset.f33Unblock);
      await renderFriendsTab();
    });
  });
}

async function renderSearchTab() {
  const holder = body();
  if (!holder) return;
  holder.innerHTML = `
    <div class="f33-search-card">
      <label for="f33SearchInput">Buscar por @usuario exacto</label>
      <div class="f33-search-row">
        <input id="f33SearchInput" type="search" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@usuario">
        <button type="button" class="f33-primary" id="f33SearchButton">Buscar</button>
      </div>
      <small>No cargamos una lista global: así gastamos menos Firebase y protegemos mejor los perfiles.</small>
    </div>
    <div id="f33SearchResult"></div>
  `;

  const input = holder.querySelector("#f33SearchInput");
  const button = holder.querySelector("#f33SearchButton");
  const result = holder.querySelector("#f33SearchResult");

  const run = async () => {
    result.innerHTML = `<div class="f33-loading">Buscando…</div>`;
    try {
      const profile = await searchUser(input.value);
      if (!profile) {
        result.innerHTML = `<div class="f33-empty compact"><span>🔎</span><strong>No encontrado</strong><p>Comprueba el @usuario exacto.</p></div>`;
        return;
      }

      const state = await relationshipState(profile.uid);
      let action = "";
      if (state.blocked) {
        action = `<button type="button" class="f33-soft" data-f33-search-unblock="${esc(profile.uid)}">Desbloquear</button>`;
      } else if (state.friend) {
        action = `<span class="f33-status ok">✓ Ya sois amigos</span>`;
      } else if (state.incoming) {
        action = `<button type="button" class="f33-primary" data-f33-search-accept="${esc(profile.uid)}">Aceptar solicitud</button>`;
      } else if (state.outgoing) {
        action = `<span class="f33-status">Solicitud enviada</span>`;
      } else {
        action = `<button type="button" class="f33-primary" data-f33-search-add="${esc(profile.uid)}">Añadir amigo</button>`;
      }

      result.innerHTML = `<div class="f33-list">${profileRow(profile, action)}</div>`;
      result.querySelector("[data-f33-search-add]")?.addEventListener("click", async event => {
        await sendRequest(profile);
        event.currentTarget.textContent = "Enviada ✓";
        event.currentTarget.disabled = true;
      });
      result.querySelector("[data-f33-search-accept]")?.addEventListener("click", async () => {
        await acceptRequest({
          id: requestId(profile.uid, currentUser.uid),
          fromUid: profile.uid,
          toUid: currentUser.uid
        });
        await run();
      });
      result.querySelector("[data-f33-search-unblock]")?.addEventListener("click", async () => {
        await unblockUser(profile.uid);
        await run();
      });
    } catch (error) {
      result.innerHTML = `<div class="f33-message error">${esc(error?.message || "No se pudo realizar la búsqueda.")}</div>`;
    }
  };

  button.addEventListener("click", run);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") run();
  });
}

async function renderRequestsTab() {
  const holder = body();
  if (!holder) return;
  holder.innerHTML = `<div class="f33-loading">Cargando solicitudes…</div>`;

  const [incoming, outgoing] = await Promise.all([pendingIncoming(), pendingOutgoing()]);
  const incomingProfiles = await Promise.all(incoming.map(item => loadProfile(item.fromUid)));
  const outgoingProfiles = await Promise.all(outgoing.map(item => loadProfile(item.toUid)));

  holder.innerHTML = `
    <section class="f33-request-section">
      <div class="f33-section-head"><div><strong>Recibidas</strong><small>${incoming.length} pendiente${incoming.length === 1 ? "" : "s"}</small></div></div>
      ${incoming.length
        ? `<div class="f33-list">${incoming.map((request, index) => {
            const profile = incomingProfiles[index];
            if (!profile) return "";
            return profileRow(profile, `<button type="button" class="f33-primary" data-f33-accept="${esc(request.id)}">Aceptar</button><button type="button" class="f33-soft" data-f33-reject="${esc(request.id)}">Rechazar</button>`);
          }).join("")}</div>`
        : `<div class="f33-empty compact"><span>📭</span><strong>Sin solicitudes nuevas</strong></div>`}
    </section>
    <section class="f33-request-section">
      <div class="f33-section-head"><div><strong>Enviadas</strong><small>${outgoing.length} pendiente${outgoing.length === 1 ? "" : "s"}</small></div></div>
      ${outgoing.length
        ? `<div class="f33-list">${outgoing.map((request, index) => {
            const profile = outgoingProfiles[index];
            if (!profile) return "";
            return profileRow(profile, `<button type="button" class="f33-soft" data-f33-cancel="${esc(request.id)}">Cancelar</button>`);
          }).join("")}</div>`
        : `<div class="f33-empty compact"><span>📤</span><strong>No tienes solicitudes enviadas</strong></div>`}
    </section>
  `;

  const incomingById = new Map(incoming.map(item => [item.id, item]));
  holder.querySelectorAll("[data-f33-accept]").forEach(button => {
    button.addEventListener("click", async () => {
      await acceptRequest(incomingById.get(button.dataset.f33Accept));
      await renderRequestsTab();
    });
  });
  holder.querySelectorAll("[data-f33-reject]").forEach(button => {
    button.addEventListener("click", async () => {
      await rejectRequest(incomingById.get(button.dataset.f33Reject));
      await renderRequestsTab();
    });
  });
  holder.querySelectorAll("[data-f33-cancel]").forEach(button => {
    button.addEventListener("click", async () => {
      await deleteDoc(doc(db, "friendRequests", button.dataset.f33Cancel));
      await renderRequestsTab();
    });
  });
}

async function renderActiveTab() {
  if (!configured) {
    renderState("Amigos no disponible", "Firebase no está configurado en esta instalación.");
    return;
  }
  if (!currentUser) {
    renderState("Inicia sesión para usar Amigos", "Abre Cuenta PokEX, inicia sesión y vuelve aquí.");
    return;
  }

  try {
    if (activeTab === "search") await renderSearchTab();
    else if (activeTab === "requests") await renderRequestsTab();
    else await renderFriendsTab();
  } catch (error) {
    console.warn("PokEX Friends v3.3:", error);
    renderState("No se pudo cargar Amigos", error?.message || "Comprueba tu conexión e inténtalo de nuevo.");
  }
}

function watchRequests() {
  requestUnsubscribe?.();
  requestUnsubscribe = null;
  pendingCount = 0;
  refreshBadges();

  if (!currentUser || !db) return;

  requestUnsubscribe = onSnapshot(
    query(
      collection(db, "friendRequests"),
      where("toUid", "==", currentUser.uid)
    ),
    snapshot => {
      pendingCount = snapshot.docs.filter(item => item.data()?.status === "pending").length;
      refreshBadges();
      const el = document.getElementById("pokexFriendsV33Overlay");
      if (el && !el.classList.contains("hidden") && activeTab === "requests") {
        renderRequestsTab();
      }
    },
    error => console.warn("PokEX Friends requests:", error)
  );
}

async function updateV33Profile() {
  if (!currentUser || !db) return;
  try {
    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        lastSeenVersion: VERSION,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (_) {}
}

function applyVersion() {
  document.title = `PokEX ${VERSION}`;
  document.querySelectorAll(".pokex-version").forEach(el => {
    el.textContent = `v${VERSION}`;
  });
}

installLauncher();
applyVersion();
window.addEventListener("pokex:account-button-ready", installLauncher);

if (auth) {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    currentProfile = user ? await loadProfile(user.uid).catch(() => null) : null;
    applyVersion();
    installLauncher();
    refreshBadges();
    watchRequests();
    if (user) await updateV33Profile();
  });
}

window.PokEXFriendsV33 = {
  open: openFriends,
  close: closeFriends,
  version: VERSION
};

console.log("✅ PokEX Friends v3.3 cargado");
