import { h, toast } from '../dom.js';
import { APP_VERSION } from '../config.js';
import { icon } from './parts.js';

/** 設定: 学習者、1日の目標、教材、管理、ログアウト */
export function renderSettings(store, { go, isAdmin }) {
  const p = store.profile, g = p.settings.goals;
  const main = h('main', {});
  const row = (label, value, options, onchange) => {
    const id = 'g-' + label;
    return h('div', { class: 'set-row' }, h('label', { for: id }, label),
      h('select', { id, onchange: e => onchange(e.target.value) }, ...options.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(value) }, t))));
  };
  const link = (label, href, value = '') => h('a', { class: 'set-row', href }, h('span', {}, label), h('span', { class: 'row', style: { gap: '4px', color: 'var(--ink2)', fontWeight: 600 } }, value, icon('back', 18, 2.2)));
  // 「戻る」の矢印を右向きに
  const fix = el => { el.querySelectorAll('svg').forEach(s => { s.style.transform = 'rotate(180deg)'; }); return el; };

  main.append(
    h('h1', { class: 'page-title' }, '設定'),
    h('div', { class: 'sec-h' }, h('h2', {}, '学習者')),
    h('div', { class: 'list' },
      fix(link('学習者を切り替える・追加する', '#/profiles', p.name)),
      h('button', { class: 'set-row', style: { cursor: 'pointer' }, onclick: async () => {
        const name = prompt('学習者の名前', p.name); if (!name || !name.trim()) return;
        await store.renameProfile(name.trim()); toast('名前を変えました');
      } }, h('span', {}, '名前を変える'), h('span', { style: { color: 'var(--ink2)', fontWeight: 600 } }, p.name))),
    h('div', { class: 'sec-h' }, h('h2', {}, '1日の目標'), h('span', { class: 'small muted' }, 'ホームのリングの目標です。新しい語の目標は、教材ごとの「1日の新しい語」の合計です。')),
    h('div', { class: 'list' },
      row('学習時間', g.minutes, [10, 15, 20, 30, 45, 60, 90].map(n => [n, `${n}分`]), v => store.saveSettings({ goals: { ...g, minutes: Number(v) } })),
      row('回答', g.answers, [30, 50, 100, 150, 200, 300].map(n => [n, `${n}回`]), v => store.saveSettings({ goals: { ...g, answers: Number(v) } }))),
    h('div', { class: 'sec-h' }, h('h2', {}, '教材')),
    h('div', { class: 'list' }, fix(link('教材を追加・外す', '#/add', `${store.enabledMaterials().length}冊`))),
    isAdmin ? h('div', { class: 'sec-h' }, h('h2', {}, '管理')) : null,
    isAdmin ? h('div', { class: 'list' }, fix(link('家族の教材を登録・更新する', '#/admin'))) : null,
    h('div', { class: 'sec-h' }, h('h2', {}, 'アカウント')),
    h('div', { class: 'list' },
      h('div', { class: 'set-row' }, h('span', {}, 'ログイン中'), h('span', { style: { color: 'var(--ink2)', fontSize: '13px' } }, store.user.email)),
      h('button', { class: 'set-row', style: { color: 'var(--red)', cursor: 'pointer' }, onclick: () => store.backend.signOut() }, h('span', {}, 'ログアウト'), icon('logout', 20))),
    h('p', { class: 'center small muted', style: { marginTop: '20px' } }, `English Drill v${APP_VERSION}`),
    bootLine(),
  );
  return main;
}

/** 前回の起動にかかった時間（どこで待っているかを見るため） */
function bootLine() {
  let T; try { T = JSON.parse(localStorage.getItem('ed-boot-timing') || 'null'); } catch (e) { T = null; }
  if (!T?.done) return null;
  const s = ms => (ms / 1000).toFixed(1);
  const parts = [`開くまで ${s(T.auth)}`];
  if (T.lists) parts.push(`一覧 ${s(T.lists - T.auth)}（${T.listsFrom}）`);
  if (T.cards) parts.push(`教材 ${s(T.cards - T.lists)}`);
  if (T.states) parts.push(`学習記録 ${s(T.states - T.cards)}`);
  const c = T.cache && (T.cache.hit || T.cache.miss) ? ` ・教材の端末保存 ${T.cache.hit}/${T.cache.hit + T.cache.miss}` : '';
  return h('p', { class: 'center small muted', style: { marginTop: '4px', lineHeight: 1.6 } }, `前回の起動 ${s(T.done)}秒：${parts.join(' / ')}${c}`);
}
