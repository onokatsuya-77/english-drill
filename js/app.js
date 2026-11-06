// 画面の切り替えと共通の枠
import { h, clear, toast } from './dom.js';
import { Store } from './model.js';
import { APP_VERSION } from './config.js';
import { icon } from './ui/parts.js';
import { renderHome } from './ui/home.js';
import { renderMaterial } from './ui/material.js';
import { renderStudy } from './ui/study.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';
import { renderAdmin } from './ui/admin.js';
import { renderRead } from './ui/read.js';
import { renderProfiles } from './ui/profiles.js';
import { renderAdd } from './ui/add.js';
import { renderPlay } from './ui/play.js';
import { initUpdate } from './update.js';

const useMock = new URLSearchParams(location.search).get('mock') === '1';
const { backend } = await import(useMock ? './backend-mock.js' : './backend-firebase.js');
const store = new Store(backend);
window.store = store; // デバッグ用

const routes = { '': renderHome, m: renderMaterial, study: renderStudy, progress: renderProgress, settings: renderSettings, admin: renderAdmin, read: renderRead, profiles: renderProfiles, add: renderAdd, play: renderPlay };
const TABS = [['', 'book', 'ホーム'], ['progress', 'rings', '記録'], ['settings', 'sliders', '設定']];
const TAB_OF = { '': '', m: '', add: '', read: '', progress: 'progress', settings: 'settings', admin: 'settings', profiles: 'settings' };

export const go = path => { location.hash = '#/' + path; };

const root = document.getElementById('app');
let current = null; // 現在の画面（後始末と、自分で描画を管理するかどうか）
let lastPath = null;
function render() {
  if (current?.dispose) current.dispose();
  current = null;
  clear(root);
  const [path, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  if (!store.ready) { root.append(h('main', { class: 'bare center', style: { justifyContent: 'center' } }, h('p', { class: 'muted' }, store.loading || '読み込み中…'))); return; }
  if (!store.user) { root.append(renderLogin()); return; }
  if (store.denied) { root.append(renderDenied()); return; }
  if (!store.profile || path === 'profiles') { root.append(shell(renderProfiles(store, { go }), store.profile ? 'profiles' : null)); return; }
  if (store.loading) { root.append(h('main', { class: 'bare center', style: { justifyContent: 'center' } }, h('p', { class: 'muted' }, store.loading))); return; }
  const view = routes[path] || renderHome;
  const el = view(store, { go, isAdmin: store.isAdmin, params });
  current = el;
  root.append(path === 'study' || path === 'play' ? el : shell(el, path));
}
function shell(content, path) {
  const frag = document.createDocumentFragment();
  frag.append(content);
  if (path != null) {
    const tab = TAB_OF[path] ?? '';
    frag.append(h('nav', { class: 'tabs', 'aria-label': 'メイン' },
      ...TABS.map(([p, ic, label]) => h('a', { href: '#/' + p, 'aria-current': p === tab ? 'page' : null }, icon(ic, 24), label))));
  }
  return frag;
}
function brand() {
  return h('div', { class: 'brand' },
    h('span', { html: '<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect x="7" y="4" width="22" height="28" rx="5" fill="#141A33" transform="rotate(8 18 18)"/><rect x="6" y="5" width="22" height="28" rx="5" fill="#FFFFFF" stroke="#141A33" stroke-width="2"/><rect x="10" y="15" width="14" height="6" rx="2" fill="#FFE14D"/><path d="M11 18h12" stroke="#141A33" stroke-width="2" stroke-linecap="round"/></svg>', style: { display: 'inline-flex' } }),
    'English Drill');
}
function renderLogin() {
  const curve = '<svg width="100%" height="118" viewBox="0 0 314 118" role="img" aria-label="記憶の残り方のグラフ。復習するたびに忘れにくくなり、復習しないと忘れていく。"><path d="M8 104H306" stroke="#E6E8F0" stroke-width="1.5"/><path d="M56 74C88 88 140 96 306 100" fill="none" stroke="#9AA0B8" stroke-width="2" stroke-dasharray="4 5"/><path d="M8 10C20 48 34 66 56 74L56 10C80 38 108 52 146 56L146 10C186 26 240 34 306 38" fill="none" stroke="#3D4BE0" stroke-width="3" stroke-linejoin="round"/><circle cx="56" cy="10" r="6" fill="#FFE14D" stroke="#141A33" stroke-width="2"/><circle cx="146" cy="10" r="6" fill="#FFE14D" stroke="#141A33" stroke-width="2"/><text x="64" y="14" font-size="11" font-weight="700" fill="#141A33">復習</text><text x="154" y="14" font-size="11" font-weight="700" fill="#141A33">復習</text><text x="306" y="30" font-size="11" font-weight="700" fill="#2F3BC4" text-anchor="end">忘れにくくなる</text><text x="306" y="92" font-size="11" fill="#5B6178" text-anchor="end">復習しないと…</text></svg>';
  const feat = (ic, bg, ink, text) => h('li', {}, h('span', { class: 'ic', style: { background: bg, color: ink } }, icon(ic, 20)), text);
  return h('main', { class: 'login bare' },
    brand(),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h1', {}, '忘れる前に、', h('br'), h('span', { class: 'mark' }, 'もう一度。')),
      h('p', { class: 'lead' }, '覚えた単語を、忘れかけたちょうどいいタイミングで出題します。英検1級まで、教材ごとに毎日少しずつ。')),
    h('figure', { style: { margin: 0, padding: '14px 14px 10px', borderRadius: '20px', background: '#fff', boxShadow: '0 1px 2px rgba(20,26,51,.06)' }, html: curve }),
    h('ul', {},
      feat('book', 'var(--indigoTint)', 'var(--indigoInk)', '教材ごとに、今日の復習と新しい語'),
      feat('grid', 'var(--orangeTint)', 'var(--orange)', 'カード・4択・つづり・穴埋め・リスニング'),
      feat('phone', 'var(--tealTint)', 'var(--teal)', 'スマホでもパソコンでも、電波がなくても')),
    h('div', { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('button', { class: 'btn dark block', style: { height: '56px' }, onclick: () => { backend.signIn().catch(e => alert('ログインできませんでした: ' + e.message)); } }, icon('logout', 20), 'Google でログイン'),
      store.error ? h('p', { class: 'small', style: { color: 'var(--red)', textAlign: 'center' } }, store.error) : null,
      h('p', { class: 'small muted center', style: { lineHeight: 1.6 } }, '家族として登録された Google アカウントで使えます。', h('br'), `v${APP_VERSION}${useMock ? '（テストモード）' : ''}`)));
}
function renderDenied() {
  return h('main', { class: 'login bare' }, brand(),
    h('h1', { style: { fontSize: '24px' } }, 'このアカウントは登録されていません'),
    h('p', { class: 'lead' }, `${store.user.email} はまだ家族として登録されていません。管理者に追加してもらってから、もう一度ログインしてください。`),
    h('button', { class: 'btn outline block', onclick: () => backend.signOut() }, '別のアカウントでログイン'));
}

let pending = false;
store.addEventListener('change', () => {
  if (current?.sticky) return; // 学習画面は自分で描画を管理する
  if (pending) return; pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
});
window.addEventListener('hashchange', render);
await store.start();
render();
if (!useMock && location.protocol === 'https:') {
  // 新しい版があるときだけ取り込んで開き直す（学習の途中は、終わってから）
  initUpdate({ busy: () => !!current?.sticky, onUpdated: () => toast(`新しい版（v${APP_VERSION}）にしました`) });
}
