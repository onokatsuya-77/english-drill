// 出題形式（カード／4択／つづり／穴埋め／リスニング）の問題づくりと採点。
import { Rating } from './fsrs.js';

const POSSESSIVE = /^(one's|oneself|someone|somebody|something|A|B|～|~|do|doing|to)$/i;

/** 出題用の意味: (⇔exclude)(≒help)(=...) のような答えのヒントになる注記を外す */
export function cleanMeaning(m) {
  return (m || '').replace(/[（(]\s*(?:⇔|≒|＝|=|→|cf\.)[^）)]*[）)]/g, '').replace(/\s{2,}/g, ' ').replace(/[，,；;]\s*$/, '').trim();
}

/** 英語らしい 1 語（つづり入力に使える） */
export const isSingleWord = s => /^[A-Za-z][A-Za-z'-]*$/.test((s || '').trim());

/** 熟語から穴埋めにする中心の語（いちばん長い語）を選ぶ */
export function keyWordOf(front) {
  const words = (front || '').replace(/\([^)]*\)|\[[^\]]*\]|〔[^〕]*〕/g, ' ').split(/[\s/]+/)
    .map(w => w.replace(/[^A-Za-z'-]/g, '')).filter(w => w && !POSSESSIVE.test(w));
  if (!words.length) return null;
  return words.slice().sort((a, b) => b.length - a.length)[0];
}

/** 例文の中から見出し語（変化形を含む）を探す。{ex, index, token, base} */
export function findInExamples(card) {
  const base = isSingleWord(card.front) ? card.front.trim() : keyWordOf(card.front);
  if (!base || base.length < 2) return null;
  const lower = base.toLowerCase();
  const stems = [lower];
  if (lower.length > 3 && /e$/.test(lower)) stems.push(lower.slice(0, -1));
  if (lower.length > 3 && /[^aeiou]y$/.test(lower)) stems.push(lower.slice(0, -1));
  for (const ex of card.examples || []) {
    const re = /[A-Za-z][A-Za-z'-]*/g; let m;
    while ((m = re.exec(ex.en))) {
      const tok = m[0], t = tok.toLowerCase().replace(/'s$/, "'s");
      if (t === lower || stems.some(s => t.startsWith(s) && t.length - s.length <= 4 && /^(s|es|d|ed|ing|ied|ies|er|est|ly)?$/.test(t.slice(s.length)))) {
        return { ex, index: m.index, token: tok, base };
      }
    }
  }
  return null;
}

/** token が base からどう変化したか（suffix と、末尾 e/y を落としたか） */
function inflection(base, token) {
  const b = base.toLowerCase(), t = token.toLowerCase();
  if (t === b) return { suffix: '' };
  if (t.startsWith(b)) {
    let suffix = t.slice(b.length);
    if (/e$/.test(b) && suffix === 'd') suffix = 'ed';
    return { suffix };
  }
  if (/e$/.test(b) && t.startsWith(b.slice(0, -1))) return { suffix: t.slice(b.length - 1) };
  if (/y$/.test(b) && t.startsWith(b.slice(0, -1))) return { suffix: t.slice(b.length - 1) };
  return { suffix: '' };
}
/** 別の語に同じ変化をつける（compare→compared と同じ形に establish→established） */
export function inflect(word, base, token) {
  const { suffix } = inflection(base, token);
  let w = word;
  if (suffix) {
    let s = suffix;
    if (/^ie[sd]$/.test(s)) s = s.slice(1);           // studied → (y→i)ed
    if (/^[ei]/.test(s) && /e$/.test(w)) w = w.slice(0, -1);
    if (/^e[sd]$|^es$|^ed$|^er$|^est$/.test(s) && /[^aeiou]y$/.test(w)) w = w.slice(0, -1) + 'i';
    if (s === 's' && /(s|x|z|ch|sh)$/.test(w)) s = 'es';
    if (s === 's' && /[^aeiou]y$/.test(w)) { w = w.slice(0, -1) + 'ie'; }
    w += s;
  }
  if (/^[A-Z]/.test(token)) w = w[0].toUpperCase() + w.slice(1);
  return w;
}

function shuffle(a, rnd = Math.random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** 4択の誤答候補（同じ品詞を優先、意味や語が重ならないもの） */
function distractors(card, pool, key, n = 3, rnd = Math.random) {
  const val = key(card);
  const others = pool.filter(c => c.id !== card.id && key(c) && key(c) !== val);
  const same = shuffle(others.filter(c => c.pos && c.pos === card.pos), rnd);
  const rest = shuffle(others.filter(c => !(c.pos && c.pos === card.pos)), rnd);
  const out = []; const seen = new Set([val]);
  for (const c of [...same, ...rest]) { const v = key(c); if (seen.has(v)) continue; seen.add(v); out.push(c); if (out.length >= n) break; }
  return out;
}

/** このカードで使える出題形式 */
export function applicableModes(card, pool, { speech = false } = {}) {
  const modes = ['card'];
  const withMeaning = pool.filter(c => c.meaning).length;
  if (card.meaning && withMeaning >= 4) modes.push('choice');
  if (isSingleWord(card.front) && card.front.length <= 24) modes.push('spell');
  if (pool.length >= 4 && findInExamples(card)) modes.push('cloze');
  if (speech && card.meaning && withMeaning >= 4 && /[A-Za-z]/.test(card.front)) modes.push('listen');
  return modes;
}

/** 実際に出す形式を決める（新しい語は必ずカードで覚える） */
export function pickMode(card, wanted, isNew, pool, opts = {}, rnd = Math.random) {
  if (isNew) return 'card';
  const ok = applicableModes(card, pool, opts);
  if (wanted === 'mix') return ok[Math.floor(rnd() * ok.length)];
  if (ok.includes(wanted)) return wanted;
  if (wanted !== 'card' && ok.includes('choice')) return 'choice';
  return 'card';
}

/** 問題をつくる */
export function makeQuestion(card, mode, pool, { direction = 'en-ja' } = {}, rnd = Math.random) {
  if (mode === 'choice' || mode === 'listen') {
    const jaEn = mode === 'choice' && direction === 'ja-en';
    const key = jaEn ? (c => c.front) : (c => cleanMeaning(c.meaning));
    const opts = shuffle([card, ...distractors(card, pool, key, 3, rnd)], rnd);
    return { mode, card, prompt: jaEn ? cleanMeaning(card.meaning) : card.front, jaEn, options: opts.map(c => ({ text: key(c), correct: c.id === card.id })) };
  }
  if (mode === 'cloze') {
    const hit = findInExamples(card);
    const base = hit.base;
    const others = distractors(card, pool, c => (isSingleWord(c.front) ? c.front : keyWordOf(c.front)) || '', 3, rnd)
      .map(c => inflect(isSingleWord(c.front) ? c.front.trim() : keyWordOf(c.front), base, hit.token));
    const words = shuffle([hit.token, ...others.filter(w => w.toLowerCase() !== hit.token.toLowerCase())], rnd).slice(0, 4);
    return {
      mode, card,
      before: hit.ex.en.slice(0, hit.index), after: hit.ex.en.slice(hit.index + hit.token.length), ja: hit.ex.ja,
      answer: hit.token,
      options: words.map(w => ({ text: w, correct: w === hit.token })),
    };
  }
  if (mode === 'spell') {
    const hit = findInExamples(card);
    return {
      mode, card, answer: card.front.trim(),
      before: hit ? hit.ex.en.slice(0, hit.index) : null, after: hit ? hit.ex.en.slice(hit.index + hit.token.length) : null,
      token: hit ? hit.token : null, ja: hit ? hit.ex.ja : null,
    };
  }
  return { mode: 'card', card };
}

/** つづりの答え合わせ（大文字小文字・前後の空白・’ は区別しない） */
export function checkSpelling(input, answer) {
  const norm = s => (s || '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  return norm(input) === norm(answer);
}

/** 自動採点の評価: 正解=普通、ヒントを使った正解=難しい、不正解=もう一度 */
export function autoRating(correct, usedHint = false) {
  if (!correct) return Rating.Again;
  return usedHint ? Rating.Hard : Rating.Good;
}
