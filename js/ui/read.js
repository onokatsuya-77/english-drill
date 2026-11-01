import { h, clear } from '../dom.js';
import { backOf } from './study.js';

/** 速読英熟語の長文を読む画面 */
export function renderRead(store, { params }) {
  const [materialId, lessonNo] = params;
  const main = h('main', {}, h('p', { class: 'muted' }, '読み込み中…'));
  store.loadPassages(materialId).then(passages => {
    clear(main);
    if (!lessonNo) {
      main.append(h('div', { class: 'card list' }, h('h2', {}, '長文'), ...passages.map(p => h('a', { href: `#/read/${materialId}/${p.lesson}` }, `${p.lesson}. ${p.title_en}`, h('span', { class: 'muted small' }, `　${p.title_ja}`)))));
      return;
    }
    const p = passages.find(x => x.lesson === Number(lessonNo)); if (!p) { main.append('見つかりません'); return; }
    let showJa = false;
    const body = h('div', { class: 'passage' });
    const draw = () => { clear(body); for (const para of p.passage) { body.append(h('p', { html: mark(para.en, p.highlights) })); if (showJa) body.append(h('p', { class: 'ja' }, para.ja)); } };
    draw();
    const cards = (p.entryIds || []).map(id => store.cardIndex.get(id)).filter(Boolean);
    main.append(
      h('div', { class: 'row small muted' }, h('a', { href: `#/read/${materialId}` }, '← 一覧'), h('span', { class: 'grow' }), h('span', {}, `${p.words} words`)),
      h('div', { class: 'card' }, h('h2', {}, `${p.lesson}. ${p.title_en} / ${p.title_ja}`), body,
        p.footnotes?.length ? h('p', { class: 'muted small' }, '(注) ' + p.footnotes.join('　')) : null,
        h('p', {}, h('button', { onclick: () => { showJa = !showJa; draw(); } }, showJa ? '和訳を隠す' : '和訳を表示'))),
      cards.length ? h('div', { class: 'card' }, h('h2', {}, 'このレッスンの熟語・構文'),
        ...cards.map(c => h('details', {}, h('summary', { style: { cursor: 'pointer', padding: '6px 0' } }, h('b', {}, c.front), h('span', { class: 'tag' }, c.pos), ' ', h('span', { class: 'muted' }, c.meaning)), backOf(c)))) : null,
      p.extras?.length ? h('div', { class: 'card' }, ...p.extras.map(x => h('div', {}, h('h2', {}, x.title), h('ul', {}, ...x.items.map(i => h('li', {}, h('b', {}, i.phrase), ' ', i.meaning)))))) : null,
    );
  });
  return main;
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** 本文中の熟語（赤）・構文（青）を色付けする。highlights は出現順。 */
function mark(text, highlights) {
  let out = '', pos = 0; const t = text;
  for (const hl of highlights || []) {
    const parts = hl.text.split(' … ').filter(Boolean); let ok = true, i0 = pos, segs = [];
    for (const part of parts) { const i = t.indexOf(part, i0); if (i < 0) { ok = false; break; } segs.push([i, i + part.length]); i0 = i + part.length; }
    if (!ok || segs[0][0] < pos) continue;
    for (const [a, b] of segs) { out += esc(t.slice(pos, a)) + `<mark class="${hl.kind === '構文' ? 'c' : ''}">${esc(t.slice(a, b))}</mark>`; pos = b; }
  }
  return out + esc(t.slice(pos));
}
