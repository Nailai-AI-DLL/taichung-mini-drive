// 地圖建置主程式(格式 v2,見 docs/decisions/0012)。
// 用法:npx tsx tools/map-build/build.ts --area range-a
// 輸入:data/osm/raw/<area>/<area>_area.json(Overpass out geom)、data/overrides/*.json、
//      政府路寬對應結果(tools/research/road_width_match.py --out-widths 產生,選用)
// 輸出:public/map/<area>/world.json(只含 2D 描述;網格在執行端分塊生成),並在終端印出統計與道路連通檢查。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { lonLatToTm2, lonLatToWorld, type Origin } from '../../src/map/projection';
import { QUANT, type WorldArea, type WorldBuilding, type WorldFurniture, type WorldJson, type WorldLandmark, type WorldRoad, type WorldStreet, type WorldWaterway } from '../../src/map/types';
import { areaCentroid, assembleRings, centroid, cleanRing, clipPolygon, clipPolyline, inRect, pointInPolygon, signedArea, type Pt, type Rect } from '../../src/world/gen/geom';
import { defaultWidth, isDrivable, isOneway, resolveWidth, runsAlongside, splitWidth } from './lib/roads';
import { buildingHeight, buildingKind, hasShopTags, kindHeight, nearWideRoad, touchingCorners, type HeightSource } from './lib/buildings';
import { KIND, SHOP_KINDS } from '../../src/config/buildings';
import { placeFurniture, type FurnitureRoad } from './lib/furniture';
import { crossingMarked, generateStreet, type StreetCrossing, type StreetResult, type StreetWay } from './lib/street';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface AreaConfig {
  raw: string;
  /** 點資料(公車站;tools/map-build/fetch-range-a-nodes.sh 下載);沒有就不放公車站 */
  nodes?: string;
  /** 區域中心(經緯度),同時是世界座標原點 */
  center: [number, number]; // [lat, lon]
  halfX: number; // 東西半寬(公尺)
  halfZ: number; // 南北半高(公尺)
  spawnRoad: string; // 出生點所在道路名稱
  /** 出生點取 spawnRoad 上最接近這個經緯度的點 */
  spawnNear: [number, number]; // [lat, lon]
  /** 政府路寬對應結果(選用) */
  govWidths?: string;
  /** 街道細節(標線、分隔島、路緣)的範圍:'all' = 整個區域,或中心經緯度與半寬(公尺);沒有就不產生(decisions/0015) */
  detail?: 'all' | { center: [number, number]; half: number };
}

const OPERA_HOUSE: [number, number] = [24.16293, 120.64052];

const AREAS: Record<string, AreaConfig> = {
  // M0:臺中國家歌劇院(OSM way 222636759 中心,見 data/osm/derived/landmarks.json)周邊 1 km × 1 km
  m0: { raw: 'data/osm/raw/m0/m0_area.json', center: OPERA_HOUSE, halfX: 500, halfZ: 500, spawnRoad: '惠來路二段', spawnNear: OPERA_HOUSE },
  // 範圍 A:台中車站 ↔ 七期(24.130,120.630,24.175,120.695),約 6.6 × 5.0 km(production-plan.md §4.1)
  'range-a': {
    raw: 'data/osm/raw/range-a/range-a_area.json',
    nodes: 'data/osm/raw/range-a/range-a_nodes.json',
    center: [24.1525, 120.6625],
    halfX: 3300,
    halfZ: 2490,
    spawnRoad: '惠來路二段',
    spawnNear: OPERA_HOUSE,
    govWidths: 'data/gov/road-width/widths-range-a.json',
    // 2026-10-31 先做樣張區(歌劇院周邊 1 km × 1 km:{ center: OPERA_HOUSE, half: 500 }),Cooper 看過後同意鋪到整區
    detail: 'all',
  },
};

const CHUNK_SIZE = 250;

interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  /** node 才有 */
  lat?: number;
  lon?: number;
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}

const q = (v: number) => Math.round(v * QUANT);
const qPts = (pts: Pt[]) => pts.flatMap((p) => [q(p[0]), q(p[1])]);
const dequantPts = (v: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i] / QUANT, v[i + 1] / QUANT]);
  return out;
};

function main() {
  const areaName = process.argv[process.argv.indexOf('--area') + 1] ?? 'm0';
  const cfg = AREAS[areaName];
  if (!cfg) throw new Error(`未知區域:${areaName}`);
  const raw = JSON.parse(readFileSync(join(ROOT, cfg.raw), 'utf8'));
  const els: OsmEl[] = raw.elements;

  const [oe, on] = lonLatToTm2(cfg.center[1], cfg.center[0]);
  const origin: Origin = { e: Math.round(oe), n: Math.round(on) };
  const rect: Rect = { minX: -cfg.halfX, minZ: -cfg.halfZ, maxX: cfg.halfX, maxZ: cfg.halfZ };
  const toW = (g: { lat: number; lon: number }): Pt => lonLatToWorld(g.lon, g.lat, origin);

  const widthOverrides = loadOverrides('road-width.json');
  const gov = cfg.govWidths && existsSync(join(ROOT, cfg.govWidths)) ? JSON.parse(readFileSync(join(ROOT, cfg.govWidths), 'utf8')).byOsmId : {};
  // 地標(decisions/0013):這些 OSM 建築不進一般建築,改輸出成地標
  const landmarkCfg: { id: string; name: string; osmIds: number[]; model: string; height?: number }[] = JSON.parse(
    readFileSync(join(ROOT, 'data/landmarks/landmarks.json'), 'utf8'),
  ).landmarks;
  const landmarkOf = new Map<number, (typeof landmarkCfg)[number]>();
  for (const l of landmarkCfg) for (const id of l.osmIds) landmarkOf.set(id, l);
  const landmarkRings = new Map<string, { rings: Pt[][]; h: number }>();
  const roads: WorldRoad[] = [];
  const buildings: WorldBuilding[] = [];
  const areas: WorldArea[] = [];
  const waterways: WorldWaterway[] = [];
  const stats: Record<string, number> = {};
  const inc = (k: string, v = 1) => (stats[k] = (stats[k] ?? 0) + v);

  // 政府路寬的後處理(平行 way 平分、沿河排除)需要完整幾何,先記下來
  const govWays: { id: number; tags: Record<string, string>; line: Pt[]; carriage: number; pieces: WorldRoad[] }[] = [];
  const waterLines = els
    .filter((e) => e.type === 'way' && e.tags?.waterway && e.geometry)
    .map((e) => e.geometry!.map(toW));

  // 街道細節用:可行駛道路(含 node id,寬度在政府路寬後處理完才定)與行人穿越道
  const streetWays: { id: number; tags: Record<string, string>; nodes: number[]; line: Pt[]; pieces: WorldRoad[] }[] = [];
  const crossings: StreetCrossing[] = [];

  // 連通檢查用:OSM node → 道路
  const nodeToWays = new Map<number, number[]>();
  // 街道傢俱用(第四批):OSM lit、bridge
  const roadExtra = new Map<number, { lit: boolean; bridge: boolean }>();
  const wayLength: number[] = [];

  const addBuilding = (id: number, t: Record<string, string>, outer: Pt[], holes: Pt[][]) => {
    const ring = cleanRing(outer);
    if (ring.length < 3) return;
    if (!inRect(centroid(ring), rect)) return;
    const area = Math.abs(signedArea(ring)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
    const est = buildingHeight(id, t, area);
    const lm = landmarkOf.get(id);
    if (lm) {
      const e = landmarkRings.get(lm.id) ?? { rings: [], h: 0 };
      e.rings.push(ring);
      e.h = Math.max(e.h, est.height);
      landmarkRings.set(lm.id, e);
      inc('landmarkFootprints');
      return;
    }
    const kind = buildingKind(t, area, est.height);
    const { height, source } = kindHeight(kind, est);
    buildings.push({ id, h: Math.round(height * 10), t: kind, ...(hasShopTags(t) && SHOP_KINDS.includes(kind) && { s: 1 as const }), rings: [ring, ...holes].map(qPts) });
    inc('buildings');
    inc(`buildingKind_${Object.keys(KIND)[kind]}`);
    if (holes.length) inc('buildingsWithCourtyard');
    inc(`heightFrom_${source satisfies HeightSource}`);
  };

  for (const el of els) {
    const t = el.tags ?? {};
    // ---- 道路 ----
    if (el.type === 'way' && t.highway && el.geometry) {
      if (crossingMarked(t) && el.nodes) {
        crossings.push({ id: el.id, nodes: el.nodes, line: el.geometry.map(toW), signals: t.crossing === 'traffic_signals' });
        continue;
      }
      if (!isDrivable(t)) continue;
      const line = el.geometry.map(toW);
      const pieces = clipPolyline(line, rect);
      if (!pieces.length) continue;
      const { width, sidewalk, from, carriage } = resolveWidth(el.id, t, widthOverrides, gov);
      const oneway = isOneway(t);
      roadExtra.set(el.id, { lit: t.lit === 'yes', bridge: !!t.bridge && t.bridge !== 'no' });
      const wayPieces: WorldRoad[] = [];
      if (carriage !== undefined) govWays.push({ id: el.id, tags: t, line, carriage, pieces: wayPieces });
      if (el.nodes) {
        const rev = t.oneway === '-1';
        streetWays.push({ id: el.id, tags: t, nodes: rev ? [...el.nodes].reverse() : el.nodes, line: rev ? [...line].reverse() : line, pieces: wayPieces });
      }
      for (const piece of pieces) {
        // oneway=-1 表示行車方向與折線相反;統一存成行車方向
        const pts = t.oneway === '-1' ? [...piece].reverse() : piece;
        const road: WorldRoad = {
          osmId: el.id,
          name: t.name ?? '',
          nameEn: t['name:en'] ?? '',
          highway: t.highway,
          oneway,
          width: round2(width),
          sidewalk,
          widthFrom: from,
          pts: qPts(pts),
        };
        roads.push(road);
        wayPieces.push(road);
        const len = polyLen(pts);
        inc('roadLengthM', len);
        inc(t.name ? 'roadLengthNamedM' : 'roadLengthUnnamedM', len);
        inc(`roadLengthWidthFrom_${from}M`, len);
      }
      inc('roadWays');
      const wi = wayLength.push(pieces.reduce((s, p) => s + polyLen(p), 0)) - 1;
      for (const n of el.nodes ?? []) {
        const arr = nodeToWays.get(n) ?? [];
        arr.push(wi);
        nodeToWays.set(n, arr);
      }
      continue;
    }
    // ---- 建築 ----
    if (el.type === 'way' && t.building && el.geometry) {
      addBuilding(el.id, t, el.geometry.map(toW), []);
      continue;
    }
    if (el.type === 'relation' && t.building && el.members) {
      // multipolygon:外環各自成一棟,內環依位置分給包含它的外環
      const part = (role: (r: string) => boolean) =>
        assembleRingsByPoint(el.members!.filter((m) => m.type === 'way' && role(m.role) && m.geometry).map((m) => m.geometry!.map(toW)));
      const outers = part((r) => r !== 'inner');
      const inners = part((r) => r === 'inner').map(cleanRing).filter((r) => r.length >= 3);
      for (const o of outers) {
        const holes = inners.filter((h) => pointInPolygon(centroid(h), o));
        addBuilding(el.id, t, o, holes);
      }
      inc('buildingRelations');
      continue;
    }
    // ---- 水系(線) ----
    if (el.type === 'way' && t.waterway && el.geometry) {
      const w = t.waterway === 'river' || t.waterway === 'canal' ? 8 : 3;
      for (const piece of clipPolyline(el.geometry.map(toW), rect)) waterways.push({ w, pts: qPts(piece) });
      inc('waterways');
      continue;
    }
    // ---- 綠地、水面(面) ----
    const isGreen = t.leisure || t.landuse || (t.natural && t.natural !== 'water');
    const isWater = t.natural === 'water';
    if (!isGreen && !isWater) continue;
    const k: WorldArea['k'] = isWater ? 2 : t.leisure === 'pitch' ? 1 : 0;
    let rings: Pt[][] = [];
    if (el.type === 'way' && el.geometry && el.nodes && el.nodes[0] === el.nodes[el.nodes.length - 1]) {
      rings = [el.geometry.map(toW)];
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members
        .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry)
        .map((m) => m.geometry!.map(toW));
      rings = assembleRingsByPoint(outers);
    }
    for (const r0 of rings) {
      const r = clipPolygon(cleanRing(r0), rect);
      if (r.length >= 3) {
        areas.push({ k, ring: qPts(r) });
        inc(isWater ? 'waterAreas' : 'greenAreas');
      }
    }
  }

  // ---- 政府路寬後處理(decisions/0011)----
  // 1. 沿河道路:政府路寬常把河道算進去(例:梅川西路),河道在路寬一半以內且平行時改用預設寬度
  // 2. 同一條路在 OSM 拆成幾條同名平行 way(分隔幹道、快慢車道):路面依 way 數平分
  const byName = new Map<string, typeof govWays>();
  for (const w of govWays) {
    const n = w.tags.name ?? '';
    byName.set(n, [...(byName.get(n) ?? []), w]);
  }
  for (const w of govWays) {
    const g = gov[String(w.id)].w as number;
    const len = w.pieces.reduce((s, r) => s + polyLen(dequantPts(r.pts)), 0);
    if (waterLines.some((wl) => runsAlongside(w.line, wl, g / 2))) {
      const d = defaultWidth(w.id, w.tags, widthOverrides);
      for (const r of w.pieces) Object.assign(r, { width: round2(d.width), sidewalk: d.sidewalk, widthFrom: 'default' });
      inc('roadLengthWidthFrom_govM', -len);
      inc('roadLengthWidthFrom_defaultM', len);
      inc('govRejectedNearWaterM', len);
      continue;
    }
    const siblings = (byName.get(w.tags.name ?? '') ?? []).filter((o) => o !== w && runsAlongside(w.line, o.line, g / 2)).length;
    // 寬路(≥ 20 m)上的單行 way 一定只是其中一個方向;對向 way 分段位置錯開時可能偵測不到,至少平分成 2 份
    const n = Math.max(siblings + 1, isOneway(w.tags) && g >= 20 ? 2 : 1);
    if (n > 1) {
      const width = round2(splitWidth(w.carriage, n));
      for (const r of w.pieces) r.width = width;
      inc(`govSplitInto${n}M`, len);
    }
  }

  // ---- 街道細節(decisions/0015):用政府路寬後處理完的寬度 ----
  let street: WorldStreet | undefined;
  let streetRaw: StreetResult | undefined;
  let detailRect: Rect | undefined;
  if (cfg.detail) {
    if (cfg.detail === 'all') detailRect = rect;
    else {
      const [dx, dz] = toW({ lat: cfg.detail.center[0], lon: cfg.detail.center[1] });
      const h = cfg.detail.half;
      detailRect = { minX: dx - h, minZ: dz - h, maxX: dx + h, maxZ: dz + h };
    }
    const sw: StreetWay[] = streetWays
      .filter((w) => w.pieces.length)
      .map((w) => ({ id: w.id, name: w.tags.name ?? '', highway: w.tags.highway, oneway: isOneway(w.tags), width: w.pieces[0].width, sidewalk: w.pieces[0].sidewalk, nodes: w.nodes, line: w.line }));
    streetRaw = generateStreet(sw, crossings);
    street = quantStreet(streetRaw, detailRect);
    stats.streetStrips = street.strips.length;
    stats.streetCrosswalks = street.crosswalks.length;
    stats.streetMedians = street.medians.length;
    stats.streetJunctions = street.junctions!.length;
  }

  // ---- 地標:位置 = 所有外框的面積加權形心;外框中心落在地標外框內的一般建築(附屬棟、重複描繪)一併挖掉 ----
  const landmarks: WorldLandmark[] = [];
  for (const l of landmarkCfg) {
    const e = landmarkRings.get(l.id);
    if (!e) {
      console.warn(`地標 ${l.id} 的 OSM 外框不在區域內,略過`);
      continue;
    }
    let ax = 0, az = 0, at = 0;
    for (const r of e.rings) {
      const a = Math.abs(signedArea(r));
      const [cx, cz] = areaCentroid(r);
      ax += cx * a;
      az += cz * a;
      at += a;
    }
    const x = ax / at, z = az / at;
    // 有查到實際高度(landmarks.json 的 height,附出處)就用實際值,否則用 OSM 標籤或樓層推估
    const h = l.height ?? e.h;
    landmarks.push({ id: l.id, name: l.name, model: l.model, x: round2(x), z: round2(z), h: Math.round(h * 10), rings: e.rings.map((r) => qPts(r.map(([px, pz]) => [px - x, pz - z] as Pt))) });
    for (let i = buildings.length - 1; i >= 0; i--) {
      const c = centroid(dequantPts(buildings[i].rings[0]));
      if (e.rings.some((r) => pointInPolygon(c, r))) {
        inc(`buildingKind_${Object.keys(KIND)[buildings[i].t]}`, -1);
        buildings.splice(i, 1);
        inc('buildingsRemovedUnderLandmarks');
        inc('buildings', -1);
      }
    }
  }

  // ---- 一樓店面:臨大路(人行道外緣 SHOP_REACH 內)的建築,一樓畫店面(decisions/0015 第三批) ----
  const nearRoad = nearWideRoad(
    buildings.map((b) => dequantPts(b.rings[0])),
    roads.map((r) => ({ pts: dequantPts(r.pts), width: r.width, half: r.width / 2 + r.sidewalk })),
  );
  // ---- 和隔壁相接的轉角不做圓角(0015 §10.6);用量化後的外框算,索引才和執行端一致 ----
  const touch = touchingCorners(buildings.map((b) => dequantPts(b.rings[0])));
  buildings.forEach((b, i) => {
    if (touch[i].length) {
      b.c = touch[i];
      inc('buildingsTouching');
      inc('buildingCornersSharp', touch[i].length);
    }
  });
  buildings.forEach((b, i) => {
    if (nearRoad[i] && SHOP_KINDS.includes(b.t as (typeof SHOP_KINDS)[number])) b.s = 1;
    if (b.s) inc('buildingShopfront');
  });

  // ---- 街道傢俱(decisions/0015 第四批):行道樹、路燈、號誌桿、機車、招牌、公車站;只在街道細節範圍內 ----
  let furniture: WorldFurniture | undefined;
  if (streetRaw && detailRect) {
    const dr = detailRect;
    const busNodes: OsmEl[] = cfg.nodes && existsSync(join(ROOT, cfg.nodes)) ? JSON.parse(readFileSync(join(ROOT, cfg.nodes), 'utf8')).elements : [];
    const busStops = busNodes
      .filter((n) => n.type === 'node' && n.lat !== undefined)
      .map((n) => ({ p: toW({ lat: n.lat!, lon: n.lon! }), shelter: n.tags?.shelter === 'yes' }))
      .filter((b) => inRect(b.p, rect));
    stats.busStopNodes = busStops.length;
    const fr: FurnitureRoad[] = roads.map((r) => ({ id: r.osmId, name: r.name, highway: r.highway, width: r.width, sidewalk: r.sidewalk, ...(roadExtra.get(r.osmId) ?? { lit: false, bridge: false }), pts: dequantPts(r.pts) }));
    const f = placeFurniture(
      fr,
      {
        shops: buildings.filter((b) => b.s).map((b) => dequantPts(b.rings[0])),
        waterways: waterways.map((w) => ({ pts: dequantPts(w.pts), w: w.w })),
        junctions: streetRaw.junctions,
        shopBuildings: buildings.filter((b) => b.s).map((b) => ({ ring: dequantPts(b.rings[0]), h: b.h / 10, id: b.id })),
        rings: [...buildings.map((b) => dequantPts(b.rings[0])), ...landmarks.flatMap((l) => l.rings.map((r) => dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt)))], water: areas.filter((a) => a.k === 2).map((a) => dequantPts(a.ring)) },
      streetRaw.crosswalks.map((c) => ({ p: c.p, v: [Math.cos(c.v), Math.sin(c.v)] as Pt, reach: c.reach, sig: c.sig })),
      busStops,
    );
    const ang = (a: number) => Math.round(a * 1000);
    furniture = { trees: [], lights: [], signals: [], scooters: [], signs: [], busStops: [] };
    f.trees.forEach((p, i) => inRect(p, dr) && furniture!.trees.push(q(p[0]), q(p[1]), f.treeKinds[i]));
    for (const s of f.signs) if (inRect(s.p, dr)) furniture.signs.push(q(s.p[0]), q(s.p[1]), ang(s.a), Math.round(s.y0 * 10), Math.round(s.y1 * 10), s.c);
    for (const b of f.busStops) if (inRect(b.p, dr)) furniture.busStops.push(q(b.p[0]), q(b.p[1]), ang(b.a), b.shelter ? 1 : 0);
    stats.furnitureSigns = furniture.signs.length / 6;
    stats.furnitureBusStops = furniture.busStops.length / 4;
    // 統計一律從寫進 world.json 的陣列算(驗收 2026-11-01:原本用未裁切的結果,數字和 world.json 對不上)
    for (let i = 3; i < furniture.busStops.length; i += 4) inc('furnitureBusShelters', furniture.busStops[i]);
    for (let i = 2; i < furniture.trees.length; i += 3) inc(`furnitureTreeKind${furniture.trees[i]}`);
    for (const l of f.lights) if (inRect(l.p, dr)) furniture.lights.push(q(l.p[0]), q(l.p[1]), ang(l.a));
    for (const s of f.signals) if (inRect(s.p, dr)) furniture.signals.push(q(s.p[0]), q(s.p[1]), ang(s.a), Math.round(s.arm * 10));
    for (const s of f.scooters) if (inRect(s.p, dr)) furniture.scooters.push(q(s.p[0]), q(s.p[1]), ang(s.a), s.n, ang(s.f));
    stats.furnitureScooterRows = furniture.scooters.length / 5;
    for (let i = 3; i < furniture.scooters.length; i += 5) inc('furnitureScooters', furniture.scooters[i]);
    stats.furnitureTrees = furniture.trees.length / 3;
    stats.furnitureLights = furniture.lights.length / 3;
    stats.furnitureSignals = furniture.signals.length / 4;
    stats.signalCrosswalks = streetRaw.crosswalks.filter((c) => c.sig).length;
  }

  // 給 Blender 地標腳本用的外框:原點 = 地標形心,Blender 座標 X = 東、Y = 北(= 世界 -Z),單位公尺
  writeFileSync(
    join(ROOT, `data/landmarks/footprints-${areaName}.json`),
    JSON.stringify(
      {
        說明: '由 tools/map-build/build.ts 產生,勿手改。Blender 座標:X 東、Y 北、原點 = 地標形心;h = landmarks.json 的 height(查到的實際高度),沒有時用 OSM 高度或樓層推估(公尺)',
        area: areaName,
        landmarks: Object.fromEntries(
          landmarks.map((l) => [l.id, { name: l.name, h: l.h / 10, rings: l.rings.map((r) => { const out: number[][] = []; for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT, -r[i + 1] / QUANT]); return out; }) }]),
        ),
      },
      null,
      1,
    ),
  );

  // ---- 道路連通檢查 ----
  const comp = connectedComponents(wayLength.length, nodeToWays);
  const compLen = new Map<number, number>();
  wayLength.forEach((l, i) => compLen.set(comp[i], (compLen.get(comp[i]) ?? 0) + l));
  const total = [...compLen.values()].reduce((a, b) => a + b, 0);
  const largest = Math.max(0, ...compLen.values());
  stats.roadComponents = compLen.size;
  stats.largestComponentShare = total ? round2(largest / total) : 0;

  // ---- 出生點:指定道路上最接近 spawnNear 的點,車頭沿道路方向 ----
  const near = toW({ lat: cfg.spawnNear[0], lon: cfg.spawnNear[1] });
  const spawn = pickSpawn(roads, cfg.spawnRoad, near);

  for (const k of Object.keys(stats)) stats[k] = round2(stats[k]);
  const json: WorldJson = {
    version: 2,
    meta: {
      area: areaName,
      origin,
      originLonLat: [cfg.center[1], cfg.center[0]],
      bounds: [rect.minX, rect.minZ, rect.maxX, rect.maxZ],
      chunkSize: CHUNK_SIZE,
      osmTimestamp: raw.osm3s?.timestamp_osm_base ?? 'not_stated',
      builtAt: new Date().toISOString(),
      stats,
      ...(detailRect && { detailRect: [detailRect.minX, detailRect.minZ, detailRect.maxX, detailRect.maxZ] as [number, number, number, number] }),
    },
    spawn,
    roads,
    buildings,
    areas,
    waterways,
    landmarks,
    ...(street && { street }),
    ...(furniture && { furniture }),
  };
  const outDir = join(ROOT, 'public/map', areaName);
  mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(json);
  writeFileSync(join(outDir, 'world.json'), text);
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`輸出 ${outDir}/world.json(${kb(Buffer.byteLength(text))},gzip ${kb(gzipSync(text).byteLength)})`);
  console.log(JSON.stringify(stats, null, 2));
  console.log('出生點', spawn);
}

/** 街道細節裁切到範圍內並量化(座標 × QUANT;線寬、平移量用公分;寬度、範圍用公寸;角度用毫弧度) */
function quantStreet(st: StreetResult, r: Rect): WorldStreet {
  const out: WorldStreet = { strips: [], crosswalks: [], medians: [], junctions: [] };
  for (const j of st.junctions) if (j.every((p) => inRect(p, r))) out.junctions!.push(qPts(j));
  for (const s of st.strips) {
    const m = s.m.map((k) => ({ c: k.c, d: k.d, w: Math.round(k.w * 100), o: Math.round(k.o * 100) }));
    for (const piece of clipPolyline(s.pts, r)) out.strips.push({ pts: qPts(piece), m });
  }
  for (const c of st.crosswalks) {
    if (!inRect(c.p, r)) continue;
    out.crosswalks.push({ p: [q(c.p[0]), q(c.p[1])], v: Math.round(c.v * 1000), u: Math.round(c.u * 1000), h: Math.round(c.h * 10) });
  }
  for (const md of st.medians) {
    let run: WorldStreet['medians'][number] = { pts: [], ws: [] };
    const flush = () => {
      if (run.ws.length >= 2) out.medians.push(run);
      run = { pts: [], ws: [] };
    };
    md.pts.forEach((p, i) => {
      if (!inRect(p, r)) return flush();
      run.pts.push(q(p[0]), q(p[1]));
      run.ws.push(Math.round(md.ws[i] * 10));
    });
    flush();
  }
  return out;
}

function loadOverrides(file: string): Record<string, number> {
  const p = join(ROOT, 'data/overrides', file);
  if (!existsSync(p)) return {};
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return j.byOsmId ?? {};
}

/** relation 成員只有幾何沒有 node id,以端點座標相等來串接 */
function assembleRingsByPoint(parts: Pt[][]): Pt[][] {
  const key = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const ids = new Map<string, number>();
  const id = (p: Pt) => {
    const k = key(p);
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k)!;
  };
  return assembleRings(parts.map((pts) => ({ nodes: pts.map(id), pts })));
}

function connectedComponents(n: number, nodeToWays: Map<number, number[]>): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const ws of nodeToWays.values()) for (let i = 1; i < ws.length; i++) parent[find(ws[i])] = find(ws[0]);
  return parent.map((_, i) => find(i));
}

function pickSpawn(roads: WorldRoad[], name: string, near: Pt): WorldJson['spawn'] {
  let best = { d: Infinity, x: 0, z: 0, heading: 0 };
  for (const r of roads) {
    if (r.name !== name) continue;
    const p = r.pts.map((v) => v / QUANT);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const mz = (p[i + 1] + p[i + 3]) / 2;
      const d = Math.hypot(mx - near[0], mz - near[1]);
      if (d < best.d) {
        const dx = p[i + 2] - p[i];
        const dz = p[i + 3] - p[i + 1];
        // 羅盤方位角:北 = -Z
        const heading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        best = { d, x: mx, z: mz, heading };
      }
    }
  }
  if (!Number.isFinite(best.d)) return { x: 0, z: 0, headingDeg: 0, label: '原點' };
  return { x: round2(best.x), z: round2(best.z), headingDeg: round2(best.heading), label: name };
}

function polyLen(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

main();
