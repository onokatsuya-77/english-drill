import { h, toast } from '../dom.js';
import { MASTERY, MODES, STATUS } from '../model.js';
import { icon, coverOf, masteryBar } from './parts.js';

const view = {}; // 画面を描き直しても残す選択（教材ごと）

/** 教材ページ: 今日の学習・出題形式・覚え具合・Section ごとの練習・設定 */
export function renderMaterial(store, { go, params }) {
  const mid = params[0];
  const m = store.material(mid);
  const main = h('main', {});
  if (!m) { main.append(h('div', { class: 'empty' }, h('p', {}, '教材が見つかりません。'), h('a', { class: 'btn primary', href: '#/' }, 'ホームへ'))); return main; }
  if (!store.cards.has(mid)) {
    main.append(h('div', { class: 'empty' }, h('p', {}, 'この教材はホームの一覧に入っていません。'),
      h('button', { class: 'btn primary', onclick: async () => { await store.setStatus(mid, 'active'); } }, '取組中として追加する'),
      h('button', { class: 'btn outline', onclick: async () => { await store.setStatus(mid, 'later'); } }, '取り掛かる前に追加する')));
    return main;
  }
  const v = (view[mid] ||= { sel: 'shaky', all: false });
  const ms = store.matSettings(mid);
  const c = store.counts(mid);
  const mm = store.mastery(mid);
  const cover = coverOf(m);
  const unit = m.kind === 'idioms' ? '項目' : '語';
  const label = m.deckLabel || 'Section';
  const decks = m.decks || [];

  // 上
  main.append(
    h('nav', { class: 'back-nav', 'aria-label': '教材ページ' },
      h('a', { href: '#/' }, icon('back', 22, 2.2), 'ホーム'),
      m.passageCount ? h('a', { href: `#/read/${mid}`, style: { fontSize: '14px', color: 'var(--indigoInk)' } }, icon('text', 18), '長文を読む') : h('span')),
    h('section', { class: 'hero', style: { background: cover.color } },
      h('div', { class: 'row-between', style: { alignItems: 'flex-start' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('h1', {}, m.title),
          h('span', { class: 'meta' }, `${label} ${decks[0]?.no ?? 1}〜${decks[decks.length - 1]?.no ?? 1} · ${m.cardCount}${unit}`)),
        h('span', { class: 'badge', style: { color: cover.color } }, m.own ? '自作' : '家族で共有')),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${mm.total}${unit}のうち${mm.learned}${unit}を習得` },
        h('div', { style: { width: `${mm.total ? (mm.learned / mm.total) * 100 : 0}%` } })),
      h('div', { class: 'foot' },
        h('span', {}, '習得 ', h('b', {}, mm.learned), ` / ${mm.total}${unit}`),
        h('span', {}, '正解率 ', h('b', {}, mm.accuracy == null ? '—' : Math.round(mm.accuracy * 100) + '%')))),
  );

  // 今日の学習（取組中の教材だけ）
  if (ms.status !== 'active') {
    main.append(h('section', { class: 'card' },
      h('h2', {}, '今日の学習'),
      h('p', { class: 'muted', style: { fontSize: '14px', lineHeight: 1.7 } }, ms.status === 'paused'
        ? '休憩中です。新しい語も復習も出ません。再開すると、たまった復習から始まります。'
        : 'まだ取り掛かる前の教材です。始めると、今日の学習と今日の目標に入ります。'),
      h('button', { class: 'btn primary block', onclick: async () => { await store.setStatus(mid, 'active'); toast('取組中にしました'); } },
        ms.status === 'paused' ? '再開する（取組中にする）' : 'この教材を始める（取組中にする）')));
  } else {
    const minutes = Math.max(1, Math.round(((c.review + c.ahead) * 8 + c.newLeft * 25) / 60));
    const modeChips = h('div', { class: 'chips' }, ...MODES.map(([id, name]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(ms.mode === id), onclick: () => store.saveMatSettings(mid, { mode: id }) }, name)));
    main.append(h('section', { class: 'card' },
      h('h2', {}, '今日の学習'),
      h('div', { class: 'grid3' }, tile('復習', c.review + c.ahead), tile('新しい語', c.newLeft), tile('目安', c.total ? minutes : 0, '分')),
      h('span', { class: 'small muted', style: { lineHeight: 1.6 } },
        `1日の語数は ${ms.wordsPerDay}${unit}（最低）。復習のあと、届かない分は新しい語で、それも無ければ復習日が近い語の先取りで埋めます。`
        + (c.ahead ? `今日は先取りが ${c.ahead}${unit} あります。` : '')),
      h('div', { class: 'field' }, h('span', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--ink2)' } }, '出題形式'), modeChips,
        h('span', { class: 'small muted', style: { lineHeight: 1.6 } }, ms.mode === 'card' ? '答えを見て、覚えていたかを自分で評価します。'
          : (ms.newStyle === 'quiz' ? (ms.mode === 'spell' ? '初めて出る語は、見て覚えてから書きます。' : '初めて出る語も、この形式で出ます。')
            : '初めて出る語は、まずカードで覚えます。同じ回の2回目から、この形式で出ます。')
            + (ms.mode === 'spell' && m.kind === 'idioms' ? '熟語は、例文の空欄に入る語を書きます。' : ''))),
      c.total
        ? h('a', { class: 'btn primary block', href: `#/study/${mid}/today` }, '今日の学習を始める', icon('arrow', 20, 2.2))
        : h('div', { class: 'btn outline block', style: { cursor: 'default' } }, '今日の分はおわりました'),
    ));
  }

  // 連続再生（瞬間英作文）
  const todayN = store.playCards(mid, 'today').length;
  const scopes = [
    ...(todayN ? [['today', `今日学習した語（${todayN}）`]] : []),
    ...(mm.shaky ? [['shaky', `あやしい語（${mm.shaky}）`]] : []),
    ...decks.map(d => [`deck:${d.no}`, d.title])];
  if (!scopes.some(([id]) => id === v.play)) {
    const studiedDeck = [...decks].reverse().find(d => { const x = mm.deckList.find(y => y.no === d.no); return x && x.new < x.total; }); // いちばん進んだ Section
    v.play = todayN ? 'today' : `deck:${(studiedDeck || decks[0])?.no ?? 1}`;
  }
  main.append(h('section', { class: 'card' },
    h('h2', {}, '連続再生（瞬間英作文）'),
    h('p', { class: 'muted', style: { fontSize: '14px', lineHeight: 1.7, margin: 0 } }, '日本語 → 間 → 英語 を自動で流します。間のうちに英語を口に出して言う練習です。車や散歩のときに。学習の記録はつけません。'),
    h('select', { class: 'input', 'aria-label': '流す範囲', onchange: e => { v.play = e.target.value; } },
      ...scopes.map(([id, name]) => h('option', { value: id, selected: id === v.play }, name))),
    h('button', { class: 'btn tint block', onclick: () => { const [k, a] = v.play.split(':'); go(`play/${mid}/${k}${a ? '/' + a : ''}`); } }, icon('play', 20, 2.2), '再生画面へ')));

  // 覚え具合
  const mastery = h('section', { class: 'card', 'aria-labelledby': `mt-${mid}` },
    h('div', { class: 'row-between', style: { alignItems: 'baseline' } },
      h('h2', { id: `mt-${mid}` }, '覚え具合'),
      h('span', { class: 'small muted' }, mm.studied ? `学習した ${mm.studied}${unit}のうち` : '')));
  if (!mm.studied) {
    mastery.append(h('p', { class: 'muted', style: { fontSize: '14px' } }, 'まだ学習した語がありません。今日の学習を始めると、ここに「定着・覚えた・あやしい」の割合が出ます。'));
  } else {
    const pct = n => Math.round((n / mm.studied) * 100) + '%';
    const cur = MASTERY.find(k => k.id === v.sel) || MASTERY[2];
    mastery.append(
      h('div', { class: 'readout', 'aria-live': 'polite' }, h('b', {}, mm[cur.id], h('small', {}, unit)), h('span', {}, `${cur.name} · ${pct(mm[cur.id])}`)),
      h('div', { class: 'seg tall', role: 'group', 'aria-label': '覚え具合の内訳。押すと数を表示' },
        ...MASTERY.filter(k => mm[k.id] > 0).map(k => h('button', {
          type: 'button', 'aria-pressed': String(v.sel === k.id), 'aria-label': `${k.name} ${mm[k.id]}${unit}（${pct(mm[k.id])}）`,
          style: { flex: `${mm[k.id]} 1 0px`, background: k.color, color: k.ink, boxShadow: v.sel === k.id ? '0 0 0 2px #fff, 0 0 0 4px #141A33' : 'none' },
          onclick: () => { v.sel = k.id; store.emit(); },
        }, mm[k.id] / mm.studied >= 0.12 ? pct(mm[k.id]) : ''))),
      h('dl', { class: 'defs' }, ...MASTERY.map(k => h('div', {}, h('span', { class: 'swatch', style: { background: k.color } }), h('dt', {}, k.name), h('dd', {}, k.desc)))),
      h('div', { class: 'grid2' },
        quick(`#/study/${mid}/shaky`, 'あやしい語を練習', mm.shaky, unit, 'var(--indigoTint)', 'var(--indigoInk)'),
        quick(`#/study/${mid}/miss`, 'よく間違える語', store.missCount(mid), unit, 'var(--redTint)', 'var(--red)')),
    );
  }
  main.append(mastery);

  // Section ごと
  main.append(h('div', { class: 'sec-h' },
    h('h2', {}, `${label} ごとに練習`),
    h('span', { class: 'small muted' }, '範囲を決めて集中して覚えます。結果は今日の学習と同じ記録に残ります。')));
  const byNo = new Map(mm.deckList.map(d => [d.no, d]));
  const shown = v.all ? decks : decks.slice(0, 6);
  const list = h('div', { class: 'list' });
  for (const d of shown) {
    const x = byNo.get(d.no) || { total: d.count, new: d.count, shaky: 0, known: 0, solid: 0 };
    const parts = [`定着 ${x.solid}`, `覚えた ${x.known}`, `あやしい ${x.shaky}`];
    if (x.new) parts.push(`未学習 ${x.new}`);
    const nos = (store.cards.get(mid) || []).filter(cc => cc.deckNo === d.no).map(cc => cc.no);
    const range = nos.length ? `${Math.min(...nos)}〜${Math.max(...nos)}` : '';
    list.append(h('div', { class: 'deck-row' },
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
        h('div', { class: 'row-between', style: { alignItems: 'baseline' } },
          h('span', { class: 'name' }, d.title, ' ', h('small', {}, range)),
          h('span', { class: 'pct' }, x.total - x.new ? `習得 ${Math.round(((x.solid + x.known) / x.total) * 100)}%` : '未学習')),
        masteryBar(x, `${d.title}：${parts.join('、')}`),
        h('span', { class: 'detail' }, parts.join('・'))),
      h('a', { class: 'btn tint sm', href: `#/study/${mid}/deck/${d.no}`, 'aria-label': `${d.title}を練習`, style: { minWidth: '56px' } }, '練習')));
  }
  if (decks.length > 6) list.append(h('button', { class: 'more', onclick: () => { v.all = !v.all; store.emit(); } }, v.all ? '閉じる' : `すべての ${label}（${decks.length}）`, icon('down', 18, 2.2)));
  main.append(list);

  // 設定
  main.append(h('div', { class: 'sec-h' }, h('h2', {}, 'この教材の設定')));
  main.append(h('div', { class: 'list' },
    setRow('状態', ms.status, STATUS.map(([id, name]) => [id, name]), val => store.setStatus(mid, val)),
    setRow('1日の語数（最低）', ms.wordsPerDay, [10, 20, 30, 40, 50, 70, 100].map(n => [n, `${n}${unit}`]), val => store.saveMatSettings(mid, { wordsPerDay: Number(val) })),
    setRow('1日の新しい語（必ず出す数）', ms.newPerDay, [0, 5, 10, 15, 20, 30, 50].map(n => [n, `${n}${unit}`]), val => store.saveMatSettings(mid, { newPerDay: Number(val) })),
    setRow('新しい語の出し方', ms.newStyle, [['quiz', '最初から出題形式で'], ['card', 'カードで覚えてから']], val => store.saveMatSettings(mid, { newStyle: val })),
    setRow('出題の向き', ms.direction, [['en-ja', '英語 → 日本語'], ['ja-en', '日本語 → 英語']], val => store.saveMatSettings(mid, { direction: val })),
    setRow('新しい語の順番', ms.order, [['book', '本の順'], ['random', 'ランダム']], val => store.saveMatSettings(mid, { order: val })),
    m.ranked ? setRow('出題する重要度', ms.minRank || 0, [[0, 'すべて（難単語も）'], [1, '重要まで（＊以上）'], [2, '最重要だけ（＊＊）']], val => store.saveMatSettings(mid, { minRank: Number(val) })) : null,
    h('button', { class: 'set-row', style: { color: 'var(--red)', cursor: 'pointer' }, onclick: async () => {
      if (!confirm(`「${m.title}」をホームの一覧から外しますか？（学習の記録は残ります）`)) return;
      await store.setStatus(mid, 'off'); toast('一覧から外しました'); go('');
    } }, '一覧から外す')));
  return main;
}

function tile(k, v, unit = '') {
  return h('div', { class: 'tile' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, String(v), unit ? h('small', {}, unit) : null));
}
function quick(href, k, n, unit, bg, ink) {
  const inner = [h('span', { class: 'k', style: { color: ink } }, k), h('span', { class: 'v' }, String(n), h('small', {}, unit))];
  return n ? h('a', { class: 'quick', href, style: { background: bg } }, ...inner) : h('div', { class: 'quick', style: { background: bg, opacity: 0.6 } }, ...inner);
}
function setRow(label, value, options, onchange) {
  const id = 'set-' + Math.random().toString(36).slice(2, 8);
  return h('div', { class: 'set-row' },
    h('label', { for: id }, label),
    h('select', { id, onchange: e => onchange(e.target.value) },
      ...options.map(([val, text]) => h('option', { value: String(val), selected: String(val) === String(value) }, text))));
}
