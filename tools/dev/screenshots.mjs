// 產生風格樣張截圖(真 Chrome、1920×1080)。
// 用法:node tools/dev/screenshots.mjs [輸出資料夾,預設 docs/art/m0-style-sample] [--set m0|range-a-roads]
//   m0:M0 區域(?area=m0)的風格樣張;range-a-roads:範圍 A 主要道路的路寬比例(decisions/0011)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const setArg = process.argv.indexOf('--set');
const SET = setArg > 0 ? process.argv[setArg + 1] : 'm0';
const outArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const OUT = join(ROOT, outArg ?? 'docs/art/m0-style-sample');
mkdirSync(OUT, { recursive: true });

// M0:世界座標原點 = 臺中國家歌劇院中心;北 = -Z
const M0_SHOTS = [
  { file: '01-spawn-chase.png', x: null, z: null, heading: null, cam: 0, drive: 2.5 },
  { file: '02-opera-front.png', x: 10, z: 120, heading: 350, cam: 0, drive: 0 },
  { file: '03-opera-near.png', x: -20, z: 95, heading: 15, cam: 1, drive: 0 },
  { file: '05-car-near.png', x: 86, z: 58, heading: 120, cam: 1, drive: 0 },
  { file: '04-top-view.png', x: 120, z: -40, heading: 270, cam: 2, drive: 0 },
];

// 範圍 A:世界座標原點 = 範圍中心(24.1525, 120.6625);座標取自 public/map/range-a/world.json 的道路折線
const RANGE_A_ROADS = [
  // x 為 null = 不傳送,停在出生點(惠來路二段,歌劇院旁),所以要排第一張
  { file: '00-huilai-rd-chase.png', x: null, z: null, heading: null, cam: 0, drive: 2.5 },
  { file: '01-taiwan-blvd-chase.png', x: -1318.8, z: -1127.9, heading: 122.8, cam: 0, drive: 0 },
  { file: '02-taiwan-blvd-top.png', x: -1318.8, z: -1127.9, heading: 122.8, cam: 2, drive: 0 },
  { file: '03-wenxin-rd-chase.png', x: -1196.7, z: -1331.6, heading: 209.8, cam: 0, drive: 0 },
  { file: '04-wenxin-rd-top.png', x: -1196.7, z: -1331.6, heading: 209.8, cam: 2, drive: 0 },
  { file: '06-zhongqing-rd-chase.png', x: 918.8, z: -2261.1, heading: 166.8, cam: 0, drive: 0 },
];

const SETS = { m0: { area: 'm0', shots: M0_SHOTS }, 'range-a-roads': { area: 'range-a', shots: RANGE_A_ROADS } };
const { area, shots: SHOTS } = SETS[SET];

const server = await createServer({ root: ROOT, server: { port: 5180, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1920,1160'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
// 埠號被占用時 Vite 會自動換下一個,網址以實際啟動的為準
await page.goto(`${server.resolvedUrls.local[0]}?area=${area}`);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.evaluate(() => window.__game.start());
// 等 MINI 模型載入(最多 10 秒;載入失敗時會用方塊車)
await page.waitForFunction(() => window.__game.state().carModelLoaded, null, { timeout: 10000 }).catch(() => console.warn('MINI 模型未載入'));
for (const s of SHOTS) {
  await page.evaluate((s) => {
    if (s.x !== null) window.__game.teleport(s.x, s.z, s.heading);
    window.__game.setCamera(s.cam);
    window.__game.setInput(s.drive ? { throttle: 1, brake: 0, steer: 0, handbrake: false } : null);
  }, s);
  await page.waitForTimeout(s.drive ? s.drive * 1000 : 1800);
  await page.evaluate(() => window.__game.setInput(null));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, s.file) });
  console.log('已存', s.file);
}
await browser.close();
await server.close();
