import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const S='/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', async d => { console.log('dialog:', d.type(), d.message()); await d.accept(d.type() === 'prompt' ? '勝也' : undefined); });
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/-home-claude/d0c14157-09da-53dc-bb1a-3f3301bbbdec/scratchpad/ui_${n}.png` });
await page.goto('http://localhost:8765/index.html?mock=1'); await page.waitForTimeout(500); await shot('01_login');
await page.click('text=Google でログイン'); await page.waitForTimeout(400); await shot('02_profiles');
await page.click('text=学習者を追加'); await page.waitForTimeout(500); await shot('03_home_empty');
await page.goto('http://localhost:8765/index.html?mock=1#/admin'); await page.waitForTimeout(300);
for (const f of ['sj/sj_lessons01-74.json','t1400/tg1400_all_0001-1400.json']) {
  await page.setInputFiles('input[type=file]', `${S}/${f}`); await page.waitForTimeout(800);
  await page.click('text=登録する'); await page.waitForTimeout(800);
}
await shot('04_admin');
await page.goto('http://localhost:8765/index.html?mock=1#/'); await page.waitForTimeout(500); await shot('05_home');
await page.click('text=学習を始める'); await page.waitForTimeout(400); await shot('06_study_front');
await page.keyboard.press('Space'); await page.waitForTimeout(300); await shot('07_study_back');
for (let i=0;i<12;i++){ if (!(await page.$('.rate'))) { await page.keyboard.press('Space'); await page.waitForTimeout(100);} await page.keyboard.press(String(1+(i%4))); await page.waitForTimeout(150); }
await shot('08_study_mid');
await page.click('text=終了'); await page.waitForTimeout(300); await shot('09_finish');
await page.goto('http://localhost:8765/index.html?mock=1#/progress'); await page.waitForTimeout(500); await shot('10_progress');
await page.goto('http://localhost:8765/index.html?mock=1#/settings'); await page.waitForTimeout(400); await page.click('summary >> nth=0'); await page.waitForTimeout(200); await shot('11_settings');
await page.goto('http://localhost:8765/index.html?mock=1#/read/sj/1'); await page.waitForTimeout(500); await page.click('text=和訳を表示'); await page.waitForTimeout(200); await shot('12_read');
const state = await page.evaluate(() => ({ today: store.today(), counts: store.queueCounts(), total: store.states.size }));
console.log(JSON.stringify(state));
console.log('errors:', errors);
await browser.close();
