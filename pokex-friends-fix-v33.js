import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs,
  query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const cfg = window.POKEX_FIREBASE_CONFIG || {};
const configured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = configured ? (getApps().length ? getApp() : initializeApp(cfg)) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const rid = (a, b) => `${a}__${b}`;

async function pairDocs(otherUid) {
  const me = auth?.currentUser?.uid;
  if (!me || !db || !otherUid) return [];

  const [owned, linked, outgoing, incoming] = await Promise.all([
    getDocs(query(collection(db, "friendLinks"), where("ownerUid", "==", me))),
    getDocs(query(collection(db, "friendLinks"), where("friendUid", "==", me))),
    getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", me))),
    getDocs(query(collection(db, "friendRequests"), where("toUid", "==", me)))
  ]);

  const refs = new Map();
  [...owned.docs, ...linked.docs].forEach(snap => {
    const data = snap.data();
    if (data.ownerUid === otherUid || data.friendUid === otherUid) refs.set(snap.ref.path, snap.ref);
  });
  [...outgoing.docs, ...incoming.docs].forEach(snap => {
    const data = snap.data();
    if (data.fromUid === otherUid || data.toUid === otherUid) refs.set(snap.ref.path, snap.ref);
  });
  return [...refs.values()];
}

async function removeFriend(otherUid) {
  const refs = await pairDocs(otherUid);
  if (!refs.length) return;
  const batch = writeBatch(db);
  refs.forEach(ref => batch.delete(ref));
  await batch.commit();
}

async function addFriend(button) {
  const me = auth?.currentUser?.uid;
  const card = button.closest(".f33-user-card");
  const username = card?.querySelector(".f33-user-copy strong")?.textContent?.trim().replace(/^@/, "").toLowerCase();
  if (!me || !username) return;
  const directory = await getDoc(doc(db, "usernames", username));
  if (!directory.exists()) throw new Error("No se pudo resolver el usuario.");
  const otherUid = directory.data()?.uid;
  if (!otherUid || otherUid === me) return;
  await setDoc(doc(db, "friendRequests", rid(me, otherUid)), {
    fromUid: me,
    toUid: otherUid,
    status: "pending",
    createdAt: Date.now()
  });
  button.outerHTML = '<span class="f33-status">Solicitud enviada</span>';
}

async function acceptRequest(requestId) {
  const me = auth?.currentUser?.uid;
  if (!me || !requestId) return;
  const requestRef = doc(db, "friendRequests", requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.toUid !== me || data.status !== "pending") return;

  const otherUid = data.fromUid;
  const batch = writeBatch(db);
  batch.set(requestRef, { status: "accepted", acceptedAt: Date.now() }, { merge: true });
  batch.set(doc(db, "friendLinks", rid(otherUid, me)), { ownerUid: otherUid, friendUid: me, createdAt: Date.now() });
  batch.set(doc(db, "friendLinks", rid(me, otherUid)), { ownerUid: me, friendUid: otherUid, createdAt: Date.now() });
  await batch.commit();

  await deleteDoc(requestRef);
  const leftovers = await pairDocs(otherUid);
  const requestRefs = leftovers.filter(ref => ref.path.includes("/friendRequests/"));
  if (requestRefs.length) {
    const cleanup = writeBatch(db);
    requestRefs.forEach(ref => cleanup.delete(ref));
    await cleanup.commit();
  }
}

function clearFalseError() {
  const body = document.getElementById("f33Body");
  if (!body) return;
  if (body.querySelector(".f33-user-card")) {
    body.querySelectorAll(".f33-action-error").forEach(el => el.remove());
  }
}

async function refresh(tab) {
  await window.PokEXFriendsV33?.open?.(tab);
  clearFalseError();
}

document.addEventListener("click", async event => {
  const button = event.target.closest?.("[data-remove], [data-add], [data-accept]");
  if (!button || !button.closest("#pokexFriendsV33Overlay")) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (button.disabled) return;
  button.disabled = true;

  try {
    if (button.dataset.remove) {
      if (!confirm("¿Eliminar a este usuario de tus amigos?")) {
        button.disabled = false;
        return;
      }
      await removeFriend(button.dataset.remove);
      await refresh("friends");
      return;
    }

    if (button.hasAttribute("data-add")) {
      await addFriend(button);
      return;
    }

    if (button.dataset.accept) {
      await acceptRequest(button.dataset.accept);
      await refresh("friends");
    }
  } catch (error) {
    console.warn("PokEX Friends fix:", error);
    button.disabled = false;
    const body = document.getElementById("f33Body");
    body?.querySelectorAll(".f33-action-error").forEach(el => el.remove());
    body?.insertAdjacentHTML("afterbegin", '<div class="f33-message f33-action-error">No se pudo completar la acción. Inténtalo de nuevo.</div>');
  }
}, true);

const observer = new MutationObserver(clearFalseError);
observer.observe(document.body, { childList: true, subtree: true });

console.log("✅ PokEX Friends fix v3.3 cargado");
