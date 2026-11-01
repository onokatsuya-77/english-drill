// 画面で共通に使う部品: アイコン、リング、メダル、帯グラフ、表紙の色。
import { h } from '../dom.js';
import { MASTERY, TRACK } from '../model.js';

const NS = 'http://www.w3.org/2000/svg';
/** SVG 文字列から要素をつくる */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  book: '<path d="M4 19V6a2 2 0 0 1 2-2h4v15H6a2 2 0 0 0-2 2"/><path d="M10 4h8a2 2 0 0 1 2 2v13H10"/><path d="M4 21h16"/>',
  rings: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z"/>',
  speaker: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  text: '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  grid: '<rect x="3" y="4" width="8" height="7" rx="2"/><rect x="13" y="4" width="8" height="7" rx="2"/><rect x="3" y="13" width="8" height="7" rx="2"/><rect x="13" y="13" width="8" height="7" rx="2"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
};
/** 線のアイコン */
export function icon(name, size = 22, sw = 2) {
  return svg(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
}

/** 今日の目標のリング（学習時間・回答・新しい語） */
export function rings(fracs, size = 112, label = '') {
  const r = [48, 36, 24], c = r.map(x => 2 * Math.PI * x), col = ['#7C8CFF', '#F7A23B', '#3CCFE0'];
  const parts = r.map((rr, i) => {
    const f = Math.max(0, Math.min(1, fracs[i] || 0));
    return `<circle cx="56" cy="56" r="${rr}" fill="none" stroke="${col[i]}" stroke-opacity="0.22" stroke-width="10"/>` +
      (f > 0 ? `<circle cx="56" cy="56" r="${rr}" fill="none" stroke="${col[i]}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(f * c[i]).toFixed(2)} ${c[i].toFixed(2)}" transform="rotate(-90 56 56)"/>` : '');
  }).join('');
  return svg(`<svg width="${size}" height="${size}" viewBox="0 0 112 112" role="img" aria-label="${esc(label)}">${parts}</svg>`);
}

/** 小さいリング（記録画面の今週） */
export function miniRings(fracs, label) {
  const r = [17, 12, 7], col = ['#7C8CFF', '#F7A23B', '#3CCFE0'];
  const parts = r.map((rr, i) => {
    const c = 2 * Math.PI * rr, f = Math.max(0, Math.min(1, fracs[i] || 0));
    return `<circle cx="20" cy="20" r="${rr}" fill="none" stroke="${col[i]}" stroke-opacity="0.22" stroke-width="4"/>` +
      (f > 0 ? `<circle cx="20" cy="20" r="${rr}" fill="none" stroke="${col[i]}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(f * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 20 20)"/>` : '');
  }).join('');
  return svg(`<svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label="${esc(label)}">${parts}</svg>`);
}

// ---- メダル（硬貨の縁の目盛り。色は種類ごと＝リングの色） ----
export const BADGE_COLOR = { first: '#FFFFFF', streak: '#FFD84D', answers: '#F7A23B', words: '#3CCFE0', hours: '#7C8CFF' };
const BADGE_EN = { first: 'FIRST DAY', streak: 'DAY STREAK', answers: 'ANSWERS', words: 'WORDS', hours: 'HOURS' };
const BADGE_ICON = {
  first: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.8l6.1-.9z',
  streak: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z',
  answers: 'M5 12.5l4.5 4.5L19 7.5',
  words: 'M4 19V6a2 2 0 0 1 2-2h5v15H6a2 2 0 0 0-2 2M11 4h7a2 2 0 0 1 2 2v13h-9',
  hours: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 7v5l3 2',
};
/** メダル。b: { cat, mark, earned, value, goal, name } */
export function medal(b, size = 88, disc = null) {
  const c = BADGE_COLOR[b.cat], L = !b.earned;
  const C = 2 * Math.PI * 46, f = L ? Math.max(0, Math.min(1, b.value / b.goal)) : 1;
  const fs = b.mark.length >= 4 ? 21 : b.mark.length === 3 ? 26 : 30, ny = b.mark.length >= 4 ? 61 : 63;
  const soft = L ? '#5D668F' : c;
  const aria = `${b.name}${L ? `（あと ${(b.goal - b.value).toLocaleString()}${b.unit}）` : '（獲得）'}`;
  return svg(`<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(aria)}">
    <circle cx="50" cy="50" r="46" fill="${disc || (L ? '#161C38' : '#1C2447')}"/>
    <circle cx="50" cy="50" r="46" fill="none" stroke="${L ? '#2A3260' : c}" stroke-opacity="${L ? 1 : 0.25}" stroke-width="3"/>
    ${f > 0 ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
    <circle cx="50" cy="50" r="39" fill="none" stroke="${L ? '#2A3260' : c}" stroke-opacity="${L ? 1 : 0.45}" stroke-width="2.5" stroke-dasharray="0.9 2.16"/>
    <path d="${BADGE_ICON[b.cat]}" transform="translate(43.5 20) scale(0.54)" fill="none" stroke="${soft}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="${ny}" text-anchor="middle" font-size="${fs}" font-weight="800" letter-spacing="-0.5" fill="${L ? '#6B7399' : '#FFFFFF'}" font-family="Plus Jakarta Sans, sans-serif">${esc(b.mark)}</text>
    <text x="50" y="76" text-anchor="middle" font-size="6.6" font-weight="700" letter-spacing="1.4" fill="${soft}" font-family="Plus Jakarta Sans, sans-serif">${BADGE_EN[b.cat]}</text>
  </svg>`);
}

/** 覚え具合の細い帯（定着・覚えた・あやしい・未学習） */
export function masteryBar(m, label) {
  const parts = [[m.solid, MASTERY[0].color], [m.known, MASTERY[1].color], [m.shaky, MASTERY[2].color], [m.new, TRACK]].filter(([n]) => n > 0);
  return h('div', { class: 'seg', role: 'img', 'aria-label': label },
    ...parts.map(([n, color]) => h('span', { style: { flex: `${n} 1 0px`, background: color } })));
}
export function masteryLegend(withNew = true) {
  return h('div', { class: 'legend' },
    ...MASTERY.map(k => h('span', {}, h('span', { class: 'swatch', style: { background: k.color, width: '10px', height: '10px' } }), k.name)),
    withNew ? h('span', {}, h('span', { class: 'swatch', style: { background: TRACK, width: '10px', height: '10px', boxShadow: 'inset 0 0 0 1px #C3C7D4' } }), '未学習') : null);
}

/** 教材の表紙の色と短い名前 */
const COVERS = { tg1900: '#2B3A8F', tg1400: '#0B6E6A', sj: '#B4410E', teppeki: '#5E3A8C' };
const OWN_COLORS = ['#4A4F63', '#5E3A8C', '#1F5F8B', '#7A4B2A'];
export function coverOf(m) {
  if (COVERS[m.id]) return { color: COVERS[m.id], label: { tg1900: '1900', tg1400: '1400', sj: '速読', teppeki: '鉄壁' }[m.id] };
  let hsh = 0; for (const ch of m.id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: m.color || OWN_COLORS[hsh % OWN_COLORS.length], label: m.own ? '自作' : (m.title || '').slice(0, 2) };
}
export function coverEl(m, w = 46, hgt = 62) {
  const c = coverOf(m);
  return h('div', { class: 'cover', style: { background: c.color, width: w + 'px', height: hgt + 'px' } }, w >= 40 ? c.label : '');
}

export const shortTitle = t => (t || '').replace('英単語ターゲット', 'ターゲット').replace('鉄緑会 東大英単語熟語 ', '');

/** 重要度の印（＊＊ 最重要／＊ 重要／なし 難単語） */
export const RANK_NAME = ['難単語', '重要', '最重要'];
export function rankMark(r) {
  if (r == null || r <= 0) return null;
  return h('span', { class: 'rank', 'aria-label': RANK_NAME[r], title: RANK_NAME[r] }, r >= 2 ? '＊＊' : '＊');
}
/** 挿絵（images: id → data URL） */
export function illus(card, images, maxW = 240) {
  const src = card?.img && images?.get(card.img);
  if (!src) return null;
  return h('img', { class: 'illus', src, alt: `${card.front} の挿絵`, style: { maxWidth: maxW + 'px' } });
}

/**
 * 下から出るメニュー。actions: [{ label, sub, onclick, current, danger }]。
 * 背景を押す・Esc・「やめる」で閉じる。開いたら最初のボタンにフォーカスする。
 */
export function actionSheet(title, subtitle, actions) {
  const prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-title' }, h('b', {}, title), subtitle ? h('span', {}, subtitle) : null),
    ...actions.map(a => h('button', { type: 'button', class: a.danger ? 'danger' : '', 'aria-current': a.current ? 'true' : null,
      onclick: async () => { close(); await a.onclick(); } }, a.label, a.sub ? h('small', {}, a.sub) : null)),
    h('button', { type: 'button', class: 'cancel', onclick: close }, 'やめる'));
  const back = h('div', { class: 'sheet-back', onclick: e => { if (e.target === back) close(); } }, sheet);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  sheet.querySelector('button')?.focus();
  return close;
}

/**
 * 長押し（とパソコンの右クリック）で onLong を呼ぶ。指が動いたら（スクロール）取りやめる。
 * 長押しのあとのクリックは打ち消すので、ふつうに押したときだけリンクとして動く。
 */
export function onLongPress(el, onLong, ms = 500) {
  let timer = null, x = 0, y = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; el.classList.remove('pressing'); };
  el.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    fired = false; x = e.clientX; y = e.clientY; el.classList.add('pressing');
    timer = setTimeout(() => { timer = null; fired = true; el.classList.remove('pressing'); navigator.vibrate?.(15); onLong(); }, ms);
  });
  el.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, cancel));
  el.addEventListener('click', e => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  // パソコンの右クリック。Android は長押しでも contextmenu が来るので、すでに開いていれば二重に開かない
  // （次に押したときの pointerdown で fired は戻るので、右クリックのあとのふつうのクリックは効く）
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (fired) return; cancel(); fired = true; onLong(); });
  return el;
}
