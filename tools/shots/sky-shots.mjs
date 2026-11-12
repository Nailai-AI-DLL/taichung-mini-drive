// 遠景(山、雲)樣張(decisions/0019):從指定點、指定高度往東南西北各拍一張(水平略往上看),再拍一張追車畫面。
// 用法:node tools/shots/sky-shots.mjs <輸出資料夾> [x] [z] [高度 m,預設 35] [網址查詢字串]
// 開發伺服器用 5178 埠(5175、5176 是其他專案的)。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [outArg, xs = '0', zs = '0', ys = '35', q = ''] = process.argv.slice(2);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1600,1080'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && /Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().split('\n')[0]); });
try {
  await page.goto(`http://localhost:5178/${q ? '?' + q : ''}`);
  await page.waitForFunction(() => window.__game && document.getElementById('status')?.textContent === '按任意鍵開始', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.start());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, 's0-chase.jpg'), quality: 88 });
  const x = Number(xs), z = Number(zs), y = Number(ys);
  // 方位角 → 世界 (x 東, z 南) = (sin, −cos)
  for (const [name, az] of [['s1-north', 0], ['s2-east', 90], ['s3-south', 180], ['s4-west', 270]]) {
    const a = (az * Math.PI) / 180;
    await page.evaluate((v) => window.__game.inspect(v), { x, y, z, lx: x + Math.sin(a) * 1000, ly: y + 30, lz: z - Math.cos(a) * 1000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${name}.jpg`), quality: 88 });
  }
  console.log('已拍', out, errors.length ? `錯誤:${errors.join(' | ')}` : '');
} finally {
  await browser.close();
  await server.close();
  if (errors.length) process.exitCode = 1;
}
