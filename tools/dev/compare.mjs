// 並排比較兩張圖(例如實車照片 vs 模型預覽),輸出 PNG。
// 用法:node tools/dev/compare.mjs <左圖> <右圖> <輸出.png> [左標題] [右標題]
// 注意:含車牌等個資的照片,輸出檔請放在 gitignore 的資料夾(例如 mini60/)。
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const [a, b, out, la = '參考', lb = '模型'] = process.argv.slice(2);
const uri = (p) => `data:image/${extname(p) === '.png' ? 'png' : 'jpeg'};base64,${readFileSync(resolve(p)).toString('base64')}`;
const html = `<html><body style="margin:0;background:#eaedee;font-family:sans-serif;display:flex;gap:12px;padding:12px">
<figure style="margin:0"><img src="${uri(a)}" style="height:640px;object-fit:contain"><figcaption>${la}</figcaption></figure>
<figure style="margin:0"><img src="${uri(b)}" style="height:640px;object-fit:contain"><figcaption>${lb}</figcaption></figure></body></html>`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1800, height: 700 } });
await page.setContent(html);
await page.waitForTimeout(300);
const box = await page.evaluate(() => {
  const r = document.body.getBoundingClientRect();
  return { w: Math.ceil(document.body.scrollWidth), h: Math.ceil(r.height) };
});
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: Math.min(box.w, 1800), height: Math.max(box.h, 690) } });
await browser.close();
console.log('已存', out);
