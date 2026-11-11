// 街道畫面對照截圖(decisions/0015):固定機位拍一組圖,改畫面前後各拍一次就能並排比較。
// 用法:node tools/shots/street-shots.mjs <輸出資料夾> [機位組,預設 street] [網址查詢字串,例 fx=off]   例:node tools/shots/street-shots.mjs docs/art/street-sample/after
// 機位組:street = 街道(0015 第一、二批);buildings = 建築(0015 第三批,b01 之後);furniture = 街道傢俱(0015 第四批,f01 之後);look = 畫面質感(0016,l01 之後)
// 用系統的 Google Chrome(有畫面視窗,才會用到真的 GPU);開發伺服器用 5178 埠(5175、5176 是其他專案的)。
// 機位:01–03 和 docs/art/visual-baseline/ 的原始截圖相同(出生點、往前開 6 秒、換高視角);04–07 是樣張區的俯瞰與街景;08 之後在樣張區外。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? join(ROOT, 'docs/art/street-sample/after'));
mkdirSync(out, { recursive: true });

const STREET = [
  { name: '01-spawn', run: async (g) => g.start(), wait: 2500 },
  {
    name: '02-driving',
    run: async (g) => {
      g.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
      await new Promise((r) => setTimeout(r, 6000));
      g.setInput({ throttle: 0, brake: 0, steer: 0, handbrake: false });
    },
    wait: 500,
  },
  { name: '03-intersection', run: async (g) => g.setCamera(1), wait: 1500 },
  { name: '04-aerial-huizhong', view: { x: -1865, y: 110, z: -930, lx: -1860, lz: -962 } },
  { name: '05-aerial-taiwan-blvd', view: { x: -1990, y: 120, z: -1420, lx: -1960, lz: -1490 } },
  { name: '06-street-crosswalk', view: { x: -1871, y: 4, z: -932, lx: -1850, lz: -966 } },
  { name: '07-street-taiwan-blvd', view: { x: -2080, y: 22, z: -1520, lx: -1960, lz: -1470 } },
  // 樣張區以外(2026-10-31 鋪到全區後加的機位)
  { name: '08-aerial-taiwan-blvd-2', view: { x: -1360, y: 90, z: -1060, lx: -1310, lz: -1120 } },
  { name: '09-aerial-station', view: { x: 2330, y: 120, z: 1560, lx: 2400, lz: 1690 } },
  { name: '10-aerial-zhonghua', view: { x: 1560, y: 90, z: 600, lx: 1595, lz: 660 } },
  { name: '11-street-wuquan', view: { x: 1500, y: 5, z: 120, lx: 1480, lz: 160 } },
];

// 建築機位(2026-11-01):舊城區街景(騎樓、店面)、透天巷弄、七期大樓、屋頂俯瞰、廟宇、學校
const BUILDINGS = [
  { name: 'b01-street-ziyou', view: { x: 2012, y: 4, z: 1362, lx: 1952, lz: 1424 } },
  { name: 'b02-street-jiguang', view: { x: 2078, y: 4, z: 1461, lx: 2009, lz: 1536 } },
  { name: 'b03-street-wuquan', view: { x: 1296, y: 4, z: 366, lx: 1338, lz: 322 } },
  { name: 'b04-street-gongyi', view: { x: -1490, y: 4, z: 179, lx: -1590, lz: 180 } },
  { name: 'b05-aerial-oldtown-roofs', view: { x: 2150, y: 70, z: 1620, lx: 2060, lz: 1500 } },
  { name: 'b06-aerial-qiqi', view: { x: -2100, y: 120, z: -1000, lx: -1950, lz: -1150 } },
  { name: 'b07-temple-baoan', view: { x: 1420, y: 14, z: 640, lx: 1450, lz: 609 } },
  { name: 'b08-school-huiwen', view: { x: -2270, y: 35, z: 70, lx: -2350, lz: 0 } },
  { name: 'b09-aerial-houses', view: { x: 2560, y: 45, z: -120, lx: 2500, lz: -180 } },
];

// 街道傢俱機位(2026-11-01):行道樹(含樹種)、路燈、號誌桿、機車、直式招牌、公車站;街景與俯瞰
const FURNITURE = [
  { name: 'f01-street-huizhong', view: { x: -1871, y: 4, z: -932, lx: -1850, lz: -966 } },
  { name: 'f02-street-taiwan-blvd', view: { x: -2030, y: 14, z: -1470, lx: -1950, lz: -1475 } },
  { name: 'f03-signal-qiqi', view: { x: -1930, y: 5, z: -1190, lx: -1895, lz: -1220 } },
  { name: 'f04-aerial-qiqi', view: { x: -2100, y: 120, z: -1000, lx: -1950, lz: -1150 } },
  { name: 'f05-street-ziyou', view: { x: 2012, y: 4, z: 1362, lx: 1952, lz: 1424 } },
  { name: 'f06-street-wuquan', view: { x: 1296, y: 4, z: 366, lx: 1338, lz: 322 } },
  { name: 'f07-signal-spawn', view: { x: 365, y: 5, z: -5, lx: 395, lz: -27 } },
  { name: 'f08-aerial-taiwan-blvd', view: { x: -1990, y: 120, z: -1420, lx: -1960, lz: -1490 } },
  // 機車排(2026-11-01 加)
  { name: 'f09-scooters-ziyou', view: { x: 2010, y: 2.5, z: 1386.3, lx: 2022.1, lz: 1386.7 } },
  { name: 'f10-scooters-wuquan', view: { x: 1336.3, y: 2.5, z: 303.8, lx: 1323.6, lz: 305.6 } },
  // 直式招牌、公車站、樹種(2026-11-01 加)
  { name: 'f11-signs-oldtown', view: { x: 2718.6, y: 3, z: 2251.4, lx: 2733.6, lz: 2263.4 } },
  { name: 'f12-bus-shelter', view: { x: 1962.9, y: 2.5, z: 1421.2, lx: 1959.4, lz: 1411.5 } },
  { name: 'f13-bus-pole', view: { x: -1818.8, y: 2, z: -1034.3, lx: -1821.8, lz: -1040.8 } },
  { name: 'f14-trees-tiered', view: { x: 996, y: 22, z: 2348, lx: 976, lz: 2328 } },
  { name: 'f15-trees-cluster', view: { x: 440, y: 22, z: -665, lx: 419, lz: -685 } },
  { name: 'f16-trees-palm', view: { x: -411, y: 18, z: -1178, lx: -431, lz: -1198 } },
  { name: 'f17-trees-cone', view: { x: 101, y: 22, z: -2170, lx: 81, lz: -2190 } },
];

// 畫面質感機位(decisions/0016):遊戲視角(出生點、開車中)+ 街景、俯瞰
const LOOK = [
  { name: 'l01-spawn', run: async (g) => g.start(), wait: 2500 },
  {
    name: 'l02-driving',
    run: async (g) => {
      g.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
      await new Promise((r) => setTimeout(r, 6000));
      g.setInput({ throttle: 0, brake: 0, steer: 0, handbrake: false });
    },
    wait: 500,
  },
  FURNITURE[0], FURNITURE[4], FURNITURE[2], FURNITURE[11], FURNITURE[13], BUILDINGS[5], BUILDINGS[6],
].map((v, i) => (i < 2 ? v : { ...v, name: `l${String(i + 1).padStart(2, '0')}-${v.name.replace(/^[a-z]\d+-/, '')}` }));

// 介面主題機位(0016 §10):開車中、街景;配合第 4 個參數 hud=a / hud=b / hud=c
const HUD = [LOOK[0], LOOK[1], LOOK[3]];

const SHOTS = { street: STREET, buildings: BUILDINGS, furniture: FURNITURE, look: LOOK, hud: HUD }[process.argv[3] ?? 'street'];
/** 第 4 個參數:網址查詢字串,例如 fx=off(畫面質感改版前) */
const QUERY = process.argv[4] ? `?${process.argv[4]}` : '';

const server = await createServer({ root: ROOT, server: { port: 5178, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1600,1080'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
try {
  await page.goto(`http://localhost:5178/${QUERY}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  // 先關掉開始畫面(機位組不一定從 01-spawn 開始)
  await page.evaluate(() => window.__game.start());
  for (const s of SHOTS) {
    if (s.view) {
      // 車子煞停,畫面上的路名牌與速度才不會跟著變
      await page.evaluate((v) => {
        window.__game.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false });
        window.__game.inspect(v);
      }, s.view);
      await page.waitForTimeout(2500);
    } else {
      await page.evaluate(`(${s.run.toString()})(window.__game)`);
      await page.waitForTimeout(s.wait);
    }
    await page.screenshot({ path: join(out, `${s.name}.jpg`), quality: 85 });
    console.log('已拍', s.name);
  }
  const st = await page.evaluate(() => window.__game.state());
  console.log(JSON.stringify({ avgFps: st.avgFps, drawCalls: st.drawCalls, triangles: st.triangles, chunkMaxMs: st.chunkMaxMs }));
  if (errors.length) {
    console.error('console error:', errors);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
