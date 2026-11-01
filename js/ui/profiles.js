import { h, toast } from '../dom.js';

/** 学習者（プロファイル）の選択・作成。1 つの Google アカウントで複数の学習者を持てる。 */
export function renderProfiles(store, { go }) {
  const create = async () => {
    const name = prompt('学習者の名前（例: 勝也、英検準1級用）'); if (!name) return;
    try { await store.createProfile(name.trim()); toast('作成しました'); go(''); } catch (e) { alert('作成できませんでした: ' + e.message); }
  };
  return h('main', {},
    h('div', { class: 'card' }, h('h2', {}, '学習者を選ぶ'),
      h('p', { class: 'small muted' }, `${store.user.email} でログイン中。学習の記録は学習者ごとに分かれます。`),
      ...store.profiles.map(p => h('p', {}, h('button', { class: 'big' + (store.profile?.id === p.id ? ' primary' : ''), onclick: async () => { await store.selectProfile(p.id); go(''); } }, p.name))),
      h('p', {}, h('button', { class: 'big', onclick: create }, '＋ 学習者を追加'))),
    h('p', { class: 'center' }, h('button', { class: 'ghost', onclick: () => store.backend.signOut() }, 'ログアウト')));
}
