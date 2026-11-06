// 今日の分が終わったあとに、さらに新しい語・復習の先取りへ進めるか（mock）
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const S = '/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept('勝也'));
const B = 'http://localhost:8765/index.html?mock=1';
const shot = async (n, full = false) => { await p.waitForTimeout(250); await p.screenshot({ path: `${S}/more_${n}.png`, fullPage: full }); };
await p.goto(B); await p.evaluate(() => localStorage.clear()); await p.goto(B); await p.waitForTimeout(500);
await p.click('text=Google でログイン'); await p.waitForTimeout(300); await p.click('text=学習者を追加'); await p.waitForTimeout(500);
await p.goto(B + '#/admin'); await p.waitForTimeout(300);
await p.setInputFiles('input[type=file]', `${S}/t1900/tg1900_all_0001-1900.json`); await p.waitForTimeout(1200);
await p.click('text=登録する'); await p.waitForTimeout(2500);
await p.evaluate(async () => { await window.store.setStatus('tg1900', 'active'); await window.store.saveMatSettings('tg1900', { wordsPerDay: 10, newPerDay: 5, mode: 'card', newStyle: 'card' }); });
await p.waitForTimeout(300);

// カードで全部「簡単」にして、今日の分を終える
const runAll = async route => {
  await p.goto(B + '#/'); await p.goto(B + route); await p.waitForTimeout(500);
  for (let i = 0; i < 80; i++) {
    if (!(await p.$('.word'))) break;
    await p.keyboard.press('Space'); await p.waitForTimeout(60); await p.keyboard.press('4'); await p.waitForTimeout(90);
  }
  await p.waitForTimeout(500);
};
await runAll('#/study/tg1900/today');
await shot('1_finish_today');
const btns = async () => p.$$eval('main .btn', as => as.map(a => `${a.textContent}|${a.getAttribute('href') || 'button'}`));
let bs = await btns(); console.log('finish(today)', bs);
assert.ok(bs.some(x => x.startsWith('あと10語、新しく覚える|button')));
// 今日の分のおわりから「あと10語」を押すと、新しい語の学習が始まる
await p.click('text=あと10語、新しく覚える'); await p.waitForTimeout(500);
assert.ok(await p.$('.word'), 'あと10語（今日の分のあと）');
assert.match(p.url(), /extra\/10$/);
for (let i = 0; i < 80 && (await p.$('.word')); i++) { await p.keyboard.press('Space'); await p.waitForTimeout(60); await p.keyboard.press('4'); await p.waitForTimeout(90); }
await p.waitForTimeout(500);
// 「あと10語」のおわり（同じアドレス）からもう一度「あと10語」を押しても始まる（前はここで動かなかった）
await p.click('text=あと10語、新しく覚える'); await p.waitForTimeout(500);
assert.ok(await p.$('.word'), 'あと10語のあとのあと10語');
await shot('1b_extra_again');
for (let i = 0; i < 80 && (await p.$('.word')); i++) { await p.keyboard.press('Space'); await p.waitForTimeout(60); await p.keyboard.press('4'); await p.waitForTimeout(90); }
await p.waitForTimeout(500);
assert.ok(!bs.some(x => x.includes('/ahead/')), '今日はじめて覚えた語は、今日のうちには先取りに出さない');

// 教材ページ: 「今日の分はおわりました」＋ 2 つのボタン
await p.goto(B + '#/m/tg1900'); await p.waitForTimeout(500); await shot('2_material_done');
assert.ok(await p.$('text=今日の分はおわりました'));
bs = await p.$$eval('main a.btn', as => as.map(a => `${a.textContent}|${a.getAttribute('href')}`));
console.log('material', bs.filter(x => /extra|ahead/.test(x)));
assert.ok(bs.some(x => x === '新しい語をあと10語|#/study/tg1900/extra/10'));
const nToday = await p.evaluate(() => window.store.today().newCards);

// さらに新しい語 10 → 終わったら、また進められる
await runAll('#/study/tg1900/extra/10');
bs = await btns(); console.log('finish(extra)', bs);
assert.ok(bs.some(x => x.startsWith('あと10語')), 'もう 10 語進められる');
assert.equal(await p.evaluate(() => window.store.today().newCards), nToday + 10, '新しい語が今日の記録に入る');

// 復習の先取り: 今日もう出した語は除くので、きょう学んだ語は出ない → 先取りは 0
const aheadN = await p.evaluate(() => window.store.buildQueue('tg1900', 'ahead', 20).length);
console.log('ahead queue now', aheadN);
// 明日になった想定（今日出した語を「昨日」にずらす）で先取りを確かめる
await p.evaluate(() => { const s = window.store; for (const [id, st] of s.states) s.states.set(id, { ...st, lastReview: st.lastReview - 86400000 }); s.emit(); });
const q = await p.evaluate(() => window.store.buildQueue('tg1900', 'ahead', 20).map(c => c.id));
console.log('ahead queue (next day)', q.length); assert.equal(q.length, 20);
await p.goto(B + '#/m/tg1900'); await p.waitForTimeout(400);
bs = await p.$$eval('main a.btn', as => as.map(a => `${a.textContent}|${a.getAttribute('href')}`));
console.log('material(next day)', bs.filter(x => /extra|ahead|today/.test(x)));
await p.goto(B + '#/'); await p.goto(B + '#/study/tg1900/ahead/20'); await p.waitForTimeout(500);
await shot('3_ahead');
assert.ok((await p.textContent('.study-head .pill')).includes('先取り'));
console.log('errors', errors); assert.equal(errors.length, 0);
console.log('more tests passed');
await b.close();
