// 介面截圖(decisions/0016 §11):標題畫面、開車中 HUD、暫停選單。
// 用法:node tools/shots/ui-shots.mjs <輸出資料夾> [網址查詢字串,例 hud=a]
// 用系統的 Google Chrome;開發伺服器用 5178 埠(5175、5176 是其他專案的)。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? join(ROOT, 'docs/art/ui-sample'));
const query = process.argv[3] ? `?${process.argv[3]}` : '';
mkdirSync(out, { recursive: true });
const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1600,1080'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
try {
  await page.goto(`http://localhost:5178/${query}`);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === '按任意鍵開始', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, 'u01-title.jpg'), quality: 85 });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(4000);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: join(out, 'u02-hud.jpg'), quality: 85 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, 'u03-pause.jpg'), quality: 85 });
  console.log('已拍', out);
} finally {
  await browser.close();
  await server.close();
}
