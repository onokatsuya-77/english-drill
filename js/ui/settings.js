import { h, toast } from '../dom.js';
import { APP_VERSION } from '../config.js';

export function renderSettings(store, { go, isAdmin }) {
  const s = store.profile.settings;
  const save = async patch => { try { await store.saveSettings(patch); toast('保存しました'); } catch (e) { alert('保存できませんでした: ' + e.message); } };
  const main = h('main', {},
    h('div', { class: 'card' }, h('h2', {}, '学習'),
      field('1 日に始める新しいカード', h('select', { onchange: e => save({ newPerDay: Number(e.target.value) }) },
        ...[0, 5, 10, 15, 20, 30, 50].map(n => h('option', { value: n, selected: s.newPerDay === n }, `${n} 枚`)))),
      field('出題の向き', h('select', { onchange: e => save({ direction: e.target.value }) },
        h('option', { value: 'en-ja', selected: s.direction === 'en-ja' }, '英語 → 日本語'),
        h('option', { value: 'ja-en', selected: s.direction === 'ja-en' }, '日本語 → 英語')))),
    h('div', { class: 'card' }, h('h2', {}, '教材'),
      ...store.materials.map(m => materialSettings(store, m, save)),
      !store.materials.length ? h('p', { class: 'muted' }, '教材が登録されていません。') : null),
    h('div', { class: 'card' }, h('h2', {}, '学習者'),
      field('名前', h('button', { onclick: async () => { const n = prompt('名前', store.profile.name); if (n && n !== store.profile.name) { await store.renameProfile(n); toast('変更しました'); } } }, store.profile.name)),
      field('学習者を切り替える', h('button', { onclick: () => go('profiles') }, '一覧')),
      field(store.user.email, h('button', { onclick: () => store.backend.signOut() }, 'ログアウト'))),
    isAdmin ? h('div', { class: 'card' }, h('h2', {}, '管理'), field('教材の登録・更新', h('button', { onclick: () => go('admin') }, '管理画面'))) : null,
    h('p', { class: 'muted small center' }, `English Drill v${APP_VERSION}`),
  );
  return main;
}
const field = (label, ctrl) => h('div', { class: 'field' }, h('span', {}, label), ctrl);

function materialSettings(store, m, save) {
  const ms = store.profile.settings.materials[m.id] || { enabled: true };
  const setM = patch => save({ materials: { ...store.profile.settings.materials, [m.id]: { ...ms, ...patch } } });
  const enabled = ms.enabled !== false;
  const deckSel = ms.decks; // undefined = 全部
  const decks = h('details', { open: false },
    h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, deckSel ? `新しいカードを出す範囲: ${deckSel.length} / ${m.decks.length} ${m.deckLabel}` : `新しいカードを出す範囲: すべての ${m.deckLabel}`),
    h('div', { class: 'row small', style: { marginTop: '6px' } },
      h('button', { class: 'ghost', onclick: () => setM({ decks: undefined }) }, 'すべて'),
      h('button', { class: 'ghost', onclick: () => setM({ decks: [] }) }, 'なし')),
    h('div', { class: 'decks' }, ...m.decks.map(d => h('label', {},
      h('input', { type: 'checkbox', checked: !deckSel || deckSel.includes(d.no), onchange: e => {
        const cur = new Set(deckSel || m.decks.map(x => x.no)); e.target.checked ? cur.add(d.no) : cur.delete(d.no);
        const arr = [...cur].sort((a, b) => a - b); setM({ decks: arr.length === m.decks.length ? undefined : arr });
      } }), `${d.title} (${d.count})`))));
  return h('div', { class: 'field', style: { display: 'block' } },
    h('div', { class: 'row' }, h('label', { class: 'grow' }, h('input', { type: 'checkbox', checked: enabled, onchange: e => setM({ enabled: e.target.checked }) }), ' ', m.title),
      h('span', { class: 'small muted' }, `${m.cardCount} 枚`)),
    enabled ? decks : null);
}
