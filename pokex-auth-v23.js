
import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser
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
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const CURRENT_VERSION = "3.1";
const SEEN_KEY = "pokex_seen_version";
const SYNC_QUEUE_KEY = "pokex_sync_queue_v31";
const ACCOUNT_AVATARS = new Set([
  "😎", "🤠", "🥷", "🧙", "🦸",
  "🧑‍🚀", "🤖", "👻", "🧑‍🎤", "🧑‍💻"
]);
const DEFAULT_ACCOUNT_AVATAR = "😎";

const cfg =
  window.POKEX_FIREBASE_CONFIG || {};

const configured =
  Boolean(
    cfg.apiKey &&
    cfg.authDomain &&
    cfg.projectId &&
    cfg.appId
  );

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let currentProfile = null;
let initialSyncRunning = false;
let syncTimer = null;
let syncNowRunning = false;
let dirtySyncRunning = false;
let fullSyncPending = 0;
let syncRetryDelay = 5000;
const dirtyCards = new Map();

function accountAvatar(profile) {
  return ACCOUNT_AVATARS.has(
    profile?.avatar
  )
    ? profile.avatar
    : DEFAULT_ACCOUNT_AVATAR;
}

function pendingChangeTime(change) {
  return Math.max(
    1,
    Number(
      change?.changedAt ||
      change?.item?.collectionUpdatedAt ||
      Date.now()
    ) || Date.now()
  );
}

function hasPendingSync() {
  return Boolean(
    fullSyncPending ||
    dirtyCards.size
  );
}

function persistSyncQueue() {
  try {
    if (!hasPendingSync()) {
      localStorage.removeItem(
        SYNC_QUEUE_KEY
      );
      return;
    }

    localStorage.setItem(
      SYNC_QUEUE_KEY,
      JSON.stringify({
        full:
          Number(fullSyncPending) || 0,
        cards:
          [...dirtyCards.entries()]
            .map(([key, change]) => ({
              key,
              deleted:
                Boolean(change?.deleted),
              changedAt:
                pendingChangeTime(change)
            }))
      })
    );
  } catch (_) {}
}

function restoreSyncQueue() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(
        SYNC_QUEUE_KEY
      ) || "null"
    );

    fullSyncPending = Math.max(
      0,
      Number(saved?.full) || 0
    );

    for (const change of saved?.cards || []) {
      if (!change?.key)
        continue;

      dirtyCards.set(
        change.key,
        {
          key: change.key,
          item: null,
          deleted:
            Boolean(change.deleted),
          changedAt:
            pendingChangeTime(change)
        }
      );
    }
  } catch (_) {
    fullSyncPending = 0;
    dirtyCards.clear();
  }
}

function currentSyncText() {
  if (
    initialSyncRunning ||
    syncNowRunning ||
    dirtySyncRunning
  ) {
    return "Sincronizando…";
  }

  if (hasPendingSync())
    return "Pendiente de sincronizar";

  return navigator.onLine
    ? "Sincronizado"
    : "Sin conexión · datos guardados";
}

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 24);
}

function imageURL(image) {
  if (!image)
    return "";

  if (
    /\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i
      .test(image)
  ) {
    return image;
  }

  return `${image}/low.webp`;
}

function openLocalDB() {
  return new Promise(
    (resolve, reject) => {
      const req =
        indexedDB.open(
          "tcgscan-pokedex"
        );

      req.onsuccess =
        () => resolve(req.result);

      req.onerror =
        () => reject(req.error);
    }
  );
}

async function localCards() {
  const dbLocal =
    await openLocalDB();

  return new Promise(
    (resolve, reject) => {
      const tx =
        dbLocal.transaction(
          "cards",
          "readonly"
        );

      const req =
        tx.objectStore("cards")
          .getAll();

      req.onsuccess =
        () => resolve(
          req.result || []
        );

      req.onerror =
        () => reject(req.error);
    }
  );
}

async function saveLocalCard(item) {
  const dbLocal =
    await openLocalDB();

  return new Promise(
    (resolve, reject) => {
      const tx =
        dbLocal.transaction(
          "cards",
          "readwrite"
        );

      tx.objectStore("cards")
        .put(item);

      tx.oncomplete = resolve;
      tx.onerror =
        () => reject(tx.error);
    }
  );
}

function docIdForKey(key) {
  const bytes =
    new TextEncoder()
      .encode(
        String(key)
      );

  let binary = "";

  for (const b of bytes)
    binary += String.fromCharCode(b);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function quantityOf(item) {
  return Math.max(
    0,
    Number(item?.quantity) || 0
  );
}

function itemTime(item) {
  return Number(
    item?.lastCheckedAt ||
    item?.priceUpdated ||
    item?.addedAt ||
    0
  );
}

function comparableCard(item) {
  const value = {
    ...(item || {})
  };

  delete value.syncedAt;

  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce(
        (out, key) => {
          out[key] = value[key];
          return out;
        },
        {}
      )
  );
}

function mergeItem(local, remote) {
  if (!local)
    return remote;

  if (!remote)
    return local;

  const newest =
    itemTime(remote) >
    itemTime(local)
      ? {
          ...local,
          ...remote
        }
      : {
          ...remote,
          ...local
        };

  newest.quantity =
    Math.max(
      quantityOf(local),
      quantityOf(remote)
    );

  if (
    Array.isArray(local.copies) ||
    Array.isArray(remote.copies)
  ) {
    const lc =
      Array.isArray(local.copies)
        ? local.copies
        : [];

    const rc =
      Array.isArray(remote.copies)
        ? remote.copies
        : [];

    newest.copies =
      rc.length > lc.length
        ? rc
        : lc;

    newest.quantity =
      Math.max(
        newest.quantity,
        newest.copies.length
      );
  }

  return newest;
}

async function remoteCards(uid) {
  const snapshot =
    await getDocs(
      collection(
        db,
        "users",
        uid,
        "cards"
      )
    );

  return snapshot.docs.map(
    snap => snap.data()
  );
}

async function mirrorRemote(cards) {
  if (!currentUser)
    return;

  const remoteSnap =
    await getDocs(
      collection(
        db,
        "users",
        currentUser.uid,
        "cards"
      )
    );

  const localIds =
    new Set(
      cards.map(
        card =>
          docIdForKey(
            card.key ||
            `${card.lang}:${card.id}`
          )
      )
    );

  const remoteById =
    new Map(
      remoteSnap.docs.map(
        snap => [
          snap.id,
          snap.data()
        ]
      )
    );

  const operations = [];

  for (const snap of remoteSnap.docs) {
    if (!localIds.has(snap.id)) {
      operations.push({
        type: "delete",
        ref: snap.ref
      });
    }
  }

  for (const card of cards) {
    const key =
      card.key ||
      `${card.lang}:${card.id}`;

    const documentId =
      docIdForKey(key);

    const data = {
      ...card,
      key
    };

    const remote =
      remoteById.get(
        documentId
      );

    if (
      remote &&
      comparableCard(remote) ===
        comparableCard(data)
    ) {
      continue;
    }

    operations.push({
      type: "set",
      ref: doc(
        db,
        "users",
        currentUser.uid,
        "cards",
        documentId
      ),
      data: {
        ...data,
        syncedAt:
          Date.now()
      }
    });
  }

  for (
    let start = 0;
    start < operations.length;
    start += 400
  ) {
    const batch =
      writeBatch(db);

    for (
      const op
      of operations.slice(
        start,
        start + 400
      )
    ) {
      if (op.type === "delete")
        batch.delete(op.ref);
      else
        batch.set(op.ref, op.data);
    }

    await batch.commit();
  }
}

async function updateStats() {
  if (!currentUser)
    return;

  const cards =
    await localCards();

  const cardsCount =
    cards.reduce(
      (sum, item) =>
        sum + quantityOf(item),
      0
    );

  const collectionValue =
    cards.reduce(
      (sum, item) => {
        const price =
          typeof item.lastPrice ===
            "number"
            ? item.lastPrice
            : typeof item.lastTrend ===
                "number"
              ? item.lastTrend
              : 0;

        return (
          sum +
          price *
            quantityOf(item)
        );
      },
      0
    );

  const stats = {
    distinctCount:
      cards.length,
    cardsCount,
    collectionValue:
      Number(
        collectionValue.toFixed(2)
      )
  };

  await setDoc(
    doc(
      db,
      "users",
      currentUser.uid
    ),
    {
      ...stats,

      updatedAt:
        serverTimestamp()
    },
    {
      merge: true
    }
  );

  currentProfile = {
    ...(currentProfile || {}),
    ...stats
  };
}

async function syncNow() {
  if (
    !configured ||
    !currentUser ||
    initialSyncRunning ||
    syncNowRunning ||
    dirtySyncRunning ||
    !navigator.onLine
  ) {
    return;
  }

  syncNowRunning = true;
  const pendingFullAtStart =
    fullSyncPending;

  try {
    setSyncText(
      "Sincronizando…"
    );

    const cards =
      await localCards();

    await mirrorRemote(cards);
    await updateStats();

    if (
      pendingFullAtStart &&
      fullSyncPending ===
        pendingFullAtStart
    ) {
      fullSyncPending = 0;
    }

    persistSyncQueue();
    syncRetryDelay = 5000;

    setSyncText(
      "Sincronizado"
    );
  } finally {
    syncNowRunning = false;
  }
}

async function syncDirtyCards() {
  if (
    !configured ||
    !currentUser ||
    !dirtyCards.size ||
    initialSyncRunning ||
    syncNowRunning ||
    dirtySyncRunning ||
    !navigator.onLine
  ) {
    return;
  }

  dirtySyncRunning = true;

  const pending =
    new Map(dirtyCards);

  try {
    setSyncText("Sincronizando…");

    const localByKey =
      new Map(
        (await localCards())
          .map(item => [
            item.key ||
              `${item.lang}:${item.id}`,
            item
          ])
      );

    const entries =
      [...pending.entries()];

    for (
      let start = 0;
      start < entries.length;
      start += 400
    ) {
      const batch = writeBatch(db);

      for (
        const [key, change]
        of entries.slice(
          start,
          start + 400
        )
      ) {
        const ref = doc(
          db,
          "users",
          currentUser.uid,
          "cards",
          docIdForKey(key)
        );

        const item =
          change.item ||
          localByKey.get(key) ||
          null;

        if (change.deleted || !item) {
          batch.delete(ref);
        } else {
          batch.set(
            ref,
            {
              ...item,
              key,
              syncedAt: Date.now()
            }
          );
        }
      }

      await batch.commit();
    }

    await updateStats();

    for (const [key, change] of pending) {
      const current =
        dirtyCards.get(key);

      if (
        current &&
        pendingChangeTime(current) ===
          pendingChangeTime(change)
      ) {
        dirtyCards.delete(key);
      }
    }

    persistSyncQueue();
    syncRetryDelay = 5000;
    setSyncText("Sincronizado");

  } catch (error) {
    persistSyncQueue();
    throw error;
  } finally {
    dirtySyncRunning = false;
  }
}

async function initialSync() {
  if (
    !currentUser ||
    initialSyncRunning
  ) {
    return;
  }

  initialSyncRunning = true;

  const dirtyAtStart =
    new Map(dirtyCards);

  const fullAtStart =
    fullSyncPending;

  try {
    setSyncText(
      "Sincronizando…"
    );

    const local =
      await localCards();

    const remote =
      await remoteCards(
        currentUser.uid
      );

    const merged =
      new Map();

    for (const card of local) {
      merged.set(
        card.key,
        card
      );
    }

    for (const card of remote) {
      const key =
        card.key ||
        `${card.lang}:${card.id}`;

      const pending =
        dirtyAtStart.get(key);

      if (fullAtStart)
        continue;

      if (pending?.deleted)
        continue;

      if (
        pending &&
        merged.has(key)
      ) {
        continue;
      }

      merged.set(
        key,
        mergeItem(
          merged.get(key),
          {
            ...card,
            key
          }
        )
      );
    }

    for (
      const item
      of merged.values()
    ) {
      const key =
        item.key ||
        `${item.lang}:${item.id}`;

      const pendingNow =
        dirtyCards.get(key);

      const pendingAtStart =
        dirtyAtStart.get(key);

      const changedDuringSync =
        pendingNow &&
        (
          !pendingAtStart ||
          pendingChangeTime(pendingNow) !==
            pendingChangeTime(pendingAtStart)
        );

      const fullChangeDuringSync =
        fullSyncPending &&
        fullSyncPending !== fullAtStart;

      if (
        changedDuringSync ||
        fullChangeDuringSync
      ) {
        continue;
      }

      await saveLocalCard(item);
    }

    const finalCards =
      await localCards();

    await mirrorRemote(
      finalCards
    );

    await updateStats();

    for (const [key, change] of dirtyAtStart) {
      const current =
        dirtyCards.get(key);

      if (
        current &&
        pendingChangeTime(current) ===
          pendingChangeTime(change)
      ) {
        dirtyCards.delete(key);
      }
    }

    if (
      fullAtStart &&
      fullSyncPending === fullAtStart
    ) {
      fullSyncPending = 0;
    }

    persistSyncQueue();
    syncRetryDelay = 5000;

    refreshLegacyCollection();

    setSyncText(
      "Sincronizado"
    );

  } catch (error) {
    console.error(
      "PokEX sync:",
      error
    );

    setSyncText(
      "Error de sincronización"
    );

  } finally {
    initialSyncRunning = false;

    if (hasPendingSync()) {
      scheduleSync(null, 1800);
    }
  }
}

function scheduleSync(event, delay = 1600) {
  const detail =
    event?.detail || {};

  let changedAt =
    pendingChangeTime(detail);

  if (detail.full) {
    changedAt = Math.max(
      changedAt,
      fullSyncPending + 1
    );

    fullSyncPending = Math.max(
      fullSyncPending,
      changedAt
    );
  } else if (detail.key) {
    const previous =
      dirtyCards.get(detail.key);

    if (previous) {
      changedAt = Math.max(
        changedAt,
        pendingChangeTime(previous) + 1
      );
    }

    dirtyCards.set(
      detail.key,
      {
        ...detail,
        changedAt
      }
    );
  }

  if (detail.full || detail.key) {
    persistSyncQueue();
    setSyncText(
      "Pendiente de sincronizar"
    );
  }

  clearTimeout(
    syncTimer
  );

  if (
    !currentUser ||
    !navigator.onLine ||
    !hasPendingSync()
  ) {
    return;
  }

  syncTimer =
    setTimeout(
      async () => {
        if (
          initialSyncRunning ||
          syncNowRunning ||
          dirtySyncRunning
        ) {
          scheduleSync(null, 1800);
          return;
        }

        try {
          if (fullSyncPending)
            await syncNow();
          else
            await syncDirtyCards();

          if (hasPendingSync()) {
            scheduleSync(null, 1600);
          }
        } catch (error) {
          console.warn(
            "PokEX auto-sync:",
            error
          );

          setSyncText(
            "Pendiente de sincronizar"
          );

          const retryIn =
            syncRetryDelay;

          syncRetryDelay = Math.min(
            syncRetryDelay * 2,
            60000
          );

          scheduleSync(null, retryIn);
        }
      },
      Math.max(0, delay)
    );
}

function refreshLegacyCollection() {
  const search =
    document.getElementById(
      "pokedexSearch"
    );

  if (search) {
    search.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true
        }
      )
    );
  }

  window.dispatchEvent(
    new CustomEvent(
      "pokex:collection-reloaded"
    )
  );
}

function setSyncText(text) {
  document
    .querySelectorAll(
      "[data-pokex-sync]"
    )
    .forEach(
      el => {
        el.textContent =
          text;
      }
    );
}

function profileRef(uid) {
  return doc(
    db,
    "users",
    uid
  );
}

async function loadProfile(uid) {
  const snap =
    await getDoc(
      profileRef(uid)
    );

  return snap.exists()
    ? snap.data()
    : null;
}

async function createAccount(
  usernameRaw,
  email,
  password
) {
  const username =
    String(usernameRaw || "")
      .trim();

  const usernameLower =
    normalizeUsername(username);

  if (
    usernameLower.length < 3
  ) {
    throw new Error(
      "El usuario debe tener al menos 3 caracteres."
    );
  }

  if (
    password.length < 6
  ) {
    throw new Error(
      "La contraseña debe tener al menos 6 caracteres."
    );
  }

  const credential =
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

  const user =
    credential.user;

  try {
    await runTransaction(
      db,
      async transaction => {
        const usernameRef =
          doc(
            db,
            "usernames",
            usernameLower
          );

        const existing =
          await transaction.get(
            usernameRef
          );

        if (existing.exists()) {
          throw new Error(
            "Ese nombre de usuario ya existe."
          );
        }

        transaction.set(
          usernameRef,
          {
            uid: user.uid,
            username,
            usernameLower,
            createdAt:
              Date.now()
          }
        );

        transaction.set(
          profileRef(user.uid),
          {
            uid:
              user.uid,

            username,

            usernameLower,

            avatar:
              DEFAULT_ACCOUNT_AVATAR,

            publicProfile:
              true,

            lastSeenVersion:
              CURRENT_VERSION,

            distinctCount:
              0,

            cardsCount:
              0,

            collectionValue:
              0,

            createdAt:
              Date.now(),

            updatedAt:
              Date.now()
          }
        );
      }
    );

    await updateProfile(
      user,
      {
        displayName:
          username
      }
    );

    localStorage.setItem(
      SEEN_KEY,
      CURRENT_VERSION
    );

    return user;

  } catch (error) {
    try {
      await deleteUser(user);
    } catch (_) {}

    throw error;
  }
}

async function loginAccount(
  email,
  password
) {
  return await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}

function makeOverlay(id) {
  let overlay =
    document.getElementById(id);

  if (overlay)
    return overlay;

  overlay =
    document.createElement(
      "div"
    );

  overlay.id = id;

  overlay.className =
    "v23-overlay hidden";

  document.body.appendChild(
    overlay
  );

  return overlay;
}

const accountOverlay =
  makeOverlay(
    "pokexAccountOverlay"
  );

const friendsOverlay =
  makeOverlay(
    "pokexFriendsOverlay"
  );

const welcomeOverlay =
  makeOverlay(
    "pokexWelcomeOverlay"
  );

function closeOverlay(
  overlay
) {
  overlay.classList.add(
    "hidden"
  );

  const anyOpen =
    [...document.querySelectorAll(
      ".v23-overlay"
    )].some(
      item =>
        !item.classList.contains(
          "hidden"
        )
    );

  document.body.classList.toggle(
    "pokex-modal-open",
    anyOpen
  );
}

function openOverlay(
  overlay
) {
  overlay.classList.remove(
    "hidden"
  );

  document.body.classList.add(
    "pokex-modal-open"
  );
}

function accountFormHTML(
  mode = "login"
) {
  const signup =
    mode === "signup";

  return `
    <div class="v23-window">

      <div class="v23-header">
        <strong>
          👤 ${
            signup
              ? "Crear cuenta"
              : "Cuenta PokEX"
          }
        </strong>

        <button
          class="v23-close"
          data-close>
          ×
        </button>
      </div>

      ${
        signup
          ? `
            <label class="v23-field">
              <span>Nombre de usuario</span>
              <input
                id="v23Username"
                maxlength="24"
                autocomplete="username"
                placeholder="Ej. Mendo">
            </label>
          `
          : ""
      }

      <label class="v23-field">
        <span>Email</span>
        <input
          id="v23Email"
          type="email"
          autocomplete="email"
          placeholder="tu@email.com">
      </label>

      <label class="v23-field">
        <span>Contraseña</span>
        <input
          id="v23Password"
          type="password"
          autocomplete="${
            signup
              ? "new-password"
              : "current-password"
          }">
      </label>

      <button
        class="v23-primary"
        id="v23AuthSubmit">
        ${
          signup
            ? "Crear mi cuenta"
            : "Entrar"
        }
      </button>

      <button
        class="v23-secondary"
        id="v23SwitchAuth">
        ${
          signup
            ? "Ya tengo cuenta"
            : "Crear una cuenta"
        }
      </button>

      ${
        !signup
          ? `
            <button
              class="v23-secondary"
              id="v23ResetPassword">
              He olvidado mi contraseña
            </button>
          `
          : ""
      }

      <div
        class="v23-message"
        id="v23AuthMessage">
      </div>

    </div>
  `;
}

function wireClose(
  overlay
) {
  overlay
    .querySelector(
      "[data-close]"
    )
    ?.addEventListener(
      "click",
      () => closeOverlay(
        overlay
      )
    );
}

function renderAuthForm(
  mode = "login"
) {
  accountOverlay.innerHTML =
    accountFormHTML(mode);

  wireClose(
    accountOverlay
  );

  const message =
    accountOverlay
      .querySelector(
        "#v23AuthMessage"
      );

  accountOverlay
    .querySelector(
      "#v23SwitchAuth"
    )
    ?.addEventListener(
      "click",
      () => {
        renderAuthForm(
          mode === "login"
            ? "signup"
            : "login"
        );
      }
    );

  accountOverlay
    .querySelector(
      "#v23AuthSubmit"
    )
    ?.addEventListener(
      "click",
      async () => {
        const email =
          accountOverlay
            .querySelector(
              "#v23Email"
            )
            .value
            .trim();

        const password =
          accountOverlay
            .querySelector(
              "#v23Password"
            )
            .value;

        try {
          message.textContent =
            mode === "signup"
              ? "Creando cuenta…"
              : "Entrando…";

          if (mode === "signup") {
            const username =
              accountOverlay
                .querySelector(
                  "#v23Username"
                )
                .value;

            await createAccount(
              username,
              email,
              password
            );

          } else {
            await loginAccount(
              email,
              password
            );
          }

          closeOverlay(
            accountOverlay
          );

        } catch (error) {
          console.error(error);

          message.textContent =
            friendlyError(error);
        }
      }
    );

  accountOverlay
    .querySelector(
      "#v23ResetPassword"
    )
    ?.addEventListener(
      "click",
      async () => {
        const email =
          accountOverlay
            .querySelector(
              "#v23Email"
            )
            .value
            .trim();

        if (!email) {
          message.textContent =
            "Escribe primero tu email.";

          return;
        }

        try {
          await sendPasswordResetEmail(
            auth,
            email
          );

          message.textContent =
            "✅ Te hemos enviado el email para cambiar la contraseña.";

        } catch (error) {
          message.textContent =
            friendlyError(error);
        }
      }
    );
}

function friendlyError(error) {
  const code =
    error?.code || "";

  if (
    code.includes(
      "email-already-in-use"
    )
  )
    return "Ese email ya tiene una cuenta.";

  if (
    code.includes(
      "invalid-credential"
    )
  )
    return "Email o contraseña incorrectos.";

  if (
    code.includes(
      "invalid-email"
    )
  )
    return "El email no es válido.";

  if (
    code.includes(
      "weak-password"
    )
  )
    return "La contraseña es demasiado débil.";

  return (
    error?.message ||
    "Ha ocurrido un error."
  );
}

async function renderAccount() {
  if (!configured) {
    accountOverlay.innerHTML = `
      <div class="v23-window">
        <div class="v23-header">
          <strong>👤 Cuenta</strong>
          <button
            class="v23-close"
            data-close>
            ×
          </button>
        </div>

        <div class="v23-note">
          Firebase todavía no está
          configurado en este PokEX.
        </div>
      </div>
    `;

    wireClose(
      accountOverlay
    );

    return;
  }

  if (!currentUser) {
    renderAuthForm(
      "login"
    );

    return;
  }

  const profile =
    currentProfile ||
    await loadProfile(
      currentUser.uid
    );

  accountOverlay.innerHTML = `
    <div class="v23-window">

      <div class="v23-header">
        <strong class="v23-user">
          <span
            class="v231-avatar"
            aria-hidden="true">${
              escapeHTML(
                accountAvatar(profile)
              )
            }</span>
          <span>${
            escapeHTML(
              profile?.username ||
              currentUser.displayName ||
              "Entrenador"
            )
          }</span>
        </strong>

        <button
          class="v23-close"
          data-close>
          ×
        </button>
      </div>

      <div class="v23-card">
        <div>
          ${
            escapeHTML(
              currentUser.email
            )
          }
        </div>

        <div class="v23-sync">
          <span class="v23-dot"></span>
          <span data-pokex-sync>
            ${escapeHTML(
              currentSyncText()
            )}
          </span>
        </div>
      </div>

      <div class="v23-stat-grid">

        <div class="v23-stat">
          <span>Cartas</span>
          <strong>
            ${
              profile?.cardsCount ??
              0
            }
          </strong>
        </div>

        <div class="v23-stat">
          <span>Distintas</span>
          <strong>
            ${
              profile?.distinctCount ??
              0
            }
          </strong>
        </div>

        <div class="v23-stat">
          <span>Valor</span>
          <strong>
            ${Number(
              profile?.collectionValue ||
              0
            ).toFixed(2)} €
          </strong>
        </div>

        <div class="v23-stat">
          <span>Versión vista</span>
          <strong>
            ${
              escapeHTML(
                profile?.lastSeenVersion ||
                "—"
              )
            }
          </strong>
        </div>

      </div>

      <label
        class="v23-card v23-row pokex-v31-hidden-feature"
        hidden>

        <span>
          Colección pública
        </span>

        <input
          id="v23PublicProfile"
          type="checkbox"
          ${
            profile?.publicProfile !==
            false
              ? "checked"
              : ""
          }>

      </label>

      <button
        class="v23-primary"
        id="v23SyncNow">
        ⟳ Sincronizar ahora
      </button>

      <button
        class="v23-danger"
        id="v23Logout">
        Cerrar sesión
      </button>

      <div
        class="v23-message"
        id="v23AccountMessage">
      </div>

    </div>
  `;

  wireClose(
    accountOverlay
  );

  accountOverlay
    .querySelector(
      "#v23SyncNow"
    )
    ?.addEventListener(
      "click",
      async () => {
        const msg =
          accountOverlay
            .querySelector(
              "#v23AccountMessage"
            );

        try {
          msg.textContent =
            "Sincronizando…";

          await syncNow();

          currentProfile =
            await loadProfile(
              currentUser.uid
            );

          msg.textContent =
            "✅ Sincronizado.";

        } catch (error) {
          msg.textContent =
            friendlyError(error);
        }
      }
    );

  accountOverlay
    .querySelector(
      "#v23PublicProfile"
    )
    ?.addEventListener(
      "change",
      async event => {
        await setDoc(
          profileRef(
            currentUser.uid
          ),
          {
            publicProfile:
              event.target.checked,

            updatedAt:
              serverTimestamp()
          },
          {
            merge: true
          }
        );

        currentProfile =
          await loadProfile(
            currentUser.uid
          );
      }
    );

  accountOverlay
    .querySelector(
      "#v23Logout"
    )
    ?.addEventListener(
      "click",
      async () => {
        await signOut(auth);

        closeOverlay(
          accountOverlay
        );
      }
    );
}

function openAccount(
  mode = null
) {
  if (
    mode &&
    !currentUser
  ) {
    renderAuthForm(mode);

  } else {
    renderAccount();
  }

  openOverlay(
    accountOverlay
  );
}

async function allProfiles() {
  const snapshot =
    await getDocs(
      collection(
        db,
        "users"
      )
    );

  return snapshot.docs.map(
    snap => snap.data()
  );
}

function requestId(
  fromUid,
  toUid
) {
  return `${fromUid}__${toUid}`;
}

async function outgoingRequests() {
  const snap =
    await getDocs(
      query(
        collection(
          db,
          "friendRequests"
        ),
        where(
          "fromUid",
          "==",
          currentUser.uid
        )
      )
    );

  return snap.docs.map(
    d => ({
      id: d.id,
      ...d.data()
    })
  );
}

async function incomingRequests() {
  const snap =
    await getDocs(
      query(
        collection(
          db,
          "friendRequests"
        ),
        where(
          "toUid",
          "==",
          currentUser.uid
        )
      )
    );

  return snap.docs
    .map(
      d => ({
        id: d.id,
        ...d.data()
      })
    )
    .filter(
      r =>
        r.status ===
        "pending"
    );
}

async function friendships() {
  const snap =
    await getDocs(
      query(
        collection(
          db,
          "friendships"
        ),
        where(
          "members",
          "array-contains",
          currentUser.uid
        )
      )
    );

  return snap.docs.map(
    d => ({
      id: d.id,
      ...d.data()
    })
  );
}

async function sendFriendRequest(
  toUid
) {
  const id =
    requestId(
      currentUser.uid,
      toUid
    );

  await setDoc(
    doc(
      db,
      "friendRequests",
      id
    ),
    {
      fromUid:
        currentUser.uid,

      toUid,

      status:
        "pending",

      createdAt:
        Date.now()
    }
  );
}

async function acceptFriendRequest(
  request
) {
  const ref =
    doc(
      db,
      "friendRequests",
      request.id
    );

  await setDoc(
    ref,
    {
      status:
        "accepted",

      acceptedAt:
        Date.now()
    },
    {
      merge: true
    }
  );

  await setDoc(
    doc(
      db,
      "friendships",
      request.id
    ),
    {
      members: [
        request.fromUid,
        request.toUid
      ],

      createdAt:
        Date.now()
    }
  );
}

async function rejectFriendRequest(
  request
) {
  await setDoc(
    doc(
      db,
      "friendRequests",
      request.id
    ),
    {
      status:
        "rejected"
    },
    {
      merge: true
    }
  );
}

async function friendCards(uid) {
  const snap =
    await getDocs(
      collection(
        db,
        "users",
        uid,
        "cards"
      )
    );

  return snap.docs.map(
    d => d.data()
  );
}

async function showFriendCollection(
  profile
) {
  const cards =
    await friendCards(
      profile.uid
    );

  friendsOverlay.innerHTML = `
    <div class="v23-window">

      <div class="v23-header">

        <button
          class="v23-secondary"
          id="v23BackFriends"
          style="width:auto">
          ←
        </button>

        <strong>
          🗂️ ${
            escapeHTML(
              profile.username
            )
          }
        </strong>

        <button
          class="v23-close"
          data-close>
          ×
        </button>

      </div>

      <div class="v23-stat-grid">

        <div class="v23-stat">
          <span>Cartas</span>
          <strong>
            ${
              profile.cardsCount ||
              0
            }
          </strong>
        </div>

        <div class="v23-stat">
          <span>Distintas</span>
          <strong>
            ${cards.length}
          </strong>
        </div>

        <div class="v23-stat">
          <span>Valor</span>
          <strong>
            ${Number(
              profile.collectionValue ||
              0
            ).toFixed(2)} €
          </strong>
        </div>

      </div>

      <div class="v23-friend-collection">

        ${cards.map(
          card => `
            <div class="v23-mini-card">

              ${
                card.image
                  ? `
                    <img
                      loading="lazy"
                      src="${
                        escapeHTML(
                          imageURL(
                            card.image
                          )
                        )
                      }">
                  `
                  : ""
              }

              <strong>
                ${
                  escapeHTML(
                    card.name
                  )
                }
              </strong>

              <div>
                x${
                  quantityOf(
                    card
                  )
                }
              </div>

            </div>
          `
        ).join("")}

      </div>

    </div>
  `;

  wireClose(
    friendsOverlay
  );

  friendsOverlay
    .querySelector(
      "#v23BackFriends"
    )
    ?.addEventListener(
      "click",
      () => {
        renderFriends();
      }
    );
}

async function compareWithFriend(
  profile
) {
  const mine =
    await localCards();

  const theirs =
    await friendCards(
      profile.uid
    );

  const myIds =
    new Set(
      mine.map(
        x => x.id
      )
    );

  const theirIds =
    new Set(
      theirs.map(
        x => x.id
      )
    );

  const common =
    [...myIds]
      .filter(
        id =>
          theirIds.has(id)
      )
      .length;

  const onlyMine =
    [...myIds]
      .filter(
        id =>
          !theirIds.has(id)
      )
      .length;

  const onlyTheirs =
    [...theirIds]
      .filter(
        id =>
          !myIds.has(id)
      )
      .length;

  alert(
    `PokEX · Comparación con ${profile.username}\n\n` +
    `En común: ${common}\n` +
    `Solo tú: ${onlyMine}\n` +
    `Solo ${profile.username}: ${onlyTheirs}`
  );
}

async function renderFriends() {
  if (!configured) {
    friendsOverlay.innerHTML = `
      <div class="v23-window">
        <div class="v23-header">
          <strong>👥 Amigos</strong>
          <button
            class="v23-close"
            data-close>
            ×
          </button>
        </div>

        <div class="v23-note">
          Firebase aún no está
          configurado.
        </div>
      </div>
    `;

    wireClose(
      friendsOverlay
    );

    return;
  }

  if (!currentUser) {
    friendsOverlay.innerHTML = `
      <div class="v23-window">

        <div class="v23-header">
          <strong>👥 Amigos</strong>

          <button
            class="v23-close"
            data-close>
            ×
          </button>
        </div>

        <div class="v23-note">
          Necesitas una cuenta PokEX
          para utilizar Amigos.
        </div>

        <button
          class="v23-primary"
          id="v23FriendsLogin">
          Entrar
        </button>

        <button
          class="v23-secondary"
          id="v23FriendsSignup">
          Crear cuenta
        </button>

      </div>
    `;

    wireClose(
      friendsOverlay
    );

    friendsOverlay
      .querySelector(
        "#v23FriendsLogin"
      )
      .onclick =
        () => {
          closeOverlay(
            friendsOverlay
          );

          openAccount(
            "login"
          );
        };

    friendsOverlay
      .querySelector(
        "#v23FriendsSignup"
      )
      .onclick =
        () => {
          closeOverlay(
            friendsOverlay
          );

          openAccount(
            "signup"
          );
        };

    return;
  }

  friendsOverlay.innerHTML = `
    <div class="v23-window">

      <div class="v23-header">
        <strong>
          👥 Amigos
        </strong>

        <button
          class="v23-close"
          data-close>
          ×
        </button>
      </div>

      <div class="v23-tabs">

        <button
          class="v23-tab active"
          data-friend-tab="friends">
          Mis amigos
        </button>

        <button
          class="v23-tab"
          data-friend-tab="search">
          Buscar
        </button>

        <button
          class="v23-tab"
          data-friend-tab="requests">
          Solicitudes
        </button>

        <button
          class="v23-tab"
          data-friend-tab="ranking">
          Ranking
        </button>

      </div>

      <div id="v23FriendsContent">
        Cargando…
      </div>

    </div>
  `;

  wireClose(
    friendsOverlay
  );

  friendsOverlay
    .querySelectorAll(
      "[data-friend-tab]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            friendsOverlay
              .querySelectorAll(
                "[data-friend-tab]"
              )
              .forEach(
                b =>
                  b.classList.toggle(
                    "active",
                    b === button
                  )
              );

            renderFriendsTab(
              button.dataset.friendTab
            );
          }
        );
      }
    );

  await renderFriendsTab(
    "friends"
  );
}

async function renderFriendsTab(
  tab
) {
  const holder =
    friendsOverlay
      .querySelector(
        "#v23FriendsContent"
      );

  if (!holder)
    return;

  holder.textContent =
    "Cargando…";

  const profiles =
    await allProfiles();

  const byUid =
    new Map(
      profiles.map(
        p => [
          p.uid,
          p
        ]
      )
    );

  if (tab === "friends") {
    const rows =
      await friendships();

    if (!rows.length) {
      holder.innerHTML = `
        <div class="v23-note">
          Todavía no tienes amigos.
        </div>
      `;

      return;
    }

    holder.innerHTML =
      rows.map(
        row => {
          const otherUid =
            row.members.find(
              uid =>
                uid !==
                currentUser.uid
            );

          const p =
            byUid.get(
              otherUid
            );

          if (!p)
            return "";

          return `
            <div class="v23-card">

              <div class="v23-row">

                <div>
                  <strong>
                    ${
                      escapeHTML(
                        p.username
                      )
                    }
                  </strong>

                  <div class="v23-note">
                    ${
                      p.cardsCount ||
                      0
                    } cartas ·
                    ${Number(
                      p.collectionValue ||
                      0
                    ).toFixed(2)} €
                  </div>
                </div>

              </div>

              <button
                class="v23-secondary"
                data-view-friend="${
                  p.uid
                }">
                Ver colección
              </button>

              <button
                class="v23-secondary"
                data-compare-friend="${
                  p.uid
                }">
                Comparar
              </button>

            </div>
          `;
        }
      ).join("");

    holder
      .querySelectorAll(
        "[data-view-friend]"
      )
      .forEach(
        button => {
          button.onclick =
            () =>
              showFriendCollection(
                byUid.get(
                  button.dataset
                    .viewFriend
                )
              );
        }
      );

    holder
      .querySelectorAll(
        "[data-compare-friend]"
      )
      .forEach(
        button => {
          button.onclick =
            () =>
              compareWithFriend(
                byUid.get(
                  button.dataset
                    .compareFriend
                )
              );
        }
      );

    return;
  }

  if (tab === "search") {
    const outgoing =
      await outgoingRequests();

    const friendRows =
      await friendships();

    const friendIds =
      new Set(
        friendRows.flatMap(
          f => f.members
        )
      );

    holder.innerHTML = `
      <label class="v23-field">
        <span>
          Buscar usuario
        </span>

        <input
          id="v23FriendSearch"
          placeholder="Nombre de usuario">
      </label>

      <div id="v23SearchResults"></div>
    `;

    const input =
      holder.querySelector(
        "#v23FriendSearch"
      );

    const results =
      holder.querySelector(
        "#v23SearchResults"
      );

    const draw =
      () => {
        const q =
          normalizeUsername(
            input.value
          );

        if (!q) {
          results.innerHTML = "";
          return;
        }

        const matches =
          profiles
            .filter(
              p =>
                p.uid !==
                  currentUser.uid &&
                p.usernameLower
                  ?.includes(q)
            )
            .slice(0, 10);

        results.innerHTML =
          matches.map(
            p => {
              const alreadyFriend =
                friendIds.has(
                  p.uid
                );

              const pending =
                outgoing.some(
                  r =>
                    r.toUid ===
                      p.uid &&
                    r.status ===
                      "pending"
                );

              return `
                <div class="v23-card v23-row">

                  <strong>
                    ${
                      escapeHTML(
                        p.username
                      )
                    }
                  </strong>

                  ${
                    alreadyFriend
                      ? `
                        <span>
                          ✓ Amigos
                        </span>
                      `
                      : pending
                        ? `
                          <span>
                            Pendiente
                          </span>
                        `
                        : `
                          <button
                            class="v23-primary"
                            data-add-friend="${
                              p.uid
                            }">
                            Añadir
                          </button>
                        `
                  }

                </div>
              `;
            }
          ).join("");

        results
          .querySelectorAll(
            "[data-add-friend]"
          )
          .forEach(
            button => {
              button.onclick =
                async () => {
                  await sendFriendRequest(
                    button.dataset
                      .addFriend
                  );

                  button.textContent =
                    "Enviada ✓";

                  button.disabled =
                    true;
                };
            }
          );
      };

    input.addEventListener(
      "input",
      draw
    );

    return;
  }

  if (tab === "requests") {
    const requests =
      await incomingRequests();

    if (!requests.length) {
      holder.innerHTML = `
        <div class="v23-note">
          No tienes solicitudes pendientes.
        </div>
      `;

      return;
    }

    holder.innerHTML =
      requests.map(
        request => {
          const p =
            byUid.get(
              request.fromUid
            );

          return `
            <div class="v23-card">

              <strong>
                ${
                  escapeHTML(
                    p?.username ||
                    "Entrenador"
                  )
                }
              </strong>

              <button
                class="v23-primary"
                data-accept="${
                  request.id
                }">
                Aceptar
              </button>

              <button
                class="v23-secondary"
                data-reject="${
                  request.id
                }">
                Rechazar
              </button>

            </div>
          `;
        }
      ).join("");

    for (const request of requests) {
      holder
        .querySelector(
          `[data-accept="${request.id}"]`
        )
        ?.addEventListener(
          "click",
          async () => {
            await acceptFriendRequest(
              request
            );

            await renderFriendsTab(
              "requests"
            );
          }
        );

      holder
        .querySelector(
          `[data-reject="${request.id}"]`
        )
        ?.addEventListener(
          "click",
          async () => {
            await rejectFriendRequest(
              request
            );

            await renderFriendsTab(
              "requests"
            );
          }
        );
    }

    return;
  }

  if (tab === "ranking") {
    const ranking =
      profiles
        .filter(
          p =>
            p.publicProfile !==
              false
        )
        .sort(
          (a, b) =>
            Number(
              b.collectionValue ||
              0
            )
            -
            Number(
              a.collectionValue ||
              0
            )
        );

    holder.innerHTML =
      ranking.map(
        (p, index) => `
          <div class="v23-card v23-row">

            <span>
              <strong>
                #${index + 1}
              </strong>
              ${
                escapeHTML(
                  p.username
                )
              }
            </span>

            <strong>
              ${Number(
                p.collectionValue ||
                0
              ).toFixed(2)} €
            </strong>

          </div>
        `
      ).join("");
  }
}

function openFriends() {
  renderFriends();
  openOverlay(
    friendsOverlay
  );
}

function installHomeButtons() {
  if (
    document.querySelector(
      "#v23AccountButton"
    )
  ) {
    return;
  }

  const existing =
    document.querySelector(
      ".pokedex-nav"
    );

  if (!existing)
    return;

  existing.classList.add(
    "pokex-quick-actions"
  );

  existing.insertAdjacentHTML(
    "beforeend",
    `
    <button
      type="button"
      class="pokex-account-btn"
      id="v23AccountButton">
      <span class="pokex-account-avatar" aria-hidden="true">👤</span>
      <span>Cuenta</span>
    </button>
  `
  );

  existing
    .querySelector(
      "#v23AccountButton"
    )
    .onclick =
      () => openAccount();

  window.dispatchEvent(
    new CustomEvent(
      "pokex:account-button-ready"
    )
  );
}

function hideBackupTab() {
  document
    .querySelector(
      '.v22-tab[data-tab="backup"]'
    )
    ?.style
    .setProperty(
      "display",
      "none"
    );
}

function welcomeHTML(
  firstTime
) {
  return `
    <div class="v23-window v23-welcome">

      <div class="v23-welcome-icon">
        ⚡
      </div>

      <h2>
        ${
          firstTime
            ? "Bienvenido a PokEX"
            : `PokEX Beta v${CURRENT_VERSION}`
        }
      </h2>

      <p>
        ${
          firstTime
            ? "PokEX está actualmente en fase Beta."
            : "Hay una nueva versión de PokEX."
        }
      </p>

      <div class="v23-changes">

        <strong>
          ${
            firstTime
              ? "PokEX Beta"
              : "Novedades"
          }
        </strong>

        <p>
          ✨ Interfaz móvil renovada
          <br>
          ⚡ PokEX más rápida y eficiente
          <br>
          📷 Carga del escáner integrada
        </p>

      </div>

      ${
        !currentUser
          ? `
            <button
              class="v23-primary"
              id="v23WelcomeSignup">
              Crear cuenta
            </button>

            <button
              class="v23-secondary"
              id="v23WelcomeLogin">
              Ya tengo cuenta
            </button>
          `
          : ""
      }

      <button
        class="v23-secondary"
        id="v23WelcomeContinue">
        Continuar
      </button>

    </div>
  `;
}

async function markVersionSeen() {
  localStorage.setItem(
    SEEN_KEY,
    CURRENT_VERSION
  );

  if (
    currentUser &&
    db
  ) {
    await setDoc(
      profileRef(
        currentUser.uid
      ),
      {
        lastSeenVersion:
          CURRENT_VERSION,

        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

    currentProfile = {
      ...(currentProfile || {}),
      lastSeenVersion:
        CURRENT_VERSION
    };
  }
}

async function maybeShowWelcome() {
  const localSeen =
    localStorage.getItem(
      SEEN_KEY
    );

  const accountSeen =
    currentProfile
      ?.lastSeenVersion;

  const seen =
    currentUser
      ? (
          accountSeen ||
          localSeen
        )
      : localSeen;

  if (
    seen === CURRENT_VERSION
  ) {
    return;
  }

  const firstTime =
    !seen;

  welcomeOverlay.innerHTML =
    welcomeHTML(
      firstTime
    );

  openOverlay(
    welcomeOverlay
  );

  welcomeOverlay
    .querySelector(
      "#v23WelcomeSignup"
    )
    ?.addEventListener(
      "click",
      async () => {
        await markVersionSeen();

        closeOverlay(
          welcomeOverlay
        );

        openAccount(
          "signup"
        );
      }
    );

  welcomeOverlay
    .querySelector(
      "#v23WelcomeLogin"
    )
    ?.addEventListener(
      "click",
      async () => {
        await markVersionSeen();

        closeOverlay(
          welcomeOverlay
        );

        openAccount(
          "login"
        );
      }
    );

  welcomeOverlay
    .querySelector(
      "#v23WelcomeContinue"
    )
    ?.addEventListener(
      "click",
      async () => {
        await markVersionSeen();

        closeOverlay(
          welcomeOverlay
        );
      }
    );
}

function watchLocalChanges() {
  restoreSyncQueue();

  window.addEventListener(
    "pokex:collection-changed",
    scheduleSync
  );

  window.addEventListener(
    "online",
    () => {
      if (
        hasPendingSync()
      ) {
        scheduleSync(null, 0);
      }
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
          "visible" &&
        hasPendingSync()
      ) {
        scheduleSync(null, 500);
      }
    }
  );
}

async function waitForPokEX() {
  for (
    let i = 0;
    i < 120;
    i++
  ) {
    if (
      document.querySelector(
        ".pokedex-nav"
      )
    ) {
      return true;
    }

    await sleep(100);
  }

  return false;
}

await waitForPokEX();

installHomeButtons();

if (!configured) {
  console.warn(
    "PokEX Firebase todavía no está configurado."
  );

  await maybeShowWelcome();

  window.PokEXAccount = {
    configured: false,
    openAccount,
    openFriends
  };

} else {
  app =
    getApps().length
      ? getApp()
      : initializeApp(cfg);

  auth =
    getAuth(app);

  db =
    getFirestore(app);

  hideBackupTab();

  watchLocalChanges();

  onAuthStateChanged(
    auth,
    async user => {
      currentUser =
        user;

      currentProfile =
        user
          ? await loadProfile(
              user.uid
            )
          : null;

      if (user) {
        await initialSync();

        if (hasPendingSync()) {
          scheduleSync(null, 500);
        }
      }

      await maybeShowWelcome();
    }
  );

  window.PokEXAccount = {
    configured: true,
    openAccount,

    syncNow,
    auth,
    db
  };
}

console.log(
  "✅ PokEX v3.1 · Cuenta cargada"
);
