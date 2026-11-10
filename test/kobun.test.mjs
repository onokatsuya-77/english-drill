// 古文単語330: 形式の変換、出題形式（例文問題・4択・読みの読み上げ）、実戦問題の一覧
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { normalize, chunk, chunkBySize, detectFormat } from '../js/content.js';
import { applicableModes, makeQuestion, pickMode, senseExamples, senseGloss } from '../js/quiz.js';
import { modesFor } from '../js/model.js';
const F = process.env.KOBUN_JSON || '/home/claude/kobun/testdata/kobun330_pilot.json';
const data = JSON.parse(fs.readFileSync(F, 'utf8'));
assert.equal(detectFormat(data), 'kobun330');
const { material, cards, images, extras } = normalize(data);
assert.equal(material.id, 'kobun330'); assert.equal(material.kind, 'kobun'); assert.ok(material.ranked && material.rankKind === 'stars');
assert.ok(cards.length >= 11);
const words = cards.filter(c => !c.extra);
assert.ok(words.every(c => c.kobun && c.front && c.meaning && c.reading && c.pos && [0, 1, 2, 3].includes(c.rank)));
assert.ok(words.every(c => c.lines.length === c.senses.length && c.examples.every(x => x.en && x.ja)));
const on = words.find(c => c.front === 'おぼゆ');
assert.equal(on.kanji, '覚ゆ'); assert.equal(on.conj, 'ヤ行下二段'); assert.equal(on.senses.length, 4); assert.equal(on.meaning.split('；')[1], '似る');
assert.ok(on.img && images.some(x => x.id === on.img));
// 例文問題: 傍線部のある見出し語の例文だけ（関連語の用例は除く）
const nn = words.find(c => c.front === 'ののしる');
assert.equal(nn.examples.length, 3); assert.equal(senseExamples(nn).length, 2, '類 らうがはし の用例は除く');
assert.equal(senseGloss(nn, nn.examples[1]), '評判になる');
assert.deepEqual(applicableModes(nn, cards, { speech: true }), ['card', 'choice', 'sense', 'listen']);
assert.deepEqual(applicableModes(nn, cards, { speech: false }), ['card', 'choice', 'sense'], '読み上げが無ければリスニングは出ない');
let seed = 3; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
for (let i = 0; i < 20; i++) {
  const q = makeQuestion(on, 'sense', cards, {}, rnd);
  assert.equal(q.options.length, 4); assert.equal(q.options.filter(o => o.correct).length, 1);
  assert.ok((q.before + q.target + q.after).includes('おぼえ')); assert.ok(q.options.some(o => o.text === q.answer));
  assert.equal(new Set(q.options.map(o => o.text)).size, 4, '選択肢が重ならない');
}
// 多義語は同じ語のほかの訳語が誤答に入る
const q = makeQuestion(on, 'sense', cards, {}, rnd);
assert.ok(q.options.filter(o => ['思われる', '似る', '思い出される', '（人から）思われる'].includes(o.text)).length >= 3);
// つづり・穴埋めは出ない。ミックスの新しい語はカード以外
for (let i = 0; i < 30; i++) assert.ok(['choice', 'sense', 'listen'].includes(pickMode(nn, 'mix', true, cards, { speech: true }, rnd)));
assert.equal(pickMode(nn, 'spell', false, cards, {}, rnd), 'choice', 'つづりを選んでいても古文は 4 択に');
assert.deepEqual(modesFor('kobun').map(m => m[0]), ['card', 'choice', 'sense', 'listen', 'mix']);
assert.deepEqual(modesFor('words').map(m => m[0]), ['card', 'choice', 'spell', 'cloze', 'listen', 'mix']);
// 実戦問題は extras に
// 実戦問題（数のセット）は古文・訳・傍線部がそろう。付録の演習（「文学史」などの名前のセット）は問題文だけのものもある
const bad = extras.filter(x => !(x.kind === 'drill' && ['choice', 'trans', 'grammar', 'order'].includes(x.type) && (x.ko || x.q) &&
  (typeof x.set === 'string' || (x.ko && x.ja && Array.isArray(x.target) && x.target.length))));
assert.ok(extras.length >= 17 && !bad.length, JSON.stringify(bad.map(x => x.id)));
const inRange = (a, x) => Number.isInteger(a) && a >= 1 && a <= x.options.length;
assert.ok(extras.filter(x => x.type === 'choice' || x.type === 'order').every(x => [].concat(x.answer).every(a => inRange(a, x))));
assert.ok(extras.filter(x => x.type === 'order').every(x => [...x.answer].sort((a, b) => a - b).join() === x.options.map((_, i) => i + 1).join()));
assert.equal(new Set(extras.map(x => x.id)).size, extras.length, '問の id が重ならない');
assert.ok(extras.filter(x => x.type === 'grammar').every(x => x.parts || x.labels || x.answer_text));
const c1 = extras.find(x => x.set === 1 && x.n === 1);
assert.equal(c1.options.length, 5); assert.equal(c1.answer, 2); assert.deepEqual(c1.entry_nos, [2]);
// 付録（慣用表現・敬語・文法・和歌・文学史・古文常識）は一問一答のカードに
const appx = cards.filter(c => c.extra);
if (data.extras?.length) {
  assert.ok(appx.every(c => c.front && c.meaning && c.deckNo >= 100), '付録のカードに見出しと意味がある');
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length, 'カードの id が重ならない');
  assert.ok(appx.filter(c => c.img).every(c => images.some(x => x.id === c.img)), '付録の図がある');
  assert.ok(appx.filter(c => c.img2).every(c => images.some(x => x.id === c.img2)), '2 枚目の図がある');
  console.log('appendix cards', appx.length, 'qa', appx.filter(c => c.question).length, 'with figure', appx.filter(c => c.img).length);
}
const ch = chunk(cards); const maxBytes = Math.max(...ch.map(c => Buffer.byteLength(JSON.stringify(c))));
console.log('kobun330 cards', cards.length, 'words', words.length, 'images', images.length, 'drills', extras.length, 'decks', material.decks.map(d => d.title).join('|'), 'max chunk KB', (maxBytes / 1024).toFixed(0));
assert.ok(maxBytes < 900 * 1024);
const ich = chunkBySize(images); const maxImg = Math.max(...ich.map(c => Buffer.byteLength(JSON.stringify(c))));
console.log('image chunks', ich.length, 'max KB', (maxImg / 1024).toFixed(0)); assert.ok(maxImg < 900 * 1024);
assert.equal(ich.flat().length, images.length);
console.log('kobun tests passed');
