// 画面の切り替えと共通の枠
import { h, clear } from './dom.js';
import { Store } from './model.js';
import { APP_VERSION } from './config.js';
import { renderHome } from './ui/home.js';
import { renderStudy } from './ui/study.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';
import { renderAdmin } from './ui/admin.js';
import { renderRead } from './ui/read.js';
import { renderProfiles } from './ui/profiles.js';

const useMock = new URLSearchParams(location.search).get('mock') === '1';
const { backend } = await import(useMock ? './backend-mock.js' : './backend-firebase.js');
const store = new Store(backend);
window.store = store; // デバッグ用

const routes = { '': renderHome, study: renderStudy, progress: renderProgress, settings: renderSettings, admin: renderAdmin, read: renderRead, profiles: renderProfiles };
const TABS = [['', '🏠', 'ホーム'], ['study', '📖', '学習'], ['progress', '📈', '進捗'], ['settings', '⚙️', '設定']];

export const isAdmin = () => !!store.user && !!store.isAdmin;
export const go = path => { location.hash = '#/' + path; };

const root = document.getElementById('app');
let current = null; // 現在の画面の後始末
function render() {
  if (current?.dispose) current.dispose(); current = null;
  clear(root);
  const [path, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const params = rest;
  if (!store.ready) { root.append(h('main', { class: 'center' }, h('p', { class: 'muted' }, store.loading || '読み込み中…'))); return; }
  if (!store.user) { root.append(renderLogin()); return; }
  if (!store.profile || path === 'profiles') { root.append(shell(renderProfiles(store, { go }), 'profiles')); return; }
  if (store.loading) { root.append(shell(h('main', { class: 'center' }, h('p', { class: 'muted' }, store.loading)), path)); return; }
  const view = routes[path] || renderHome;
  const el = view(store, { go, isAdmin: isAdmin(), params });
  current = el;
  root.append(shell(el, path));
}
function shell(content, path) {
  const frag = document.createDocumentFragment();
  frag.append(h('header', { class: 'top' },
    h('span', { class: 'title' }, 'English Drill'),
    h('a', { class: 'who', href: '#/profiles' }, store.profile ? `${store.profile.name} ▾` : '')));
  frag.append(content);
  if (path !== 'study') frag.append(h('nav', { class: 'tabs' }, ...TABS.map(([p, ic, label]) => h('a', { href: '#/' + p, class: p === path ? 'active' : '' }, h('span', { class: 'ic' }, ic), label))));
  return frag;
}
function renderLogin() {
  return h('main', { class: 'login' },
    h('h1', {}, 'English Drill'),
    h('p', { class: 'muted' }, '忘却曲線に合わせて復習する英語学習アプリ'),
    h('p', {}, h('button', { class: 'primary big', style: { maxWidth: '320px' }, onclick: async () => { try { await backend.signIn(); } catch (e) { alert('ログインできませんでした: ' + e.message); } } }, 'Google でログイン')),
    store.error ? h('p', { class: 'muted small' }, store.error) : null,
    h('p', { class: 'muted small' }, `v${APP_VERSION}${useMock ? '（テストモード）' : ''}`));
}

let pending = false;
store.addEventListener('change', () => {
  if (current?.sticky) return; // 学習画面は自分で描画を管理する
  if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); });
});
window.addEventListener('hashchange', render);
await store.start();
render();
if ('serviceWorker' in navigator && !useMock && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('sw', e));
