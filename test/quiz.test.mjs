// 出題形式（4択・穴埋め・つづり）の問題づくりを、本物の教材データで確かめる
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { normalize } from '../js/content.js';
import { cleanMeaning, findInExamples, inflect, keyWordOf, applicableModes, makeQuestion, pickMode, checkSpelling, autoRating, isSingleWord } from '../js/quiz.js';
const S = '/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
const tg = normalize(JSON.parse(fs.readFileSync(`${S}/t1900/tg1900_all_0001-1900.json`, 'utf8'))).cards;
const sj = normalize(JSON.parse(fs.readFileSync(`${S}/sj/sj_lessons01-74.json`, 'utf8'))).cards;

// 変化形
assert.equal(inflect('establish', 'compare', 'compared'), 'established');
assert.equal(inflect('reduce', 'compare', 'comparing'), 'reducing');
assert.equal(inflect('apply', 'compare', 'compared'), 'applied');
assert.equal(inflect('reach', 'compare', 'compares'), 'reaches');
assert.equal(inflect('save', 'study', 'studied'), 'saved');
assert.equal(inflect('reduce', 'compare', 'Compare'), 'Reduce');
assert.equal(keyWordOf("at (one's) wit's end"), "wit's");
assert.equal(keyWordOf('at (one\'s) ease'), 'ease');
assert.ok(isSingleWord('compare')); assert.ok(!isSingleWord('at ease'));

// 例文の中に見出し語が見つかる割合
const tgHit = tg.filter(c => findInExamples(c)).length / tg.length;
const sjHit = sj.filter(c => findInExamples(c)).length / sj.length;
console.log('cloze coverage tg1900', (tgHit * 100).toFixed(1) + '%', 'sj', (sjHit * 100).toFixed(1) + '%');
assert.ok(tgHit > 0.85, 'TARGET はほとんどの語で穴埋めが作れる');
assert.ok(sjHit > 0.5);
const cmp = tg.find(c => c.front === 'compare');
const hit = findInExamples(cmp); assert.ok(hit && /compar/i.test(hit.token));

assert.equal(cleanMeaning('を含む(⇔exclúde)'), 'を含む');
assert.equal(cleanMeaning('を援助する，助ける(≒help)'), 'を援助する，助ける');

// 問題づくり（乱数を固定）
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (const c of tg.slice(0, 300)) {
  const modes = applicableModes(c, tg, { speech: true });
  assert.ok(modes.includes('card') && modes.includes('choice'));
  const qc = makeQuestion(c, 'choice', tg, {}, rnd);
  assert.equal(qc.options.length, 4); assert.equal(qc.options.filter(o => o.correct).length, 1);
  assert.equal(new Set(qc.options.map(o => o.text)).size, 4, '選択肢が重ならない');
  if (modes.includes('cloze')) {
    const qz = makeQuestion(c, 'cloze', tg, {}, rnd);
    assert.ok(qz.options.length >= 3 && qz.options.filter(o => o.correct).length === 1, c.front);
    assert.equal(qz.before + qz.answer + qz.after, findInExamples(c).ex.en);
  }
  if (modes.includes('spell')) { const qs = makeQuestion(c, 'spell', tg, {}, rnd); assert.equal(qs.answer, c.front.trim()); }
}
const jaEn = makeQuestion(cmp, 'choice', tg, { direction: 'ja-en' }, rnd);
assert.equal(jaEn.prompt, cmp.meaning); assert.ok(jaEn.options.some(o => o.correct && o.text === 'compare'));
for (const c of sj.slice(0, 200)) { const qz = applicableModes(c, sj).includes('cloze') ? makeQuestion(c, 'cloze', sj, {}, rnd) : null; if (qz) assert.equal(qz.options.filter(o => o.correct).length, 1); }

// 形式の選び方
assert.equal(pickMode(cmp, 'choice', true, tg, {}, Math.random, 'card'), 'card', '設定でカードで覚えてからにできる');
assert.equal(pickMode(cmp, 'choice', true, tg), 'choice', '既定では新しい語も選んだ形式で出す');
assert.equal(pickMode(cmp, 'spell', true, tg, {}, Math.random, 'quiz') !== 'spell', true, '知らない語のつづりは出さない');
for (let i = 0; i < 30; i++) assert.notEqual(pickMode(cmp, 'mix', true, tg, { speech: true }, Math.random, 'quiz'), 'card', 'ミックスでも新しい語をカードにしない');
assert.equal(pickMode(cmp, 'spell', false, tg), 'spell');
assert.equal(pickMode(sj[0], 'spell', false, sj), sj[0].front.includes(' ') ? 'choice' : 'spell', '熟語はつづりの代わりに4択');
assert.equal(pickMode(cmp, 'listen', false, tg, { speech: false }), 'choice', '読み上げが無い端末では4択');

// 採点
assert.ok(checkSpelling(' Compare ', 'compare')); assert.ok(!checkSpelling('compair', 'compare'));
assert.equal(autoRating(true), 3); assert.equal(autoRating(true, true), 2); assert.equal(autoRating(false), 1);
console.log('quiz tests passed');
