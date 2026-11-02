// アプリの更新: 新しい版があるときだけ取り込み、自動で開き直す。
// - 開いたとき・アプリに戻ってきたとき（iPhone のホーム画面アプリは閉じずに戻ることが多い）・開いている間は 30 分ごとに確かめる。
// - 確かめるのは sw.js 1 つだけ（中身が同じなら何も取りに行かない）。
// - 学習の途中では開き直さず、学習を終えて別の画面に移ったときに開き直す。
let reg = null, lastCheck = 0, wanted = false, reloaded = false;
let isBusy = () => false;

function apply() {
  if (reloaded) return;
  if (isBusy()) { wanted = true; return; }
  reloaded = true;
  try { sessionStorage.setItem('ed-updated', '1'); } catch { /* 使えない環境では知らせを省く */ }
  location.reload();
}

/** 新しい版があるか確かめる。'found'（取り込み中）／'none'（最新）／'offline'／'unsupported' */
export async function checkForUpdate(force = false) {
  if (!reg) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  if (!force && Date.now() - lastCheck < 60_000) return 'none';
  lastCheck = Date.now();
  try { await reg.update(); } catch { return 'offline'; }
  return reg.installing || reg.waiting ? 'found' : 'none';
}

/** 起動のあとに 1 回呼ぶ。busy: 学習の途中など、今は開き直したくないとき true を返す関数 */
export function initUpdate({ busy, onUpdated }) {
  isBusy = busy;
  try { if (sessionStorage.getItem('ed-updated')) { sessionStorage.removeItem('ed-updated'); onUpdated?.(); } } catch { /* 同上 */ }
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // 初めて入れたときは開き直さない
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) apply(); });
  window.addEventListener('hashchange', () => { if (wanted && !isBusy()) apply(); });
  const check = () => { checkForUpdate().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30 * 60_000);
  navigator.serviceWorker.register('./sw.js').then(r => { reg = r; check(); }).catch(e => console.warn('sw', e));
}
