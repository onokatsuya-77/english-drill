import { h } from '../dom.js';
import { miniRings, medal, masteryBar, masteryLegend, shortTitle } from './parts.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const HEAT = ['#E6E8F0', '#C9CEF7', '#9AA4F2', '#5C69E6', '#2B3A8F'];

/** 記録: 今週のリング、連続日数と合計、4週間、教材ごとの覚え具合、バッジ */
export function renderProgress(store) {
  const main = h('main', {});
  const g = store.goals();
  const t = store.totals();

  // 今週（月曜はじまり）
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 月=0
  const week = store.recentDays(dow + 1);
  while (week.length < 7) week.push(null);
  const first = new Date(now); first.setDate(now.getDate() - dow);
  const last = new Date(first); last.setDate(first.getDate() + 6);
  main.append(
    h('h1', { class: 'page-title' }, '記録'),
    h('section', { class: 'card night', style: { padding: '16px', gap: '12px' } },
      h('div', { class: 'row-between', style: { alignItems: 'baseline' } },
        h('h2', { style: { fontSize: '15px' } }, '今週'),
        h('span', { style: { fontSize: '12px', color: 'var(--nightInk)' } }, `${md(first)}〜${md(last)}`)),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' } },
        ...week.map((d, i) => {
          const name = WD[(i + 1) % 7];
          const fr = d ? [(d.studyMs || 0) / 60000 / g.minutes, (d.reviews || 0) / g.answers, (d.newCards || 0) / g.newWords] : [0, 0, 0];
          const isToday = i === dow;
          return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: d ? 1 : 0.45 } },
            miniRings(fr, `${name}曜日：学習時間${pc(fr[0])}、回答${pc(fr[1])}、新しい語${pc(fr[2])}`),
            h('span', { style: { fontSize: '12px', fontWeight: isToday ? 800 : 500, color: isToday ? '#fff' : 'var(--nightInk)' } }, name));
        }))));

  // 合計
  main.append(h('div', { class: 'grid2', style: { margin: '14px 16px 0', gap: '10px' } },
    statCard('連続', t.streak, '日', `最長 ${Math.max(t.longest, t.streak)}日`),
    statCard('習得した語', t.learned, '', '定着＋覚えた'),
    statCard('学習時間', null, null, 'はじめてから', hm(t.studyMs)),
    statCard('回答', t.reviews.toLocaleString(), '', 'はじめてから')));

  // 4週間（月曜はじまり）
  const days = store.recentDays(21 + dow + 1);
  const max = Math.max(1, ...days.map(d => d.studyMs || 0));
  const lv = d => !d.reviews ? 0 : Math.min(4, 1 + Math.floor(((d.studyMs || 0) / max) * 3.999));
  const cells = days.map(d => h('span', { style: { background: HEAT[lv(d)] }, title: `${d.key}：${Math.round((d.studyMs || 0) / 60000)}分・${d.reviews || 0}回答` }));
  while (cells.length % 7) cells.push(h('span', { style: { background: 'transparent' } }));
  main.append(h('section', { class: 'card', style: { gap: '10px' } },
    h('h2', { style: { fontSize: '15px' } }, 'この4週間'),
    h('div', { class: 'heat labels' }, ...['月', '火', '水', '木', '金', '土', '日'].map(x => h('span', {}, x))),
    h('div', { class: 'heat', role: 'img', 'aria-label': `過去4週間の学習。学習した日 ${days.filter(d => d.reviews).length}日` }, ...cells),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '4px', fontSize: '11px', color: 'var(--muted)' } },
      '少ない', ...HEAT.map(c => h('span', { class: 'swatch', style: { width: '14px', height: '14px', borderRadius: '4px', background: c } })), '多い')));

  // 教材ごとの覚え具合
  const mats = store.enabledMaterials();
  if (mats.length) {
    main.append(h('section', { class: 'card', style: { padding: '16px' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h2', { style: { fontSize: '15px' } }, '教材ごとの覚え具合'), masteryLegend(true)),
      ...mats.map(m => {
        const mm = store.mastery(m.id);
        const unit = m.kind === 'idioms' ? '項目' : '語';
        const detail = mm.studied ? `定着 ${mm.solid}・覚えた ${mm.known}・あやしい ${mm.shaky} / ${mm.total.toLocaleString()}${unit}` : `まだ始めていません · ${mm.total.toLocaleString()}${unit}`;
        return h('a', { href: `#/m/${m.id}`, style: { display: 'flex', flexDirection: 'column', gap: '7px', color: 'var(--ink)' } },
          h('div', { class: 'row-between', style: { fontSize: '14px' } },
            h('span', { style: { fontWeight: 700 } }, shortTitle(m.title)),
            h('span', { style: { fontSize: '12px', color: 'var(--ink2)' } }, mm.accuracy == null ? '' : `正解率 ${Math.round(mm.accuracy * 100)}%`)),
          masteryBar(mm, `${m.title}：${detail}`),
          h('span', { style: { fontSize: '12px', color: 'var(--muted)' } }, detail));
      })));
  }

  // バッジ
  const st = store.badgeStatus();
  const got = st.filter(b => b.earned).length;
  const nextB = st.filter(b => !b.earned).sort((a, b) => (b.value / b.goal) - (a.value / a.goal))[0];
  main.append(h('section', { class: 'card night', style: { padding: '18px 16px', gap: '16px' } },
    h('div', { class: 'row-between', style: { alignItems: 'baseline' } },
      h('h2', { style: { fontSize: '15px' } }, 'バッジ'),
      h('span', { style: { fontSize: '12px', color: 'var(--nightInk)' } }, `${got} / ${st.length}`)),
    nextB ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', borderRadius: '16px', background: 'var(--night2)' } },
      h('div', { class: 'row-between', style: { fontSize: '13px' } },
        h('span', { style: { fontWeight: 700 } }, `次は「${nextB.name}」`),
        h('span', { style: { color: 'var(--nightInk)' } }, `あと${(nextB.goal - nextB.value).toLocaleString()}${nextB.unit}`)),
      h('div', { style: { height: '6px', borderRadius: '3px', background: '#2F386A', overflow: 'hidden' } },
        h('div', { style: { width: `${Math.min(100, (nextB.value / nextB.goal) * 100)}%`, height: '6px', borderRadius: '3px', background: 'var(--hl)' } }))) : null,
    h('div', { class: 'badges' }, ...st.map(b => h('div', { class: 'badge-cell' },
      medal(b),
      h('span', { class: 'n', style: { color: b.earned ? '#fff' : 'var(--nightInk)' } }, b.name),
      b.earned
        ? (b.at ? h('span', { class: 'p' }, md(new Date(b.at))) : null)
        : h('span', { class: 'p' }, `${Math.min(b.value, b.goal).toLocaleString()} / ${b.goal.toLocaleString()}${b.unit}`))))));
  return main;
}

const pc = f => Math.round(Math.min(1, f) * 100) + '%';
const md = d => `${d.getMonth() + 1}月${d.getDate()}日`;
function hm(ms) { const m = Math.round(ms / 60000); return [Math.floor(m / 60), m % 60]; }
function statCard(k, v, unit, s, hmv = null) {
  return h('div', { class: 'stat-card' },
    h('span', { class: 'k' }, k),
    hmv ? h('span', { class: 'v' }, String(hmv[0]), h('small', {}, '時間'), String(hmv[1]), h('small', {}, '分'))
      : h('span', { class: 'v' }, String(v), unit ? h('small', {}, unit) : null),
    h('span', { class: 's' }, s));
}
