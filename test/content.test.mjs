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
assert.equal(detectFormat({}), null);
console.log('content tests passed');
