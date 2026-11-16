// 指定地點拍一張追車畫面(例:檢查某段標線)。
// 用法:node tools/shots/spot-shot.mjs <輸出 jpg> <x> <z> <heading 度> [往右偏移公尺,預設 0] [鏡頭編號,預設 0] [網址參數,例 ?night=1]
// 開發伺服器用 5178 埠(5175、5176 是其他專案的)。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [outArg, xs, zs, hs, rs = '0', cs = '0', query = ''] = process.argv.slice(2);
const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
const h = (Number(hs) * Math.PI) / 180;
const right = Number(rs);
// 車頭 f = (sin h, -cos h),右方 = (-fz, fx)
const x = Number(xs) + Math.cos(h) * right;
const z = Number(zs) + Math.sin(h) * right;
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1600,1080'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
try {
  await page.goto('http://localhost:5178/' + query);
  await page.waitForFunction(() => window.__game && document.getElementById('status')?.textContent === '按任意鍵開始', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.start());
  await page.evaluate(([x, z, hd, c]) => { window.__game.teleport(x, z, hd); window.__game.setCamera(c); }, [x, z, Number(hs), Number(cs)]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out, quality: 88 });
  console.log('已拍', out);
} finally {
  await browser.close();
  await server.close();
}
