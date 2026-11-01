// 教材 JSON（TARGET 1400/1900、速読英熟語）を共通のカード形式に変換し、Firestore 用に分割する。

export const CHUNK_SIZE = 150;
export const IMAGE_CHUNK = 40; // 挿絵は 40 枚ずつ（1 文書 1MB の上限に余裕を持たせる）

const POS_NAME = { '動': '動詞', '名': '名詞', '形': '形容詞', '副': '副詞', '前': '前置詞', '接': '接続詞', '代': '代名詞', '助': '助動詞', '間': '間投詞' };

/** JSON の中身から教材の種類を判定する */
export function detectFormat(data) {
  if (Array.isArray(data) && data.length && typeof data[0].id === 'string') {
    if (data[0].id.startsWith('tg1400-')) return 'tg1400';
    if (data[0].id.startsWith('tg1900-')) return 'tg1900';
  }
  if (data && Array.isArray(data.cards) && Array.isArray(data.lessons) && data.cards[0]?.id?.startsWith('sj-')) return 'sj';
  if (data && data.format === 'teppeki' && Array.isArray(data.entries)) return 'teppeki';
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

const TP_POS = { '他': '動', '自': '動', '自他': '動', '他自': '動', '動': '動', '名': '名', '形': '形', '副': '副', '前': '前', '接': '接', '代': '代', '助': '助', '句': '熟語' };
const meaningOf = ms => (ms || []).map(m => m.red || m.text).filter(Boolean).join('；');
const lineOf = m => (m.pos ? `〔${m.pos}〕` : '') + m.text;
const squash = s => (s || '').replace(/[，,；;\s]/g, '');
/** 赤字だけでは足りないとき（「～を」や①②、補足がある、品詞が複数）だけ、品詞ごとの行を出す */
const linesOf = ms => ((ms || []).length > 1 || (ms || []).some(m => squash(m.text) !== squash(m.red))) ? (ms || []).map(lineOf) : [];

/** 鉄壁の 1 見出し語（派生語つき）を共通カードに */
function fromTeppeki(e, sectionTitles) {
  const no = String(e.no).padStart(4, '0');
  // 挿絵: tp-ill-0026 は見出し語、tp-ill-0026-2 は 2 つめの派生語（derived[1]）の絵
  const ids = e.illustration_ids || (e.illustration_id ? [e.illustration_id] : []);
  // 新しい JSON は e.img / d.img で絵の名前を直接持つ（同じ絵を数語で共有できる）。前の形は名前の決まりから探す
  const headImg = e.img !== undefined ? e.img : (ids.find(x => /^tp-ill-\d{4}$/.test(x)) || null);
  return {
    id: `tp-${no}`, m: 'teppeki', deck: `SECTION ${e.section}`, deckNo: e.section, no: e.no,
    front: e.headword, pron: e.pron || '', pos: TP_POS[e.meanings?.[0]?.pos] || e.meanings?.[0]?.pos || '', flags: [],
    rank: e.rank ?? 0, group: e.group || null, summary: e.summary || '',
    meaning: meaningOf(e.meanings), sub: [], lines: linesOf(e.meanings),
    examples: (e.examples || []).map(x => ({ en: x.en, ja: x.ja })),
    usage: e.notes || [], colloc: (e.phrases || []).map(p => p.ja ? `${p.en}「${p.ja}」` : p.en),
    derived: (e.derived || []).map((d, k) => ({
      img: d.img !== undefined ? d.img : (ids.find(x => x === `tp-ill-${no}-${k + 1}`) || null),
      word: d.word, pos: TP_POS[d.meanings?.[0]?.pos] || d.meanings?.[0]?.pos || '', rank: d.rank ?? 0, pron: d.pron || '', summary: d.summary || '',
      meaning: meaningOf(d.meanings), lines: (d.meanings || []).map(lineOf),
      notes: d.notes || [], colloc: (d.phrases || []).map(p => p.ja ? `${p.en}「${p.ja}」` : p.en),
      examples: (d.examples || []).map(x => ({ en: x.en, ja: x.ja })),
      related: (d.related || []).map(relOf),
    })),
    related: (e.related || []).map(relOf),
    notes: [], refs: [], page: e.page || null, audio: null,
    img: headImg,
  };
}
function relOf(r) {
  return { mark: '□', text: r.word, rank: r.rank ?? 0, pron: r.pron || '', meaning: `${r.pos ? `〔${r.pos}〕` : ''}${r.meaning || ''}${r.ref ? ` →p.${r.ref}` : ''}` };
}

/**
 * 教材 JSON を { material, cards, passages, images } に変換する。
 * material: { id, title, kind, decks:[{id,title,count}], cardCount }
 */
export function normalize(data) {
  const fmt = detectFormat(data);
  if (!fmt) throw new Error('教材の形式を判定できません（TARGET 1400/1900、速読英熟語、鉄壁の JSON を選んでください）');
  let cards, material, passages = [], images = [];
  if (fmt === 'teppeki') {
    const titles = Object.fromEntries((data.sections || []).map(s => [s.no, s.title]));
    cards = data.entries.map(e => fromTeppeki(e, titles));
    material = { id: 'teppeki', title: data.title || '鉄緑会 東大英単語熟語 鉄壁', kind: 'words', deckLabel: 'SECTION', ranked: true, deckTitles: titles };
    images = Object.entries(data.images || {}).map(([id, src]) => ({ id, src }));
  } else if (fmt === 'tg1400' || fmt === 'tg1900') {
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
    if (!d || d.no !== c.deckNo) {
      const t = material.deckTitles?.[c.deckNo];
      d = { id: `${material.id}:${c.deckNo}`, no: c.deckNo, title: t ? `${c.deck}　${t}` : c.deck, count: 0 }; decks.push(d);
    }
    d.count += 1;
  }
  delete material.deckTitles;
  material.decks = decks;
  material.cardCount = cards.length;
  material.passageCount = passages.length;
  material.imageCount = images.length;
  return { material, cards, passages, images };
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
