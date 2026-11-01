import { h } from '../dom.js';
import { rings, icon, coverEl, coverOf } from './parts.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** ホーム（本棚）: 今日の目標リングと、教材ごとの今日の数 */
export function renderHome(store, { go }) {
  const main = h('main', {});
  const now = new Date();
  const p = store.profile;
  const t = store.today(), g = store.goals();
  const min = Math.round((t.studyMs || 0) / 60000);
  const fr = [min / g.minutes, (t.reviews || 0) / g.answers, (t.newCards || 0) / g.newWords];
  const left = store.totalCounts();
  const streak = store.streak();

  main.append(
    h('header', { class: 'top' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
        h('span', { class: 'date' }, `${now.getMonth() + 1}月${now.getDate()}日（${WD[now.getDay()]}）`),
        h('span', { class: 'hello' }, `こんにちは、${p.name}さん`)),
      h('a', { class: 'avatar', href: '#/profiles', 'aria-label': '学習者を切り替える' }, (p.name || '?').slice(0, 1))),
    h('section', { class: 'today', 'aria-label': '今日の目標' },
      h('div', { class: 'row', style: { gap: '18px' } },
        rings(fr, 112, `今日の目標の達成度：学習時間${pc(fr[0])}、回答${pc(fr[1])}、新しい語${pc(fr[2])}`),
        h('div', { class: 'stats' },
          stat('学習時間', min, ` / ${g.minutes}分`, '#7C8CFF'),
          stat('回答', t.reviews || 0, ` / ${g.answers}回`, '#F7A23B'),
          stat('新しい語', t.newCards || 0, ` / ${g.newWords}語`, '#3CCFE0'))),
      h('div', { class: 'foot' },
        h('b', {}, icon('flame', 18), streak ? `${streak}日連続` : '今日から始めよう'),
        h('span', {}, left.review + left.fresh ? `のこり 復習 ${left.review}・新規 ${left.fresh}` : '今日の分はおわり'))),
    h('div', { class: 'row-between', style: { padding: '22px 20px 10px' } },
      h('h2', { style: { fontSize: '17px', fontWeight: 700 } }, 'わたしの教材'),
      h('a', { href: '#/add', class: 'row', style: { gap: '4px', fontSize: '14px', fontWeight: 600, minHeight: '44px' } }, icon('plus', 18, 2.2), '教材を追加')),
  );

  const mats = store.enabledMaterials();
  if (!mats.length) {
    main.append(h('div', { class: 'empty' },
      h('p', { class: 'muted' }, store.materials.length ? '教材がまだ選ばれていません。' : 'まだ教材がありません。'),
      h('a', { class: 'btn primary', href: '#/add' }, '教材を追加する')));
    return main;
  }
  const list = h('div', { class: 'mat-list' });
  for (const m of mats) {
    const c = store.counts(m.id), ms = store.mastery(m.id);
    const started = ms.studied > 0;
    const unit = m.kind === 'idioms' ? '項目' : '語';
    list.append(h('a', { class: 'mat', href: `#/m/${m.id}` },
      coverEl(m),
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('span', { class: 'title' }, m.title),
        h('span', { class: 'sub' }, started ? `習得 ${ms.learned} / ${ms.total}${unit}` : 'まだ始めていません'),
        h('div', { class: 'bar' }, h('div', { style: { width: `${ms.total ? (ms.learned / ms.total) * 100 : 0}%`, background: coverOf(m).color } }))),
      started || c.review
        ? h('div', { class: 'num' }, h('b', {}, c.total), h('span', {}, [c.review ? `復習${c.review}` : '', c.newLeft ? `新規${c.newLeft}` : ''].filter(Boolean).join('・') || '今日はおわり'))
        : h('span', { class: 'start' }, 'はじめる')));
  }
  main.append(list);
  return main;
}

const pc = f => Math.round(Math.min(1, f) * 100) + '%';
function stat(k, v, rest, color) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
    h('span', { class: 'k' }, k),
    h('span', { class: 'v', style: { color } }, String(v), h('small', {}, rest)));
}
