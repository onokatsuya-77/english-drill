import { h, clear, toast } from '../dom.js';
import { normalize, chunk } from '../content.js';

export function renderAdmin(store, { go, isAdmin }) {
  if (!isAdmin) return h('main', {}, h('p', {}, '管理者だけが使えます。'));
  const status = h('div', {});
  const prog = h('progress', { max: 1, value: 0, style: { display: 'none' } });
  const list = h('div', {});
  const refreshList = () => { clear(list); list.append(...store.materials.map(m => h('div', { class: 'field' }, h('span', {}, `${m.title}（${m.id}）`), h('span', { class: 'small muted' }, `${m.cardCount} 枚 · ${m.decks.length} ${m.deckLabel} · 版 ${new Date(m.version).toLocaleString('ja-JP')}`)))); if (!store.materials.length) list.append(h('p', { class: 'muted' }, 'まだ登録されていません')); };
  refreshList();
  const input = h('input', { type: 'file', accept: '.json,application/json', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    clear(status); status.append(h('p', {}, `${f.name} を読んでいます…`));
    try {
      const data = JSON.parse(await f.text());
      const { material, cards, passages } = normalize(data);
      clear(status);
      status.append(h('p', {}, `${material.title}: ${cards.length} 枚、${material.decks.length} ${material.deckLabel}${passages.length ? `、長文 ${passages.length} 本` : ''}`),
        h('p', {}, h('button', { class: 'primary', onclick: async ev => {
          ev.target.disabled = true; prog.style.display = ''; prog.value = 0;
          try {
            await store.backend.saveMaterial(material, chunk(cards), chunk(passages, 10), p => { prog.value = p; });
            await store.refreshMaterials(); refreshList(); toast('登録しました');
            clear(status); status.append(h('p', {}, `${material.title} を登録しました。`));
          } catch (err) { alert('登録できませんでした: ' + err.message); ev.target.disabled = false; }
          prog.style.display = 'none';
        } }, '登録する')));
    } catch (err) { clear(status); status.append(h('p', { style: { color: 'var(--red)' } }, err.message)); }
    input.value = '';
  } });
  return h('main', {},
    h('div', { class: 'card' }, h('h2', {}, '教材の登録・更新'),
      h('p', { class: 'small muted' }, 'Drive の _試作_ フォルダにある JSON（tg1400_all_0001-1400.json、tg1900_all_0001-1900.json、sokujuku_all_L01-74.json）を選んでください。同じ教材を選ぶと更新されます（学習記録はそのまま）。'),
      h('p', {}, input), status, prog),
    h('div', { class: 'card' }, h('h2', {}, '登録済みの教材'), list),
    h('p', {}, h('button', { onclick: () => go('settings') }, '設定へ戻る')));
}
