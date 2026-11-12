// 車子外觀截圖(decisions/0016 §12):出生點停著的車,從 6 個角度近拍 + 遊戲追車視角。
// 用法:node tools/shots/car-shots.mjs <輸出資料夾> [網址查詢字串,例 car=glb]
// 用系統的 Google Chrome;開發伺服器用 5178 埠(5175、5176 是其他專案的)。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? join(ROOT, 'docs/art/car-sample'));
const query = process.argv[3] ? `?${process.argv[3]}` : '';
mkdirSync(out, { recursive: true });
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1600,1080'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// 著色器編譯失敗只會出現在 console.error,不算 pageerror;沒抓的話描邊壞掉也看不出來(2026-11-11)
page.on('console', (m) => { if (m.type() === 'error' && /Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().split('\n')[0]); });
try {
  await page.goto(`http://localhost:5178/${query}`);
  await page.waitForFunction(() => window.__game && document.getElementById('status')?.textContent === '按任意鍵開始', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.start());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, 'c00-chase.jpg'), quality: 88 });
  // 第一人稱(decisions/0017):鏡頭第 3 個模式;起步開一小段讓路面有動態,再停下拍
  await page.evaluate(() => window.__game.setCamera(2));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, 'c07-first-person.jpg'), quality: 88 });
  await page.evaluate(() => window.__game.setCamera(0));
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => window.__game.state());
  const h = (s.headingDeg * Math.PI) / 180;
  const f = [Math.sin(h), -Math.cos(h)];
  const r = [-f[1], f[0]];
  // [名稱, 前後距離, 左右距離, 高度]
  const views = [['c01-front34', 4.2, 3.0, 1.5], ['c02-side', 0.2, 5.2, 1.2], ['c03-rear34', -4.2, 3.0, 1.6], ['c04-front', 5.2, 0, 1.1], ['c05-rear', -5.2, 0, 1.3], ['c06-top34', 3.0, -3.2, 4.0]];
  for (const [name, a, b, y] of views) {
    await page.evaluate((v) => window.__game.inspect(v), { x: s.x + f[0] * a + r[0] * b, y, z: s.z + f[1] * a + r[1] * b, lx: s.x, lz: s.z, ly: 0.35 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${name}.jpg`), quality: 88 });
  }
  console.log('已拍', out, errors.length ? `錯誤:${errors.join(' | ')}` : '');
} finally {
  await browser.close();
  await server.close();
  if (errors.length) process.exitCode = 1;
}
