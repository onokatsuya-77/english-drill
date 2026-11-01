// Firebase（Auth + Firestore）を使うデータ層。アプリの他の部分はこのインターフェースだけを使う。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, getDocsFromCache, setDoc, updateDoc, deleteDoc, collection, writeBatch, query, orderBy, onSnapshot,
  serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn('persistent cache unavailable, falling back', e);
  db = initializeFirestore(app, {});
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const backend = {
  name: 'firebase',

  // ---- 認証 ----
  /**
   * Google でログイン。Safari は「押した直後に開いたポップアップ」しか許さないので、await を挟まずにすぐ開く。
   * （ページを移る方式は、Safari の追跡防止で github.io と firebaseapp.com の間のログイン結果を受け取れないため、
   *   ポップアップが使えない環境のときだけ使う。ログイン状態は既定で端末に保存される）
   */
  signIn() {
    return signInWithPopup(auth, provider).then(() => {}, e => {
      if (e.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      if (e.code === 'auth/popup-blocked') throw new Error('ログインの画面が開けませんでした。もう一度「Google でログイン」を押してください。');
      throw e;
    });
  },
  async signOut() { await fbSignOut(auth); },
  onAuth(cb) {
    getRedirectResult(auth).catch(e => console.warn('redirect result', e));
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', photo: u.photoURL || '' } : null));
  },

  // ---- 教材 ----
  async listMaterials() {
    const snap = await getDocs(collection(db, 'materials'));
    return snap.docs.map(d => d.data()).sort((a, b) => (a.order || 0) - (b.order || 0));
  },
  async loadChunks(materialId, kind, count, version) {
    // 端末のキャッシュにある版と同じなら通信しない
    const col = collection(db, 'materials', materialId, kind);
    const key = `chunkver:${materialId}:${kind}`;
    let docs = [];
    if (localStorage.getItem(key) === String(version)) {
      try { const s = await getDocsFromCache(col); docs = s.docs; } catch (e) { docs = []; }
    }
    if (docs.length < count) {
      const s = await getDocs(col); docs = s.docs;
      localStorage.setItem(key, String(version));
    }
    const out = [];
    docs.map(d => d.data()).sort((a, b) => a.i - b.i).forEach(d => out.push(...d.items));
    return out;
  },
  async saveMaterial(material, cardChunks, passageChunks, onProgress, imageChunks = []) {
    const version = Date.now();
    const total = cardChunks.length + passageChunks.length + imageChunks.length + 1; let done = 0;
    // 既存の chunk を消す（数が減った場合に備えて）
    for (const kind of ['cards', 'passages', 'images']) {
      const s = await getDocs(collection(db, 'materials', material.id, kind));
      let b = writeBatch(db), n = 0;
      for (const d of s.docs) { b.delete(d.ref); if (++n === 400) { await b.commit(); b = writeBatch(db); n = 0; } }
      if (n) await b.commit();
    }
    const write = async (kind, chunks) => {
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, 'materials', material.id, kind, String(i).padStart(3, '0')), { i, items: chunks[i] });
        onProgress?.(++done / total);
      }
    };
    await write('cards', cardChunks);
    await write('passages', passageChunks);
    await write('images', imageChunks);
    await setDoc(doc(db, 'materials', material.id), { ...material, version, cardChunks: cardChunks.length, passageChunks: passageChunks.length, imageChunks: imageChunks.length, updatedAt: serverTimestamp() });
    onProgress?.(1);
    return version;
  },

  // ---- 利用者・学習者 ----
  /** 管理者かどうか: config/admin はルールで管理者だけが読める（文書が無くても読めれば管理者） */
  async checkAdmin() {
    try { await getDoc(doc(db, 'config', 'admin')); return true; }
    catch (e) { if (e.code !== 'permission-denied') console.warn('admin check', e); return false; }
  },
  async ensureUser(user) {
    await setDoc(doc(db, 'users', user.uid), { email: user.email, name: user.name, lastSeen: serverTimestamp() }, { merge: true });
  },
  async listProfiles(uid) {
    const s = await getDocs(query(collection(db, 'users', uid, 'profiles'), orderBy('createdAt')));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async createProfile(uid, data) {
    const ref = doc(collection(db, 'users', uid, 'profiles'));
    await setDoc(ref, { ...data, createdAt: Date.now() });
    return ref.id;
  },
  async updateProfile(uid, pid, patch) { await updateDoc(doc(db, 'users', uid, 'profiles', pid), patch); },
  async deleteProfile(uid, pid) { await deleteDoc(doc(db, 'users', uid, 'profiles', pid)); },

  // ---- 学習の記録 ----
  subscribeCardStates(uid, pid, cb) {
    return onSnapshot(collection(db, 'users', uid, 'profiles', pid, 'cards'), snap => {
      const changes = snap.docChanges().map(ch => ({ type: ch.type, id: ch.doc.id, data: ch.doc.data() }));
      cb(changes, snap.metadata.fromCache);
    }, err => console.error('cardStates', err));
  },
  subscribeDays(uid, pid, cb) {
    return onSnapshot(collection(db, 'users', uid, 'profiles', pid, 'days'), snap => {
      cb(snap.docs.map(d => ({ key: d.id, ...d.data() })));
    }, err => console.error('days', err));
  },
  async saveReview(uid, pid, cardId, state, log, dayKey, dayDelta) {
    const base = ['users', uid, 'profiles', pid];
    const b = writeBatch(db);
    b.set(doc(db, ...base, 'cards', cardId), state);
    b.set(doc(collection(db, ...base, 'logs')), { cardId, ...log });
    const toInc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? toInc(v) : increment(v)]));
    b.set(doc(db, ...base, 'days', dayKey), { ...toInc(dayDelta), date: dayKey }, { merge: true });
    await b.commit();
  },

  // ---- 自分の教材（アカウントごと） ----
  async listOwnMaterials(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'materials'));
    return snap.docs.map(d => d.data()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },
  async loadOwnChunks(uid, materialId, count, version) {
    const col = collection(db, 'users', uid, 'materials', materialId, 'cards');
    const key = `ownver:${uid}:${materialId}`;
    let docs = [];
    if (localStorage.getItem(key) === String(version)) {
      try { const s = await getDocsFromCache(col); docs = s.docs; } catch (e) { docs = []; }
    }
    if (docs.length < count) { const s = await getDocs(col); docs = s.docs; localStorage.setItem(key, String(version)); }
    const out = [];
    docs.map(d => d.data()).sort((a, b) => a.i - b.i).forEach(d => out.push(...d.items));
    return out;
  },
  async saveOwnMaterial(uid, material, cardChunks) {
    const version = Date.now();
    const col = collection(db, 'users', uid, 'materials', material.id, 'cards');
    const old = await getDocs(col);
    let b = writeBatch(db), n = 0;
    for (const d of old.docs) { b.delete(d.ref); n++; }
    cardChunks.forEach((items, i) => { b.set(doc(col, String(i).padStart(3, '0')), { i, items }); n++; });
    b.set(doc(db, 'users', uid, 'materials', material.id), { ...material, version, cardChunks: cardChunks.length, createdAt: material.createdAt || Date.now() });
    await b.commit();
    return version;
  },
  async deleteOwnMaterial(uid, materialId) {
    const col = collection(db, 'users', uid, 'materials', materialId, 'cards');
    const old = await getDocs(col);
    const b = writeBatch(db);
    old.docs.forEach(d => b.delete(d.ref));
    b.delete(doc(db, 'users', uid, 'materials', materialId));
    await b.commit();
  },
  async saveBadges(uid, pid, badges) { await updateDoc(doc(db, 'users', uid, 'profiles', pid), { badges }); },
};
