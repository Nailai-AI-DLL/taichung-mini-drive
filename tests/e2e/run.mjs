// 瀏覽器端冒煙與效能測試(用系統安裝的 Google Chrome,有畫面視窗,才會用到真的 GPU)。
// 用法:
//   npm run test:e2e                     冒煙 + 60 秒效能取樣(1920×1080,DPR 1)
//   npm run test:e2e -- --seconds 300    連續駕駛 5 分鐘
//   npm run test:e2e -- --dpr 2          以 Retina 解析度量測
//   npm run test:e2e -- --stream 30      高速穿越範圍 A 的秒數(測分塊載入卡頓;0 = 不測,預設 20)
// 輸出:tests/e2e/out/report-<時間>.json,並在終端印出摘要;任何 console error 都視為失敗。
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SECONDS = arg('seconds', 60);
const DPR = arg('dpr', 1);
const STREAM_SECONDS = arg('stream', 20);

const server = await createServer({ root: ROOT, server: { port: 5174, strictPort: true }, logLevel: 'error' });
await server.listen();
const url = 'http://localhost:5174/';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1920,1160'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @ ${m.location()?.url ?? ''}`));
page.on('pageerror', (e) => errors.push(String(e)));

const report = { url, seconds: SECONDS, viewport: '1920x1080', dpr: DPR, ua: '', checks: {}, samples: [] };
let ok = true;
const check = (name, pass, detail) => {
  report.checks[name] = { pass, detail };
  if (!pass) ok = false;
  console.log(`${pass ? '通過' : '失敗'}  ${name}  ${detail ?? ''}`);
};

try {
  const t0 = Date.now();
  await page.goto(url);
  report.ua = await page.evaluate(() => navigator.userAgent);
  report.gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'not_stated';
  });
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  check('載入時間 < 10 秒(本機)', Date.now() - t0 < 10000, `${Date.now() - t0} ms`);
  await page.evaluate(() => window.__game.start());

  // 冒煙:油門 3 秒要有速度
  await page.evaluate(() => window.__game.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }));
  await page.waitForTimeout(3000);
  const s1 = await page.evaluate(() => window.__game.state());
  check('油門 3 秒後車速 > 20 km/h', s1.speedKmh > 20, `${s1.speedKmh.toFixed(1)} km/h`);
  check('路名牌有顯示路名', !!s1.roadName, s1.roadName);


  // 駕駛:每 2 秒換一種操作,每輪(12 秒)回到路面一次,持續取樣
  const pattern = [
    { throttle: 1, brake: 0, steer: 0, handbrake: false },
    { throttle: 0.8, brake: 0, steer: 0.6, handbrake: false },
    { throttle: 1, brake: 0, steer: 0, handbrake: false },
    { throttle: 0.4, brake: 0, steer: -1, handbrake: true },
    { throttle: 1, brake: 0, steer: -0.4, handbrake: false },
    { throttle: 0, brake: 1, steer: 0, handbrake: false },
  ];
  let lastFrames = s1.frames;
  let lastPos = s1;
  let distance = 0;
  let frozen = 0;
  for (let t = 0; t < SECONDS; t += 2) {
    await page.evaluate((i) => window.__game.setInput(i), pattern[(t / 2) % pattern.length]);
    // 每輪操作(12 秒)開始時回到路面:這是盲開,撞到建築會卡住;原本 30 秒才回一次,
    // 「持續移動」的距離就看剛好撞到哪棟樓(2026-11-13 建築退出車道後從 304 m 掉到 176 m,車子本身沒問題)
    if (t % (pattern.length * 2) === 0 && t > 0) await page.evaluate(() => window.__game.reset());
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => window.__game.state());
    report.samples.push({ t, fps: s.fps, avgFps: s.avgFps, p1LowFps: s.p1LowFps, maxFrameMs: s.maxFrameMs, drawCalls: s.drawCalls, triangles: s.triangles, speedKmh: s.speedKmh, roadName: s.roadName });
    if (s.frames === lastFrames) frozen++;
    distance += Math.hypot(s.x - lastPos.x, s.z - lastPos.z);
    lastFrames = s.frames;
    lastPos = s;
  }
  const fpsList = report.samples.map((s) => s.avgFps);
  const avg = fpsList.reduce((a, b) => a + b, 0) / fpsList.length;
  const minAvg = Math.min(...fpsList);
  const maxDraw = Math.max(...report.samples.map((s) => s.drawCalls));
  const maxFrameMs = Math.max(...report.samples.map((s) => s.maxFrameMs));
  report.summary = { avgFps: avg, minWindowAvgFps: minAvg, maxFrameMs, maxDrawCalls: maxDraw, distanceM: distance, frozenSamples: frozen, autoRight: lastPos.autoRight };
  check('畫面持續更新(沒有凍結)', frozen === 0, `凍結取樣 ${frozen} 次`);
  check('車子持續移動', distance > SECONDS * 3, `${distance.toFixed(0)} m`);
  check('平均 fps ≥ 58', avg >= 58, `平均 ${avg.toFixed(1)},最差取樣(最近 600 幀)${minAvg.toFixed(1)},最長單幀 ${maxFrameMs.toFixed(1)} ms`);
  check('draw calls < 300', maxDraw < 300, `最多 ${maxDraw}`);
  // 分塊串流:以 2 倍極速(72 m/s)由西往東穿越範圍 A,量最長單幀(docs/decisions/0012)
  if (STREAM_SECONDS > 0) {
    const st = await page.evaluate(async ({ secs }) => {
      const g = window.__game;
      const s0 = g.state();
      g.state(); // 歸零最長單幀
      const z = s0.z;
      const x0 = -3200;
      const frameMs = [];
      let last = performance.now();
      const t0 = last;
      await new Promise((done) => {
        const step = (now) => {
          frameMs.push(now - last);
          last = now;
          const t = (now - t0) / 1000;
          g.teleport(x0 + 72 * t, z, 90);
          if (t < secs) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      const s = g.state();
      frameMs.sort((a, b) => a - b);
      return {
        distanceM: 72 * secs,
        worstFrameMs: frameMs[frameMs.length - 1],
        p99FrameMs: frameMs[Math.floor(frameMs.length * 0.99)],
        // 門檻 34 ms:掉一次垂直同步的幀是 33.3 ms,計時器抖動 ±0.2 ms;33.4 會讓 33.4 / 33.5 ms 的幀時過時不過
        // (2026-11-12 ~ 13 六次執行最慢幀 33.0–33.5 ms,都是掉一次同步,不是真的更慢)
        over33ms: frameMs.filter((f) => f > 34).length,
        frames: frameMs.length,
        chunksLoaded: s.chunksLoaded,
        chunksTotal: s.chunksTotal,
        chunkMaxMs: s.chunkMaxMs,
        drawCalls: s.drawCalls,
        minimapRedraws: s.minimapRedraws,
        minimapMaxRedrawMs: s.minimapMaxRedrawMs,
        // 最慢的幾幀與它們前一幀各分項的耗時(physics / stream / build / meshes / colliders / render…),找卡頓來源用
        worst: g.perf().slice(0, 3),
      };
    }, { secs: STREAM_SECONDS });
    report.stream = st;
    check('高速穿越:沒有超過 33 ms 的卡頓幀', st.over33ms === 0, `${st.frames} 幀中 ${st.over33ms} 幀;最長 ${st.worstFrameMs.toFixed(1)} ms、p99 ${st.p99FrameMs.toFixed(1)} ms、單格生成最長 ${st.chunkMaxMs.toFixed(1)} ms、載入 ${st.chunksLoaded}/${st.chunksTotal} 格、draw calls ${st.drawCalls}`);
    if (st.over33ms) console.log('  最慢幀分項:', JSON.stringify(st.worst));
    check('高速穿越:小地圖快取重畫 < 8 ms', st.minimapRedraws > 1 && st.minimapMaxRedrawMs < 8, `重畫 ${st.minimapRedraws} 次，最長 ${st.minimapMaxRedrawMs.toFixed(1)} ms`);
  }
  // 小地圖(M1-plan §5):可切換北朝上 / 車頭朝上;位置與道路對齊。
  // 對齊的檢查方式(兩種模式各做一次):
  // - 找一個離車子 50–85 m 的道路點 T,它在小地圖上的位置要是道路色;
  // - T 對車子的鏡射點 M(離任何道路邊緣 > 8 m,約 3 px)要不是道路色。
  // 這樣平移、旋轉 180°、鏡像都會失敗(只取樣車頭前方的話，轉 180° 會漏掉;驗收發現)。
  // 放在效能量測之後：讀回畫布像素(getImageData)會讓瀏覽器卡一幀(實測約 50 ms),干擾 fps 量測。
  const mm = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const modes = [g.state().minimapMode];
    g.setMinimapMode('north');
    await sleep(100);
    modes.push(g.state().minimapMode);
    g.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false });
    g.setMinimapLabels(false); // 路名底框會擋住取樣點
    const w = await fetch('/map/range-a/world.json').then((r) => r.json());
    const segs = [];
    for (const r of w.roads) for (let i = 0; i + 3 < r.pts.length; i += 2) segs.push([r.pts[i] / 10, r.pts[i + 1] / 10, r.pts[i + 2] / 10, r.pts[i + 3] / 10, r.width / 2]);
    /** 到最近道路邊緣的距離(公尺) */
    const distRoads = (x, z) => {
      let best = Infinity;
      for (const [ax, az, bx, bz, hw] of segs) {
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz) - hw);
      }
      return best;
    };
    const c = document.querySelector('.minimap canvas');
    const ctx = c.getContext('2d');
    const k = c.width / 200;
    // 道路色:一般道路白、主要道路黃與邊線(src/ui/minimap.ts 的 C);容差 8(路名底框 #F6F4EF 和白色差 21)
    const road = [[255, 255, 255], [247, 227, 174], [226, 205, 147]];
    const isRoad = (sx, sy) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const p = ctx.getImageData(Math.round((100 + sx) * k) + dx, Math.round((100 + sy) * k) + dy, 1, 1).data;
          if (road.some((r) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) < 8)) return true;
        }
      return false;
    };
    const sp = w.spawn;
    const out = [];
    for (const mode of ['heading', 'north']) {
      g.setMinimapMode(mode);
      g.teleport(sp.x, sp.z, sp.headingDeg);
      await sleep(400);
      const s = g.state();
      const b = (sp.headingDeg * Math.PI) / 180;
      const hx = Math.sin(b), hz = -Math.cos(b);
      const rot = mode === 'north' ? 0 : -Math.PI / 2 - Math.atan2(hz, hx);
      const toMap = (x, z) => {
        const dx = (x - s.x) * (100 / 260), dy = (z - s.z) * (100 / 260);
        return [dx * Math.cos(rot) - dy * Math.sin(rot), dx * Math.sin(rot) + dy * Math.cos(rot)];
      };
      const nearLandmark = (x, z) => w.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < 30);
      let found = null;
      // 沿每段路每 5 m 取一個點(長直路段的頂點可能都不在 40–90 m 內)
      for (const [ax, az, bx, bz, hw] of segs) {
        if (hw < 3) continue;
        const n = Math.max(1, Math.floor(Math.hypot(bx - ax, bz - az) / 5));
        for (let j = 0; j <= n && !found; j++) {
          const tx = ax + ((bx - ax) * j) / n, tz = az + ((bz - az) * j) / n;
          const d = Math.hypot(tx - s.x, tz - s.z);
          if (d < 40 || d > 90) continue;
          const mx = 2 * s.x - tx, mz = 2 * s.z - tz;
          if (nearLandmark(tx, tz) || nearLandmark(mx, mz) || distRoads(mx, mz) < 8) continue;
          found = { tx, tz, mx, mz, name: `(${tx.toFixed(0)}, ${tz.toFixed(0)})` };
        }
        if (found) break;
      }
      if (!found) { out.push({ mode, ok: false, why: '找不到合適的取樣點' }); continue; }
      const t = toMap(found.tx, found.tz);
      const m = toMap(found.mx, found.mz);
      out.push({ mode, ok: isRoad(...t) && !isRoad(...m), road: isRoad(...t), mirrorRoad: isRoad(...m), name: found.name });
    }
    g.setMinimapLabels(true);
    g.setMinimapMode('heading');
    return { modes, out };
  });
  check('小地圖可切換北朝上 / 車頭朝上', mm.modes[0] === 'heading' && mm.modes[1] === 'north', mm.modes.join(' → '));
  for (const o of mm.out)
    check(`小地圖對齊(${o.mode === 'north' ? '北朝上' : '車頭朝上'}):道路點畫在道路上、鏡射點不是道路`, o.ok, o.why ?? `${o.name}:道路點 ${o.road ? '是' : '不是'}道路色、鏡射點${o.mirrorRoad ? '是' : '不是'}道路色`);
  // 街道傢俱碰撞(0015 §11.6,Cooper 2026-11-01:要碰撞)。單元測試管不到 main.ts 有沒有把碰撞體加進物理世界,這裡實際開車撞:
  // 出生點附近的一支路燈(行道樹 2026-11-13 先移除,改撞路燈),從最近道路的車道沿垂直方向開過去,3 秒全油門後車子要停在樹前(沒有碰撞會直接穿過去)
  const hit = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const w = await fetch('/map/range-a/world.json').then((r) => r.json());
    const sp = w.spawn;
    const t = w.furniture.lights;
    let tree = null;
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i] / 10, z = t[i + 1] / 10;
      if (!tree || Math.hypot(x - sp.x, z - sp.z) < Math.hypot(tree[0] - sp.x, tree[1] - sp.z)) tree = [x, z];
    }
    let foot = null, best = Infinity;
    for (const r of w.roads)
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const ax = r.pts[i] / 10, az = r.pts[i + 1] / 10, dx = r.pts[i + 2] / 10 - ax, dz = r.pts[i + 3] / 10 - az;
        const k = Math.max(0, Math.min(1, ((tree[0] - ax) * dx + (tree[1] - az) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(tree[0] - ax - k * dx, tree[1] - az - k * dz);
        if (d < best) [best, foot] = [d, [ax + k * dx, az + k * dz]];
      }
    const nx = (tree[0] - foot[0]) / best, nz = (tree[1] - foot[1]) / best;
    g.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false });
    // 起點在車道上(中心線再往後 2 m);起點如果退太遠,會落在對面人行道、和對面的樹重疊,車子一出生就被推歪(2026-11-01 踩過)
    g.teleport(foot[0] - nx * 2, foot[1] - nz * 2, ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360);
    await sleep(1500); // 等附近的格子載入
    g.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
    await sleep(3000);
    const s = g.state();
    g.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: false });
    return { tree, along: (s.x - tree[0]) * nx + (s.z - tree[1]) * nz };
  });
  check('撞到路燈會被擋下', hit.along < -0.5, `路燈 (${hit.tree.map((v) => v.toFixed(1)).join(', ')}),車子停在路燈前 ${(-hit.along).toFixed(1)} m(負值 = 穿過去)`);
  check('沒有 console error', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('執行沒有例外', false, String(e));
} finally {
  report.errors = errors;
  report.pass = ok;
  const outDir = join(ROOT, 'tests/e2e/out');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`GPU:${report.gpu}`);
  console.log(`報告:${file}`);
  await browser.close();
  await server.close();
  process.exit(ok ? 0 : 1);
}
