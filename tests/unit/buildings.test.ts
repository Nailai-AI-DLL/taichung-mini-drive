// 建築變化(decisions/0015 第三批):細分類、一樓店面判定、窗格用的沿牆距離、屋頂附加物。
// 實際資料的測試需要先建置:npm run map:build:range-a
import { describe, expect, it } from 'vitest';
import { buildingKind, hasShopTags, kindHeight, nearWideRoad, touchingCorners } from '../../tools/map-build/lib/buildings';
import { FLOOR_HEIGHT, KIND, SHOP_KINDS, TEMPLE_EST_FLOORS, type BuildingKind } from '../../src/config/buildings';
import { CODE_SEED, CODE_SHOP, MeshBuilder, packBuildingCode, unpackBuildingCode } from '../../src/world/gen/mesh';
import { extrude, PLAIN_CODE, roundCorners } from '../../src/world/gen/extrude';
import { addRoofProps } from '../../src/world/gen/roof-props';
import { pointInPolygon, type Pt } from '../../src/world/gen/geom';
import { buildChunk, buildingCode, colliderMeshes, extrudeBuilding } from '../../src/world/chunks';
import { FRAGMENT } from '../../src/render/building-material';
import { KIND_COUNT } from '../../src/config/buildings';
import { loadWorld } from '../helpers/load-map';

const GREY: [number, number, number] = [200, 200, 200];
const COLORS = { wall: GREY, shed: [GREY], tank: GREY, roof: GREY };
const rect = (w: number, l: number, x = 0, z = 0): Pt[] => [[x, z], [x + l, z], [x + l, z + w], [x, z + w]];

/** 擠出後在屋頂放附加物,回傳附加物網格與屋頂面 */
function props(ring: Pt[], h: number, kind: BuildingKind, id: number) {
  const mb = new MeshBuilder({ wall: true });
  const roof = extrude(mb, ring, h, GREY, GREY)!;
  const p = new MeshBuilder({ wall: true });
  addRoofProps(p, roof, kind, h / 3.2, id, COLORS);
  return { p, roof };
}

/** 附加物頂點都在屋頂外框內(xz)、不低於屋頂 */
function inside(p: MeshBuilder, roof: { ring: Pt[]; y: number }) {
  for (let i = 0; i < p.vertexCount; i++) {
    const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2];
    if (y < roof.y - 1e-6 || !pointInPolygon([x, z], roof.ring)) return false;
  }
  return true;
}

describe('細分類', () => {
  const k = (tags: Record<string, string>, area: number, height: number) => buildingKind(tags, area, height);
  it('building=* 的值直接對應', () => {
    expect(k({ building: 'house' }, 300, 30)).toBe(KIND.House);
    expect(k({ building: 'apartments' }, 100, 6)).toBe(KIND.Apartment);
    expect(k({ building: 'retail' }, 100, 6)).toBe(KIND.Commercial);
    expect(k({ building: 'school' }, 100, 6)).toBe(KIND.School);
    expect(k({ building: 'temple' }, 100, 6)).toBe(KIND.Temple);
    expect(k({ building: 'outbuilding' }, 100, 6)).toBe(KIND.Low);
    expect(k({ building: 'hospital' }, 100, 6)).toBe(KIND.Public);
  });
  it('宗教場所:基督教是公共建築,其他是廟宇', () => {
    expect(k({ building: 'yes', amenity: 'place_of_worship', religion: 'taoist' }, 100, 6)).toBe(KIND.Temple);
    expect(k({ building: 'church', amenity: 'place_of_worship', religion: 'christian' }, 100, 6)).toBe(KIND.Public);
  });
  it('residential / yes 依樓層與面積分成透天、一般、大樓', () => {
    expect(k({ building: 'residential' }, 80, 4 * 3.2)).toBe(KIND.House);
    expect(k({ building: 'yes' }, 80, 4 * 3.2)).toBe(KIND.House);
    expect(k({ building: 'residential' }, 400, 5 * 3.2)).toBe(KIND.Generic);
    expect(k({ building: 'residential' }, 80, 6 * 3.2)).toBe(KIND.Generic);
    expect(k({ building: 'residential' }, 80, 7 * 3.2)).toBe(KIND.Apartment);
  });
  it('非寺廟的宗教建築、building=yes 上的公家機關算公共;量販店算商辦(2026-11-01 驗收)', () => {
    expect(k({ building: 'mosque' }, 100, 6)).toBe(KIND.Public);
    expect(k({ building: 'yes', amenity: 'place_of_worship', religion: 'muslim' }, 100, 6)).toBe(KIND.Public);
    expect(k({ building: 'cathedral' }, 100, 6)).toBe(KIND.Public);
    expect(k({ building: 'religious' }, 100, 6)).toBe(KIND.Temple);
    expect(k({ building: 'yes', amenity: 'police' }, 100, 12.8)).toBe(KIND.Public);
    expect(k({ building: 'yes', amenity: 'library' }, 800, 12.8)).toBe(KIND.Public);
    expect(k({ building: 'yes', shop: 'supermarket' }, 800, 12.8)).toBe(KIND.Commercial);
  });
  it('building=yes 上的公廁、涼亭算低矮建築', () => {
    expect(k({ building: 'yes', amenity: 'toilets' }, 40, 3.2)).toBe(KIND.Low);
    expect(k({ building: 'yes', amenity: 'shelter' }, 40, 3.2)).toBe(KIND.Low);
  });
  it('公廁、涼亭、活動中心不算店面', () => {
    for (const a of ['toilets', 'shelter', 'community_centre', 'waste_transfer_station']) expect(hasShopTags({ amenity: a })).toBe(false);
  });
  it('商店標籤:shop、office、一般 amenity 算;廟、學校、停車場不算', () => {
    expect(hasShopTags({ shop: 'convenience' })).toBe(true);
    expect(hasShopTags({ amenity: 'restaurant' })).toBe(true);
    expect(hasShopTags({ amenity: 'place_of_worship' })).toBe(false);
    expect(hasShopTags({ amenity: 'parking' })).toBe(false);
    expect(hasShopTags({})).toBe(false);
  });
});

describe('廟宇高度(0015 §10.8)', () => {
  it('沒有高度資料的廟宇估 TEMPLE_EST_FLOORS 層;有資料的、其他類別照原值', () => {
    expect(TEMPLE_EST_FLOORS).toBe(2);
    expect(kindHeight(KIND.Temple, { height: 16, source: 'estimate' }).height).toBeCloseTo(TEMPLE_EST_FLOORS * FLOOR_HEIGHT);
    expect(kindHeight(KIND.Temple, { height: 16, source: 'levels' }).height).toBe(16);
    expect(kindHeight(KIND.Temple, { height: 16, source: 'height' }).height).toBe(16);
    expect(kindHeight(KIND.House, { height: 16, source: 'estimate' }).height).toBe(16);
  });
});

describe('一樓店面:臨大路判定', () => {
  // 東西向道路,路面 12 m、人行道 3 m:人行道外緣在 z = ±9
  const road = (width: number) => [{ pts: [[-100, 0], [100, 0]] as Pt[], width, half: width / 2 + 3 }];
  it('離人行道外緣 2 m 的建築算臨路,8 m 的不算', () => {
    const near = rect(10, 10, 0, 11);
    const far = rect(10, 10, 0, 17);
    expect(nearWideRoad([near, far], road(12))).toEqual([true, false]);
  });
  it('窄路(< SHOP_ROAD_MIN)旁不畫店面', () => {
    expect(nearWideRoad([rect(10, 10, 0, 7)], road(6))).toEqual([false]);
  });
  it('著色器拆代碼用的常數和 packBuildingCode 相同(兩邊各改一半會被擋下)', () => {
    expect(CODE_SHOP).toBe(KIND_COUNT);
    expect(CODE_SEED).toBe(CODE_SHOP * 2);
    expect(FRAGMENT).toContain(`int kind = int(mod(code, ${CODE_SHOP}.0));`);
    expect(FRAGMENT).toContain(`float shop = mod(floor(code / ${CODE_SHOP}.0), 2.0);`);
    expect(FRAGMENT).toContain(`float seed = floor(code / ${CODE_SEED}.0);`);
  });
  it('packBuildingCode 確實用 CODE_SHOP / CODE_SEED 打包(只改打包、拆開而不經過常數會被擋下)', () => {
    for (let kind = 0; kind < KIND_COUNT; kind++)
      for (const shop of [false, true])
        for (const seed of [0, 1, 77, 255]) expect(packBuildingCode(kind, shop, seed)).toBe(kind + (shop ? CODE_SHOP : 0) + seed * CODE_SEED);
  });
  it('建築代碼打包、拆開一致', () => {
    for (const [kind, shop, seed] of [[0, false, 0], [7, true, 255], [3, true, 128], [1, false, 77]] as const) {
      expect(unpackBuildingCode(packBuildingCode(kind, shop, seed))).toEqual({ kind, shop, seed });
    }
  });
});

describe('窗格:不畫窗的地方', () => {
  /** 牆面(法向量水平)頂點的 [y, 代碼];屋頂是水平面,著色器本來就不畫窗 */
  const codes = (mb: MeshBuilder) =>
    Array.from({ length: mb.vertexCount }, (_, i) => [mb.pos[i * 3 + 1], mb.wall![i * 3 + 1], mb.nor[i * 3 + 1]] as const)
      .filter(([, , ny]) => Math.abs(ny) < 0.5)
      .map(([y, c]) => [y, c] as const);

  it('高度不是層高倍數時,最後一個整層以上那段牆用不畫窗的代碼(窗不會被屋頂線切半)', () => {
    const mb = new MeshBuilder({ wall: true });
    mb.code = buildingCode(1, KIND.Apartment, false);
    extrude(mb, rect(5, 8), 10, GREY, GREY); // 面積 40,不做女兒牆;整層到 9.6 m
    for (const [y, c] of codes(mb)) {
      if (y > 9.6 + 1e-6) expect(c).toBe(PLAIN_CODE);
    }
    expect(codes(mb).some(([y, c]) => y <= 9.6 && c === mb.code)).toBe(true);
  });

  it('女兒牆(頂面、內側牆)用不畫窗的代碼', () => {
    const mb = new MeshBuilder({ wall: true });
    mb.code = buildingCode(1, KIND.Apartment, false);
    extrude(mb, rect(20, 30), 32, GREY, GREY); // 層高倍數,有女兒牆
    // 外牆一段從 0 到女兒牆頂(層高倍數時,0.6 m 高的女兒牆不會落在窗的範圍);牆頂高度 32 m 的牆面頂點只有女兒牆內側牆
    const atRoof = codes(mb).filter(([y]) => Math.abs(y - 32) < 1e-6);
    expect(atRoof.length).toBeGreaterThan(0);
    for (const [, c] of atRoof) expect(c).toBe(PLAIN_CODE);
  });

  it('廟宇不做女兒牆(否則會從斜屋頂的屋簷穿出;2026-11-01 驗收 66 棟中 46 棟)', () => {
    const mb = new MeshBuilder({ wall: true });
    extrudeBuilding(mb, { id: 3, h: 12.8, t: KIND.Temple, s: false, rings: [rect(12, 20)] });
    let top = 0;
    for (let i = 0; i < mb.vertexCount; i++) top = Math.max(top, mb.pos[i * 3 + 1]);
    expect(top).toBeCloseTo(12.8, 6);
  });
});

describe('窗格:沿牆距離', () => {
  it('沿外牆一路累加到周長,沒有任何一面牆從周長跳回 0(否則那面牆的窗會擠成一團)', () => {
    const mb = new MeshBuilder({ wall: true });
    const ring = rect(8, 20);
    extrude(mb, ring, 3.2, GREY, GREY);
    const wall = mb.wall!;
    const u = (v: number) => wall[v * 3];
    let maxSpan = 0;
    let maxU = 0;
    for (let i = 0; i < mb.idx.length; i += 3) {
      const tri = [mb.idx[i], mb.idx[i + 1], mb.idx[i + 2]];
      // 只看牆面(法向量水平)
      if (Math.abs(mb.nor[tri[0] * 3 + 1]) > 0.5) continue;
      const us = tri.map(u);
      maxSpan = Math.max(maxSpan, Math.max(...us) - Math.min(...us));
      maxU = Math.max(maxU, ...us);
    }
    // 圓角後的周長略小於 56 m;最長的一面牆 < 20 m
    expect(maxU).toBeGreaterThan(50);
    expect(maxU).toBeLessThanOrEqual(56);
    expect(maxSpan).toBeLessThanOrEqual(20);
  });
});

describe('屋頂附加物', () => {
  it('窄長透天(5 × 14 m):大多數棟有附加物,而且全部在屋頂內(回歸:擺放時邊距多扣一次,角壓在屋頂邊線上,全部判定放不下)', () => {
    let withProps = 0;
    for (let id = 1; id <= 200; id++) {
      const { p, roof } = props(rect(5, 14), 4 * 3.2, KIND.House, id);
      if (p.vertexCount) withProps++;
      expect(inside(p, roof)).toBe(true);
    }
    // 水塔 80%、鐵皮加蓋 50%:至少 70% 有東西
    expect(withProps).toBeGreaterThan(140);
  });

  it('大樓有屋突,學校、低矮建築沒有附加物', () => {
    const big = rect(20, 40);
    expect(props(big, 12 * 3.2, KIND.Apartment, 7).p.vertexCount).toBeGreaterThan(0);
    expect(props(big, 4 * 3.2, KIND.School, 7).p.vertexCount).toBe(0);
    expect(props(big, 2 * 3.2, KIND.Low, 7).p.vertexCount).toBe(0);
  });

  it('有屋簷的斜屋頂:每片朝上的坡面都有朝下的底面(兩側與山牆端仰看都不透空)', () => {
    const { p } = props(rect(12, 20), 6, KIND.Temple, 3);
    let up = 0, down = 0;
    for (let i = 0; i < p.idx.length; i += 3) {
      const ny = p.nor[p.idx[i] * 3 + 1];
      if (ny > 0.3) up++;
      else if (ny < -0.3) down++;
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBe(up);
  });

  it('廟宇:矩形外框加斜屋頂(屋脊高於屋頂);L 形外框維持平頂', () => {
    const { p, roof } = props(rect(12, 20), 6, KIND.Temple, 3);
    expect(p.vertexCount).toBeGreaterThan(0);
    let top = 0;
    for (let i = 0; i < p.vertexCount; i++) top = Math.max(top, p.pos[i * 3 + 1]);
    expect(top).toBeGreaterThan(roof.y + 3);
    const L: Pt[] = [[0, 0], [20, 0], [20, 6], [6, 6], [6, 20], [0, 20]];
    expect(props(L, 6, KIND.Temple, 3).p.vertexCount).toBe(0);
  });
});

describe('和隔壁相接的轉角不做圓角(連棟透天的星形破洞,0015 §10.6)', () => {
  const has = (ring: Pt[], p: Pt) => ring.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9);

  it('兩棟共用一條邊:共用的兩個轉角兩棟都標出;離 0.2 m 的也算;離 2 m 的不算', () => {
    const a = rect(10, 5, 0, 0);
    const b = rect(10, 5, 5, 0); // 共用 x = 5 那條邊
    const c = rect(10, 5, 10.2, 0); // 和 b 相隔 0.2 m
    const far = rect(10, 5, 30, 0);
    const t = touchingCorners([a, b, c, far]);
    expect(t[0].sort()).toEqual([1, 2]);
    expect(t[1].sort()).toEqual([0, 1, 2, 3]);
    expect(t[2].sort()).toEqual([0, 3]);
    expect(t[3]).toEqual([]);
  });

  it('標出的轉角保留原位置,其他轉角照樣做圓角', () => {
    const ring = rect(10, 5);
    const out = roundCorners(ring, 1.2, 2, [false, true, true, false]);
    expect(has(out, ring[1])).toBe(true);
    expect(has(out, ring[2])).toBe(true);
    expect(has(out, ring[0])).toBe(false);
  });

  it('順時針外框(擠出時會反轉)的旗標跟著頂點走', () => {
    const cw: Pt[] = [...rect(10, 5)].reverse();
    const mb = new MeshBuilder({ wall: true });
    const roof = extrude(mb, cw, 3.2, GREY, GREY, [], [true, false, false, false])!;
    expect(has(roof.ring, cw[0])).toBe(true);
    expect(has(roof.ring, cw[1])).toBe(false);
  });

  it('沒做圓角的直角轉角,牆面法向量分開(不取平均,轉角附近才不會有明暗漸層)', () => {
    const mb = new MeshBuilder({ wall: true });
    extrude(mb, rect(10, 5), 3.2, GREY, GREY, [], [true, true, true, true]);
    for (let i = 0; i < mb.vertexCount; i++) {
      if (Math.abs(mb.nor[i * 3 + 1]) > 0.5) continue;
      const nx = Math.abs(mb.nor[i * 3]), nz = Math.abs(mb.nor[i * 3 + 2]);
      expect(Math.max(nx, nz)).toBeCloseTo(1, 6);
    }
  });
});

describe('範圍 A 實際資料', () => {
  const world = loadWorld('range-a');
  const bs = world.json.buildings;

  it('每棟都有細分類;店面只出現在會畫店面的類別', () => {
    for (const b of bs) {
      expect(b.t).toBeGreaterThanOrEqual(0);
      expect(b.t).toBeLessThanOrEqual(7);
      if (b.s) expect(SHOP_KINDS).toContain(b.t);
    }
  });

  it('類別分佈合理:透天最多;廟宇、學校都有;店面 10–50%', () => {
    const count = (t: number) => bs.filter((b) => b.t === t).length;
    expect(count(KIND.House)).toBeGreaterThan(bs.length * 0.3);
    expect(count(KIND.Temple)).toBeGreaterThan(50);
    expect(count(KIND.School)).toBeGreaterThan(200);
    const shop = bs.filter((b) => b.s).length / bs.length;
    expect(shop).toBeGreaterThan(0.1);
    expect(shop).toBeLessThan(0.5);
  });

  it('廟宇:建物圖的實測樓層多數 ≤ 3 層,沒有超過 4 層的(0039:OSM 廟宇外框包到的大樓不繼承廟宇)', () => {
    const temples = bs.filter((b) => b.t === KIND.Temple);
    expect(temples.length).toBeGreaterThan(50);
    expect(temples.filter((b) => b.h <= Math.round(3 * FLOOR_HEIGHT * 10)).length).toBeGreaterThan(temples.length * 0.7);
    expect(temples.filter((b) => b.g && b.h > Math.round(4 * FLOOR_HEIGHT * 10)).length).toBe(0);
  });

  it('兩棟共用的外框頂點,在兩棟都標成不做圓角(100%)', () => {
    const users = new Map<string, { b: number; i: number }[]>();
    bs.forEach((b, bi) => {
      const r = b.rings[0];
      for (let i = 0; i * 2 < r.length; i++) {
        const k = `${r[i * 2]},${r[i * 2 + 1]}`;
        const list = users.get(k) ?? [];
        list.push({ b: bi, i });
        users.set(k, list);
      }
    });
    let shared = 0;
    for (const list of users.values()) {
      if (new Set(list.map((u) => u.b)).size < 2) continue;
      for (const u of list) {
        shared++;
        expect(bs[u.b].c ?? []).toContain(u.i);
      }
    }
    expect(shared).toBeGreaterThan(10000);
  });

  it('附加物頂點都在所屬建築外框的範圍內(不會飄到路上;廟宇屋簷除外),透天 60% 以上有附加物', () => {
    let houses = 0;
    let housesWithProps = 0;
    let checked = 0;
    for (const c of world.chunks.values()) {
      for (const b of c.buildings) {
        if (b.t === KIND.Temple || b.rings.length > 1) continue;
        const { p, roof } = props(b.rings[0], b.h, b.t, b.id);
        if (b.t === KIND.House) {
          houses++;
          if (p.vertexCount) housesWithProps++;
        }
        if (p.vertexCount) {
          checked++;
          expect(inside(p, roof)).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(3000);
    expect(housesWithProps / houses).toBeGreaterThan(0.6);
  });

  it('分塊輸出的附加物網格有牆面屬性,頂點數與牆面屬性長度一致;附加物全用不畫窗的代碼;碰撞體不含附加物', () => {
    const c = [...world.chunks.values()].sort((a, b) => b.buildings.length - a.buildings.length)[0];
    const m = buildChunk(c);
    for (let i = 1; i < m.roofProps.wall!.length; i += 3) expect(m.roofProps.wall![i]).toBe(PLAIN_CODE);
    const col = colliderMeshes(m);
    expect(col).not.toContain(m.roofProps);
    expect(col).toEqual([m.buildings, ...m.landmarkSolids]);
    expect(m.roofProps.index.length).toBeGreaterThan(0);
    expect(m.roofProps.wall!.length).toBe((m.roofProps.position.length / 3) * 3);
    expect(m.buildings.wall!.length).toBe((m.buildings.position.length / 3) * 3);
  });
});

// 0023:參考台中七期 FPS 專案的立面(窗放大、窗台線、玻璃反光);?bld=old 換回舊外觀
import { FACADE_DETAIL, KIND_COUNT as KC, WINDOW_STYLE as WS, WINDOW_STYLE_OLD, buildingLookFromSearch } from '../../src/config/buildings';

describe('建築立面 0023(參考 FPS 專案)', () => {
  it('網址預設新外觀,?bld=old 換回舊外觀', () => {
    expect(buildingLookFromSearch('')).toBe('fps');
    expect(buildingLookFromSearch('?bld=old')).toBe('old');
  });

  it('每個細分類都有窗格、舊窗格與立面細節;窗不超出週期、上緣不超過層高', () => {
    for (const t of [WS, WINDOW_STYLE_OLD, FACADE_DETAIL]) expect(t.length).toBe(KC);
    for (const [p, w, lo, hi] of WS.filter(([, w]) => w > 0)) {
      expect(w).toBeLessThan(p);
      expect(hi).toBeLessThanOrEqual(3.2);
      expect(lo).toBeLessThan(hi);
    }
  });

  it('有窗的類別窗牆比都比舊版大;不畫窗的類別不畫窗台線和反光', () => {
    WS.forEach(([p, w, lo, hi], k) => {
      const [op, ow, olo, ohi] = WINDOW_STYLE_OLD[k];
      if (w === 0) {
        expect(FACADE_DETAIL[k]).toEqual([0, 0]);
        return;
      }
      expect((w / p) * (hi - lo)).toBeGreaterThan((ow / op) * (ohi - olo));
    });
    expect(FACADE_DETAIL[KIND.Commercial][0]).toBe(0); // 帷幕牆沒有窗台線
  });

  it('著色器有用到窗台線與反光的 uniform', () => {
    expect(FRAGMENT).toContain('vec2 det = uDetail[kind];');
    expect(FRAGMENT).toContain('uGlintFrac');
    expect(FRAGMENT).toContain('uSill');
  });
});
