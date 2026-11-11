// 找偶發卡頓:照 e2e 的駕駛模式開 N 秒(每 30 秒回到路面一次),印出最慢的 5 幀,
// 以及它們「前一幀」各步驟花了多少毫秒(物理、分塊生成、加進場景、碰撞體、小地圖、繪製)。
// 分項加總遠小於該幀時間 → 時間花在 JS 以外(GC、GPU 上傳、合成器)。
// 用法:node tools/perf/frame-spikes.mjs [秒數,預設 60]
// 開發伺服器用 5179 埠(5175、5176 是其他專案的)。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SECONDS = Number(process.argv[2] ?? 60);
const server = await createServer({ root: ROOT, server: { port: 5179, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1920,1160', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
try {
  await page.goto('http://localhost:5179/');
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.evaluate(() => window.__game.start());
  const pattern = [
    { throttle: 1, brake: 0, steer: 0, handbrake: false },
    { throttle: 0.8, brake: 0, steer: 0.6, handbrake: false },
    { throttle: 1, brake: 0, steer: 0, handbrake: false },
    { throttle: 0.4, brake: 0, steer: -1, handbrake: true },
    { throttle: 1, brake: 0, steer: -0.4, handbrake: false },
    { throttle: 0, brake: 1, steer: 0, handbrake: false },
  ];
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const m0 = await metric();
  for (let t = 0; t < SECONDS; t += 2) {
    await page.evaluate((i) => window.__game.setInput(i), pattern[(t / 2) % pattern.length]);
    if (t % 30 === 0 && t > 0) await page.evaluate(() => window.__game.reset());
    await page.waitForTimeout(2000);
  }
  const m1 = await metric();
  const st = await page.evaluate(() => window.__game.state());
  console.log('最慢的 5 幀(ms)與前一幀的分項:');
  for (const f of await page.evaluate(() => window.__game.perf())) console.log(JSON.stringify(f));
  console.log(
    JSON.stringify({
      avgFps: +st.avgFps.toFixed(1),
      chunkMaxMs: st.chunkMaxMs,
      jsHeapMB: +(m1.JSHeapUsedSize / 1e6).toFixed(1),
      layoutMs: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(0),
      scriptMs: +((m1.ScriptDuration - m0.ScriptDuration) * 1000).toFixed(0),
      taskMs: +((m1.TaskDuration - m0.TaskDuration) * 1000).toFixed(0),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
