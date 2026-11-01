import { h, clear } from '../dom.js';
import { backOf } from './study.js';
import { icon } from './parts.js';
import { canSpeak, speak, stopSpeaking } from '../speech.js';

/** 長文を読む画面（速読英熟語） */
export function renderRead(store, { params }) {
  const [materialId, lessonNo] = params;
  const m = store.material(materialId);
  const main = h('main', {});
  main.append(h('nav', { class: 'back-nav' }, h('a', { href: lessonNo ? `#/read/${materialId}` : `#/m/${materialId}` }, icon('back', 22, 2.2), lessonNo ? '長文の一覧' : (m?.title || '戻る'))));
  const body = h('div', {}, h('p', { class: 'note' }, '読み込み中…'));
  main.append(body);
  store.loadPassages(materialId).then(passages => {
    clear(body);
    if (!lessonNo) {
      body.append(h('h1', { class: 'page-title', style: { paddingTop: '6px' } }, '長文'),
        h('div', { class: 'list', style: { marginTop: '14px' } }, ...passages.map(p => h('a', { class: 'set-row', href: `#/read/${materialId}/${p.lesson}`, style: { flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '12px 16px', color: 'var(--ink)' } },
          h('span', { style: { fontWeight: 700 } }, `${p.lesson}. ${p.title_en}`), h('span', { class: 'small muted' }, `${p.title_ja} · ${p.words} words`)))));
      return;
    }
    const p = passages.find(x => x.lesson === Number(lessonNo)); if (!p) { body.append(h('p', { class: 'note' }, '見つかりません')); return; }
    let showJa = false;
    const text = h('div', { class: 'passage' });
    const draw = () => { clear(text); for (const para of p.passage) { text.append(h('p', { html: mark(para.en, p.highlights) })); if (showJa) text.append(h('p', { class: 'ja' }, para.ja)); } };
    draw();
    const cards = (p.entryIds || []).map(id => store.cardIndex.get(id)).filter(Boolean);
    const jaBtn = h('button', { class: 'btn outline sm', onclick: () => { showJa = !showJa; jaBtn.textContent = showJa ? '和訳を隠す' : '和訳を表示'; draw(); } }, '和訳を表示');
    body.append(
      h('section', { class: 'card' },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('span', { class: 'small muted' }, `Lesson ${p.lesson} · ${p.words} words`),
          h('h1', { style: { fontSize: '20px', fontWeight: 800 } }, p.title_en),
          h('span', { style: { fontSize: '14px', color: 'var(--ink2)' } }, p.title_ja)),
        h('div', { class: 'row', style: { gap: '8px' } }, jaBtn,
          canSpeak ? h('button', { class: 'btn outline sm', onclick: () => speak(p.passage.map(x => x.en).join(' '), { rate: 0.9 }) }, icon('speaker', 16), '読み上げ') : null,
          canSpeak ? h('button', { class: 'btn ghost sm', onclick: stopSpeaking }, '止める') : null),
        text,
        p.footnotes?.length ? h('p', { class: 'small muted', style: { lineHeight: 1.6 } }, '（注）' + p.footnotes.join('　')) : null),
      cards.length ? h('section', { class: 'card' }, h('h2', {}, 'このレッスンの熟語・構文'),
        ...cards.map(c => h('details', {}, h('summary', {}, h('b', {}, c.front), ' ', h('span', { class: 'muted', style: { fontSize: '13px' } }, c.meaning)), backOf(c)))) : null,
      p.extras?.length ? h('section', { class: 'card' }, ...p.extras.map(x => h('div', {}, h('h2', {}, x.title), h('ul', { style: { paddingLeft: '18px', lineHeight: 1.7 } }, ...x.items.map(i => h('li', {}, h('b', {}, i.phrase), ' ', i.meaning)))))) : null,
    );
  });
  main.dispose = stopSpeaking;
  return main;
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** 本文中の熟語（黄）・構文（青）に印をつける。highlights は出現順。 */
function mark(text, highlights) {
  let out = '', pos = 0; const t = text;
  for (const hl of highlights || []) {
    const parts = hl.text.split(' … ').filter(Boolean); let ok = true, i0 = pos; const segs = [];
    for (const part of parts) { const i = t.indexOf(part, i0); if (i < 0) { ok = false; break; } segs.push([i, i + part.length]); i0 = i + part.length; }
    if (!ok || segs[0][0] < pos) continue;
    for (const [a, b] of segs) { out += esc(t.slice(pos, a)) + `<mark class="${hl.kind === '構文' ? 'c' : ''}">${esc(t.slice(a, b))}</mark>`; pos = b; }
  }
  return out + esc(t.slice(pos));
}
