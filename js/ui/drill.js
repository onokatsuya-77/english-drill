// 実戦問題（古文単語330 の各章末にある入試の過去問）: 5 択と口語訳。学習の記録（FSRS）とは別に、できた・できなかったを端末に覚える。
import { h, clear } from '../dom.js';
import { icon, shortTitle } from './parts.js';

const circled = n => (n >= 1 && n <= 20 ? String.fromCharCode(0x245F + n) : String(n));
const list = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);

/** 付属データからセットごとの一覧（set, page, ids, items）を作る */
export function drillSets(extras) {
  const by = new Map();
  for (const x of extras || []) {
    if (x.kind !== 'drill') continue;
    const s = by.get(x.set) || { set: x.set, page: x.page, ids: [], items: [] };
    s.items.push(x); s.ids.push(x.id); if (x.page < s.page) s.page = x.page;
    by.set(x.set, s);
  }
  return [...by.values()].sort((a, b) => a.set - b.set).map(s => ({ ...s, items: s.items.sort((a, b) => a.n - b.n), ids: s.items.sort((a, b) => a.n - b.n).map(x => x.id) }));
}
const recKey = (store, mid) => `ed-drill:${store.profile?.id || 'x'}:${mid}`;
/** できた・できなかったの記録（問 id → { ok, at }） */
export function drillRecord(store, mid) {
  try { return JSON.parse(localStorage.getItem(recKey(store, mid)) || '{}'); } catch { return {}; }
}
function saveRecord(store, mid, rec) { try { localStorage.setItem(recKey(store, mid), JSON.stringify(rec)); } catch { /* 保存できなくてもよい */ } }

/** 訳の中の赤字（四角囲み）を強調 */
function markRed(text, reds) {
  const t = String(text || ''); const keys = list(reds).map(x => String(x).trim()).filter(Boolean);
  if (!keys.length) return [t];
  const re = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const out = []; let last = 0, m;
  while ((m = re.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); out.push(h('mark', { class: 'red' }, m[0])); last = m.index + m[0].length; if (!m[0]) re.lastIndex++; }
  if (last < t.length) out.push(t.slice(last));
  return out;
}
/** 古文の中の傍線部（と太字）を強調 */
function markKo(ko, targets, heads) {
  const spans = [];
  for (const t of list(targets)) { const i = ko.indexOf(t); if (i >= 0) spans.push([i, i + t.length, 'tgt']); }
  for (const t of list(heads)) { const i = ko.indexOf(t); if (i >= 0) spans.push([i, i + t.length, 'head']); }
  if (!spans.length) return [ko];
  // 位置ごとに、傍線か太字かを決める（重なりは両方）
  const cls = Array.from({ length: ko.length }, () => '');
  for (const [a, b, c] of spans) for (let i = a; i < b; i++) cls[i] += c + ' ';
  const out = []; let i = 0;
  while (i < ko.length) {
    let j = i; while (j < ko.length && cls[j] === cls[i]) j++;
    const seg = ko.slice(i, j);
    out.push(cls[i] ? h('mark', { class: cls[i].includes('tgt') ? 'tgt' + (cls[i].includes('head') ? ' head' : '') : 'head' }, seg) : seg);
    i = j;
  }
  return out;
}

/** 実戦問題の画面: #/drill/<教材>/<セット> */
export function renderDrill(store, { go, params }) {
  const [mid, setStr] = params;
  const set = Number(setStr);
  const m = store.material(mid);
  const main = h('main', { class: 'study bare' });
  main.sticky = true;
  if (!m) { main.append(h('div', { class: 'empty' }, h('p', {}, '教材が見つかりません。'), h('a', { class: 'btn primary', href: '#/' }, 'ホームへ'))); return main; }
  main.append(h('p', { class: 'muted center', style: { padding: '40px 0' } }, '読み込み中…'));
  let keyHandler = null;
  const s = { items: [], idx: 0, ok: 0, done: 0, rec: drillRecord(store, mid) };

  store.loadExtras(mid).then(xs => {
    const st = drillSets(xs).find(x => x.set === set);
    if (!st) { clear(main); main.append(h('div', { class: 'empty' }, h('p', {}, 'この実戦問題は登録されていません。'), h('a', { class: 'btn primary', href: `#/m/${mid}` }, '教材ページへ'))); return; }
    s.items = st.items; s.page = st.page;
    // 続きから（全部終わっていたら最初から、記録を消して）
    const first = s.items.findIndex(x => !s.rec[x.id]);
    if (first < 0) { for (const x of s.items) delete s.rec[x.id]; saveRecord(store, mid, s.rec); s.idx = 0; } else s.idx = first;
    show();
  });

  function header(q) {
    const n = Math.min(s.idx + 1, s.items.length);
    return h('header', { class: 'study-head' },
      h('div', { class: 'row', style: { gap: '8px' } },
        h('a', { class: 'icon-btn', style: { marginLeft: '-8px' }, 'aria-label': 'やめる', href: `#/m/${mid}` }, icon('close', 22, 2.2)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.items.length), 'aria-valuenow': String(n) },
          h('div', { style: { width: `${(s.idx / s.items.length) * 100}%` } })),
        h('span', { class: 'count' }, `${n} / ${s.items.length}`)),
      h('div', { class: 'info' }, h('span', { class: `pill ${q.type === 'choice' ? 'orange' : q.type === 'grammar' ? 'teal' : 'indigo'}` }, q.type === 'choice' ? `${(q.options || []).length}択` : q.type === 'grammar' ? '文法' : '口語訳'), h('span', {}, `${shortTitle(m.title)} · 実戦問題 ${circled(set)} · 問 ${q.n}`)));
  }
  function show() {
    clear(main);
    const q = s.items[s.idx];
    if (!q) { finish(); return; }
    main.append(header(q));
    (q.type === 'choice' ? showChoice : q.type === 'grammar' ? showGrammar : showTrans)(q);
  }
  function record(q, ok) {
    s.rec[q.id] = { ok, at: Date.now() }; saveRecord(store, mid, s.rec);
    s.done++; if (ok) s.ok++;
  }
  function next() { s.idx++; show(); }
  /** 傍線部に対応する見出し語（本の P 参照から） */
  function related(q) {
    return (q.entry_nos || []).map(no => store.cardIndex.get(`kb-${String(no).padStart(4, '0')}`)).filter(Boolean);
  }
  function relatedBox(q) {
    const cs = related(q);
    if (!cs.length) return null;
    return h('div', { class: 'sect', style: { marginTop: '10px' } }, h('b', {}, '見出し語'),
      ...cs.map(c => h('div', { class: 'ex kb', style: { marginTop: '6px' } }, h('span', { class: 'en kbw' }, c.front, c.kanji ? h('small', {}, `【${c.kanji}】`) : null, h('small', {}, ` ${c.no}`)), h('span', { class: 'ja' }, c.meaning))));
  }
  function question(q) {
    const ask = q.type === 'choice' ? '傍線部の口語訳として適当なものを選んでください' : q.type === 'grammar' ? (q.q || '敬語・文法の問題') : '傍線部を口語訳してください（太字が本書の見出し語）';
    return h('section', { class: 'qcard' },
      h('span', { class: 'ask' }, ask),
      h('p', { class: 'kobun-text' }, ...markKo(q.ko, q.target, q.head)),
      q.source ? h('span', { class: 'small muted' }, `〈${q.source}〉`) : null);
  }
  function answerBox(q) {
    return h('div', { class: 'ex kb' }, h('span', { class: 'ja', style: { fontSize: '15px', color: 'var(--ink)' } }, h('b', { style: { marginRight: '6px', color: '#8C2E3A' } }, '訳'), ...markRed(q.ja, q.red)));
  }

  // ---- 5 択 ----
  function showChoice(q) {
    const qc = question(q);
    const opts = h('div', { class: 'opts', role: 'group', 'aria-label': '選択肢' });
    const foot = h('div', { class: 'study-foot' });
    let answered = false;
    const buttons = (q.options || []).map((o, i) => h('button', { type: 'button', class: 'opt', onclick: () => pick(i) }, h('span', { class: 'no' }, circled(i + 1)), o));
    opts.append(...buttons);
    const pick = i => {
      if (answered) return; answered = true;
      const correct = i + 1 === q.answer;
      buttons.forEach((b, j) => { b.disabled = true; b.classList.add(j + 1 === q.answer ? 'right' : j === i ? 'wrong' : 'dim'); });
      qc.append(answerBox(q)); const rb = relatedBox(q); if (rb) qc.append(rb);
      record(q, correct);
      clear(foot);
      foot.append(feedback(correct, correct ? '正解！' : `正しくは ${circled(q.answer)}「${q.options[q.answer - 1]}」`, ''));
    };
    foot.append(h('button', { class: 'btn ghost block', onclick: () => pick(-1) }, 'わからない'));
    main.append(qc, opts, foot);
    keyHandler = e => {
      if (!answered && '123456'.includes(e.key) && e.key) pick(Number(e.key) - 1);
      else if (answered && e.key === 'Enter') { e.preventDefault(); next(); }
    };
  }
  // ---- 文法（敬語の種類などを選ぶ。A・B の 2 問、A〜E から 1 つ、記述は自己採点） ----
  function showGrammar(q) {
    if (!q.parts && !q.labels) { showTrans({ ...q, ja: q.ja, red: q.red, answerText: q.answer_text }); return; }
    const qc = question(q);
    const foot = h('div', { class: 'study-foot' });
    const groups = q.parts || [{ label: '', name: '', options: q.labels, answer: q.answer }];
    const picked = groups.map(() => null);
    const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' } });
    const btnSets = groups.map((g, gi) => {
      const bs = g.options.map((o, i) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => { picked[gi] = i; bs.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i))); check.disabled = picked.some(x => x == null); } }, `${q.parts ? circled(i + 1) : ''}${o}`));
      area.append(h('div', { class: 'field' }, g.label || g.name ? h('span', { style: { fontSize: '13px', fontWeight: 700 } }, `${g.label} ${g.name}`) : null, h('div', { class: 'chips' }, ...bs)));
      return bs;
    });
    const check = h('button', { class: 'btn primary block', disabled: true, onclick: () => {
      const ok = groups.every((g, gi) => picked[gi] + 1 === g.answer);
      btnSets.forEach((bs, gi) => bs.forEach((b, j) => { b.disabled = true; if (j + 1 === groups[gi].answer) b.style.outline = '3px solid var(--teal)'; else if (j === picked[gi]) b.style.outline = '3px solid var(--red)'; }));
      qc.append(answerBox(q)); if (q.answer_note) qc.append(h('span', { class: 'small muted' }, q.answer_note)); const rb = relatedBox(q); if (rb) qc.append(rb);
      record(q, ok); clear(foot);
      foot.append(feedback(ok, ok ? '正解！' : '正しくは ' + groups.map(g => `${g.label}${q.parts ? circled(g.answer) : ''}${g.options[g.answer - 1]}`).join('・'), ''));
    } }, '答え合わせ');
    foot.append(check);
    main.append(qc, area, foot);
    keyHandler = e => { if (e.key === 'Enter' && !check.disabled) { e.preventDefault(); check.click(); } };
  }
  // ---- 口語訳（自己採点） ----
  function showTrans(q) {
    const qc = question(q);
    const foot = h('div', { class: 'study-foot' });
    let revealed = false;
    const reveal = () => {
      if (revealed) return; revealed = true;
      qc.append(h('span', { class: 'small muted', style: { marginTop: '8px' } }, '赤い部分が、見出し語の訳です。'), answerBox(q));
      if (q.answerText) qc.append(h('div', { class: 'ex kb' }, h('span', { class: 'ja', style: { fontSize: '15px', color: 'var(--ink)' } }, h('b', { style: { marginRight: '6px', color: '#8C2E3A' } }, '答'), list(q.answerText).join('／'))));
      const rb = relatedBox(q); if (rb) qc.append(rb);
      clear(foot);
      foot.append(h('div', { class: 'grid2', style: { gap: '10px' } },
        h('button', { class: 'btn outline', onclick: () => rate(false) }, 'できなかった'),
        h('button', { class: 'btn primary', onclick: () => rate(true) }, 'できた')));
    };
    const rate = ok => { record(q, ok); next(); };
    foot.append(h('button', { class: 'btn dark block', style: { height: '60px', fontSize: '17px' }, onclick: reveal }, '訳を見る'));
    main.append(qc, foot);
    keyHandler = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!revealed) reveal(); }
      else if (revealed && (e.key === '1' || e.key === '2')) rate(e.key === '2');
    };
  }
  function feedback(ok, title, sub) {
    const btn = h('button', { class: 'btn', onclick: next }, '次へ');
    setTimeout(() => btn.focus({ preventScroll: true }), 30);
    return h('div', { class: `feedback ${ok ? 'ok' : 'ng'}`, role: 'status' },
      h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), btn);
  }
  // ---- おわり ----
  function finish() {
    clear(main); main.className = 'result bare';
    const all = s.items.length, ok = s.items.filter(x => s.rec[x.id]?.ok).length;
    const miss = s.items.filter(x => s.rec[x.id] && !s.rec[x.id].ok);
    main.append(
      h('header', { style: { display: 'flex', justifyContent: 'flex-end', padding: '14px 12px 0' } },
        h('a', { class: 'icon-btn', href: `#/m/${mid}`, 'aria-label': '閉じる', style: { color: '#fff' } }, icon('close', 22, 2.2))),
      h('section', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '20px 24px 0', textAlign: 'center' } },
        h('h1', { style: { fontSize: '24px', fontWeight: 800 } }, `実戦問題 ${circled(set)} おわり`),
        h('span', { style: { fontSize: '40px', fontWeight: 800 } }, `${ok}`, h('small', { style: { fontSize: '18px', fontWeight: 600, color: 'var(--nightInk)' } }, ` / ${all} 問`)),
        h('span', { style: { fontSize: '14px', color: 'var(--nightInk)' } }, ok === all ? '全問できました！' : 'できなかった問は、見出し語の学習で確かめましょう。')));
    if (miss.length) {
      main.append(h('div', { class: 'box', style: { paddingBottom: '6px' } },
        h('h2', { style: { margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: 'var(--nightInk)' } }, 'できなかった問'),
        ...miss.map(x => h('div', { class: 'miss' }, h('b', {}, `問 ${x.n}`), h('span', {}, list(x.target).join('／') + '　→　' + list(x.red).join('・'))))));
    }
    const line = { border: '2px solid #3A4370', color: '#fff', background: 'transparent' };
    main.append(h('div', { style: { marginTop: 'auto', padding: '22px 16px 30px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('a', { class: 'btn white block', href: `#/m/${mid}` }, '教材ページへ'),
      h('button', { class: 'btn block', style: line, onclick: () => { for (const x of s.items) delete s.rec[x.id]; saveRecord(store, mid, s.rec); s.idx = 0; s.ok = 0; s.done = 0; main.className = 'study bare'; show(); } }, 'もう一度')));
  }

  main.dispose = () => { window.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; keyHandler?.(e); };
  window.addEventListener('keydown', onKey);
  return main;
}
