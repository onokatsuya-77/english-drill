// 教材 JSON（TARGET 1400/1900、速読英熟語）を共通のカード形式に変換し、Firestore 用に分割する。

export const CHUNK_SIZE = 150;

const POS_NAME = { '動': '動詞', '名': '名詞', '形': '形容詞', '副': '副詞', '前': '前置詞', '接': '接続詞', '代': '代名詞', '助': '助動詞', '間': '間投詞' };

/** JSON の中身から教材の種類を判定する */
export function detectFormat(data) {
  if (Array.isArray(data) && data.length && typeof data[0].id === 'string') {
    if (data[0].id.startsWith('tg1400-')) return 'tg1400';
    if (data[0].id.startsWith('tg1900-')) return 'tg1900';
  }
  if (data && Array.isArray(data.cards) && Array.isArray(data.lessons) && data.cards[0]?.id?.startsWith('sj-')) return 'sj';
  return null;
}

/** TARGET の 1 語を共通カードに */
function fromTarget(c, materialId) {
  const sec = (c.no - 1) / 100 | 0;
  return {
    id: c.id, m: materialId, deck: `Section ${sec + 1}`, deckNo: sec + 1, no: c.no,
    front: c.headword, pron: c.pron || '', pos: c.pos || '', flags: c.flags || [],
    meaning: c.meaning_main || '', sub: c.meaning_sub || [],
    examples: (c.examples || []).map(e => ({ en: e.en, ja: e.ja })),
    usage: c.usage || [], colloc: c.collocations || [],
    derived: (c.derived || []).map(d => ({ word: d.word, pos: d.pos || '', meaning: d.meaning || '', pron: d.pron || '' })),
    related: [], notes: [], refs: [], page: c.page || null,
    audio: c.audio ? { file: c.audio.file, start: c.audio.start, end: c.audio.end } : null,
  };
}

/** 速読英熟語の 1 項目を共通カードに */
function fromSokujuku(c) {
  return {
    id: c.id, m: 'sj', deck: `Lesson ${c.lesson}`, deckNo: c.lesson, no: c.no,
    front: c.phrase, pron: '', pos: c.kind, flags: c.colloquial ? ['colloquial'] : [],
    meaning: c.meaning || '', sub: [],
    examples: (c.examples || []).map(e => ({ en: e.en, ja: e.ja })),
    usage: c.notes || [], colloc: [],
    derived: [],
    related: (c.related || []).map(r => ({ mark: r.mark, text: r.text, meaning: r.meaning || '', example: r.example || null })),
    notes: [], refs: c.refs || [], page: c.page || null,
    audio: c.audio || null,
  };
}

/**
 * 教材 JSON を { material, cards, passages } に変換する。
 * material: { id, title, kind, decks:[{id,title,count}], cardCount }
 */
export function normalize(data) {
  const fmt = detectFormat(data);
  if (!fmt) throw new Error('教材の形式を判定できません（TARGET 1400/1900 または速読英熟語の JSON を選んでください）');
  let cards, material, passages = [];
  if (fmt === 'tg1400' || fmt === 'tg1900') {
    cards = data.map(c => fromTarget(c, fmt));
    material = { id: fmt, title: fmt === 'tg1400' ? '英単語ターゲット1400' : '英単語ターゲット1900', kind: 'words', deckLabel: 'Section' };
  } else {
    cards = data.cards.map(fromSokujuku);
    material = { id: 'sj', title: '速読英熟語', kind: 'idioms', deckLabel: 'Lesson' };
    passages = data.lessons.map(l => ({
      lesson: l.lesson, title_en: l.title_en, title_ja: l.title_ja, words: l.words, illustrated: !!l.illustrated,
      passage: l.passage, highlights: l.highlights || [], footnotes: l.footnotes || [], extras: l.extras || [],
      entryIds: l.entry_ids || [], audio: l.audio || null,
    }));
  }
  cards.sort((a, b) => a.deckNo - b.deckNo || a.no - b.no);
  const decks = [];
  for (const c of cards) {
    let d = decks[decks.length - 1];
    if (!d || d.no !== c.deckNo) { d = { id: `${material.id}:${c.deckNo}`, no: c.deckNo, title: c.deck, count: 0 }; decks.push(d); }
    d.count += 1;
  }
  material.decks = decks;
  material.cardCount = cards.length;
  material.passageCount = passages.length;
  return { material, cards, passages };
}

/** カード配列を CHUNK_SIZE ごとに分割 */
export function chunk(arr, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const posName = p => POS_NAME[p] || p;

// ---- 自分の教材（Excel・CSV・1語ずつ） ----
export const OWN_PART = 50; // 自分の教材は 50 語ずつ Part に分ける

/** CSV を行の配列に（"…" のくくり、改行入り、先頭の BOM に対応） */
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

const COLS = {
  front: /^(英語|英単語|単語|見出し語?|english|word|term|phrase)$/i,
  meaning: /^(意味|日本語|訳|meaning|japanese|definition)$/i,
  exEn: /^(例文|example|sentence)$/i,
  exJa: /^(例文の?訳|例文和訳|和訳|example_?ja|translation)$/i,
  pos: /^(品詞|pos|part of speech)$/i,
  pron: /^(発音|発音記号|pron|ipa)$/i,
};

/** 表（1行目が見出し）から自分の教材をつくる。見出しが無ければ 英語・意味・例文・例文の訳 の順とみなす */
export function ownFromRows(rows, { title, owner, id = null, createdAt = null }) {
  if (!rows.length) throw new Error('行がありません');
  const head = rows[0].map(c => String(c).trim());
  const idx = {};
  for (const [k, re] of Object.entries(COLS)) { const i = head.findIndex(c => re.test(c)); if (i >= 0) idx[k] = i; }
  let body = rows;
  if (idx.front != null && idx.meaning != null) body = rows.slice(1);
  else { Object.assign(idx, { front: 0, meaning: 1, exEn: 2, exJa: 3 }); delete idx.pos; delete idx.pron; }
  const mid = id || 'own-' + Date.now().toString(36);
  const get = (r, k) => (idx[k] != null ? String(r[idx[k]] ?? '').trim() : '');
  const cards = [];
  for (const r of body) {
    const front = get(r, 'front'), meaning = get(r, 'meaning');
    if (!front || !meaning) continue;
    const no = cards.length + 1, deckNo = Math.floor((no - 1) / OWN_PART) + 1;
    const exEn = get(r, 'exEn'), exJa = get(r, 'exJa');
    cards.push({
      id: `${mid}-${no}`, m: mid, deck: `Part ${deckNo}`, deckNo, no,
      front, pron: get(r, 'pron'), pos: get(r, 'pos'), flags: [], meaning, sub: [],
      examples: exEn ? [{ en: exEn, ja: exJa }] : [], usage: [], colloc: [], derived: [], related: [], notes: [], refs: [], page: null, audio: null,
    });
  }
  if (!cards.length) throw new Error('「英語」と「意味」が入った行が見つかりません');
  const decks = [];
  for (const c of cards) { let d = decks[decks.length - 1]; if (!d || d.no !== c.deckNo) { d = { id: `${mid}:${c.deckNo}`, no: c.deckNo, title: c.deck, count: 0 }; decks.push(d); } d.count++; }
  const material = { id: mid, title: title || '自分の単語帳', kind: 'own', deckLabel: 'Part', decks, cardCount: cards.length, passageCount: 0, owner, createdAt: createdAt || Date.now() };
  return { material, cards };
}

export const CSV_TEMPLATE = '﻿英語,意味,例文,例文の訳,品詞\r\nefficient,効率的な,This new pump is more efficient than the old one.,この新しいポンプは古いものより効率がいい。,形\r\npressure vessel,圧力容器,,,名\r\n';
