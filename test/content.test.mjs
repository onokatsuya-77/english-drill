import { normalize, chunk, detectFormat } from '../js/content.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const S='/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
for (const [f,exp] of [[`${S}/t1400/tg1400_all_0001-1400.json`,1400],[`${S}/t1900/tg1900_all_0001-1900.json`,1900],[`${S}/sj/sj_lessons01-74.json`,1084]]) {
  const data=JSON.parse(fs.readFileSync(f,'utf8'));
  const { material, cards, passages } = normalize(data);
  assert.equal(cards.length, exp);
  const ch=chunk(cards); const maxBytes=Math.max(...ch.map(c=>Buffer.byteLength(JSON.stringify(c))));
  console.log(material.id, material.title, 'decks', material.decks.length, 'cards', cards.length, 'passages', passages.length, 'chunks', ch.length, 'max chunk KB', (maxBytes/1024).toFixed(0));
  assert.ok(maxBytes < 900*1024);
  assert.ok(cards.every(c=>c.front && c.meaning && c.examples.length));
}
// 鉄壁（試作: SECTION 1〜2）
{
  const data = JSON.parse(fs.readFileSync(`${S}/tp/teppeki_S01-02.json`, 'utf8'));
  assert.equal(detectFormat(data), 'teppeki');
  const { material, cards, images } = normalize(data);
  assert.equal(material.id, 'teppeki'); assert.ok(material.ranked);
  assert.equal(cards.length, 47); assert.equal(material.decks.length, 2);
  assert.equal(material.decks[0].title, 'SECTION 1　重要な・ささいな');
  assert.ok(cards.every(c => c.front && c.meaning && [0, 1, 2].includes(c.rank)));
  const rv = cards.find(c => c.front === 'revive');
  assert.equal(rv.meaning, '生き返らせる；生き返る'); assert.equal(rv.pos, '動'); assert.ok(rv.img && images.some(x => x.id === rv.img));
  assert.equal(rv.derived[0].word, 'revival'); assert.ok(rv.related.some(r => r.text === 'extinct' && r.rank === 2));
  const ch = chunk(images, 40); const maxImg = Math.max(...ch.map(c => Buffer.byteLength(JSON.stringify(c))));
  console.log('teppeki cards', cards.length, 'images', images.length, 'max image chunk KB', (maxImg / 1024).toFixed(0));
  assert.ok(maxImg < 900 * 1024);
}
// 鉄壁（SECTION 1〜12）: 多義語の要約、派生語の挿絵、共有の図、カード 1 枚の大きさ
{
  const data = JSON.parse(fs.readFileSync(`${S}/tp/teppeki_S01-12.json`, 'utf8'));
  const { material, cards, images } = normalize(data);
  assert.equal(cards.length, 435); assert.equal(material.decks.length, 12);
  assert.ok(cards.every(c => c.front && c.meaning && [0, 1, 2].includes(c.rank)));
  const at = cards.find(c => c.front === 'attend');
  assert.equal(at.summary, '①出席 ②注意 to'); assert.equal(at.examples[0].en, "I attended my friend's wedding last week.", '取り消し線の to は外す');
  assert.equal(cards.find(c => c.front === 'company').derived.find(d => d.word === 'accompany').img, 'tp-ill-0434-1');
  assert.ok(['budget', 'purchase', 'debt', 'bankrupt'].every(w => cards.find(c => c.front === w).img), '流れの図を 4 語で共有');
  assert.ok(cards.find(c => c.front === 'aim').lines.some(l => l.startsWith('〔自他〕')));
  assert.ok(cards.filter(c => c.img).every(c => images.some(x => x.id === c.img)));
  const ch = chunk(cards); const maxBytes = Math.max(...ch.map(c => Buffer.byteLength(JSON.stringify(c))));
  const ich = chunk(images, 40); const maxImg = Math.max(...ich.map(c => Buffer.byteLength(JSON.stringify(c))));
  console.log('teppeki S1-12 cards', cards.length, 'images', images.length, 'max card chunk KB', (maxBytes / 1024).toFixed(0), 'max image chunk KB', (maxImg / 1024).toFixed(0));
  assert.ok(maxBytes < 900 * 1024 && maxImg < 900 * 1024);
}
// 鉄壁（全 SECTION 1〜50）: 番号の連続、品詞の対応、絵の共有、要約のかぎかっこ、大きさ
{
  const data = JSON.parse(fs.readFileSync(`${S}/tp/teppeki_S01-50.json`, 'utf8'));
  const { material, cards, images } = normalize(data);
  assert.equal(cards.length, 2176); assert.equal(material.decks.length, 50);
  assert.deepEqual(data.entries.map(e => e.no), Array.from({ length: 2176 }, (_, i) => i + 1));
  assert.ok(cards.every(c => c.front && c.meaning && [0, 1, 2].includes(c.rank)));
  const POS = ['動', '名', '形', '副', '前', '接', '代', '助', '熟語', '接頭'];
  assert.ok(cards.every(c => POS.includes(c.pos)), cards.filter(c => !POS.includes(c.pos)).map(c => c.front + c.pos).join());
  assert.equal(cards.find(c => c.front === 'all the same').pos, '熟語');
  assert.equal(cards.find(c => c.front === 'consider').derived.find(d => d.word === 'considering').pos, '前');
  assert.equal(cards.find(c => c.front === 'company').derived.find(d => d.word === 'accompany').img, 'tp-p174_0');
  assert.ok(['that is (to say)', 'namely', 'in short'].every(w => cards.find(c => c.front === w).img === 'tp-p621_0'));
  assert.equal(cards.find(c => c.front === 'tight').summary, '「タイト・スカート」「タイトなスケジュール」');
  const ids = new Set(images.map(x => x.id));
  assert.ok(cards.every(c => (!c.img || ids.has(c.img)) && c.derived.every(d => !d.img || ids.has(d.img))));
  const ch = chunk(cards); const maxBytes = Math.max(...ch.map(c => Buffer.byteLength(JSON.stringify(c))));
  const ich = chunk(images, 40); const maxImg = Math.max(...ich.map(c => Buffer.byteLength(JSON.stringify(c))));
  console.log('teppeki S1-50 cards', cards.length, 'images', images.length, 'card chunks', ch.length, 'max card chunk KB', (maxBytes / 1024).toFixed(0), 'image chunks', ich.length, 'max image chunk KB', (maxImg / 1024).toFixed(0));
  assert.ok(maxBytes < 900 * 1024 && maxImg < 900 * 1024);
}
assert.equal(detectFormat({}), null);
console.log('content tests passed');
