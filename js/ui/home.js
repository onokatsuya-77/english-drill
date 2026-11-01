import { h, fmtMin, fmtNum } from '../dom.js';
import { BADGES, earnedBadges } from '../model.js';

export function renderHome(store, { go }) {
  const q = store.queueCounts();
  const t = store.today();
  const total = q.due + q.learning + q.newLeft;
  const streak = store.streak();
  const earned = earnedBadges(store);
  const known = new Set(store.profile.badges || []);
  const fresh = earned.filter(b => !known.has(b));
  if (fresh.length) { store.profile.badges = earned; store.backend.saveBadges(store.user.uid, store.profile.id, earned).catch(() => {}); }
  const main = h('main', {},
    h('div', { class: 'card' },
      h('h2', {}, '今日やること'),
      h('div', { class: 'stats' },
        stat(q.due, '復習'), stat(q.learning, '学習中'), stat(q.newLeft, '新しい単語')),
      h('p', { class: 'center', style: { marginTop: '14px' } },
        total ? h('button', { class: 'primary big', onclick: () => go('study') }, `学習を始める（${total} 枚）`)
          : h('span', { class: 'muted' }, store.materials.length ? '今日の分は終わりました。お疲れさまでした。' : '教材がまだ登録されていません')),
      q.newAvail === 0 && store.materials.length ? h('p', { class: 'muted small center' }, '新しい単語がありません。設定で教材を増やせます。') : null),
    h('div', { class: 'card' },
      h('h2', {}, '今日の記録'),
      h('div', { class: 'stats' }, stat(fmtNum(t.reviews), '回答'), stat(fmtMin(t.studyMs || 0), '学習時間'), stat(`${streak}日`, '連続'))),
    fresh.length ? h('div', { class: 'card' }, h('h2', {}, '🎉 新しいバッジ'), ...fresh.map(id => { const b = BADGES.find(x => x.id === id); return h('p', {}, `${b.icon} ${b.title} — ${b.desc}`); })) : null,
    h('div', { class: 'card' },
      h('h2', {}, '教材'),
      ...store.materials.map(m => materialRow(store, m, go))),
  );
  return main;
}
const stat = (n, l) => h('div', {}, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));

export function materialRow(store, m, go) {
  const enabled = store.profile.settings.materials[m.id]?.enabled !== false;
  if (!enabled) return h('div', { class: 'row', style: { padding: '6px 0' } }, h('span', { class: 'grow muted' }, m.title), h('span', { class: 'small muted' }, '休止中'));
  const { counts } = store.progress(m.id);
  const pct = k => (counts[k] / Math.max(1, counts.total) * 100) + '%';
  return h('div', { style: { padding: '8px 0' } },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, m.title), h('span', { class: 'small muted' }, `${fmtNum(counts.mature)} / ${fmtNum(counts.total)} 定着`),
      m.passageChunks ? h('a', { href: '#/read/' + m.id, class: 'small' }, '長文を読む') : null),
    h('div', { class: 'bar' }, h('span', { class: 'c-mature', style: { width: pct('mature') } }), h('span', { class: 'c-young', style: { width: pct('young') } }), h('span', { class: 'c-learning', style: { width: pct('learning') } })));
}
