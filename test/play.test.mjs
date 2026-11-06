// 連続再生の確かめ（mock）。読み上げは偽物に差し替えて、話した順番と間を記録する。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const S = '/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept('勝也'));
await p.addInitScript(() => {
  window.__said = []; window.__wake = 0;
  class U { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; } }
  window.SpeechSynthesisUtterance = U;
  const synth = { speaking: false, _cur: null,
    getVoices: () => [{ lang: 'en-US', name: 'Samantha', localService: true }, { lang: 'ja-JP', name: 'Kyoko', localService: true }],
    addEventListener() {}, resume() {},
    speak(u) { window.__said.push({ t: Date.now(), lang: u.lang, text: u.text, rate: u.rate }); this._cur = setTimeout(() => u.onend && u.onend(), 120); },
    cancel() { clearTimeout(this._cur); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake++; const l = { released: false, addEventListener() {}, release: async () => { l.released = true; } }; return l; } }, configurable: true });
});
const B = 'http://localhost:8765/index.html?mock=1';
const shot = async (n, full = false) => { await p.waitForTimeout(250); await p.screenshot({ path: `${S}/play_${n}.png`, fullPage: full }); };
await p.goto(B); await p.evaluate(() => localStorage.clear()); await p.goto(B); await p.waitForTimeout(500);
await p.click('text=Google でログイン'); await p.waitForTimeout(300); await p.click('text=学習者を追加'); await p.waitForTimeout(500);
await p.goto(B + '#/admin'); await p.waitForTimeout(300);
await p.setInputFiles('input[type=file]', `${S}/tp/ui_S42-50.json`); await p.waitForTimeout(1200);
await p.click('text=登録する'); await p.waitForTimeout(2500);
await p.setInputFiles('input[type=file]', `${S}/t1900/tg1900_all_0001-1900.json`); await p.waitForTimeout(1200);
await p.click('text=登録する'); await p.waitForTimeout(2500);
await p.evaluate(() => window.store.setStatus('tg1900', 'active')); await p.waitForTimeout(300);

// 教材ページの入口
await p.goto(B + '#/m/tg1900'); await p.waitForTimeout(600);
const opts = await p.$$eval('select[aria-label="流す範囲"] option', os => os.map(o => o.textContent));
console.log('scopes', opts.length, opts.slice(0, 3));
await shot('1_material', true);

// 再生画面: Section 1、間は 2 秒に
await p.evaluate(() => localStorage.setItem('ed-play-opts', JSON.stringify({ pause: 2 })));
await p.selectOption('select[aria-label="流す範囲"]', 'deck:1');
await p.click('text=再生画面へ'); await p.waitForTimeout(500);
assert.match(p.url(), /#\/play\/tg1900\/deck\/1$/);
await shot('2_idle');
await p.click('button[aria-label="再生"]');
await p.waitForTimeout(300); await shot('3_ja');
await p.waitForTimeout(800); await shot('4_pause');
await p.waitForTimeout(6000);
let said = await p.evaluate(() => window.__said);
console.log(said.map(s => `${s.lang} ${s.text}`).slice(0, 5));
assert.equal(said[0].lang, 'ja-JP'); assert.equal(said[1].lang, 'en-US');
assert.equal(said[0].text, '技術の変化は新たな生活様式を創り出す。'); assert.equal(said[1].text, 'Technological change will create new ways of living.');
const gap = said[1].t - said[0].t; console.log('ja→en ms', gap); assert.ok(gap >= 2000 && gap < 2600, '間は 2 秒（＋日本語の長さ）');
assert.equal(said[2].lang, 'ja-JP');
assert.ok(await p.evaluate(() => window.__wake) >= 1, '画面を消さない設定をかける');
// 一時停止 → 読み上げが止まる
await p.click('button[aria-label="一時停止"]'); const n1 = (await p.evaluate(() => window.__said)).length;
await p.waitForTimeout(3000); assert.equal((await p.evaluate(() => window.__said)).length, n1, '止めたら話さない');
await shot('5_paused');
const pos = await p.textContent('.player .count'); console.log('pos', pos);
// 次へ → 番号が進む
await p.click('button[aria-label="次へ"]'); const pos2 = await p.textContent('.player .count'); console.log('next', pos2);
// 画面を離れて戻ると続きから
await p.goto(B + '#/m/tg1900'); await p.waitForTimeout(300);
await p.goto(B + '#/play/tg1900/deck/1'); await p.waitForTimeout(400);
assert.equal(await p.textContent('.player .count'), pos2, '続きから');
// 語の形にする
await p.selectOption('#pl-流すもの', 'word'); await p.waitForTimeout(200);
await p.evaluate(() => { window.__said = []; });
await p.click('button[aria-label="再生"]'); await p.waitForTimeout(3600);
said = await p.evaluate(() => window.__said); console.log('word mode', said.slice(0, 2).map(s => s.text));
assert.equal(said[1].lang, 'en-US'); assert.ok(!said[1].text.includes(' '), '語');
await p.click('button[aria-label="一時停止"]');
// 英語 → 日本語（語）。英語は 2 回くり返す
await p.selectOption('#pl-向き', 'en-ja'); await p.selectOption('#pl-英語', '2'); await p.waitForTimeout(200);
await p.evaluate(() => { window.__said = []; });
await p.click('button[aria-label="再生"]'); await p.waitForTimeout(4200); await shot('5b_enja_word');
said = await p.evaluate(() => window.__said); console.log('en-ja word', said.slice(0, 3).map(s => `${s.lang} ${s.text}`));
assert.deepEqual(said.slice(0, 3).map(s => s.lang), ['en-US', 'en-US', 'ja-JP'], '英語 2 回 → 日本語');
assert.equal(await p.textContent('.player .pill'), '英語 → 日本語');
await p.click('button[aria-label="一時停止"]');
// 英語 → 日本語（例文）
await p.selectOption('#pl-流すもの', 'sentence'); await p.selectOption('#pl-英語', '1'); await p.waitForTimeout(200);
await p.evaluate(() => { window.__said = []; });
await p.click('button[aria-label="再生"]'); await p.waitForTimeout(800); await shot('5c_enja_sentence_q');
await p.waitForTimeout(5200);
said = await p.evaluate(() => window.__said); console.log('en-ja sentence', said.slice(0, 2).map(s => `${s.lang} ${s.text}`));
assert.equal(said[0].lang, 'en-US'); assert.ok(said[0].text.includes(' ')); assert.equal(said[1].lang, 'ja-JP');
const gap2 = said[1].t - said[0].t; console.log('en→ja ms', gap2); assert.ok(gap2 >= 2000 && gap2 < 2600);
await p.click('button[aria-label="一時停止"]');
await p.selectOption('#pl-向き', 'ja-en');
// 鉄壁（例文の無い語は語で、句副の熟語も）: 今日学習した語は無い → Section 46
await p.evaluate(() => localStorage.setItem('ed-play-opts', JSON.stringify({ pause: 2, content: 'sentence' })));
await p.goto(B + '#/play/teppeki/deck/46'); await p.waitForTimeout(400);
await p.evaluate(() => { window.__said = []; });
await p.click('button[aria-label="再生"]'); await p.waitForTimeout(3600); await shot('6_teppeki');
said = await p.evaluate(() => window.__said); console.log('teppeki', said.slice(0, 2).map(s => s.text));
await p.click('button[aria-label="一時停止"]');
await p.goto(B + '#/play/teppeki/deck/46'); await p.waitForTimeout(300); await shot('7_settings', true);
// 閉じる → 教材ページへ、読み上げは止まる
await p.click('button[aria-label="連続再生をやめる"]'); await p.waitForTimeout(300);
assert.match(p.url(), /#\/m\/teppeki$/);
console.log('errors', errors); assert.equal(errors.length, 0);
console.log('play tests passed');
await b.close();
