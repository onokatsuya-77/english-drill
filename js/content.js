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
