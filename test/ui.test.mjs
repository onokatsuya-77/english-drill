// 画面の通し確認（テストモード）。python3 -m http.server 8765 を起動してから実行する。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const S = '/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
const OUT = `${S}/ui2`;
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/index.html?mock=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
let promptAnswer = '勝也';
page.on('dialog', async d => { await d.accept(d.type() === 'prompt' ? promptAnswer : undefined); });
const shot = async (n, full = false) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const goto = async h => { await page.goto(`${BASE}#/${h}`); await page.waitForTimeout(500); };

await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(BASE); await page.waitForTimeout(600);
await shot('01_login');
await page.click('text=Google でログイン'); await page.waitForTimeout(400);
await shot('02_profiles');
await page.click('text=学習者を追加'); await page.waitForTimeout(600);
await goto('admin');
for (const f of ['t1900/tg1900_all_0001-1900.json', 'sj/sj_lessons01-74.json', 't1400/tg1400_all_0001-1400.json']) {
  await page.setInputFiles('input[type=file]', `${S}/${f}`); await page.waitForTimeout(900);
  await page.click('text=登録する'); await page.waitForTimeout(900);
}
await shot('03_admin', true);
await goto('add'); await shot('04_add', true);
await goto(''); await shot('05_home', true);
await goto('m/tg1900'); await shot('06_material_empty', true);

// 今日の学習（カード）
await goto('study/tg1900/today'); await shot('07_card_front');
await page.keyboard.press('Space'); await shot('08_card_back');
let n = 0;
while (n < 120 && !(await page.$('.result'))) {
  if (await page.$('.rate')) await page.keyboard.press(String(n % 7 === 0 ? 1 : 3));
  else if (await page.$('.feedback')) await page.keyboard.press('Enter');
  else if (await page.$('#spell') && !(await page.$eval('#spell', e => e.readOnly))) { await page.fill('#spell', 'x'); await page.keyboard.press('Enter'); }
  else if (await page.$('.opt:not([disabled])')) await page.click('.opt:not([disabled]) >> nth=0');
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(80); n++;
}
console.log('card steps', n);
await shot('09_result', true);

// 4択・つづり・穴埋め・リスニング（Section 1 の練習）
for (const mode of ['choice', 'spell', 'cloze', 'listen', 'mix']) {
  await page.evaluate(m => window.store.saveMatSettings('tg1900', { mode: m }), mode); await page.waitForTimeout(200);
  await goto(''); await goto('study/tg1900/deck/1');
  await shot(`10_${mode}_q`);
  if (mode === 'spell') {
    await page.fill('#spell', 'wrongword'); await page.keyboard.press('Enter');
  } else if (await page.$('.opt')) {
    await page.click('.opt >> nth=1');
  } else {
    if (await page.$('.rate')) await page.keyboard.press('3'); else await page.keyboard.press('Space');
  }
  await shot(`11_${mode}_a`);
}
await page.evaluate(() => window.store.saveMatSettings('tg1900', { mode: 'card' }));

await goto('m/tg1900'); await shot('12_material', true);
await goto('progress'); await shot('13_progress', true);
await goto('settings'); await shot('14_settings', true);
await goto('read/sj/1'); await page.waitForTimeout(400); await shot('15_read', true);

// 自分の教材（1語ずつ）
await goto('add');
await page.click('text=1語ずつ入力する'); await page.waitForTimeout(200);
await page.fill('#f-front', 'pressure vessel'); await page.fill('#f-meaning', '圧力容器'); await page.fill('#f-ex', 'The pressure vessel passed the inspection.');
await page.click('button:has-text("足す")'); await page.waitForTimeout(700);
await shot('16_add_own', true);
const own = await page.evaluate(() => window.store.materials.filter(m => m.own).map(m => [m.title, m.cardCount]));
console.log('own materials', JSON.stringify(own));
await goto(''); await shot('17_home_after', true);

// ×で閉じたら「おつかれさま」を出さずに教材ページへ
await goto(''); await goto('study/tg1900/deck/3');
for (let i = 0; i < 2; i++) {
  if (await page.$('.rate')) await page.keyboard.press('3');
  else if (await page.$('#spell')) { await page.fill('#spell', 'x'); await page.keyboard.press('Enter'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); }
  else if (await page.$('.opt')) { await page.click('.opt >> nth=0'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); }
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(100); await page.keyboard.press('3'); }
  await page.waitForTimeout(150);
}
await page.click('[aria-label="学習をやめる"]'); await page.waitForTimeout(500);
console.log('close →', await page.evaluate(() => location.hash), '| result:', !!(await page.$('.result')), '| toast:', await page.textContent('#toast').catch(() => ''));

// 横幅の広い画面
await page.setViewportSize({ width: 1200, height: 900 });
await goto(''); await shot('18_desktop');

const state = await page.evaluate(() => ({ today: window.store.today(), mastery: window.store.mastery('tg1900'), badges: window.store.profile.badges }));
console.log(JSON.stringify({ reviews: state.today.reviews, newCards: state.today.newCards, studied: state.mastery.studied, shaky: state.mastery.shaky, known: state.mastery.known, badges: state.badges.map(b => b.id) }));
console.log('errors:', errors);
await browser.close();
