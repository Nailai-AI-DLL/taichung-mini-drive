// 車流與大地圖截圖(decisions/0037):找一台公車與一台計程車各拍一張近照,再開大地圖拍一張。
// 用法:node tools/shots/traffic-shots.mjs <輸出資料夾> [網址參數,例 &night=1]   (開發伺服器用 5178 埠)
// 有網址參數時檔名加 night- 前綴,每台車多拍一張車尾(看尾燈,decisions/0047)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2];
const extra = process.argv[3] ?? '';
const pre = extra ? 'night-' : '';
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1300,900'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto('http://localhost:5178/?mode=free' + extra);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.start(); window.__game.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false }); });
  for (const want of [{ kind: 'bus' }, { kind: 'car', color: 2 }]) {
    let c = null;
    for (let i = 0; i < 40 && !c; i++) {
      await page.waitForTimeout(500);
      c = await page.evaluate((w) => window.__game.trafficCars().find((c) => c.kind === w.kind && (w.color === undefined || c.color === w.color)), want);
    }
    if (!c) { console.log('沒找到', JSON.stringify(want)); continue; }
    // 從車子右前方斜上看過去,停住畫面(暫停車流:開大地圖再關會恢復,所以用 inspect 直接看)
    const d = want.kind === 'bus' ? 16 : 8;
    const hx = Math.cos(c.heading), hz = Math.sin(c.heading);
    const v = { x: c.x + hx * d - hz * d * 0.7, y: want.kind === 'bus' ? 7 : 4, z: c.z + hz * d + hx * d * 0.7, lx: c.x, lz: c.z };
    await page.evaluate((v) => window.__game.inspect(v), v);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(out, `${pre}traffic-${want.kind === 'bus' ? 'bus' : 'taxi'}.jpg`), quality: 85 });
    if (extra) {
      // 車尾(尾燈)
      const r = { x: c.x - hx * d * 1.3 + hz * d * 0.5, y: want.kind === 'bus' ? 6 : 3.5, z: c.z - hz * d * 1.3 - hx * d * 0.5, lx: c.x, lz: c.z };
      await page.evaluate((v) => window.__game.inspect(v), r);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(out, `${pre}traffic-${want.kind === 'bus' ? 'bus' : 'taxi'}-rear.jpg`), quality: 85 });
    }
    await page.evaluate(() => window.__game.inspect(null));
  }
  if (!extra) {
    await page.evaluate(() => window.__game.setBigMap(true));
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, 'bigmap.jpg'), quality: 85 });
  }
} finally { await browser.close(); await server.close(); }
