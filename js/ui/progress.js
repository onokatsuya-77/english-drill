import { h, fmtMin, fmtNum } from '../dom.js';
import { BADGES, earnedBadges, dayKey, dayStart } from '../model.js';

export function renderProgress(store) {
  const tot = store.totals(); const streak = store.streak(); const earned = new Set(earnedBadges(store));
  const main = h('main', {},
    h('div', { class: 'card' }, h('h2', {}, '全体'),
      h('div', { class: 'stats' },
        st(fmtNum(tot.reviews), '回答の合計'), st(fmtMin(tot.studyMs), '学習時間'), st(`${streak}日`, '連続'),
        st(fmtNum(tot.mature), '定着したカード'), st(fmtNum(tot.studiedDays), '学習した日数'), st(fmtNum(store.states.size), '学習したカード'))),
    h('div', { class: 'card' }, h('h2', {}, '最近 4 週間の回答数'), chart(store)),
    ...store.materials.filter(m => store.cards.has(m.id)).map(m => materialCard(store, m)),
    h('div', { class: 'card' }, h('h2', {}, 'バッジ'),
      h('div', { class: 'badges' }, ...BADGES.map(b => h('div', { class: 'badge' + (earned.has(b.id) ? '' : ' off'), title: b.desc }, h('div', { class: 'ic' }, b.icon), h('div', { class: 't' }, b.title))))),
  );
  return main;
}
const st = (n, l) => h('div', {}, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));

function chart(store) {
  const days = []; const start = dayStart() - 27 * 86400000;
  for (let i = 0; i < 28; i++) { const k = dayKey(start + i * 86400000); days.push({ k, v: store.days.find(d => d.key === k)?.reviews || 0 }); }
  const max = Math.max(1, ...days.map(d => d.v)); const W = 560, H = 120, bw = W / 28;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart');
  days.forEach((d, i) => {
    const hgt = d.v / max * (H - 24);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', i * bw + 2); r.setAttribute('y', H - 18 - hgt); r.setAttribute('width', bw - 4); r.setAttribute('height', hgt); r.setAttribute('rx', 2);
    r.setAttribute('fill', i === 27 ? 'var(--accent)' : 'var(--young)'); svg.append(r);
    if (d.v) { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', i * bw + bw / 2); t.setAttribute('y', H - 22 - hgt); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '9'); t.setAttribute('fill', 'var(--muted)'); t.textContent = d.v; svg.append(t); }
    if (i % 7 === 6 || i === 27) { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', i * bw + bw / 2); t.setAttribute('y', H - 4); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '10'); t.setAttribute('fill', 'var(--muted)'); t.textContent = d.k.slice(5).replace('-', '/'); svg.append(t); }
  });
  return svg;
}

function materialCard(store, m) {
  const { counts, decks } = store.progress(m.id);
  const pct = k => (counts[k] / Math.max(1, counts.total) * 100) + '%';
  const open = h('details', {}, h('summary', { class: 'muted small', style: { cursor: 'pointer', marginTop: '8px' } }, `${m.deckLabel || 'Deck'} ごとの内訳`),
    h('table', {}, h('tr', {}, h('th', {}, m.deckLabel || ''), h('th', {}, '未学習'), h('th', {}, '学習中'), h('th', {}, '復習'), h('th', {}, '定着')),
      ...decks.map(d => h('tr', {}, h('td', {}, d.title), h('td', {}, d.new), h('td', {}, d.learning), h('td', {}, d.young), h('td', {}, d.mature)))));
  return h('div', { class: 'card' }, h('h2', {}, m.title),
    h('div', { class: 'bar' }, h('span', { class: 'c-mature', style: { width: pct('mature') } }), h('span', { class: 'c-young', style: { width: pct('young') } }), h('span', { class: 'c-learning', style: { width: pct('learning') } })),
    h('div', { class: 'legend' }, leg('c-mature', `定着 ${fmtNum(counts.mature)}`), leg('c-young', `復習中 ${fmtNum(counts.young)}`), leg('c-learning', `学習中 ${fmtNum(counts.learning)}`), leg('c-new', `未学習 ${fmtNum(counts.new)}`), h('span', {}, `合計 ${fmtNum(counts.total)}`)),
    open);
}
const leg = (c, t) => h('span', {}, h('i', { class: c }), t);
