import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs,
  query, where, writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const VERSION = "3.3";
const cfg = window.POKEX_FIREBASE_CONFIG || {};
const configured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = configured ? (getApps().length ? getApp() : initializeApp(cfg)) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

let user = null;
let pendingCount = 0;
let activeTab = "friends";
let unsubscribe = null;
let busy = false;

const esc = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const normalizeUsername = value => String(value || "")
  .trim().replace(/^@+/, "").toLowerCase().replace(/\s+/g, "")
  .replace(/[^a-z0-9_.-]/g, "").slice(0, 24);

const rid = (a, b) => `${a}__${b}`;
const profileName = profile => profile?.username || "Entrenador";
const avatar = profile => String(profile?.avatar || "").trim() || "😎";
const money = value => `${(Number(value) || 0).toFixed(2)} €`;

async function profile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

function modal() {
  let root = document.getElementById("pokexFriendsV33Overlay");
  if (root) return root;
  root = document.createElement("div");
  root.id = "pokexFriendsV33Overlay";
  root.className = "f33-overlay hidden";
  root.innerHTML = `
    <section class="f33-sheet" role="dialog" aria-modal="true" aria-label="Amigos PokEX">
      <header class="f33-head"><div><small>PokEX Social</small><strong>Amigos</strong></div><button class="f33-close" type="button" data-close aria-label="Cerrar">×</button></header>
      <nav class="f33-tabs">
        <button type="button" data-tab="friends" class="active">Amigos</button>
        <button type="button" data-tab="search">Buscar</button>
        <button type="button" data-tab="requests">Solicitudes <span class="f33-tab-badge" data-count hidden></span></button>
      </nav>
      <div class="f33-body" id="f33Body"></div>
    </section>`;
  document.body.appendChild(root);
  root.querySelector("[data-close]").onclick = close;
  root.onclick = event => { if (event.target === root) close(); };
  root.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      activeTab = button.dataset.tab;
      root.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("active", item === button));
      render();
    };
  });
  refreshBadges();
  return root;
}

function close() {
  document.getElementById("pokexFriendsV33Overlay")?.classList.add("hidden");
  document.documentElement.classList.remove("f33-modal-open");
  document.body.classList.remove("f33-modal-open");
}

async function open(tab = "friends") {
  activeTab = tab;
  const root = modal();
  root.classList.remove("hidden");
  document.documentElement.classList.add("f33-modal-open");
  document.body.classList.add("f33-modal-open");
  root.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  await render();
}

function installLauncher() {
  if (document.getElementById("pokexFriendsV33Button")) return;
  const nav = document.querySelector(".pokedex-nav");
  if (!nav) return void setTimeout(installLauncher, 160);
  const button = document.createElement("button");
  button.id = "pokexFriendsV33Button";
  button.type = "button";
  button.className = "f33-launch";
  button.innerHTML = `<span class="f33-launch-icon">👥</span><span class="f33-launch-copy"><strong>Amigos</strong><small data-subtitle>Conecta con otros entrenadores</small></span><span class="f33-launch-badge" data-count hidden></span><span class="f33-launch-arrow">›</span>`;
  button.onclick = () => open(pendingCount ? "requests" : "friends");
  nav.insertAdjacentElement("afterend", button);
}

function refreshBadges() {
  document.querySelectorAll("[data-count]").forEach(el => {
    el.hidden = pendingCount < 1;
    el.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
  });
  const subtitle = document.querySelector("[data-subtitle]");
  if (subtitle) subtitle.textContent = pendingCount
    ? `${pendingCount} solicitud${pendingCount === 1 ? "" : "es"} pendiente${pendingCount === 1 ? "" : "s"}`
    : (user ? "Tus amigos PokEX" : "Inicia sesión para usar Amigos");
}

function holder() { return document.getElementById("f33Body"); }
function state(title, detail = "") {
  const el = holder();
  if (el) el.innerHTML = `<div class="f33-state"><div class="f33-state-icon">👥</div><strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ""}</div>`;
}

async function ownedLinks() {
  if (!user) return [];
  const snap = await getDocs(query(collection(db, "friendLinks"), where("ownerUid", "==", user.uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function blocks() {
  if (!user) return [];
  const snap = await getDocs(query(collection(db, "blocks"), where("blockerUid", "==", user.uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function requests(field) {
  if (!user) return [];
  const snap = await getDocs(query(collection(db, "friendRequests"), where(field, "==", user.uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.status === "pending");
}

async function relationship(otherUid) {
  const [friend, outgoing, incoming, blocked] = await Promise.all([
    getDoc(doc(db, "friendLinks", rid(user.uid, otherUid))),
    getDoc(doc(db, "friendRequests", rid(user.uid, otherUid))),
    getDoc(doc(db, "friendRequests", rid(otherUid, user.uid))),
    getDoc(doc(db, "blocks", rid(user.uid, otherUid)))
  ]);
  return {
    friend: friend.exists(), blocked: blocked.exists(),
    outgoing: outgoing.exists() && outgoing.data()?.status === "pending",
    incoming: incoming.exists() && incoming.data()?.status === "pending"
  };
}

async function findUser(raw) {
  const username = normalizeUsername(raw);
  if (username.length < 3) throw new Error("Escribe al menos 3 caracteres del @usuario exacto.");
  const snap = await getDoc(doc(db, "usernames", username));
  if (!snap.exists()) return null;
  const uid = snap.data()?.uid;
  return !uid || uid === user?.uid ? null : profile(uid);
}

async function send(profileData) {
  if (!user || !profileData?.uid || busy) return;
  const rel = await relationship(profileData.uid);
  if (rel.blocked) throw new Error("Primero desbloquea a este usuario.");
  if (rel.friend || rel.outgoing) return;
  if (rel.incoming) return accept({ id: rid(profileData.uid, user.uid), fromUid: profileData.uid, toUid: user.uid });
  busy = true;
  try {
    await setDoc(doc(db, "friendRequests", rid(user.uid, profileData.uid)), {
      fromUid: user.uid, toUid: profileData.uid, status: "pending", createdAt: Date.now()
    });
  } finally { busy = false; }
}

async function accept(request) {
  if (!request || busy) return;
  busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "friendRequests", request.id), { status: "accepted", acceptedAt: Date.now() }, { merge: true });
    batch.set(doc(db, "friendLinks", rid(request.fromUid, request.toUid)), { ownerUid: request.fromUid, friendUid: request.toUid, createdAt: Date.now() });
    batch.set(doc(db, "friendLinks", rid(request.toUid, request.fromUid)), { ownerUid: request.toUid, friendUid: request.fromUid, createdAt: Date.now() });
    await batch.commit();
  } finally { busy = false; }
}

async function reject(request) {
  if (!request || busy) return;
  busy = true;
  try { await deleteDoc(doc(db, "friendRequests", request.id)); }
  finally { busy = false; }
}

async function removeFriend(otherUid, ask = true) {
  if (!user || !otherUid || busy) return;
  if (ask && !confirm("¿Eliminar a este usuario de tus amigos?")) return;
  busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "friendLinks", rid(user.uid, otherUid)));
    batch.delete(doc(db, "friendLinks", rid(otherUid, user.uid)));
    const refs = [doc(db, "friendRequests", rid(user.uid, otherUid)), doc(db, "friendRequests", rid(otherUid, user.uid))];
    const snaps = await Promise.all(refs.map(ref => getDoc(ref)));
    snaps.forEach((snap, i) => { if (snap.exists()) batch.delete(refs[i]); });
    await batch.commit();
  } finally { busy = false; }
}

async function block(otherUid) {
  if (!user || !otherUid || busy || !confirm("¿Bloquear a este usuario? Se eliminará de tus amigos y no podrá enviarte solicitudes.")) return;
  await removeFriend(otherUid, false);
  busy = true;
  try {
    await setDoc(doc(db, "blocks", rid(user.uid, otherUid)), { blockerUid: user.uid, blockedUid: otherUid, createdAt: Date.now() });
  } finally { busy = false; }
}

async function unblock(otherUid) {
  if (!user || !otherUid || busy) return;
  busy = true;
  try { await deleteDoc(doc(db, "blocks", rid(user.uid, otherUid))); }
  finally { busy = false; }
}

function row(profileData, actions = "") {
  return `<article class="f33-user-card"><div class="f33-user-main"><span class="f33-avatar">${esc(avatar(profileData))}</span><div class="f33-user-copy"><strong>@${esc(profileName(profileData))}</strong><small>${Number(profileData?.cardsCount || 0)} cartas · ${money(profileData?.collectionValue)}</small></div></div>${actions ? `<div class="f33-actions">${actions}</div>` : ""}</article>`;
}

async function renderFriends() {
  const el = holder();
  el.innerHTML = `<div class="f33-loading">Cargando amigos…</div>`;
  const [links, blocked] = await Promise.all([ownedLinks(), blocks()]);
  const profiles = (await Promise.all(links.map(link => profile(link.friendUid)))).filter(Boolean);
  const blockedProfiles = (await Promise.all(blocked.map(item => profile(item.blockedUid)))).filter(Boolean);
  el.innerHTML = `<div class="f33-section-head"><div><strong>${profiles.length} amigo${profiles.length === 1 ? "" : "s"}</strong><small>Colecciones y rankings llegarán en la siguiente fase.</small></div></div>
    ${profiles.length ? `<div class="f33-list">${profiles.map(p => row(p, `<button class="f33-soft" data-remove="${esc(p.uid)}">Eliminar</button><button class="f33-danger" data-block="${esc(p.uid)}">Bloquear</button>`)).join("")}</div>` : `<div class="f33-empty"><span>🤝</span><strong>Aún no tienes amigos</strong><p>Busca a otro entrenador por su @usuario.</p><button class="f33-primary" data-search>Buscar entrenador</button></div>`}
    ${blockedProfiles.length ? `<details class="f33-blocked"><summary>Usuarios bloqueados (${blockedProfiles.length})</summary><div class="f33-list">${blockedProfiles.map(p => row(p, `<button class="f33-soft" data-unblock="${esc(p.uid)}">Desbloquear</button>`)).join("")}</div></details>` : ""}`;
  el.querySelector("[data-search]")?.addEventListener("click", () => modal().querySelector('[data-tab="search"]')?.click());
  el.querySelectorAll("[data-remove]").forEach(b => b.onclick = async () => { await removeFriend(b.dataset.remove); await renderFriends(); });
  el.querySelectorAll("[data-block]").forEach(b => b.onclick = async () => { await block(b.dataset.block); await renderFriends(); });
  el.querySelectorAll("[data-unblock]").forEach(b => b.onclick = async () => { await unblock(b.dataset.unblock); await renderFriends(); });
}

async function renderSearch() {
  const el = holder();
  el.innerHTML = `<div class="f33-search-card"><label for="f33SearchInput">Buscar por @usuario exacto</label><div class="f33-search-row"><input id="f33SearchInput" type="search" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@usuario"><button class="f33-primary" id="f33SearchButton">Buscar</button></div><small>No cargamos una lista global: así gastamos menos Firebase y protegemos mejor los perfiles.</small></div><div id="f33SearchResult"></div>`;
  const input = el.querySelector("#f33SearchInput");
  const result = el.querySelector("#f33SearchResult");
  const run = async () => {
    result.innerHTML = `<div class="f33-loading">Buscando…</div>`;
    try {
      const p = await findUser(input.value);
      if (!p) return void (result.innerHTML = `<div class="f33-empty compact"><span>🔎</span><strong>No encontrado</strong><p>Comprueba el @usuario exacto.</p></div>`);
      const rel = await relationship(p.uid);
      const action = rel.blocked ? `<button class="f33-soft" data-unblock>Desbloquear</button>`
        : rel.friend ? `<span class="f33-status ok">✓ Ya sois amigos</span>`
        : rel.incoming ? `<button class="f33-primary" data-accept>Aceptar solicitud</button>`
        : rel.outgoing ? `<span class="f33-status">Solicitud enviada</span>`
        : `<button class="f33-primary" data-add>Añadir amigo</button>`;
      result.innerHTML = `<div class="f33-list">${row(p, action)}</div>`;
      result.querySelector("[data-add]")?.addEventListener("click", async event => { await send(p); event.currentTarget.textContent = "Enviada ✓"; event.currentTarget.disabled = true; });
      result.querySelector("[data-accept]")?.addEventListener("click", async () => { await accept({ id: rid(p.uid, user.uid), fromUid: p.uid, toUid: user.uid }); await run(); });
      result.querySelector("[data-unblock]")?.addEventListener("click", async () => { await unblock(p.uid); await run(); });
    } catch (error) { result.innerHTML = `<div class="f33-message error">${esc(error?.message || "No se pudo buscar.")}</div>`; }
  };
  el.querySelector("#f33SearchButton").onclick = run;
  input.onkeydown = event => { if (event.key === "Enter") run(); };
}

async function renderRequests() {
  const el = holder();
  el.innerHTML = `<div class="f33-loading">Cargando solicitudes…</div>`;
  const [incoming, outgoing] = await Promise.all([requests("toUid"), requests("fromUid")]);
  const inProfiles = await Promise.all(incoming.map(item => profile(item.fromUid)));
  const outProfiles = await Promise.all(outgoing.map(item => profile(item.toUid)));
  el.innerHTML = `<section class="f33-request-section"><div class="f33-section-head"><div><strong>Recibidas</strong><small>${incoming.length} pendiente${incoming.length === 1 ? "" : "s"}</small></div></div>${incoming.length ? `<div class="f33-list">${incoming.map((r, i) => inProfiles[i] ? row(inProfiles[i], `<button class="f33-primary" data-accept="${esc(r.id)}">Aceptar</button><button class="f33-soft" data-reject="${esc(r.id)}">Rechazar</button>`) : "").join("")}</div>` : `<div class="f33-empty compact"><span>📭</span><strong>Sin solicitudes nuevas</strong></div>`}</section>
    <section class="f33-request-section"><div class="f33-section-head"><div><strong>Enviadas</strong><small>${outgoing.length} pendiente${outgoing.length === 1 ? "" : "s"}</small></div></div>${outgoing.length ? `<div class="f33-list">${outgoing.map((r, i) => outProfiles[i] ? row(outProfiles[i], `<button class="f33-soft" data-cancel="${esc(r.id)}">Cancelar</button>`) : "").join("")}</div>` : `<div class="f33-empty compact"><span>📤</span><strong>No tienes solicitudes enviadas</strong></div>`}</section>`;
  const byId = new Map(incoming.map(item => [item.id, item]));
  el.querySelectorAll("[data-accept]").forEach(b => b.onclick = async () => { await accept(byId.get(b.dataset.accept)); await renderRequests(); });
  el.querySelectorAll("[data-reject]").forEach(b => b.onclick = async () => { await reject(byId.get(b.dataset.reject)); await renderRequests(); });
  el.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => { await deleteDoc(doc(db, "friendRequests", b.dataset.cancel)); await renderRequests(); });
}

async function render() {
  if (!configured) return state("Amigos no disponible", "Firebase no está configurado en esta instalación.");
  if (!user) return state("Inicia sesión para usar Amigos", "Abre Cuenta PokEX, inicia sesión y vuelve aquí.");
  try {
    if (activeTab === "search") await renderSearch();
    else if (activeTab === "requests") await renderRequests();
    else await renderFriends();
  } catch (error) {
    console.warn("PokEX Friends v3.3:", error);
    state("No se pudo cargar Amigos", error?.message || "Comprueba tu conexión.");
  }
}

function watchRequests() {
  unsubscribe?.();
  unsubscribe = null;
  pendingCount = 0;
  refreshBadges();
  if (!user || !db) return;
  unsubscribe = onSnapshot(
    query(collection(db, "friendRequests"), where("toUid", "==", user.uid)),
    snap => {
      pendingCount = snap.docs.filter(d => d.data()?.status === "pending").length;
      refreshBadges();
      const root = document.getElementById("pokexFriendsV33Overlay");
      if (root && !root.classList.contains("hidden") && activeTab === "requests") renderRequests();
    },
    error => console.warn("PokEX Friends requests:", error)
  );
}

function applyVersion() {
  document.title = `PokEX ${VERSION}`;
  document.querySelectorAll(".pokex-version").forEach(el => el.textContent = `v${VERSION}`);
}

installLauncher();
applyVersion();
window.addEventListener("pokex:account-button-ready", installLauncher);
if (auth) onAuthStateChanged(auth, next => { user = next; applyVersion(); installLauncher(); refreshBadges(); watchRequests(); });

window.PokEXFriendsV33 = { open, close, version: VERSION };
console.log("✅ PokEX Friends v3.3 cargado");
