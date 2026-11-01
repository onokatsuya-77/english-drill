import { schedule, emptyCard, Rating, State, preview, formatInterval, retrievability } from '../js/fsrs.js';
import assert from 'node:assert/strict';

const DAY = 86400000;
let now = Date.parse('2026-11-01T09:00:00+09:00');

// 新規カードを Good で 2 回 → review に入る
let c = emptyCard(now);
let r = schedule(c, Rating.Good, now); c = r.card;
assert.equal(c.state, State.Learning); assert.equal(c.due - now, 10 * 60000);
now += 10 * 60000;
r = schedule(c, Rating.Good, now); c = r.card;
assert.equal(c.state, State.Review); assert.ok(c.scheduledDays >= 1, 'review interval ≥ 1 day');
console.log('after 2 good:', c.scheduledDays, 'days, S=', c.stability.toFixed(2), 'D=', c.difficulty.toFixed(2));

// 間隔は Hard < Good < Easy
now = c.due;
const p = preview(c, now);
assert.ok(p[2] <= p[3] && p[3] < p[4], 'hard<=good<easy');
console.log('preview:', [1, 2, 3, 4].map(g => formatInterval(p[g])).join(' / '));

// 復習を Good で繰り返すと間隔が伸びる
let prev = 0;
for (let i = 0; i < 8; i++) { now = c.due; c = schedule(c, Rating.Good, now).card; assert.ok(c.scheduledDays >= prev, 'growing'); prev = c.scheduledDays; }
console.log('after 8 reviews:', prev, 'days');
assert.ok(prev > 30 && prev < 36500);

// Again で relearning、lapses が増え、安定性が下がる
const sBefore = c.stability; now = c.due;
c = schedule(c, Rating.Again, now).card;
assert.equal(c.state, State.Relearning); assert.equal(c.lapses, 1); assert.ok(c.stability < sBefore);
now += 5 * 60000; c = schedule(c, Rating.Good, now).card; assert.equal(c.state, State.Review);

// 新規 Easy は直接 review
const e = schedule(emptyCard(now), Rating.Easy, now).card; assert.equal(e.state, State.Review); assert.ok(e.scheduledDays >= 1);

// retrievability
assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.01);
assert.equal(formatInterval(3 * DAY), '3日');
console.log('fsrs tests passed');
