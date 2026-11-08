// 連続再生（瞬間英作文）: 日本語 → 間 → 英語（または 英語 → 間 → 日本語）を自動で流す。車や散歩のとき用。学習の記録はつけない。
import { h, clear, toast } from '../dom.js';
import { cleanMeaning } from '../quiz.js';
import { canSpeak, say, stopSpeaking, hasJaVoice } from '../speech.js';
import { icon, shortTitle } from './parts.js';

const OPT_KEY = 'ed-play-opts';
const POS_KEY = 'ed-play-pos:';
const DEFAULT_OPTS = { dir: 'ja-en', content: 'sentence', pause: 'auto', repeat: 1, rate: 1, loop: true, keepAlive: false };
const DIR_NAME = { 'ja-en': '日本語 → 英語', 'en-ja': '英語 → 日本語' };
const SCOPE_NAME = { today: '今日学習した語', shaky: 'あやしい語' };

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const saveLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境では覚えない */ } };

/** 例文（無ければ語）を「日本語 → 英語」の 1 組にする。例文はできるだけ文の形のものを選ぶ */
export function playItems(cards, content = 'sentence') {
  const out = [];
  for (const c of cards) {
    if (c.kobun) {
      // 古文: 例文の読みは無いので語だけ。「意味 → 読み（現代仮名遣い）」を日本語の声で
      const rd = String(c.reading || c.front).replace(/～(うちけし|打消|禁止|きんし)/g, '').replace(/～/g, '、');
      const it = { id: c.id, ja: cleanMeaning(c.meaning), en: rd, word: c.front, kind: 'word', lang: 'ja' };
      if (it.ja && it.en) out.push(it);
      continue;
    }
    const exs = (c.examples || []).filter(x => x.en && x.ja);
    const ex = content === 'sentence' ? (exs.find(x => /[.?!]["”’]?$/.test(x.en.trim())) || exs[0]) : null;
    const it = ex ? { id: c.id, ja: ex.ja, en: ex.en, word: c.front, kind: 'sentence' }
      : { id: c.id, ja: cleanMeaning(c.meaning), en: c.front, word: c.front, kind: 'word' };
    if (it.ja && it.en) out.push(it);
  }
  return out;
}
/** 答えを言うまでの間（自動は答えの長さに合わせる。英語を言うときは長め、日本語の意味を言うときは短め） */
export function pauseMs(it, pause, dir = 'ja-en') {
  if (pause !== 'auto') return Number(pause) * 1000;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  if (dir === 'en-ja') return it.kind === 'word' ? clamp(2000 + it.ja.length * 120, 2500, 4500) : clamp(2000 + it.ja.length * 90, 3000, 8000);
  return it.kind === 'word' ? clamp(2000 + it.en.length * 80, 2500, 5000) : clamp(1500 + it.en.length * 70, 3000, 9000);
}

/** 画面ロック中も音を出し続けるための、無音のくり返し（試験中） */
function silentUrl() {
  const n = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function renderPlay(store, { go, params }) {
  const [mid, scope = 'deck', arg = null] = params;
  const m = store.material(mid);
  const main = h('main', { class: 'player bare' });
  main.sticky = true; // 自分で描画を管理する（アプリの更新も再生が終わってから）
  if (!m || !store.cards.has(mid)) { main.append(h('div', { class: 'empty' }, h('p', {}, '教材が見つかりません。'), h('a', { class: 'btn primary', href: '#/' }, 'ホームへ'))); return main; }

  const opts = { ...DEFAULT_OPTS, ...load(OPT_KEY, {}) };
  const posKey = POS_KEY + [mid, scope, arg].join(':');
  const deck = scope === 'deck' ? (m.decks || []).find(d => String(d.no) === String(arg)) : null;
  const scopeName = deck ? deck.title : SCOPE_NAME[scope] || '';
  const cards = store.playCards(mid, scope, arg);
  const P = { items: playItems(cards, opts.content), idx: 0, playing: false, phase: 'idle', token: 0 };
  P.idx = Math.min(load(posKey, 0) || 0, Math.max(0, P.items.length - 1));

  let wake = null, audio = null, audioUrl = null;
  const wakeOK = 'wakeLock' in navigator;
  async function wakeOn() {
    if (!wakeOK || wake || document.visibilityState !== 'visible') return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch { wake = null; }
  }
  function wakeOff() { wake?.release().catch(() => {}); wake = null; }
  function keepOn() {
    if (!opts.keepAlive) return;
    if (!audio) { audioUrl = silentUrl(); audio = new Audio(audioUrl); audio.loop = true; audio.setAttribute('playsinline', ''); }
    audio.play().catch(() => {});
  }
  function keepOff() { audio?.pause(); }

  // ---- 画面（一度つくって、中身だけ書き換える） ----
  const count = h('span', { class: 'count' });
  const bar = h('div', {});
  const qEl = h('p', { class: 'q' });  // 先に流す方（日本語 → 英語なら日本語）
  const aEl = h('p', { class: 'a' });  // 間のあとに流す答え
  const wordEl = h('p', { class: 'word-sub', lang: 'en' });
  const gauge = h('div', { class: 'gauge' }, h('div', {}));
  const phaseEl = h('span', { class: 'phase', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': '再生', onclick: () => (P.playing ? pause() : play()) });
  const status = h('p', { class: 'small note-dark' });
  const dirPill = h('span', { class: 'pill dark' });

  function head() {
    return h('header', { class: 'study-head' },
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'icon-btn', style: { marginLeft: '-8px' }, 'aria-label': '連続再生をやめる', onclick: () => go(`m/${mid}`) }, icon('close', 22, 2.2)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': '進み具合' }, bar),
        count),
      h('div', { class: 'info' }, dirPill, h('span', {}, `${shortTitle(m.title)} · ${scopeName}`)));
  }
  function update() {
    P.tick = Date.now();
    const it = P.items[P.idx];
    const n = P.items.length;
    count.textContent = n ? `${P.idx + 1} / ${n}` : '0 / 0';
    bar.style.width = n ? `${((P.idx + (P.phase === 'gap' ? 1 : 0)) / n) * 100}%` : '0';
    const jaFirst = opts.dir !== 'en-ja';
    dirPill.textContent = DIR_NAME[opts.dir] || DIR_NAME['ja-en'];
    qEl.lang = jaFirst ? 'ja' : 'en'; aEl.lang = jaFirst ? 'en' : 'ja';
    qEl.textContent = it ? (jaFirst ? it.ja : it.en) : '';
    const showA = P.phase === 'a' || P.phase === 'gap' || !P.playing;
    aEl.textContent = it && showA ? (jaFirst ? it.en : it.ja) : '';
    wordEl.textContent = it && it.kind === 'sentence' && showA ? it.word : '';
    phaseEl.textContent = { q: jaFirst ? '日本語' : '英語', pause: jaFirst ? '英語で言ってみる' : '意味を言ってみる', a: jaFirst ? '英語' : '日本語', gap: '', idle: P.items.length ? '止まっています' : '' }[P.phase] || '';
    clear(playBtn); playBtn.append(icon(P.playing ? 'pause' : 'play', 40, 2.4));
    playBtn.setAttribute('aria-label', P.playing ? '一時停止' : '再生');
    status.textContent = !canSpeak ? 'この端末では読み上げが使えません。'
      : !hasJaVoice() ? '日本語の読み上げの声が見つかりません。端末の設定で日本語の声を入れてください。'
        : P.playing ? (wake ? '再生中は画面を消さずにおきます。車ではホルダーに固定して使ってください。' : '画面が消えると止まることがあります。止まったら、開き直すと続きから流れます。')
          : '続きから流れます。最後まで行くと' + (opts.loop ? '最初に戻ります。' : '止まります。');
    if ('mediaSession' in navigator && it) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: jaFirst ? it.ja : it.en, artist: `${shortTitle(m.title)} · ${scopeName}`, album: 'English Drill 連続再生' }); } catch { /* 対応していない端末 */ }
    }
  }
  function startGauge(ms) {
    const g = gauge.firstChild;
    g.style.transition = 'none'; g.style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = `width ${ms}ms linear`; g.style.width = '100%'; }));
  }
  function clearGauge() { const g = gauge.firstChild; g.style.transition = 'none'; g.style.width = '0'; }

  // ---- 再生 ----
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function run() {
    const my = ++P.token;
    const live = () => my === P.token && P.playing;
    while (live()) {
      if (P.idx >= P.items.length) {
        if (opts.loop && P.items.length) { P.idx = 0; continue; }
        P.idx = Math.max(0, P.items.length - 1); stop(); toast('最後まで流しました'); saveLocal(posKey, 0); return;
      }
      saveLocal(posKey, P.idx);
      const it = P.items[P.idx];
      const jaFirst = opts.dir !== 'en-ja';
      // 英語は「くり返し」の回数だけ、設定の速さで読む（どちらの向きでも）
      const sayEn = async () => {
        for (let r = 0; r < opts.repeat; r++) {
          await say(it.en, { lang: it.lang || 'en', rate: opts.rate }); if (!live()) return false;
          if (r < opts.repeat - 1) { await sleep(900); if (!live()) return false; }
        }
        return true;
      };
      const sayJa = async () => { await say(it.ja, { lang: 'ja', rate: 1 }); return live(); };
      P.phase = 'q'; clearGauge(); update();
      if (!(await (jaFirst ? sayJa() : sayEn()))) return;
      const wait = pauseMs(it, opts.pause, opts.dir);
      P.phase = 'pause'; update(); startGauge(wait);
      await sleep(wait); if (!live()) return;
      P.phase = 'a'; clearGauge(); update();
      if (!(await (jaFirst ? sayEn() : sayJa()))) return;
      P.phase = 'gap'; update();
      await sleep(1600); if (!live()) return;
      P.idx++;
    }
  }
  function play() {
    if (!P.items.length) return;
    P.playing = true; wakeOn().then(update); keepOn();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    run();
  }
  function stop() {
    P.playing = false; P.token++; P.phase = 'idle';
    stopSpeaking(); clearGauge(); wakeOff(); keepOff();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    update();
  }
  function pause() { stop(); saveLocal(posKey, P.idx); }
  function jump(d) {
    if (!P.items.length) return;
    P.idx = Math.max(0, Math.min(P.items.length - 1, P.idx + d));
    saveLocal(posKey, P.idx);
    if (P.playing) { stopSpeaking(); run(); } else update();
  }
  function restartCurrent() { if (P.playing) { stopSpeaking(); run(); } }

  // アプリに戻ってきたら、画面を消さない設定をかけ直し、途中で止まっていた組を最初から流す
  const onVis = () => {
    if (document.visibilityState !== 'visible' || !P.playing) return;
    const stalled = Date.now() - P.tick > 20000; // 画面が消えている間に読み上げが止まっていた
    wakeOn().then(update);
    if (!opts.keepAlive || stalled) restartCurrent();
  };
  document.addEventListener('visibilitychange', onVis);
  if ('mediaSession' in navigator) {
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* 対応していない操作 */ } };
    set('play', () => play()); set('pause', () => pause()); set('nexttrack', () => jump(1)); set('previoustrack', () => jump(-1));
  }
  const onKey = e => {
    if (e.target.closest?.('select')) return;
    if (e.key === ' ') { e.preventDefault(); P.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') jump(1);
    else if (e.key === 'ArrowLeft') jump(-1);
  };
  document.addEventListener('keydown', onKey);
  main.dispose = () => {
    P.playing = false; P.token++; stopSpeaking(); wakeOff();
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    if ('mediaSession' in navigator) {
      for (const a of ['play', 'pause', 'nexttrack', 'previoustrack']) { try { navigator.mediaSession.setActionHandler(a, null); } catch { /* 同上 */ } }
      try { navigator.mediaSession.metadata = null; } catch { /* 同上 */ }
    }
  };

  // ---- 設定 ----
  const setOpt = (patch, rebuild = false) => {
    Object.assign(opts, patch); saveLocal(OPT_KEY, opts);
    if (rebuild) {
      const id = P.items[P.idx]?.id;
      P.items = playItems(cards, opts.content);
      const k = P.items.findIndex(x => x.id === id); P.idx = k >= 0 ? k : 0;
      restartCurrent();
    }
    if ('keepAlive' in patch) { if (P.playing && opts.keepAlive) keepOn(); else keepOff(); }
    update();
  };
  const row = (label, value, options, onchange) => {
    const id = 'pl-' + label;
    return h('div', { class: 'set-row' }, h('label', { for: id }, label),
      h('select', { id, onchange: e => onchange(e.target.value) }, ...options.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(value) }, t))));
  };

  if (!P.items.length) {
    main.append(head(), h('div', { class: 'empty' }, h('p', {}, '流せる語がありません。'), h('a', { class: 'btn primary', href: `#/m/${mid}` }, '教材ページへ')));
    update(); return main;
  }
  main.append(
    head(),
    h('section', { class: 'play-card' }, phaseEl, qEl, gauge, aEl, wordEl),
    h('div', { class: 'play-ctrl' },
      h('button', { class: 'icon-btn big', 'aria-label': '前へ', onclick: () => jump(-1) }, icon('prev', 30, 2.2)),
      playBtn,
      h('button', { class: 'icon-btn big', 'aria-label': '次へ', onclick: () => jump(1) }, icon('next', 30, 2.2))),
    status,
    h('div', { class: 'list dark' },
      row('向き', opts.dir, [['ja-en', '日本語 → 英語'], ['en-ja', '英語 → 日本語']], v => { setOpt({ dir: v }); restartCurrent(); }),
      row('流すもの', opts.content, [['sentence', '例文'], ['word', '語（単語・熟語）']], v => setOpt({ content: v }, true)),
      row('答えまでの間', opts.pause, [['auto', '自動（長さに合わせる）'], [2, '2秒'], [3, '3秒'], [5, '5秒'], [8, '8秒']], v => setOpt({ pause: v === 'auto' ? 'auto' : Number(v) })),
      row('英語', opts.repeat, [[1, '1回'], [2, '2回くり返す']], v => setOpt({ repeat: Number(v) })),
      row('英語の速さ', opts.rate, [[0.8, 'ゆっくり'], [1, 'ふつう'], [1.15, '速め']], v => setOpt({ rate: Number(v) })),
      row('最後まで行ったら', opts.loop ? 1 : 0, [[1, '最初に戻る'], [0, '止まる']], v => setOpt({ loop: v === '1' })),
      row('画面ロック中も続ける（試験中）', opts.keepAlive ? 1 : 0, [[0, 'しない'], [1, '試す']], v => setOpt({ keepAlive: v === '1' })),
      h('button', { class: 'set-row', style: { cursor: 'pointer' }, onclick: () => { P.idx = 0; saveLocal(posKey, 0); restartCurrent(); update(); } }, h('span', {}, '最初から流す'), icon('prev', 20, 2.2))),
    h('p', { class: 'small note-dark' }, '学習の記録はつけません。運転中は画面を見たり操作したりせず、音だけで使ってください。'),
  );
  update();
  return main;
}
