import { h, clear, toast } from '../dom.js';
import { preview, formatInterval, Rating, State, emptyCard } from '../fsrs.js';
import { posName } from '../content.js';
import { pickMode, makeQuestion, checkSpelling, autoRating, cleanMeaning } from '../quiz.js';
import { canSpeak, speak, stopSpeaking } from '../speech.js';
import { icon, rings, medal, shortTitle, rankMark, illus } from './parts.js';

const LEARN_WINDOW = 30 * 60000; // この時間内に再出題になるカードはセッションの中でもう一度出す
const MODE_LABEL = { card: ['カード', 'indigo'], choice: ['4択', 'orange'], spell: ['つづり', 'indigo'], cloze: ['穴埋め', 'orange'], listen: ['リスニング', 'teal'] };
const KIND_LABEL = { today: '今日の学習', deck: '練習', shaky: 'あやしい語', miss: 'よく間違える語', extra: '新しい語', ahead: '復習の先取り' };
const EXTRA_NEW = 10, EXTRA_AHEAD = 20; // 今日の分のあとに進める数（教材ページと同じ）

/** 学習画面（5つの出題形式）と、学習のおわり */
export function renderStudy(store, { go, params }) {
  const [mid, kind = 'today', arg = null] = params;
  const m = store.material(mid);
  const main = h('main', { class: 'study bare' });
  main.sticky = true;
  if (!m || !store.cards.has(mid)) { main.append(h('div', { class: 'empty' }, h('p', {}, '教材が見つかりません。'), h('a', { class: 'btn primary', href: '#/' }, 'ホームへ'))); return main; }
  const pool = store.cards.get(mid);
  const ms = store.matSettings(mid);
  const dir = ms.direction;
  const queue = store.buildQueue(mid, kind, arg);
  const s = { queue, idx: 0, done: 0, correct: 0, newIds: new Set(), again: new Map(), startMs: Date.now(), shownAt: 0, finished: false };
  let keyHandler = null;
  const deckTitle = kind === 'deck' ? (m.decks || []).find(d => String(d.no) === String(arg))?.title : null;

  function header(card, mode, isNew) {
    const st = store.stateOf(card.id);
    const ahead = (kind === 'today' || kind === 'ahead') && st && st.due > s.startMs; // 復習日より前に出した語
    const [label, tone] = mode === 'card' ? [isNew ? '新規' : ahead ? '先取り' : st?.state === State.Review ? '復習' : '学習中', isNew ? 'teal' : 'indigo'] : MODE_LABEL[mode];
    const n = Math.min(s.idx + 1, s.queue.length);
    return h('header', { class: 'study-head' },
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'icon-btn', style: { marginLeft: '-8px' }, 'aria-label': '学習をやめる', onclick: () => finish(true) }, icon('close', 22, 2.2)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': '進み具合', 'aria-valuemin': '0', 'aria-valuemax': String(s.queue.length), 'aria-valuenow': String(n) },
          h('div', { style: { width: `${(s.idx / s.queue.length) * 100}%` } })),
        h('span', { class: 'count' }, `${n} / ${s.queue.length}`)),
      h('div', { class: 'info' }, h('span', { class: `pill ${tone}` }, label), h('span', {}, `${shortTitle(m.title)} · ${card.deck}`)));
  }

  function show() {
    stopSpeaking();
    clear(main);
    const card = s.queue[s.idx];
    if (!card) { finish(false); return; }
    const isNew = !store.stateOf(card.id);
    if (isNew) s.newIds.add(card.id);
    const mode = pickMode(card, ms.mode, isNew, pool, { speech: canSpeak }, Math.random, ms.newStyle);
    const q = makeQuestion(card, mode, pool, { direction: dir });
    q.isNew = isNew;
    s.shownAt = Date.now();
    main.append(header(card, mode, isNew));
    ({ card: showCard, choice: showChoice, listen: showChoice, cloze: showCloze, spell: showSpell }[q.mode] || showCard)(q);
  }

  // 自動採点の記録（4択・穴埋め・つづり・リスニング）
  async function grade(card, correct, usedHint, mode) {
    const dur = Date.now() - s.shownAt;
    const st = await store.review(card, autoRating(correct, usedHint), dur, { mode, direction: dir });
    afterReview(card, correct, st);
    return st;
  }
  function afterReview(card, correct, st) {
    s.done++; if (correct) s.correct++;
    if (!correct) s.again.set(card.id, (s.again.get(card.id) || 0) + 1);
    if (st.due - Date.now() < LEARN_WINDOW) {
      const pos = Math.min(s.queue.length, s.idx + 1 + (correct ? 6 : 3));
      s.queue.splice(pos, 0, card);
    }
  }
  function next() { s.idx++; show(); }

  // ---- カード ----
  function showCard(q) {
    const card = q.card;
    const jaEn = dir === 'ja-en';
    const qc = h('article', { class: 'qcard', style: { flex: '1', minHeight: '0' } },
      h('div', { class: 'row-between' },
        card.pos ? h('span', { class: 'tag' }, posName(card.pos)) : h('span'),
        canSpeak && !jaEn ? h('button', { class: 'icon-btn', style: { background: 'var(--bg)' }, 'aria-label': '発音を聞く', onclick: () => speak(card.front) }, icon('speaker', 22)) : h('span')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('span', { class: 'word' + (jaEn ? ' ja' : card.front.length > 14 ? ' mid' : '') }, jaEn ? card.meaning : card.front, jaEn ? null : rankMark(card.rank)),
        !jaEn && card.pron ? h('span', { class: 'pron' }, `[${card.pron}]`) : null));
    const foot = h('div', { class: 'study-foot' });
    main.append(qc, foot);
    let revealed = false;
    const reveal = () => {
      if (revealed) return; revealed = true;
      qc.append(backOf(card, dir, store.images));
      if (jaEn && canSpeak) speak(card.front);
      const st = store.stateOf(card.id) || emptyCard(Date.now());
      const pv = preview(st);
      clear(foot);
      foot.append(h('div', { class: 'rate' },
        ...[[1, 'もう一度'], [2, '難しい'], [3, '普通'], [4, '簡単']].map(([g, t]) =>
          h('button', { class: `r${g}`, onclick: () => rate(g) }, h('b', {}, t), h('small', {}, formatInterval(pv[g]))))));
    };
    const rate = async g => {
      if (!revealed) return;
      foot.querySelectorAll('button').forEach(b => { b.disabled = true; });
      const st = await store.review(card, g, Date.now() - s.shownAt, { mode: 'card', direction: dir });
      afterReview(card, g !== Rating.Again, st);
      next();
    };
    foot.append(h('button', { class: 'btn dark block', style: { height: '60px', fontSize: '17px' }, onclick: reveal }, '答えを見る'));
    keyHandler = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
      else if (revealed && '1234'.includes(e.key)) rate(Number(e.key));
    };
  }

  // ---- 4択・リスニング ----
  function showChoice(q) {
    const card = q.card;
    const listen = q.mode === 'listen';
    let rate = 1;
    const play = () => speak(card.front, { rate });
    let qc;
    if (listen) {
      const speedBtns = [];
      const setSpeed = r => { rate = r; speedBtns.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.r) === r))); play(); };
      qc = h('section', { class: 'qcard night center' },
        h('span', { class: 'ask' }, '聞こえた語の意味を選んでください'),
        h('button', { class: 'play', 'aria-label': 'もう一度聞く', onclick: play }, icon('speaker', 44, 2)),
        h('div', { class: 'speed', role: 'group', 'aria-label': '再生の速さ' },
          ...[[1, 'ふつう'], [0.7, 'ゆっくり']].map(([r, t]) => { const b = h('button', { type: 'button', 'data-r': String(r), 'aria-pressed': String(r === 1), onclick: () => setSpeed(r) }, t); speedBtns.push(b); return b; })));
    } else {
      qc = h('section', { class: 'qcard center' },
        h('span', { class: 'ask' }, q.jaEn ? '英語を選んでください' : '意味を選んでください'),
        h('span', { class: 'word' + (q.jaEn ? ' ja' : q.prompt.length > 14 ? ' mid' : '') }, q.prompt),
        !q.jaEn && card.pron ? h('span', { class: 'pron' }, `[${card.pron}]`) : null);
    }
    const opts = h('div', { class: 'opts' + (listen ? ' two' : ''), role: 'group', 'aria-label': '選択肢' });
    const foot = h('div', { class: 'study-foot' });
    let answered = false;
    const buttons = q.options.map((o, i) => h('button', { type: 'button', class: 'opt', onclick: () => pick(i) },
      listen ? null : h('span', { class: 'no' }, String(i + 1)), o.text));
    opts.append(...buttons);
    const pick = async i => {
      if (answered) return; answered = true;
      const correct = i >= 0 && q.options[i].correct;
      buttons.forEach((b, j) => { b.disabled = true; b.classList.add(q.options[j].correct ? 'right' : j === i ? 'wrong' : 'dim'); });
      clear(foot);
      const st = await grade(card, correct, false, q.mode);
      const answer = q.options.find(o => o.correct).text;
      foot.append(feedback(correct,
        correct ? '正解！' : `正しくは「${answer}」`,
        listen || q.jaEn ? `${card.front}${card.pron ? `　[${card.pron}]` : ''}　${card.meaning}` : nextText(st, correct)));
      const im = illus(anyImg(card), store.images, 150); if (im) { im.style.maxHeight = '120px'; im.style.width = 'auto'; im.style.alignSelf = 'center'; qc.append(im); }
      if (listen) play();
    };
    foot.append(h('button', { class: 'btn ghost block', onclick: () => pick(-1) }, 'わからない'));
    main.append(qc, opts, foot);
    if (listen) setTimeout(play, 250);
    keyHandler = e => {
      if (!answered && '1234'.includes(e.key) && e.key) pick(Number(e.key) - 1);
      else if (answered && e.key === 'Enter') { e.preventDefault(); next(); }
    };
  }

  // ---- 穴埋め ----
  function showCloze(q) {
    const card = q.card;
    const blank = h('span', { class: 'blank' }, ' ');
    const qc = h('section', { class: 'qcard' },
      h('span', { class: 'ask' }, '空欄に入る語を選んでください'),
      h('p', { class: 'cloze-text' }, q.before, blank, q.after),
      q.ja ? h('p', { style: { fontSize: '14px', lineHeight: 1.6, color: 'var(--muted)' } }, q.ja) : null);
    const opts = h('div', { class: 'opts two', role: 'group', 'aria-label': '選択肢' });
    const foot = h('div', { class: 'study-foot' });
    let answered = false;
    const buttons = q.options.map((o, i) => h('button', { type: 'button', class: 'opt', onclick: () => pick(i) }, o.text));
    opts.append(...buttons);
    const pick = async i => {
      if (answered) return; answered = true;
      const correct = i >= 0 && q.options[i].correct;
      buttons.forEach((b, j) => { b.disabled = true; b.classList.add(q.options[j].correct ? 'right' : j === i ? 'wrong' : 'dim'); });
      blank.textContent = q.answer; blank.style.color = 'var(--tealDeep)'; blank.style.borderColor = 'var(--teal)';
      qc.append(h('div', { class: 'ex' }, h('span', { class: 'en' }, card.front), h('span', { class: 'ja' }, card.meaning)));
      const im = illus(anyImg(card), store.images, 150); if (im) { im.style.maxHeight = '120px'; im.style.width = 'auto'; qc.append(im); }
      clear(foot);
      const st = await grade(card, correct, false, 'cloze');
      foot.append(feedback(correct, correct ? '正解！' : `正しくは ${q.answer}`, nextText(st, correct)));
    };
    foot.append(h('button', { class: 'btn ghost block', onclick: () => pick(-1) }, 'わからない'));
    if (m.passageCount && card.deckNo) foot.append(h('a', { class: 'btn ghost block', style: { fontSize: '14px', minHeight: '44px' }, href: `#/read/${mid}/${card.deckNo}` }, icon('text', 18), `${card.deck} の長文で確かめる`));
    main.append(qc, opts, foot);
    keyHandler = e => {
      if (!answered && '1234'.includes(e.key) && e.key) pick(Number(e.key) - 1);
      else if (answered && e.key === 'Enter') { e.preventDefault(); next(); }
    };
  }

  // ---- つづり ----
  function showSpell(q) {
    const card = q.card;
    if (q.isNew && !q.seen) {
      // 初めての語: まず見て覚える
      const qc = h('article', { class: 'qcard' },
        h('div', { class: 'row-between' }, h('span', { class: 'ask' }, '新しい語です。見て覚えてから書きます'),
          canSpeak ? h('button', { class: 'icon-btn', style: { background: 'var(--bg)' }, 'aria-label': '発音を聞く', onclick: () => speak(card.front) }, icon('speaker', 22)) : null),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h('span', { class: 'word' + (card.front.length > 14 ? ' mid' : '') }, card.front, rankMark(card.rank)),
          card.pron ? h('span', { class: 'pron' }, `[${card.pron}]`) : null),
        backOf(card, 'en-ja', store.images));
      const go2 = () => { q.seen = true; keyHandler = null; clear(main); main.append(header(card, 'spell', true)); showSpell(q); };
      main.append(qc, h('div', { class: 'study-foot' }, h('button', { class: 'btn dark block', style: { height: '60px', fontSize: '17px' }, onclick: go2 }, '書いてみる')));
      if (canSpeak) setTimeout(() => speak(card.front), 250);
      keyHandler = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go2(); } };
      return;
    }
    let hints = 1, checked = false;
    const hintEl = h('b', { style: { color: 'var(--ink)', letterSpacing: '.18em' } });
    const drawHint = () => { hintEl.textContent = q.answer.split('').map((ch, i) => (i < hints || !/[A-Za-z]/.test(ch) ? ch : '_')).join(''); };
    drawHint();
    const blank = q.before != null ? h('span', { class: 'blank', style: { minWidth: '84px' } }, ' ') : null;
    const qc = h('section', { class: 'qcard' },
      h('div', { class: 'row-between' }, h('span', { class: 'ask' }, q.phrase ? '空欄に入る語を書いてください' : '英語で書いてください'), card.pos ? h('span', { class: 'tag' }, posName(card.pos)) : null),
      h('span', { class: 'word ja', style: { fontSize: '30px' } }, cleanMeaning(card.meaning)),
      q.before != null ? h('div', { class: 'ex' }, h('span', { class: 'en' }, q.before, blank, q.after), q.ja ? h('span', { class: 'ja' }, q.ja) : null) : null);
    const input = h('input', { id: 'spell', class: 'spell-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'done' });
    const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '18px 16px 0' } },
      h('label', { for: 'spell', style: { fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' } }, 'つづり'),
      input,
      h('span', { style: { fontSize: '13px', color: 'var(--muted)' } }, 'ヒント：', hintEl, `（${q.answer.length}文字）`));
    const foot = h('div', { class: 'study-foot' });
    const check = async () => {
      if (checked) return; checked = true;
      const correct = checkSpelling(input.value, q.answer);
      input.readOnly = true; input.classList.add(correct ? 'ok' : 'ng');
      if (blank) { blank.textContent = q.token || q.answer; blank.style.color = 'var(--tealDeep)'; }
      const im = illus(anyImg(card), store.images, 150); if (im) { im.style.maxHeight = '120px'; im.style.width = 'auto'; qc.append(im); }
      clear(foot);
      const st = await grade(card, correct, hints > 1, 'spell');
      foot.append(feedback(correct, correct ? (hints > 1 ? '正解（ヒントあり）' : '正解！') : 'おしい！',
        q.phrase ? `正しくは ${q.answer}　（${card.front}）` : `正しいつづり ${q.answer}${card.pron ? `　[${card.pron}]` : ''}`));
      if (canSpeak) speak(card.front);
      foot.querySelector('.btn')?.focus();
    };
    foot.append(h('div', { class: 'grid2', style: { gap: '10px' } },
      h('button', { class: 'btn outline', onclick: () => { hints = Math.min(q.answer.length, hints + 1); drawHint(); input.focus(); } }, '1文字ヒント'),
      h('button', { class: 'btn primary', onclick: check }, '答え合わせ')));
    main.append(qc, area, foot);
    setTimeout(() => input.focus(), 50);
    keyHandler = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!checked) check(); else next();
    };
  }

  function feedback(ok, title, sub) {
    const btn = h('button', { class: 'btn', onclick: next }, '次へ');
    setTimeout(() => btn.focus({ preventScroll: true }), 30);
    return h('div', { class: `feedback ${ok ? 'ok' : 'ng'}`, role: 'status' },
      h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null),
      btn);
  }
  function nextText(st, correct) {
    if (!correct) return 'このあともう一度出題します';
    const ms = st.due - Date.now();
    return ms < LEARN_WINDOW ? 'このあともう一度出題します' : `次は${formatInterval(ms)}後に出題します`;
  }

  // ---- 学習のおわり ----
  async function finish(early) {
    if (s.finished) return; s.finished = true;
    stopSpeaking();
    if (early) {
      // ×で閉じたときは「おつかれさま」を出さずに教材ページへ戻る（記録は答えるたびに保存済み）
      const fresh = s.done ? await store.checkBadges() : [];
      location.hash = `#/m/${mid}`;
      if (fresh.length) toast(`新しいバッジ：${fresh.map(b => b.name).join('、')}`, 3500);
      else if (s.done) toast(`${s.done}回答を記録しました`);
      return;
    }
    clear(main);
    main.className = 'result bare';
    const fresh = s.done ? await store.checkBadges() : [];
    const fr = store.ringFractions(store.today());
    const all = fr.every(f => f >= 1);
    const misses = [...s.again.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => store.cardIndex.get(id)).filter(Boolean);
    const where = kind === 'today' ? `${shortTitle(m.title)} の今日の分が終わりました`
      : kind === 'extra' ? `${shortTitle(m.title)} の新しい語を進めました`
        : kind === 'ahead' ? `${shortTitle(m.title)} の復習を先に進めました`
          : `${shortTitle(m.title)} · ${deckTitle || KIND_LABEL[kind]}の練習が終わりました`;
    const sub = !s.done ? '今は出題できる語がありません' : early ? 'ここまでの記録を保存しました' : where;
    main.append(
      h('header', { style: { display: 'flex', justifyContent: 'flex-end', padding: '14px 12px 0' } },
        h('a', { class: 'icon-btn', href: `#/m/${mid}`, 'aria-label': '閉じる', style: { color: '#fff' } }, icon('close', 22, 2.2))),
      h('section', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '0 24px' } },
        ringWithCheck(fr, all),
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' } },
          h('h1', { style: { fontSize: '24px', fontWeight: 800 } }, all ? '今日の目標を達成！' : 'おつかれさま！'),
          h('span', { style: { fontSize: '14px', color: 'var(--nightInk)' } }, sub))));
    if (s.done) {
      main.append(h('div', { class: 'grid2', style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', margin: '22px 16px 0' } },
        rstat(s.done, '', '回答'), rstat(Math.round((s.correct / s.done) * 100), '%', '正答率'),
        rstat(Math.max(1, Math.round((Date.now() - s.startMs) / 60000)), '分', '時間'), rstat(s.newIds.size, '', '新しい語')));
    }
    for (const b of fresh) {
      main.append(h('div', { class: 'box row', style: { gap: '14px' } },
        medal({ ...b, earned: true }, 60, '#141A33'),
        h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
          h('span', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--hl)' } }, '新しいバッジ'),
          h('span', { style: { fontSize: '16px', fontWeight: 700 } }, b.name))));
    }
    if (misses.length) {
      main.append(h('div', { class: 'box', style: { paddingBottom: '6px' } },
        h('h2', { style: { margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: 'var(--nightInk)' } }, '「もう一度」が多かった語'),
        ...misses.map(c => h('div', { class: 'miss' }, h('b', {}, c.front), h('span', {}, c.meaning)))));
    }
    // 今日の分（と、そのあと進めた分）が終わったら、さらに進められるようにする
    const goOn = ['today', 'extra', 'ahead'].includes(kind) && store.counts(mid).total === 0;
    const more = goOn ? store.newCandidates(mid, EXTRA_NEW).length : 0;
    const aheadN = goOn ? store.aheadCandidates(mid, EXTRA_AHEAD).length : 0;
    const line = { border: '2px solid #3A4370', color: '#fff' };
    main.append(h('div', { style: { marginTop: 'auto', padding: '22px 16px 30px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('a', { class: 'btn white block', href: '#/' }, 'ホームへ'),
      more ? h('a', { class: 'btn block', style: line, href: `#/study/${mid}/extra/${EXTRA_NEW}` }, `あと${more}語、新しく覚える`) : null,
      aheadN ? h('a', { class: 'btn block', style: line, href: `#/study/${mid}/ahead/${EXTRA_AHEAD}` }, `復習を先に進める（${aheadN}語）`) : null,
      more || aheadN ? null : h('a', { class: 'btn block', style: line, href: `#/m/${mid}` }, '教材ページへ')));
  }

  main.dispose = () => { window.removeEventListener('keydown', onKey); stopSpeaking(); };
  const onKey = e => { if (e.target.tagName === 'INPUT' && e.key !== 'Enter') return; if (e.target.tagName === 'SELECT') return; keyHandler?.(e); };
  window.addEventListener('keydown', onKey);
  if (!queue.length) finish(false); else show();
  return main;
}

/** 見出し語の絵が無ければ、派生語の絵を使う */
function anyImg(card) { return card.img ? card : { img: card.derived?.find(d => d.img)?.img || null, front: card.front }; }

function ringWithCheck(fr, all) {
  const el = rings(fr, 168, all ? '今日の目標を3つとも達成' : '今日の目標の達成度');
  if (all) el.insertAdjacentHTML('beforeend', '<path d="M48 56l6 6 11-12" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>');
  return el;
}
function rstat(v, unit, k) {
  return h('div', { class: 'stat' }, h('b', {}, String(v), unit ? h('small', {}, unit) : null), h('span', {}, k));
}

/** カードの裏面（意味・例文・派生語など） */
export function backOf(card, dir = 'en-ja', images = null) {
  const back = h('div', { class: 'back' });
  if (dir === 'ja-en') {
    back.append(h('span', { class: 'meaning' }, h('span', { class: 'mark' }, card.front), rankMark(card.rank)));
    if (card.pron) back.append(h('span', { class: 'pron' }, `[${card.pron}]`));
  } else back.append(h('span', { class: 'meaning' }, h('span', { class: 'mark' }, card.meaning)));
  if (card.sub?.length) back.append(h('span', { class: 'sub' }, card.sub.join('；')));
  // 鉄壁: 多義語の要約（①出席 ②注意 to）と、品詞ごとの意味の行（赤字だけでは足りない情報があるとき）
  if (card.summary) back.append(h('span', { class: 'sum' }, card.summary));
  if (card.lines?.length) back.append(h('div', { class: 'lines' }, ...card.lines.map(l => h('span', {}, l))));
  const pic = illus(card, images); if (pic) back.append(pic);
  // 鉄壁は例文が意味ごとに付く（多義語）ので全部出す
  for (const ex of (card.examples || []).slice(0, card.m === 'teppeki' ? 6 : 2)) back.append(h('div', { class: 'ex' }, h('span', { class: 'en' }, ex.en), ex.ja ? h('span', { class: 'ja' }, ex.ja) : null));
  const sect = (label, items) => items?.length ? h('div', { class: 'sect' }, h('b', {}, label), h('ul', {}, ...items.map(x => h('li', {}, x)))) : null;
  const add = el => { if (el) back.append(el); };
  add(sect(card.m === 'teppeki' ? '★' : '▶', card.usage));
  add(sect(card.m === 'teppeki' ? '◆' : '連語', card.colloc));
  if (card.derived?.length && card.m === 'teppeki') {
    // 鉄壁: 派生語も見出し語と同じくらいの情報を持つ
    for (const d of card.derived) {
      back.append(h('div', { class: 'dv' },
        h('span', { class: 'w' }, d.word, rankMark(d.rank), d.pron ? h('span', { class: 'pron', style: { fontSize: '14px', fontWeight: 400, marginLeft: '8px' } }, `[${d.pron}]`) : null),
        d.summary ? h('span', { class: 'sum' }, d.summary) : null,
        h('div', { class: 'lines' }, ...(d.lines || []).map(l => h('span', {}, l))),
        illus({ img: d.img, front: d.word }, images, 200),
        d.notes?.length ? h('div', { class: 'sect' }, h('ul', {}, ...d.notes.map(x => h('li', {}, '★ ' + x)))) : null,
        d.colloc?.length ? h('div', { class: 'sect' }, h('ul', {}, ...d.colloc.map(x => h('li', {}, '◆ ' + x)))) : null,
        ...(d.examples || []).slice(0, 1).map(ex => h('div', { class: 'ex' }, h('span', { class: 'en' }, ex.en), ex.ja ? h('span', { class: 'ja' }, ex.ja) : null))));
    }
  } else if (card.derived?.length) back.append(h('div', { class: 'sect' }, h('b', {}, '派生'), ...card.derived.map(d => h('span', { style: { marginRight: '10px' } }, `${d.word} `, h('span', { class: 'muted' }, `${posName(d.pos)} ${d.meaning}`)))));
  if (card.related?.length) back.append(h('div', { class: 'sect' }, h('ul', {}, ...card.related.map(r => h('li', {}, `${r.mark} ${r.text}`, rankMark(r.rank), r.meaning ? h('span', { class: 'muted' }, ` ${r.meaning}`) : null)))));
  if (card.refs?.length) back.append(h('div', { class: 'sect muted small' }, '→ ' + card.refs.join('、')));
  return back;
}
