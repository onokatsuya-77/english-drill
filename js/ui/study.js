import { h, clear, fmtMin } from '../dom.js';
import { preview, formatInterval, Rating, State } from '../fsrs.js';
import { posName } from '../content.js';

const LEARN_WINDOW = 30 * 60000; // この時間内に再出題になるカードはセッション内に戻す

export function renderStudy(store, { go }) {
  const main = h('main', {});
  const queue = store.buildQueue();
  const session = { queue, idx: 0, shownAt: 0, done: 0, again: 0, startMs: Date.now(), revealed: false };
  const dir = store.profile.settings.direction;
  let keyHandler;

  function current() { return session.queue[session.idx]; }
  function show() {
    clear(main);
    const card = current();
    if (!card) { finish(); return; }
    session.shownAt = Date.now(); session.revealed = false;
    const st = store.stateOf(card.id);
    const kind = !st ? '新規' : st.state === State.Review ? '復習' : '学習中';
    const front = dir === 'ja-en' ? card.meaning : card.front;
    main.append(
      h('div', { class: 'study-top' },
        h('span', {}, `${session.idx + 1} / ${session.queue.length}`),
        h('span', {}, `${card.deck} · ${kind}`),
        h('button', { class: 'ghost', onclick: () => finish() }, '終了')),
      h('div', { class: 'card' },
        h('div', { class: 'flash', id: 'flash' },
          h('div', { class: 'front' + (dir === 'ja-en' ? ' ja' : '') }, front),
          dir !== 'ja-en' && card.pron ? h('div', { class: 'pron' }, `[${card.pron}]`) : null,
          h('div', { class: 'tags' }, card.pos ? h('span', { class: 'tag' }, posName(card.pos)) : null,
            ...(card.flags || []).map(f => h('span', { class: 'tag red' }, { accent: 'ア', pronunciation: '発', colloquial: '口語' }[f] || f))),
        ),
        h('p', { class: 'center' }, h('button', { class: 'primary big', id: 'reveal', onclick: reveal }, '答えを見る'))));
  }
  function reveal() {
    const card = current(); if (session.revealed) return; session.revealed = true;
    const cardEl = main.querySelector('.card');
    main.querySelector('#reveal').remove();
    cardEl.append(backOf(card, dir));
    const st = store.stateOf(card.id) || undefined;
    const pv = preview(st || { due: 0, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null });
    const btn = (g, cls, label) => h('button', { class: cls, onclick: () => rate(g) }, label, h('small', {}, formatInterval(pv[g])));
    cardEl.append(h('div', { class: 'rate' }, btn(1, 'again', 'もう一度'), btn(2, 'hard', '難しい'), btn(3, 'good', '普通'), btn(4, 'easy', '簡単')));
    cardEl.append(h('p', { class: 'muted small center' }, 'キー: スペース=答え  1〜4=評価'));
  }
  async function rate(g) {
    const card = current(); if (!session.revealed) return;
    const dur = Date.now() - session.shownAt;
    const state = await store.review(card, g, dur);
    session.done++; if (g === Rating.Again) session.again++;
    if (state.due - Date.now() < LEARN_WINDOW) {
      const pos = Math.min(session.queue.length, session.idx + 1 + (g === Rating.Again ? 3 : 6));
      session.queue.splice(pos, 0, card);
    }
    session.idx++;
    show();
  }
  function finish() {
    clear(main);
    const t = store.today();
    main.append(h('div', { class: 'card center' },
      h('h2', {}, 'セッション終了'),
      h('p', { style: { fontSize: '20px' } }, `${session.done} 回答 · ${fmtMin(Date.now() - session.startMs)}`),
      session.done ? h('p', { class: 'muted' }, `「もう一度」${session.again} 回 / 今日の合計 ${t.reviews} 回答・${fmtMin(t.studyMs || 0)}`) : null,
      h('p', {}, h('button', { class: 'primary big', style: { maxWidth: '320px' }, onclick: () => go('') }, 'ホームへ'))));
    session.queue = []; session.idx = 0;
  }
  keyHandler = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!session.revealed) reveal(); }
    else if ('1234'.includes(e.key) && e.key) rate(Number(e.key));
  };
  window.addEventListener('keydown', keyHandler);
  main.dispose = () => window.removeEventListener('keydown', keyHandler);
  main.sticky = true;
  if (!queue.length) finish(); else show();
  return main;
}

/** カードの裏面（意味・例文・派生語など） */
export function backOf(card, dir = 'en-ja') {
  const back = h('div', { class: 'back' });
  if (dir === 'ja-en') { back.append(h('div', { class: 'meaning' }, card.front)); if (card.pron) back.append(h('div', { class: 'muted' }, `[${card.pron}]`)); }
  else back.append(h('div', { class: 'meaning' }, card.meaning));
  if (card.sub?.length) back.append(h('div', { class: 'sub' }, card.sub.join('；')));
  for (const ex of card.examples || []) back.append(h('div', { class: 'ex' }, h('div', { class: 'en' }, ex.en), h('div', { class: 'ja' }, ex.ja)));
  const sect = (label, items) => items?.length ? h('div', { class: 'sect' }, h('b', {}, label), h('ul', {}, ...items.map(x => h('li', {}, x)))) : null;
  const add = el => { if (el) back.append(el); };
  add(sect('▶', card.usage));
  add(sect('TG', card.colloc));
  if (card.derived?.length) back.append(h('div', { class: 'sect' }, h('b', {}, '派生'), h('ul', {}, ...card.derived.map(d => h('li', {}, `${d.word} `, h('span', { class: 'tag' }, posName(d.pos)), ` ${d.meaning}`, d.pron ? h('span', { class: 'muted' }, ` [${d.pron}]`) : null)))));
  if (card.related?.length) back.append(h('div', { class: 'sect' }, h('ul', {}, ...card.related.map(r => h('li', {}, `${r.mark} ${r.text}`, r.meaning ? h('span', { class: 'muted' }, ` ${r.meaning}`) : null, r.example ? h('div', { class: 'muted small' }, `${r.example.en}（${r.example.ja}）`) : null)))));
  if (card.refs?.length) back.append(h('div', { class: 'sect muted small' }, '→ ' + card.refs.join('、')));
  return back;
}
