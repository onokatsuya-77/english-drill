import { h, toast } from '../dom.js';
import { rings, icon, coverEl, coverOf, actionSheet, onLongPress } from './parts.js';
import { STATUS } from '../model.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** ホーム（本棚）: 今日の目標リングと、教材ごとの今日の数 */
export function renderHome(store, { go }) {
  const main = h('main', {});
  const now = new Date();
  const p = store.profile;
  const t = store.today(), g = store.goals();
  const a = store.dayActive(t); // リングは取組中の教材の分だけ
  const min = Math.round(a.studyMs / 60000);
  const fr = store.ringFractions(t);
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
        rings(fr, 112, `今日の目標の達成度（取組中の教材）：学習時間${pc(fr[0])}、語数${pc(fr[1])}、新しい語${pc(fr[2])}`),
        h('div', { class: 'stats' },
          stat('学習時間', min, ` / ${g.minutes}分`, '#7C8CFF'),
          stat('語数', a.words, ` / ${g.wordsSum}語`, '#F7A23B'),
          stat('新しい語', a.newCards, ` / ${g.newSum}語`, '#3CCFE0'))),
      h('div', { class: 'foot' },
        h('b', {}, icon('flame', 18), streak ? `${streak}日連続` : '今日から始めよう'),
        h('span', {}, left.review + left.fresh + left.ahead
          ? 'のこり ' + [left.review ? `復習 ${left.review}` : '', left.fresh ? `新規 ${left.fresh}` : '', left.ahead ? `先取り ${left.ahead}` : ''].filter(Boolean).join('・')
          : '今日の分はおわり'))),
    h('div', { class: 'row-between', style: { padding: '22px 20px 0' } },
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
  // 取組中・休憩中・取り掛かる前に分けて並べる。長押しで状態を切り替える
  const groups = { active: [], paused: [], later: [] };
  for (const m of mats) groups[store.matSettings(m.id).status]?.push(m);
  if (!groups.active.length) {
    main.append(h('p', { class: 'small muted', style: { padding: '0 20px 8px', lineHeight: 1.6 } },
      '取組中の教材がありません。教材を長押しして「取組中にする」を選ぶと、今日の学習と目標に入ります。'));
  }
  for (const [status, name] of STATUS) {
    const ms = groups[status]; if (!ms.length) continue;
    main.append(h('div', { class: 'mat-h' }, h('h3', {}, `${name}（${ms.length}）`), status === 'active' || !groups.active.length ? h('span', {}, '長押しで切り替え') : null));
    const list = h('div', { class: 'mat-list' });
    for (const m of ms) list.append(matCard(store, m, status));
    main.append(list);
  }
  return main;
}

function matCard(store, m, status) {
  const c = store.counts(m.id), ms = store.mastery(m.id);
  const started = ms.studied > 0;
  const unit = m.kind === 'idioms' || m.kind === 'kobun' ? '項目' : '語';
  let right;
  if (status === 'active') {
    right = started || c.total
      ? h('div', { class: 'num' }, h('b', {}, c.total), h('span', {}, [c.review ? `復習${c.review}` : '', c.newLeft ? `新規${c.newLeft}` : '', c.ahead ? `先取り${c.ahead}` : ''].filter(Boolean).join('・') || '今日はおわり'))
      : h('span', { class: 'start' }, 'はじめる');
  } else right = h('span', { class: 'state' }, status === 'paused' ? '休憩中' : 'まだ');
  const el = h('a', { class: 'mat' + (status === 'active' ? '' : ' compact'), href: `#/m/${m.id}` },
    coverEl(m, status === 'active' ? undefined : 34, status === 'active' ? undefined : 46),
    h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('span', { class: 'title' }, m.title),
      h('span', { class: 'sub' }, started ? `習得 ${ms.learned} / ${ms.total}${unit}` : 'まだ始めていません'),
      status === 'active' ? h('div', { class: 'bar' }, h('div', { style: { width: `${ms.total ? (ms.learned / ms.total) * 100 : 0}%`, background: coverOf(m).color } })) : null),
    right);
  return onLongPress(el, () => statusSheet(store, m));
}

/** 教材の状態を切り替えるメニュー（ホームの長押し・教材ページから使う） */
export function statusSheet(store, m) {
  const cur = store.matSettings(m.id).status;
  const set = (st, msg) => async () => { await store.setStatus(m.id, st); toast(msg); };
  actionSheet(m.title, '教材の状態を切り替えます', [
    { label: '取組中にする', sub: '今日の学習と今日の目標に入れます', current: cur === 'active', onclick: set('active', '取組中にしました') },
    { label: '休憩にする', sub: '新しい語も復習も出しません（記録は残ります）', current: cur === 'paused', onclick: set('paused', '休憩中にしました') },
    { label: '取り掛かる前に戻す', sub: 'まだ始めない教材として並べます', current: cur === 'later', onclick: set('later', '取り掛かる前に戻しました') },
    { label: '一覧から外す', sub: '学習の記録は残ります。「教材を追加」から戻せます', danger: true, onclick: set('off', '一覧から外しました') },
  ]);
}

const pc = f => Math.round(Math.min(1, f) * 100) + '%';
function stat(k, v, rest, color) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
    h('span', { class: 'k' }, k),
    h('span', { class: 'v', style: { color } }, String(v), h('small', {}, rest)));
}
