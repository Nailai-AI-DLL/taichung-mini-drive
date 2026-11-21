// Step 1 & Step 3 單元測試:雲端地圖載入器、map-data 獨立無歷史分支同步腳本、DTM 地形網格高程取樣、2.5D 立體交叉路網(高架橋/匝道)、AI 車流防跨層轉彎、回到路面與招牌空間計算。
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWorld, mapAssetUrl, regionTileUrl, resolveMapBaseUrl } from '../../src/map/load';
import { RoadIndex } from '../../src/map/road-index';
import { roadWayOf, type RoadWay, type WorldRoad } from '../../src/map/types';
import { Traffic, mulberry32 } from '../../src/traffic/traffic';
import {
  computePlaceSignSpecs,
  GridElevationSampler,
  isSpotValid,
  snapToRoad,
  sunkHolesOf,
  WorldSurface,
} from '../../src/world/surface';
import { loadWorld } from '../helpers/load-map';

const way = (osmId: number, points: number[], o: Partial<RoadWay> = {}): RoadWay => ({
  osmId,
  name: '路' + osmId,
  nameEn: '',
  highway: 'primary',
  oneway: false,
  width: 12,
  points,
  ...o,
});

describe('雲端地圖載入器 (src/map/load.ts)', () => {
  it('優先順序:?mapUrl 參數 > VITE_MAP_URL 環境變數 > 同站 BASE_URL/map,並自動正規化斜線', () => {
    expect(resolveMapBaseUrl({ search: '', envMapUrl: '', baseUrl: '/' })).toBe('/map');
    expect(resolveMapBaseUrl({ search: '', envMapUrl: '', baseUrl: '/taichung-mini-drive/' })).toBe('/taichung-mini-drive/map');
    expect(
      resolveMapBaseUrl({
        search: '',
        envMapUrl: 'https://pub-r2.example.com/maps///',
        baseUrl: '/taichung-mini-drive/',
      }),
    ).toBe('https://pub-r2.example.com/maps');
    expect(
      resolveMapBaseUrl({
        search: '?area=range-a&mapUrl=https%3A%2F%2Fcdn.example.com%2Fbranch-map%2F',
        envMapUrl: 'https://pub-r2.example.com/maps',
        baseUrl: '/',
      }),
    ).toBe('https://cdn.example.com/branch-map');
  });

  it('組合 world.json、skyline.json 與大範圍分區 tile 網址', () => {
    const opts = { search: '', envMapUrl: 'https://r2.example.com/tc-map/' };
    expect(mapAssetUrl('range-a', 'world.json', opts)).toBe('https://r2.example.com/tc-map/range-a/world.json');
    expect(mapAssetUrl('range-a', '/skyline.json', opts)).toBe('https://r2.example.com/tc-map/range-a/skyline.json');
    expect(regionTileUrl('range-b', -2, 5, opts)).toBe('https://r2.example.com/tc-map/range-b/tiles/-2_5.json');
  });

  it('fetchWorld 回報載入狀態,且在 HTTP 失敗時給出包含狀態碼與網址的錯誤', async () => {
    const statuses: string[] = [];
    await expect(
      fetchWorld('missing-area', {
        baseUrl: '/',
        envMapUrl: '',
        search: '',
        onStatus: (s) => statuses.push(s),
        fetchFn: (async () => ({ ok: false, status: 404 }) as Response) as typeof fetch,
      }),
    ).rejects.toThrow(/404.*\/map\/missing-area\/world\.json/);
    expect(statuses).toEqual(['下載地圖資料…']);
  });
});

describe('地形高程取樣器 (GridElevationSampler)', () => {
  // 2×2 網格(step = 100 m):x 往東每 100 m 升 10 m,z 往南每 100 m 升 20 m
  const sampler = new GridElevationSampler({
    minX: 0,
    minZ: 0,
    step: 100,
    cols: 2,
    rows: 2,
    heights: [0, 10, 20, 30],
  });

  it('雙線性插值計算網格內與邊界外的高程', () => {
    expect(sampler.sampleY(0, 0)).toBeCloseTo(0);
    expect(sampler.sampleY(100, 0)).toBeCloseTo(10);
    expect(sampler.sampleY(0, 100)).toBeCloseTo(20);
    expect(sampler.sampleY(50, 50)).toBeCloseTo(15);
    expect(sampler.sampleY(25, 75)).toBeCloseTo(2.5 + 15);
  });

  it('法向量為單位向量,且在斜坡上朝向低處傾斜', () => {
    const [nx, ny, nz] = sampler.sampleNormal(50, 50);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    expect(ny).toBeGreaterThan(0.9);
    // 東邊、南邊較高 → 法向量 x、z 為負
    expect(nx).toBeLessThan(0);
    expect(nz).toBeLessThan(0);
  });
});

describe('2.5D 立體交叉路網 (RoadIndex & WorldSurface.snapToRoad)', () => {
  // 平面道路(東西向,y = 0)與高架橋(南北向,elev = 12 m,layer = 1)在原點立體交叉,另有一條上橋匝道從 y = 0 爬到 y = 12
  const groundRoad = way(1, [-200, 0, 200, 0], { name: '臺灣大道', layer: 0 });
  const viaductRoad = way(2, [0, -200, 0, 200], { name: '台74線高架', layer: 1, elev: [12, 12], oneway: true });
  const rampRoad = way(3, [-100, 20, 0, 20], { name: '台74線匝道', layer: 0, elev: [0, 12], oneway: true });
  const idx = new RoadIndex([groundRoad, viaductRoad, rampRoad]);

  it('roadWayOf 正確轉換 WorldRoad 的 layer 與量化 elev(含坡段 S 曲線平滑細分)', () => {
    const wr: WorldRoad = {
      osmId: 99,
      name: '高架測試',
      nameEn: '',
      highway: 'trunk',
      oneway: true,
      width: 16,
      sidewalk: 0,
      widthFrom: 'gov',
      layer: 1,
      elev: [0, 60, 120],
      pts: [0, 0, 500, 0, 1000, 0],
    };
    const rw = roadWayOf(wr);
    expect(rw.layer).toBe(1);
    expect(rw.elev?.[0]).toBe(0);
    expect(rw.elev?.[rw.elev.length - 1]).toBe(12);
    // 中點 (x = 50 m) 為對稱 S 曲線中點 y = 6 m,且因為有坡度已細分為 > 3 個平滑節點
    let midIdx = -1;
    for (let i = 0; i + 1 < rw.points.length; i += 2) {
      if (Math.abs(rw.points[i] - 50) < 1e-3) {
        midIdx = i / 2;
        break;
      }
    }
    expect(midIdx).toBeGreaterThan(0);
    expect(rw.elev?.[midIdx]).toBe(6);
    expect(rw.elev!.length).toBeGreaterThan(3);
  });

  it('高架橋與平面道路交叉處:依車輛高度 y 區分目前所在道路', () => {
    // 就算車頭朝向介於兩路之間(45°),在高架橋高度(y = 12)仍應判定為高架橋,在地面(y = 0)應判定為平面道路
    const d = Math.SQRT1_2;
    expect(idx.current(1, 1, d, d, 12)?.way.name).toBe('台74線高架');
    expect(idx.current(1, 1, d, d, 0)?.way.name).toBe('臺灣大道');
  });

  it('匝道插值高度與坡度仰角 pitch 正確', () => {
    const hit = idx.near(-50, 20, 5).find((h) => h.way.osmId === 3)!;
    expect(hit.y).toBeCloseTo(6, 5);
    expect(hit.pitch).toBeCloseTo(Math.atan2(12, 100), 5);
  });

  it('snapToRoad(R 鍵回到路面):在高架橋上按 R 留在橋面(y = 12)且單行道自動轉為順向;在地面按 R 留在地面', () => {
    const spawn = { x: -150, z: 0, headingDeg: 90 };
    // 在高架橋旁(x = 3, z = 0, y = 12),車頭逆向朝北(0, -1),因為高架橋是往南(0, 1)的單行道,應轉成 180°(朝南)且 y = 12
    const onBridge = snapToRoad(idx, spawn, { x: 3, y: 12, z: 0 }, [0, -1]);
    expect(onBridge.onRoad).toBe(true);
    expect(onBridge.y).toBeCloseTo(12);
    expect(onBridge.headingDeg).toBeCloseTo(180);

    // 在同一個 (x = 3, z = 0) 但高度在地面(y = 0),車頭朝西(-1, 0),雙向的臺灣大道應維持朝西(270°)且 y = 0
    const onGround = snapToRoad(idx, spawn, { x: 3, y: 0, z: 0 }, [-1, 0]);
    expect(onGround.onRoad).toBe(true);
    expect(onGround.y).toBeCloseTo(0);
    expect(onGround.headingDeg).toBeCloseTo(270);
  });
});

describe('AI 車流立體交叉與匝道高程 (Traffic 2.5D)', () => {
  it('高架橋與平面道路在 (0, 0) 重疊時,車流不會跨層從高架橋半空轉進平面道路', () => {
    const ground = way(1, [-300, 0, 0, 0, 300, 0], { layer: 0 });
    const bridge = way(2, [0, -300, 0, 0, 0, 300], { layer: 1, elev: [10, 10, 10] });
    const t = new Traffic([ground, bridge], mulberry32(42), { ...( new Traffic([]).cfg ), straight: 0 });
    const initialWay = new Map<number, number>();
    for (let i = 0; i < 60 * 25; i++) {
      t.update(1 / 60, { x: 120, y: 0, z: 120 });
      for (const c of t.cars) {
        if (!initialWay.has(c.id)) initialWay.set(c.id, c.way);
        else expect(c.way).toBe(initialWay.get(c.id));
        expect(c.y).toBeCloseTo(c.way === 1 ? 10 : 0);
      }
    }
    expect(initialWay.size).toBeGreaterThan(5);
  });

  it('有匝道連接地面(y = 0)與高架橋(y = 10)時,車輛可沿匝道爬升並匯入高架橋', () => {
    const ground = way(1, [-300, 0, -100, 0], { oneway: true, elev: [0, 0] });
    const ramp = way(2, [-100, 0, 100, 0], { oneway: true, elev: [0, 10] });
    const bridge = way(3, [100, 0, 400, 0], { oneway: true, layer: 1, elev: [10, 10] });
    const t = new Traffic([ground, ramp, bridge], mulberry32(7));
    let reachedBridge = false;
    let sawClimbingPitch = false;
    for (let i = 0; i < 60 * 30; i++) {
      t.update(1 / 60, { x: 0, y: 50, z: 150 });
      for (const c of t.cars) {
        if (c.way === 1 && (c.y ?? 0) > 1 && (c.y ?? 0) < 9 && (c.pitch ?? 0) > 0.04) sawClimbingPitch = true;
        if (c.way === 2 && Math.abs((c.y ?? 0) - 10) < 1e-3) reachedBridge = true;
      }
    }
    expect(sawClimbingPitch).toBe(true);
    expect(reachedBridge).toBe(true);
  });

  it('高架橋上的 AI 車不會因為玩家停在正下方橋下平面道路而煞車', () => {
    const bridge = way(1, [-400, 0, 400, 0], { oneway: true, width: 3.3, layer: 1, elev: [10, 10] });
    const t = new Traffic([bridge], mulberry32(5));
    let c = t.spawn(-200, 0);
    for (let i = 0; i < 50 && !c; i++) c = t.spawn(-200, 0);
    if (!c) throw new Error('生成失敗');
    const tx = t.target(c);
    // 玩家停在正下方的地面 y = 0(AI 車在 y = 10)
    const playerBelow = { x: tx.x + 30, y: 0, z: tx.z };
    for (let i = 0; i < 6 * 60; i++) t.update(1 / 60, playerBelow);
    const me = t.cars.find((o) => o.id === c!.id)!;
    // 完全不減速,已順利開過玩家正上方
    expect(me.speed).toBeGreaterThan(5);
    expect(me.x).toBeGreaterThan(playerBelow.x);
  });
});

describe('WorldSurface 與 M0 地圖空間查詢', () => {
  const world = loadWorld('m0');
  const roadIndex = new RoadIndex(world.roads);
  const surface = new WorldSurface(world, roadIndex);

  it('isSpotValid 拒絕地圖邊界外與道路路面上的點', () => {
    const [bx0, bz0] = world.json.meta.bounds;
    expect(isSpotValid(world, roadIndex, bx0 + 5, bz0 + 5)).toBe(false);
    const spawn = world.json.spawn;
    expect(isSpotValid(world, roadIndex, spawn.x, spawn.z)).toBe(false);
  });

  it('sunkHolesOf 只回傳帶有 sink 的下沉地標外框', () => {
    const holes = sunkHolesOf([
      { id: 'normal', name: '一般', model: 'a.glb', x: 10, z: 20, h: 100, rings: [[0, 0, 100, 0, 100, 100]] },
      { id: 'sunk', name: '秋紅谷', model: 'b.glb', x: 10, z: 20, h: 11, sink: 5, rings: [[0, 0, 100, 0, 100, 100]] },
    ]);
    expect(holes).toEqual([
      [
        [10, 20],
        [20, 20],
        [20, 30],
      ],
    ]);
  });

  it('computePlaceSignSpecs 能搭配地形高程產生 baseY', () => {
    const fakeWorld = {
      ...world,
      json: {
        ...world.json,
        places: [{ id: 'test-pl', name: '測試站', glyph: 'T', color: '#112233', x: 0, z: 0, px: 10, pz: 10, road: '測試路' }],
      },
    };
    const elevatedSampler = new GridElevationSampler({
      minX: -500,
      minZ: -500,
      step: 1000,
      cols: 2,
      rows: 2,
      heights: [88, 88, 88, 88],
    });
    const specs = computePlaceSignSpecs(fakeWorld, roadIndex, elevatedSampler);
    expect(specs).toHaveLength(1);
    expect(specs[0].baseY).toBeCloseTo(88);
    expect(surface.placeSignSpecs()).toBeDefined();
  });
});

describe('map-data 獨立無歷史分支同步腳本 (tools/map-build/sync-map-branch.sh)', () => {
  it('push 多次仍維持單一無歷史 commit(整個覆蓋),且 pull 可完整還原地圖檔而不殘留 .git', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tc-map-sync-'));
    try {
      const bare = join(tmp, 'remote.git');
      const srcDir = join(tmp, 'src-map');
      const dstDir = join(tmp, 'dst-map');
      execFileSync('git', ['init', '--bare', '-q', bare]);
      mkdirSync(join(srcDir, 'range-a'), { recursive: true });
      writeFileSync(join(srcDir, 'range-a/world.json'), '{"ver":1}');
      writeFileSync(join(srcDir, 'range-a/skyline.json'), '{"sky":1}');

      const script = join(process.cwd(), 'tools/map-build/sync-map-branch.sh');
      const lock1 = join(tmp, 'lock1');
      const lock2 = join(tmp, 'lock2');
      execFileSync('bash', [script, 'push', '--remote', bare, '--branch', 'map-data', '--dir', srcDir, '--lock', lock1]);

      // 第二次修改後再 push:分支上仍應只有 1 個 commit(不累積歷史)
      writeFileSync(join(srcDir, 'range-a/world.json'), '{"ver":2}');
      execFileSync('bash', [script, 'push', '--remote', bare, '--branch', 'map-data', '--dir', srcDir, '--lock', lock2]);

      const count = execFileSync('git', ['-C', bare, 'rev-list', '--count', 'refs/heads/map-data'], { encoding: 'utf8' }).trim();
      expect(count).toBe('1');

      // pull 到全新目錄:檔案與最新版一致,且不含巢狀 .git
      execFileSync('bash', [script, 'pull', '--remote', bare, '--branch', 'map-data', '--dir', dstDir, '--lock', lock2]);
      expect(readFileSync(join(dstDir, 'range-a/world.json'), 'utf8')).toBe('{"ver":2}');
      expect(readFileSync(join(dstDir, 'range-a/skyline.json'), 'utf8')).toBe('{"sky":1}');
      expect(existsSync(join(dstDir, '.git'))).toBe(false);

      // 版本綁定(decisions/0057):照舊的 lock 仍拉得到第 1 版;--latest 拉分支最新版
      const old = join(tmp, 'old-map');
      execFileSync('bash', [script, 'pull', '--remote', bare, '--dir', old, '--lock', lock1]);
      expect(readFileSync(join(old, 'range-a/world.json'), 'utf8')).toBe('{"ver":1}');
      const latest = join(tmp, 'latest-map');
      execFileSync('bash', [script, 'pull', '--remote', bare, '--dir', latest, '--lock', lock1, '--latest']);
      expect(readFileSync(join(latest, 'range-a/world.json'), 'utf8')).toBe('{"ver":2}');
      const versions = execFileSync('git', ['-C', bare, 'for-each-ref', '--format=%(refname)', 'refs/map-versions/'], { encoding: 'utf8' }).trim().split('\n');
      expect(versions).toHaveLength(2);

      // lock 的 commit 對不上就拒絕
      writeFileSync(lock1, readFileSync(lock1, 'utf8').replace(/^commit=.*$/m, 'commit=0000000000000000000000000000000000000000'));
      expect(() => execFileSync('bash', [script, 'pull', '--remote', bare, '--dir', join(tmp, 'bad'), '--lock', lock1], { stdio: 'pipe' })).toThrow();

      // lock 指令:把分支目前那版存成版本(不重新上傳)
      const lock3 = join(tmp, 'lock3');
      execFileSync('bash', [script, 'lock', '--remote', bare, '--lock', lock3]);
      const head = execFileSync('git', ['-C', bare, 'rev-parse', 'refs/heads/map-data'], { encoding: 'utf8' }).trim();
      expect(readFileSync(lock3, 'utf8')).toContain(`commit=${head}`);

      // 推送失敗(遠端不存在 / 沒權限)時不可寫出 lock(2026-11-21 曾因 bash 3.2 的 $( ) 不繼承 set -e 而寫出錯的 lock)
      const lock4 = join(tmp, 'lock4');
      expect(() => execFileSync('bash', [script, 'lock', '--remote', join(tmp, 'no-such.git'), '--lock', lock4], { stdio: 'pipe' })).toThrow();
      expect(existsSync(lock4)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
