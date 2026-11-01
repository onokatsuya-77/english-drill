// Store のロジックをモックのデータ層で確かめる（localStorage を簡易実装）
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.EventTarget = class { addEventListener() {} dispatchEvent() {} };
const { backend } = await import('../js/backend-mock.js');
const { Store, masteryOf, BADGES } = await import('../js/model.js');
const { normalize, chunk, parseCSV, ownFromRows } = await import('../js/content.js');
const { Rating, State } = await import('../js/fsrs.js');
import fs from 'node:fs'; import assert from 'node:assert/strict';
const S = '/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';

for (const f of ['sj/sj_lessons01-74.json', 't1900/tg1900_all_0001-1900.json']) {
  const { material, cards, passages } = normalize(JSON.parse(fs.readFileSync(`${S}/${f}`, 'utf8')));
  await backend.saveMaterial(material, chunk(cards), chunk(passages, 10));
}
await backend.signIn();
const store = new Store(backend); await store.start(); await new Promise(r => setTimeout(r, 20));
assert.equal(store.materials.length, 2);
await store.createProfile('テスト');
assert.ok(store.profile);
assert.equal(store.cards.get('sj').length, 1084);
assert.equal(store.cards.get('tg1900').length, 1900);

// 教材ごとの今日の学習
let q = store.buildQueue('tg1900', 'today');
assert.equal(q.length, 10); assert.equal(q[0].id, 'tg1900-0001');
const now = Date.now();
for (const c of q) await store.review(c, Rating.Good, 3000, { mode: 'card' }, now);
assert.equal(store.today().newCards, 10); assert.equal(store.today().reviews, 10);
assert.equal(store.todayFor('tg1900').newCards, 10);
assert.equal(store.todayFor('sj').newCards, 0, '速読はまだ');
assert.equal(store.counts('tg1900', now).newLeft, 0);
assert.equal(store.counts('sj', now).newLeft, 10, '新規の枠は教材ごと');
q = store.buildQueue('tg1900', 'today', null, now + 11 * 60000);
assert.equal(q.length, 10, '10分後に学習中のカードが出る');
for (const [i, c] of q.entries()) await store.review(c, i < 2 ? Rating.Again : Rating.Good, 2000, {}, now + 11 * 60000);

// 覚え具合
let mm = store.mastery('tg1900');
assert.equal(mm.studied, 10); assert.equal(mm.new, 1890);
assert.equal(mm.shaky, 2, 'もう一度を押した 2 枚はあやしい');
assert.equal(mm.known, 8);
assert.ok(Math.abs(mm.accuracy - 18 / 20) < 1e-9, '正解率 18/20');
assert.equal(store.buildQueue('tg1900', 'shaky').length, 2);
assert.equal(masteryOf({ state: State.Review, scheduledDays: 30, recent: '1111111111' }), 'solid');
assert.equal(masteryOf({ state: State.Review, scheduledDays: 30, recent: '1111111110' }), 'shaky');
assert.equal(masteryOf({ state: State.Review, scheduledDays: 30, recent: '1101101111' }), 'known', '80% は覚えた');
assert.equal(masteryOf({ state: State.Review, scheduledDays: 5, recent: '1111' }), 'known');
assert.equal(masteryOf({ state: State.Review, scheduledDays: 5, recent: '1010101' }), 'shaky', '57% はあやしい');

// Section の練習
const dq = store.buildQueue('tg1900', 'deck', 2);
assert.equal(dq.length, 20); assert.ok(dq.every(c => c.deckNo === 2));
// 追加の新しい語
assert.equal(store.buildQueue('tg1900', 'extra', 10)[0].id, 'tg1900-0011');

// 連続日数・バッジ
assert.equal(store.streak(), 1);
const fresh = await store.checkBadges();
assert.deepEqual(fresh.map(b => b.id), ['first']);
assert.deepEqual((await store.checkBadges()).map(b => b.id), [], '同じバッジは 2 度出ない');
assert.equal(BADGES.length, 12);
assert.equal(store.badgeStatus().filter(b => b.earned).length, 1);

// 教材ごとの設定
await store.saveMatSettings('tg1900', { newPerDay: 20 });
assert.equal(store.counts('tg1900', now + 20 * 60000).newLeft, 10, '20語にしたので残り10');
assert.equal(store.goals().newWords, 30);

// 長文
const pass = await store.loadPassages('sj'); assert.equal(pass.length, 74);

// 自分の教材（CSV）
const rows = parseCSV('﻿英語,意味,例文,例文の訳\r\nefficient,効率的な,"It is efficient, really.",効率がいい\r\npump,ポンプ,,\r\n');
assert.equal(rows.length, 3); assert.equal(rows[1][2], 'It is efficient, really.');
const own = ownFromRows(rows, { title: 'プラント', owner: store.profile.id });
assert.equal(own.cards.length, 2); assert.equal(own.cards[0].examples[0].ja, '効率がいい'); assert.equal(own.cards[1].examples.length, 0);
await backend.saveOwnMaterial(store.user.uid, own.material, chunk(own.cards));
await store.refreshMaterials();
assert.ok(store.material(own.material.id)?.own);
assert.ok(store.matSettings(own.material.id).enabled, '作った学習者には最初から表示');
assert.equal(store.cards.get(own.material.id).length, 2);
const noHead = ownFromRows([['dog', '犬'], ['cat', '猫']], { title: 'x', owner: 'p' });
assert.equal(noHead.cards.length, 2, '見出しが無くても 英語・意味 の順で読める');

// 重要度での絞り込み（鉄壁）
{
  const tp = normalize(JSON.parse(fs.readFileSync(`${S}/tp/teppeki_S01-02.json`, 'utf8')));
  await backend.saveMaterial(tp.material, chunk(tp.cards), [], null, chunk(tp.images, 40));
  await store.refreshMaterials(); await store.imagesLoaded();
  assert.ok(store.images.size >= 20, '挿絵が読み込まれる');
  await store.saveMatSettings('teppeki', { newPerDay: 50 });
  const all = store.newCandidates('teppeki', 50).length;
  await store.saveMatSettings('teppeki', { minRank: 2 });
  const top = store.newCandidates('teppeki', 50);
  assert.ok(top.length < all && top.every(c => c.rank === 2), '最重要だけ');
  await store.saveMatSettings('teppeki', { minRank: 1 });
  assert.ok(store.newCandidates('teppeki', 50).every(c => c.rank >= 1));
  console.log('teppeki new words: all', all, 'rank2', top.length);
}

console.log('model tests passed', store.totals());

// 2 回目の起動: 端末の控え（教材の一覧・学習者）ですぐ開き、サーバーの最新は後ろで取り直す
{
  store.saveBoot();
  const s2 = new Store(backend); await s2.start();
  for (let i = 0; i < 200 && !s2.ready; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(s2.bootTiming.listsFrom, '端末');
  assert.ok(s2.profile && s2.profile.id === store.profile.id, '前回の学習者で開く');
  assert.equal(s2.materials.length, store.materials.length);
  assert.equal(s2.cards.get('tg1900')?.length, 1900); assert.ok(s2.states.size > 0, '学習記録');
  assert.ok(s2.bootTiming.done >= s2.bootTiming.auth);
  console.log('second start: lists from', s2.bootTiming.listsFrom, 'ms', s2.bootTiming.done - s2.bootTiming.auth);
}
