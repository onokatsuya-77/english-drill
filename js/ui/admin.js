import { h, clear, toast } from '../dom.js';
import { normalize, chunk } from '../content.js';
import { icon } from './parts.js';

/** 管理: 家族の教材（JSON）を Firestore に登録・更新する */
export function renderAdmin(store, { go, isAdmin }) {
  const main = h('main', {});
  main.append(h('nav', { class: 'back-nav' }, h('a', { href: '#/settings' }, icon('back', 22, 2.2), '設定')));
  if (!isAdmin) { main.append(h('p', { class: 'note' }, '管理者だけが使えます。')); return main; }
  const status = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const list = h('div', { class: 'list' });
  const refreshList = () => {
    clear(list);
    const shared = store.materials.filter(m => !m.own);
    if (!shared.length) list.append(h('div', { class: 'set-row' }, h('span', { class: 'muted' }, 'まだ登録されていません')));
    for (const m of shared) list.append(h('div', { class: 'set-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '12px 16px' } },
      h('span', { style: { fontWeight: 700 } }, `${m.title}（${m.id}）`),
      h('span', { class: 'small muted' }, `${m.cardCount}枚 · ${m.decks.length} ${m.deckLabel} · ${new Date(m.version).toLocaleString('ja-JP')} 登録`)));
  };
  refreshList();
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    clear(status); status.append(h('p', { class: 'small muted' }, `${f.name} を読んでいます…`));
    try {
      const { material, cards, passages } = normalize(JSON.parse(await f.text()));
      const prog = h('progress', { max: 1, value: 0, style: { width: '100%' } });
      clear(status);
      status.append(h('p', { style: { fontSize: '14px' } }, `${material.title}: ${cards.length}枚、${material.decks.length} ${material.deckLabel}${passages.length ? `、長文 ${passages.length}本` : ''}`),
        h('button', { class: 'btn primary block', onclick: async ev => {
          ev.target.disabled = true; status.append(prog);
          try {
            await store.backend.saveMaterial(material, chunk(cards), chunk(passages, 10), p => { prog.value = p; });
            await store.refreshMaterials(); refreshList(); toast('登録しました');
            clear(status); status.append(h('p', { style: { fontSize: '14px', color: 'var(--teal)', fontWeight: 700 } }, `${material.title} を登録しました。`));
          } catch (err) { alert('登録できませんでした: ' + err.message); ev.target.disabled = false; }
        } }, '登録する'));
    } catch (err) { clear(status); status.append(h('p', { class: 'small', style: { color: 'var(--red)' } }, err.message)); }
    input.value = '';
  } });
  main.append(
    h('section', { class: 'card' },
      h('h2', {}, '家族の教材を登録・更新'),
      h('p', { style: { fontSize: '13px', lineHeight: 1.6, color: 'var(--ink2)' } }, 'Drive の _試作_ フォルダにある JSON（tg1400_all_0001-1400.json、tg1900_all_0001-1900.json、sokujuku_all_L01-74.json）を選んでください。同じ教材を選ぶと更新されます（学習の記録はそのまま）。'),
      h('button', { class: 'btn outline block', onclick: () => input.click() }, icon('file', 20), 'JSON を選ぶ'), input, status),
    h('div', { class: 'sec-h' }, h('h2', {}, '登録済みの教材')), list);
  return main;
}
