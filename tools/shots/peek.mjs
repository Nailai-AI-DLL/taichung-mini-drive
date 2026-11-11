// 單張檢視截圖:從 (x, y, z) 看向 (lx, 0, lz),存成 <輸出檔>。找畫面瑕疵時用。
// 用法:node tools/shots/peek.mjs x y z lx lz <輸出檔>   (世界座標,北 = -z;開發伺服器用 5178 埠)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [x, y, z, lx, lz, out] = process.argv.slice(2);
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1200,900'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
try {
  await page.goto('http://localhost:5178/');
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.evaluate((v) => { window.__game.start(); window.__game.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false }); window.__game.inspect(v); }, { x: +x, y: +y, z: +z, lx: +lx, lz: +lz });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out });
} finally { await browser.close(); await server.close(); }
