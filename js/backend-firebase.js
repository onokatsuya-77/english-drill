// Firebase（Auth + Firestore）を使うデータ層。アプリの他の部分はこのインターフェースだけを使う。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, writeBatch, query, orderBy, onSnapshot,
  serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { getCached, putCached, deleteCached } from "./matcache.js";

/** chunk 文書（{ i, items }）を番号順につないで 1 つの配列にする */
const flatChunks = docs => docs.map(d => d.data()).sort((a, b) => a.i - b.i).flatMap(d => d.items);

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
    // 端末の教材キャッシュ（IndexedDB）に同じ版があれば、通信も Firestore のキャッシュも使わない
    const key = `m:${materialId}:${kind}`;
    const hit = await getCached(key, version);
    if (hit) return hit;
    const s = await getDocs(collection(db, 'materials', materialId, kind));
    const out = flatChunks(s.docs);
    if (s.docs.length >= count && !s.metadata.fromCache) putCached(key, version, out);
    return out;
  },
  async saveMaterial(material, cardChunks, passageChunks, onProgress, imageChunks = []) {
    const version = Date.now();
    const total = cardChunks.length + passageChunks.length + imageChunks.length + 1; let done = 0;
    const col = kind => collection(db, 'materials', material.id, kind);
    const pad = i => String(i).padStart(3, '0');
    // 前の版より chunk の数が減ったときだけ、余った chunk を消す（前の版を読み込み直さない）
    const prev = (await getDoc(doc(db, 'materials', material.id))).data() || {};
    const surplus = [];
    for (const [kind, n, old] of [['cards', cardChunks.length, prev.cardChunks], ['passages', passageChunks.length, prev.passageChunks], ['images', imageChunks.length, prev.imageChunks]]) {
      for (let i = n; i < (old || 0); i++) surplus.push(doc(col(kind), pad(i)));
    }
    if (surplus.length) { const b = writeBatch(db); surplus.forEach(r => b.delete(r)); await b.commit(); }
    // 3 つずつ並べて書き込む
    const jobs = [...cardChunks.map((c, i) => ['cards', i, c]), ...passageChunks.map((c, i) => ['passages', i, c]), ...imageChunks.map((c, i) => ['images', i, c])];
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [kind, i, items] = jobs[next++];
        await setDoc(doc(col(kind), pad(i)), { i, items });
        onProgress?.(++done / total);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await setDoc(doc(db, 'materials', material.id), { ...material, version, cardChunks: cardChunks.length, passageChunks: passageChunks.length, imageChunks: imageChunks.length, updatedAt: serverTimestamp() });
    // 登録した端末では、いま書いた中身をそのまま教材キャッシュに入れる（読み込み直さない）
    await Promise.all([
      putCached(`m:${material.id}:cards`, version, cardChunks.flat()),
      passageChunks.length ? putCached(`m:${material.id}:passages`, version, passageChunks.flat()) : null,
      imageChunks.length ? putCached(`m:${material.id}:images`, version, imageChunks.flat()) : null,
    ]);
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
    const key = `own:${uid}:${materialId}:cards`;
    const hit = await getCached(key, version);
    if (hit) return hit;
    const s = await getDocs(collection(db, 'users', uid, 'materials', materialId, 'cards'));
    const out = flatChunks(s.docs);
    if (s.docs.length >= count && !s.metadata.fromCache) putCached(key, version, out);
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
    await putCached(`own:${uid}:${material.id}:cards`, version, cardChunks.flat());
    return version;
  },
  async deleteOwnMaterial(uid, materialId) {
    const col = collection(db, 'users', uid, 'materials', materialId, 'cards');
    const old = await getDocs(col);
    const b = writeBatch(db);
    old.docs.forEach(d => b.delete(d.ref));
    b.delete(doc(db, 'users', uid, 'materials', materialId));
    await b.commit();
    await deleteCached(`own:${uid}:${materialId}:`);
  },
  async saveBadges(uid, pid, badges) { await updateDoc(doc(db, 'users', uid, 'profiles', pid), { badges }); },
};
