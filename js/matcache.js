// 教材データ（単語カード・挿絵・長文）を端末の IndexedDB に 1 つのまとまりとして保存する。
// Firestore の端末キャッシュから大きな文書を何十個も組み立て直すより、ずっと速く読める。
// キーごとに { version, items } を持ち、教材の版（version）が変わったときだけ取り直す。
const DB_NAME = 'ed-matcache', STORE = 'chunks';
let opening = null;

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return opening ||= new Promise(resolve => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/** 同じ版が保存されていればその items を、無ければ null を返す */
export async function getCached(key, version) {
  const db = await open(); if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => { const v = req.result; resolve(v && v.version === version ? v.items : null); };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export async function putCached(key, version, items) {
  const db = await open(); if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ version, items }, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch (e) { resolve(); }
  });
}

export async function deleteCached(prefix) {
  const db = await open(); if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite'); const st = tx.objectStore(STORE);
      const req = st.getAllKeys();
      req.onsuccess = () => req.result.filter(k => String(k).startsWith(prefix)).forEach(k => st.delete(k));
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch (e) { resolve(); }
  });
}
