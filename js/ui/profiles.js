import { h, toast } from '../dom.js';
import { icon } from './parts.js';

/** 学習者（プロファイル）の選択・作成。1 つの Google アカウントで複数の学習者を持てる。 */
export function renderProfiles(store, { go }) {
  const create = async () => {
    const name = prompt('学習者の名前（例: 勝也、英検準1級用）'); if (!name || !name.trim()) return;
    try { await store.createProfile(name.trim()); toast('学習者を作りました'); go('add'); } catch (e) { alert('作成できませんでした: ' + e.message); }
  };
  const main = h('main', { class: store.profile ? '' : 'bare' },
    h('h1', { class: 'page-title' }, '学習者を選ぶ'),
    h('p', { class: 'small muted', style: { padding: '8px 20px 0', lineHeight: 1.6 } }, `${store.user.email} でログイン中。学習の記録は学習者ごとに分かれます。`),
    h('div', { class: 'list', style: { marginTop: '16px' } },
      ...store.profiles.map(p => h('button', { class: 'set-row', style: { cursor: 'pointer', minHeight: '64px' }, onclick: async () => { await store.selectProfile(p.id); go(''); } },
        h('span', { class: 'row', style: { gap: '12px' } }, h('span', { class: 'avatar', style: { width: '40px', height: '40px', fontSize: '16px' } }, (p.name || '?').slice(0, 1)), h('span', { style: { fontWeight: 700 } }, p.name)),
        store.profile?.id === p.id ? h('span', { class: 'row', style: { gap: '4px', color: 'var(--teal)', fontSize: '13px', fontWeight: 700 } }, icon('check', 16, 2.4), '選択中') : h('span'))),
      h('button', { class: 'set-row', style: { cursor: 'pointer', color: 'var(--indigoInk)', fontWeight: 700 }, onclick: create }, h('span', { class: 'row', style: { gap: '8px' } }, icon('plus', 20, 2.2), '学習者を追加'))),
    h('p', { class: 'center', style: { marginTop: '24px' } }, h('button', { class: 'btn ghost', onclick: () => store.backend.signOut() }, 'ログアウト')));
  return main;
}
