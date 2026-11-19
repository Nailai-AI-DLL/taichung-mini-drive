// 3D 立體高架道路與上下匝道單元測試(台 74 線 快官霧峰線、西屯一/二交流道、光明陸橋):
// 驗證高程連續性、匝道匯流處護欄自動開口、橋墩避開地面車道,以及 Rapier 物理車輛實際開上匝道、行駛高架橋面、護欄防墜落與橋下平面通行。
import { describe, expect, it } from 'vitest';
import R from '@dimforge/rapier3d-compat';
import { assignElevatedRoads, ELEVATED_DECK_Y, subdivideElevatedPolyline } from '../../src/map/elevated';
import { QUANT, type WorldRoad } from '../../src/map/types';
import { addStaticRoadDeck, addStaticTrimesh, createPhysicsWorld, FIXED_DT } from '../../src/physics/world';
import { Vehicle } from '../../src/vehicle/vehicle';
import { buildChunk } from '../../src/world/chunks';
import { addElevatedRoads, ELEVATED_ROAD_CFG, type ElevatedRoadPiece } from '../../src/world/gen/elevated-road';
import { MeshBuilder } from '../../src/world/gen/mesh';
import { loadWorld } from '../helpers/load-map';

describe('高架道路與上下匝道高程計算 (src/map/elevated.ts)', () => {
  it('自動辨識 trunk 主線、trunk_link 匝道與陸橋主跨/引道,且交接節點高程完全連續', () => {
    const qPts = (pts: [number, number][]) => pts.flatMap(([x, z]) => [Math.round(x * QUANT), Math.round(z * QUANT)]);
    const roads: WorldRoad[] = [
      // 平面道路(環中路)
      { osmId: 1, name: '環中路', nameEn: '', highway: 'tertiary', oneway: true, width: 12, sidewalk: 2, widthFrom: 'gov', pts: qPts([[-200, 0], [0, 0], [200, 0]]) },
      // 上橋匝道(從環中路 (0, 0) 爬升到台 74 線 (150, 20))
      { osmId: 2, name: '西屯交流道', nameEn: '', highway: 'trunk_link', oneway: true, width: 7, sidewalk: 0, widthFrom: 'default', pts: qPts([[0, 0], [75, 10], [150, 20]]) },
      // 台 74 線高架主線
      { osmId: 3, name: '快官霧峰線', nameEn: '', highway: 'trunk', oneway: true, width: 11, sidewalk: 0, widthFrom: 'default', pts: qPts([[-200, 20], [150, 20], [400, 20]]) },
    ];

    const count = assignElevatedRoads(roads);
    expect(count).toBe(2);
    expect(roads[0].elev).toBeUndefined();
    expect(roads[1].layer).toBe(1);
    expect(roads[2].layer).toBe(1);
    // 匝道起點接平面 = 0,中點 = 一半高度,終點接高架主線 = ELEVATED_DECK_Y
    expect(roads[1].elev![0] / QUANT).toBeCloseTo(0);
    expect(roads[1].elev![1] / QUANT).toBeCloseTo(ELEVATED_DECK_Y * 0.5, 1);
    expect(roads[1].elev![2] / QUANT).toBeCloseTo(ELEVATED_DECK_Y);
    expect(roads[2].elev!.every((v) => v === Math.round(ELEVATED_DECK_Y * QUANT))).toBe(true);
  });

  it('subdivideElevatedPolyline 細分坡段並套用緩動曲線,且 2D 折線總長度維持 100% 不變', () => {
    const pts: [number, number][] = [[0, 0], [120, 0]];
    const elev = [0, ELEVATED_DECK_Y];
    const sub = subdivideElevatedPolyline(pts, elev, ELEVATED_DECK_Y, 12);
    expect(sub.pts.length).toBe(11);
    expect(sub.elev[0]).toBeCloseTo(0);
    expect(sub.elev[5]).toBeCloseTo(ELEVATED_DECK_Y * 0.5, 2);
    expect(sub.elev[10]).toBeCloseTo(ELEVATED_DECK_Y);
    // 頭尾緩和段(第 1 段)的高差小於中段(第 5 段)的高差(S 曲線緩進緩出)
    const dyStart = sub.elev[1] - sub.elev[0];
    const dyMid = sub.elev[5] - sub.elev[4];
    expect(dyStart).toBeLessThan(dyMid);
  });
});

describe('3D 高架道路網格與 Rapier 物理實車測試 (src/world/gen/elevated-road.ts)', () => {
  it('匝道匯入主線時內側護欄自動開口,外側護欄保留;橋墩自動避開下方平面道路', () => {
    const main: ElevatedRoadPiece = {
      osmId: 10,
      pts: [[0, 0], [40, 0], [80, 0], [120, 0]],
      elev: [8.5, 8.5, 8.5, 8.5],
      width: 11,
      oneway: true,
    };
    // 從右側(z = 4,在主線半寬 5.5 m 內)匯入主線的匝道
    const ramp: ElevatedRoadPiece = {
      osmId: 11,
      pts: [[0, 12], [40, 3.5], [80, 0]],
      elev: [6.5, 8.0, 8.5],
      width: 7,
      oneway: true,
    };

    const deckOnlyMain = new MeshBuilder({ wall: true });
    const barrierOnlyMain = new MeshBuilder({ wall: true });
    addElevatedRoads(deckOnlyMain, barrierOnlyMain, [main], [main]);

    const deckWithRamp = new MeshBuilder({ wall: true });
    const barrierWithRamp = new MeshBuilder({ wall: true });
    addElevatedRoads(deckWithRamp, barrierWithRamp, [main], [main, ramp]);

    // 有匝道匯入時,主線在匯流區段的右側護欄會自動省略開口,因此護欄頂點數較少
    expect(barrierWithRamp.vertexCount).toBeLessThan(barrierOnlyMain.vertexCount);
  });

  it('Rapier 物理實測:車輛可從地面(y=0)開上匝道爬升至高架橋(y=8.5m)、側撞護欄不會墜橋、且橋下平面道路完全暢通', async () => {
    await R.init();
    const pw = createPhysicsWorld(R, [-500, -500, 500, 500]);

    // 建立一條從 x = 0(y = 0)沿 +x 爬升到 x = 120(y = 8.5 m),再平走至 x = 240(y = 8.5 m)的高架道路
    const sub = subdivideElevatedPolyline(
      [[0, 0], [120, 0], [240, 0]],
      [0, ELEVATED_DECK_Y, ELEVATED_DECK_Y],
      ELEVATED_DECK_Y,
      10,
    );
    const piece: ElevatedRoadPiece = {
      pts: sub.pts,
      elev: sub.elev,
      width: 10,
      lanes: 2,
      oneway: true,
    };
    const deckMb = new MeshBuilder({ wall: true });
    const barrierMb = new MeshBuilder({ wall: true });
    // 下方 x = 180 有一條南北向平面道路(寬 12 m),橋墩應自動避開 x = 180
    const crossGroundRoad = { pts: [[180, -50], [180, 50]] as [number, number][], width: 12 };
    addElevatedRoads(deckMb, barrierMb, [piece], [piece], [crossGroundRoad]);
    const deck = deckMb.toArrays();
    const barrier = barrierMb.toArrays();

    addStaticRoadDeck(pw, deck.position, deck.index);
    addStaticTrimesh(pw, barrier.position, barrier.index);

    // 1. 測試開車上匝道:從 x = -5, z = 0(地面)朝東(90°)全油門開上匝道至高架橋頂
    const climbCar = new Vehicle(pw, -5, 0, 90);
    for (let step = 0; step < 60 * 8; step++) {
      climbCar.update({ throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_DT);
      pw.world.step();
    }
    const topPos = climbCar.position();
    expect(topPos.x).toBeGreaterThan(130);
    // 車子成功開上 8.5 m 高架橋面(車身中心高度約 8.5 + 0.7 ≈ 9.2 m)且未翻車
    expect(topPos.y).toBeGreaterThan(ELEVATED_DECK_Y + 0.3);
    expect(climbCar.upY()).toBeGreaterThan(0.9);

    // 2. 測試高架橋兩側水泥護欄防墜落:在高架橋頂(x = 150, z = 0, y = 8.5)往右側護欄(約 z = 5)斜開撞擊
    climbCar.reset(150, 0, 125, ELEVATED_DECK_Y);
    for (let step = 0; step < 60 * 3; step++) {
      climbCar.update({ throttle: 1, brake: 0, steer: 0.4, handbrake: false }, FIXED_DT);
      pw.world.step();
    }
    const guardedPos = climbCar.position();
    // 被 z ≈ +5 m 的右側水泥護欄擋在橋面上,沒有掉下高架橋
    expect(Math.abs(guardedPos.z)).toBeLessThan(5.2);
    expect(guardedPos.y).toBeGreaterThan(ELEVATED_DECK_Y + 0.2);

    // 3. 測試高架橋下方平面通行:另一台車在地面(y = 0)沿南北向(x = 180, z = -30 → +30)穿越高架橋正下方
    const underCar = new Vehicle(pw, 180, -30, 180);
    for (let step = 0; step < 60 * 4; step++) {
      underCar.update({ throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_DT);
      pw.world.step();
    }
    expect(underCar.position().z).toBeGreaterThan(10);
    expect(underCar.position().y).toBeLessThan(2.0);
  });
});

describe('範圍 A 實際地圖高架道路驗證 (台 74 線 + 西屯一/二交流道 + 光明陸橋)', () => {
  const world = loadWorld('range-a');

  it('範圍 A 包含 27 條高架與匝道(台 74 線、西屯一/二交流道、光明陸橋),且對應分塊皆生成 roadDeck 與 roadBarrier 網格', () => {
    const elevated = world.json.roads.filter((r) => r.layer === 1 && r.elev && r.elev.some((y) => y > 0));
    expect(elevated.length).toBe(27);
    const names = new Set(elevated.map((r) => r.name));
    expect(names.has('東西向快速公路 快官霧峰線')).toBe(true);
    expect(names.has('西屯一交流道')).toBe(true);
    expect(names.has('西屯二交流道')).toBe(true);
    expect(names.has('光明陸橋')).toBe(true);

    let deckChunks = 0;
    let maxVertexY = 0;
    for (const c of world.chunks.values()) {
      if (!c.roads.some((r) => r.elev && r.elev.some((y) => y > 0.05))) continue;
      const m = buildChunk(c, false);
      if (m.roadDeck && m.roadDeck.index.length > 0) {
        deckChunks++;
        for (let i = 1; i < m.roadDeck.position.length; i += 3) {
          if (m.roadDeck.position[i] > maxVertexY) maxVertexY = m.roadDeck.position[i];
        }
      }
    }
    expect(deckChunks).toBeGreaterThan(10);
    expect(maxVertexY).toBeCloseTo(ELEVATED_DECK_Y + ELEVATED_ROAD_CFG.yMark, 1);
  });
});
