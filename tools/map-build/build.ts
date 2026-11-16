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
import { QUANT, SINK_RAIL_H, type WorldArea, type WorldBuilding, type WorldFurniture, type WorldJson, type WorldLandmark, type WorldRoad, type WorldStreet, type WorldWaterway } from '../../src/map/types';
import { areaCentroid, assembleRings, centroid, cleanRing, interiorPoint, clipPolygon, clipPolyline, inRect, pointInPolygon, signedArea, type Pt, type Rect } from '../../src/world/gen/geom';
import { defaultWidth, isDrivable, isOneway, resolveWidth, runsAlongside, splitWidth } from './lib/roads';
import { buildingHeight, buildingKind, clearBuildingsOffRoads, hasShopTags, kindHeight, nearWideRoad, touchingCorners, type HeightSource } from './lib/buildings';
import { KIND, SHOP_KINDS, type BuildingKind } from '../../src/config/buildings';
import { clearSinkOffRoads } from './lib/sink';
import { fillBuildings } from './lib/fill-buildings';
import { speciesKind, treeScale } from './lib/gov-trees';
import { decodeTreeKind, encodeTreeKind, TREE_SCALE_CODE } from '../../src/config/furniture';
import { GOV_MIN_AREA, GOV_NO_SHOP_TYPES, GOV_ROW_TYPE, govKind, INHERIT_KINDS, inheritKind, readGovBuildings, simplifyRing } from './lib/gov-buildings';
import { buildViaduct } from './lib/rail';
import { VIADUCT } from '../../src/config/viaduct';
import { PLACE_CLEAR, placePickup } from './lib/places';
import { intersectionSignals, placeFurniture, type FurnitureRoad } from './lib/furniture';
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
  /** false = 不補虛構建築(decisions/0027);預設補 */
  fill?: boolean;
  /** 捷運軌道與車站的 OSM 原始檔(選用;decisions/0030) */
  rail?: string;
  /**
   * 臺中市建物圖(decisions/0039;選用):base = Shapefile 路徑(不含副檔名),rect = [南緯, 西經, 北緯, 東經]。
   * rect 內的一般建築改用建物圖(OSM 只留地標與知名地點用到的建築),也不補虛構建築;檔案不存在就照舊。
   */
  govBuildings?: { base: string; rect: [number, number, number, number] };
  /** 臺中市行道樹(decisions/0042;選用):gov_trees.py 的輸出 JSON */
  govTrees?: string;
  /** 臺中市道路圖的每向車道數、速限對應(decisions/0046;選用):tools/research/road_lanes_match.py 的輸出 */
  govLanes?: string;
  /** OSM 號誌點(decisions/0047 A;選用):range_a_signals.overpassql 的輸出;有就依它放路口號誌 */
  osmSignals?: string;
}

/** 建物圖建築從被換掉的 OSM 建築繼承的細分類(0039) */
const OPERA_HOUSE: [number, number] = [24.16293, 120.64052];

const AREAS: Record<string, AreaConfig> = {
  // M0:臺中國家歌劇院(OSM way 222636759 中心,見 data/osm/derived/landmarks.json)周邊 1 km × 1 km
  m0: { raw: 'data/osm/raw/m0/m0_area.json', center: OPERA_HOUSE, halfX: 500, halfZ: 500, spawnRoad: '惠來路二段', spawnNear: OPERA_HOUSE },
  // 範圍 A:台中車站 ↔ 七期(24.130,120.630,24.175,120.695),約 6.6 × 5.0 km(production-plan.md §4.1)
  'range-a': {
    raw: 'data/osm/raw/range-a/range-a_area.json',
    nodes: 'data/osm/raw/range-a/range-a_nodes.json',
    rail: 'data/osm/raw/range-a/range-a_rail.json',
    center: [24.1525, 120.6625],
    halfX: 3300,
    halfZ: 2490,
    spawnRoad: '惠來路二段',
    spawnNear: OPERA_HOUSE,
    govWidths: 'data/gov/road-width/widths-range-a.json',
    // 0039:2026-11-16 先做西屯路 + 七期樣張([24.146, 120.63, 24.168, 120.676]),Cooper 看過後同意鋪到整區
    govBuildings: { base: 'data/gov/buildings/shp/01-SHP/b114', rect: [24.12, 120.62, 24.185, 120.705] },
    govTrees: 'data/gov/trees/trees-range-a.json',
    govLanes: 'data/gov/roads/lanes-range-a.json',
    osmSignals: 'data/osm/raw/range-a/range-a_signals.json',
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
  const landmarkCfg: { id: string; name: string; osmIds: number[]; model: string; height?: number; sink?: number }[] = JSON.parse(
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
  /** 政府路寬被幾條平行 way 平分(0011);車道數也照比例分(0046) */
  const splitOf = new Map<number, number>();
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

  // 臺中市建物圖的範圍(decisions/0039):範圍內的 OSM 一般建築不收,改用建物圖
  const govCfg = cfg.govBuildings && existsSync(join(ROOT, cfg.govBuildings.base + '.shp')) ? cfg.govBuildings : undefined;
  if (cfg.govBuildings && !govCfg) console.warn(`找不到建物圖 ${cfg.govBuildings.base}.shp,照舊用 OSM 建築`);
  let govRect: Rect | undefined;
  if (govCfg) {
    const [la0, lo0, la1, lo1] = govCfg.rect;
    const [x0, z1] = toW({ lat: la0, lon: lo0 }), [x1, z0] = toW({ lat: la1, lon: lo1 });
    govRect = { minX: x0, minZ: z0, maxX: x1, maxZ: z1 };
  }
  // 知名地點用到的 OSM 建築(招牌、留空要找得到),在建物圖範圍內也保留
  const placeOsm = new Set((JSON.parse(readFileSync(join(ROOT, 'data/landmarks/places.json'), 'utf8')).places as { osm?: number }[]).flatMap((c) => (c.osm ? [c.osm] : [])));

  /** 建物圖建築 id → 房屋型態(B1B;只在建置端用,不進 world.json) */
  const govType = new Map<number, string>();
  /** 建物圖範圍內的 OSM 一般建築 → 高度來源 */
  const osmInGov = new Map<number, HeightSource>();
  const addBuilding = (id: number, t: Record<string, string>, outer: Pt[], holes: Pt[][]) => {
    const ring = cleanRing(outer);
    if (ring.length < 3) return;
    if (!inRect(centroid(ring), rect)) return;
    // 建物圖範圍內的 OSM 建築先照常收,記下來;讀完建物圖再決定留不留(有實際高度標註、建物圖那裡又沒有建築的才留)
    // 捷運站的連通建築(名稱「捷運○○站」)要接空橋、換識別色(decisions/0033),也留著
    const govCandidate = !!govRect && !landmarkOf.has(id) && !placeOsm.has(id) && !/^捷運.+站$/.test(t.name ?? '') && inRect(centroid(ring), govRect);
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
    if (govCandidate) osmInGov.set(id, source);
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
    // 綠地本身是地標(秋紅谷這類下沉公園,decisions/0035):外框進地標,不畫成平面綠地
    const lmArea = landmarkOf.get(el.id);
    let rings: Pt[][] = [];
    if (el.type === 'way' && el.geometry && el.nodes && el.nodes[0] === el.nodes[el.nodes.length - 1]) {
      rings = [el.geometry.map(toW)];
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members
        .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry)
        .map((m) => m.geometry!.map(toW));
      rings = assembleRingsByPoint(outers);
    }
    if (lmArea) {
      const e = landmarkRings.get(lmArea.id) ?? { rings: [], h: 0 };
      for (const r0 of rings) {
        const r = cleanRing(r0);
        if (r.length >= 3 && inRect(centroid(r), rect)) e.rings.push(r);
      }
      landmarkRings.set(lmArea.id, e);
      inc('landmarkFootprints');
      continue;
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
      splitOf.set(w.id, n);
    }
  }

  // ---- 街道細節(decisions/0015):用政府路寬後處理完的寬度 ----
  let street: WorldStreet | undefined;
  let streetRaw: StreetResult | undefined;
  // ---- 臺中市道路圖:每向車道數、速限(decisions/0046)→ 道路(標線、其他車輛的車道與車速) ----
  if (cfg.govLanes && existsSync(join(ROOT, cfg.govLanes))) {
    const lanes: Record<string, { n?: number; spd?: number }> = JSON.parse(readFileSync(join(ROOT, cfg.govLanes), 'utf8')).byOsmId;
    for (const r of roads) {
      const g = lanes[String(r.osmId)];
      if (!g) continue;
      if (g.n) {
        // 政府路寬被 n 條平行 way 平分時(例:臺灣大道每向又分快車道、慢車道兩條 way),車道數也平分:
        // 整條路共 2 × 每向車道數,分給 n 條;單行 way 全給行車方向,雙向 way 再除以 2。
        // 無條件捨去(四捨五入會讓總數變多:5 線分兩條 → 3 + 3,驗收發現);臺灣大道每向 5 → 快 2 + 慢 2(公車道沒畫)
        const n = splitOf.get(r.osmId) ?? 1;
        r.lanes = n > 1 ? Math.max(1, Math.floor((2 * g.n) / n / (r.oneway ? 1 : 2))) : g.n;
        inc('roadLengthLanesM', polyLen(dequantPts(r.pts)));
      }
      if (g.spd) {
        r.spd = g.spd;
        inc('roadLengthSpeedM', polyLen(dequantPts(r.pts)));
      }
    }
  } else if (cfg.govLanes) console.warn(`找不到車道數資料 ${cfg.govLanes},標線依路寬推算`);

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
      .map((w) => ({ id: w.id, name: w.tags.name ?? '', highway: w.tags.highway, oneway: isOneway(w.tags), width: w.pieces[0].width, sidewalk: w.pieces[0].sidewalk, ...(w.pieces[0].lanes && { lanes: w.pieces[0].lanes }), nodes: w.nodes, line: w.line }));
    streetRaw = generateStreet(sw, crossings);
    // 單行道緊貼對向時車道的起點(0046 驗收):給其他車輛排車道用
    for (const r of roads) {
      const ls = streetRaw.laneStart?.[r.osmId];
      if (ls !== undefined && r.lanes) r.ls = round2(ls);
    }
    street = quantStreet(streetRaw, detailRect);
    stats.streetStrips = street.strips.length;
    stats.streetCrosswalks = street.crosswalks.length;
    stats.streetMedians = street.medians.length;
    stats.streetJunctions = street.junctions!.length;
  }

  const bboxOf = (r: Pt[]) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) {
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
    return [x0, z0, x1, z1] as const;
  };
  // ---- 臺中市建物圖(decisions/0039):rect 內的建築;和保留的 OSM 建築重疊的不收 ----
  if (govCfg && govRect) {
    const box = [origin.e + govRect.minX, origin.n - govRect.maxZ, origin.e + govRect.maxX, origin.n - govRect.minZ] as const;
    const gov = readGovBuildings(join(ROOT, govCfg.base), box);
    const toWorld = (p: [number, number]): Pt => [p[0] - origin.e, -(p[1] - origin.n)];
    const govRings = gov.map((g) => g.parts.map((r) => simplifyRing(cleanRing(r.map(toWorld)))).filter((r) => r.length >= 3));
    // 建物圖的測繪年份不明,近年完工的大樓可能沒收(樣張實測:OSM 標了 ≥ 40 m 的 428 棟有 77 棟在建物圖上沒有建築)。
    // 所以建物圖在 OSM 建築中心點沒有建築的,OSM 那棟留著(高度照 OSM 標籤或推估),其餘換成建物圖
    const govOuter = govRings.flatMap((rs) => rs.filter((r) => signedArea(r) > 0)).map((r) => ({ r, b: bboxOf(r) }));
    const govCovers = (p: Pt) => govOuter.some(({ r, b }) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && pointInPolygon(p, r));
    const replaced: { r: Pt[]; b: readonly [number, number, number, number]; t: number; s?: 1 }[] = [];
    for (let i = buildings.length - 1; i >= 0; i--) {
      const src = osmInGov.get(buildings[i].id);
      if (src === undefined) continue;
      if (!govCovers(interiorPoint(dequantPts(buildings[i].rings[0])))) {
        inc(`osmBuildingsKeptInGov_${src}`);
        continue;
      }
      inc(`buildingKind_${Object.keys(KIND)[buildings[i].t]}`, -1);
      inc(`heightFrom_${src}`, -1);
      if (buildings[i].rings.length > 1) inc('buildingsWithCourtyard', -1);
      inc('buildings', -1);
      inc('osmBuildingsReplacedByGov');
      // 建物圖沒有「廟宇、學校、公共建築、商辦」這類用途分類:換掉前記下來,落在它裡面的建物圖建築繼承(高度仍用建物圖樓層)
      if (INHERIT_KINDS.has(buildings[i].t) || buildings[i].s) replaced.push({ r: dequantPts(buildings[i].rings[0]), b: bboxOf(dequantPts(buildings[i].rings[0])), t: buildings[i].t, s: buildings[i].s });
      buildings.splice(i, 1);
    }
    // 和所有保留的建築比(不只範圍內:範圍邊界上的 OSM 建築也可能和建物圖重疊)
    const kept = buildings.map((b) => dequantPts(b.rings[0])).map((r) => ({ r, b: bboxOf(r) }));
    for (const [gi, g] of gov.entries()) {
      // Shapefile 外環順時針(E-N 平面),轉到世界座標(z 反向)後變成逆時針 → 面積 > 0 的是外環
      const rings = govRings[gi];
      const outers = rings.filter((r) => signedArea(r) > 0);
      const inners = rings.filter((r) => signedArea(r) < 0);
      for (const [k, outer] of outers.entries()) {
        if (k >= 64) throw new Error(`建物圖 ID ${g.id} 有 64 個以上外環,建築 id 會重複`);
        const area = signedArea(outer);
        if (area < GOV_MIN_AREA) {
          inc('govBuildingsTooSmall');
          continue;
        }
        const c = interiorPoint(outer);
        if (!inRect(c, govRect) || !inRect(c, rect)) continue;
        if (kept.some(({ r, b }) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && pointInPolygon(c, r))) {
          inc('govBuildingsUnderOsm');
          continue;
        }
        const holes = inners.filter((h) => pointInPolygon(h[0], outer));
        const gk = govKind(g);
        let kind: BuildingKind = gk.kind;
        let shop: 1 | undefined;
        const from = replaced.find(({ r, b }) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && pointInPolygon(c, r));
        if (from) {
          const k2 = inheritKind(kind, g.floors, from.t);
          if (k2 !== kind) inc('govKindFromOsm');
          kind = k2;
          if (from.s) shop = 1;
        }
        // 廟宇沒有樓層以外的高度資訊;建物圖的樓層是實測,照用
        govType.set(8_000_000_000 + g.id * 64 + k, g.type);
        buildings.push({ id: 8_000_000_000 + g.id * 64 + k, h: Math.round(gk.height * 10), t: kind, g: 1, ...(shop && SHOP_KINDS.includes(kind) && { s: shop }), rings: [outer, ...holes].map(qPts) });
        inc('buildings');
        inc('govBuildings');
        inc(`buildingKind_${Object.keys(KIND)[kind]}`);
      }
    }
    stats.govRecordsInRect = gov.length;
  }

  // ---- 地標:位置 = 所有外框的面積加權形心;外框中心落在地標外框內的一般建築(附屬棟、重複描繪)一併挖掉 ----
  const landmarks: WorldLandmark[] = [];
  for (const l of landmarkCfg) {
    const e = landmarkRings.get(l.id);
    if (!e) {
      console.warn(`地標 ${l.id} 的 OSM 外框不在區域內,略過`);
      continue;
    }
    // 下沉地標:外框退出所有道路的路面 + 人行道(地面要挖洞、外緣有擋牆)
    if (l.sink) {
      const sinkRoads = roads.map((r) => ({ pts: dequantPts(r.pts), width: r.width, sidewalk: r.sidewalk }));
      e.rings = e.rings.map((r) => {
        const res = clearSinkOffRoads(r, sinkRoads);
        inc('sinkCellsOnRoads', res.moved);
        return res.ring;
      });
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
    landmarks.push({ id: l.id, name: l.name, model: l.model, x: round2(x), z: round2(z), h: Math.round(h * 10), ...(l.sink && { sink: l.sink }), rings: e.rings.map((r) => qPts(r.map(([px, pz]) => [px - x, pz - z] as Pt))) });
    // 下沉地標:地面在這裡挖洞,外框內的水面、綠地由模型自己畫
    if (l.sink) {
      for (let i = areas.length - 1; i >= 0; i--) {
        if (e.rings.some((r) => pointInPolygon(centroid(dequantPts(areas[i].ring)), r))) {
          areas.splice(i, 1);
          inc('areasRemovedInSunkLandmarks');
        }
      }
    }
    for (let i = buildings.length - 1; i >= 0; i--) {
      // 建物圖的凹多邊形用內部代表點(0039 驗收);OSM 建築維持原本的頂點平均中心,結果不變
      // 建物圖(凹多邊形多)的頂點平均中心或內部代表點任一個在地標內就挖掉;OSM 建築維持原本只看頂點平均中心
      const ring = dequantPts(buildings[i].rings[0]);
      const cs = buildings[i].g ? [centroid(ring), interiorPoint(ring)] : [centroid(ring)];
      if (e.rings.some((r) => cs.some((c) => pointInPolygon(c, r)))) {
        inc(`buildingKind_${Object.keys(KIND)[buildings[i].t]}`, -1);
        buildings.splice(i, 1);
        inc('buildingsRemovedUnderLandmarks');
        inc('buildings', -1);
      }
    }
  }

  // ---- 建築不壓到車道(decisions/0026):伸進車道的部分切掉;路穿過建築(非服務道路)或切完剩太少就整棟拿掉 ----
  {
    const res = clearBuildingsOffRoads(
      buildings.map((b) => dequantPts(b.rings[0])),
      roads.map((r) => ({ pts: dequantPts(r.pts), width: r.width, highway: r.highway, bridge: roadExtra.get(r.osmId)?.bridge })),
    );
    for (let i = buildings.length - 1; i >= 0; i--) {
      const r = res[i];
      if (r.status === 'clipped') {
        const ring = cleanRing(dequantPts(qPts(r.ring)));
        if (ring.length >= 3) {
          buildings[i].rings[0] = qPts(ring);
          inc('buildingsClippedOffRoad');
          continue;
        }
        r.status = 'removed';
      }
      if (r.status === 'removed') {
        inc(`buildingKind_${Object.keys(KIND)[buildings[i].t]}`, -1);
        buildings.splice(i, 1);
        inc('buildingsRemovedOnRoad');
        inc('buildings', -1);
      } else if (r.status === 'through-service') inc('buildingsOverServiceRoad');
    }
  }

  // ---- 補虛構建築(decisions/0027):沿道路兩側,沒有建築的地方排上長方形建築 ----
  if (cfg.fill !== false) {
    const solid = [...buildings.map((b) => dequantPts(b.rings[0])), ...landmarks.flatMap((l) => l.rings.map((r) => dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt)))];
    // 知名地點(places.json 裡有 OSM 建築或座標的)與地標周圍留空:半徑 = 外框最遠頂點 + PLACE_CLEAR
    const clear: { p: Pt; r: number }[] = [];
    const ringClear = (ring: Pt[]) => {
      const c = areaCentroid(ring);
      clear.push({ p: c, r: Math.max(...ring.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) + PLACE_CLEAR });
    };
    for (const l of landmarks) for (const r of l.rings) ringClear(dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt));
    for (const c of JSON.parse(readFileSync(join(ROOT, 'data/landmarks/places.json'), 'utf8')).places as { osm?: number; at?: [number, number] }[]) {
      const b = c.osm ? buildings.find((x) => x.id === c.osm) : undefined;
      if (b) ringClear(dequantPts(b.rings[0]));
      else if (c.at) clear.push({ p: toW({ lat: c.at[0], lon: c.at[1] }), r: PLACE_CLEAR + 15 });
    }
    stats.fillClearZones = clear.length;
    const fills = fillBuildings(
      roads.map((r) => ({ id: r.osmId, pts: dequantPts(r.pts), width: r.width, sidewalk: r.sidewalk, highway: r.highway, bridge: roadExtra.get(r.osmId)?.bridge })),
      { solid, keepOut: areas.map((a) => dequantPts(a.ring)), waterways: waterways.map((w) => ({ pts: dequantPts(w.pts), w: w.w })), heights: buildings.map((b) => b.h / 10), clear },
      [rect.minX, rect.minZ, rect.maxX, rect.maxZ],
    );
    // 繞向和 OSM 建築一致
    const sign = Math.sign(signedArea(dequantPts(buildings[0]?.rings[0] ?? [0, 0, 1, 0, 1, 1])));
    fills.forEach((f, i) => {
      // 建物圖範圍內不補(decisions/0039)
      if (govRect && inRect(centroid(f.ring), govRect)) {
        inc('fillSkippedInGov');
        return;
      }
      const ring = Math.sign(signedArea(f.ring)) === sign ? f.ring : [...f.ring].reverse();
      buildings.push({ id: 9_000_000_000 + i, h: Math.round(f.h * 10), t: f.kind, f: 1, rings: [qPts(ring)] });
      inc('buildings');
      inc('buildingsFilled');
      inc(`buildingsFilled_${f.tier}`);
      inc(`buildingKind_${Object.keys(KIND)[f.kind]}`);
    });
  }

  // 最後實際留在地圖上的建物圖建築(扣掉地標挖除、0026 拿掉的)
  if (govCfg) stats.govBuildingsFinal = buildings.filter((b) => b.g).length;

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
  // 補的建築一律方角(省三角形;外框本來就是長方形)
  for (const b of buildings) if (b.f) b.c = [0, 1, 2, 3];
  buildings.forEach((b, i) => {
    // 建物圖的獨戶、雙併(0041 D):住宅，臨路也不開店(OSM 本身有商店標籤繼承來的 s 照留)
    const gt = govType.get(b.id);
    if (nearRoad[i] && SHOP_KINDS.includes(b.t as (typeof SHOP_KINDS)[number]) && !(gt && GOV_NO_SHOP_TYPES.has(gt))) b.s = 1;
    if (b.s) inc('buildingShopfront');
    if (b.s && gt === GOV_ROW_TYPE) inc('buildingShopfrontRowHouse');
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
    // OSM 號誌點(0047 A):只取路口號誌 highway=traffic_signals
    let signalNodes: Pt[] | undefined;
    if (cfg.osmSignals && existsSync(join(ROOT, cfg.osmSignals))) {
      signalNodes = (JSON.parse(readFileSync(join(ROOT, cfg.osmSignals), 'utf8')).elements as OsmEl[])
        .filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals' && e.lat !== undefined)
        .map((e) => toW({ lat: e.lat!, lon: e.lon! }))
        .filter((p) => inRect(p, rect));
      stats.osmSignalNodes = signalNodes.length;
    } else if (cfg.osmSignals) console.warn(`找不到 OSM 號誌點 ${cfg.osmSignals},路口號誌照舊依規則放`);
    // 臺中市行道樹分佈圖(decisions/0042;tools/map-build/gov_trees.py 從 KMZ 轉出)
    const govTrees: { p: Pt; code: number }[] = [];
    if (cfg.govTrees && existsSync(join(ROOT, cfg.govTrees))) {
      for (const t of JSON.parse(readFileSync(join(ROOT, cfg.govTrees), 'utf8')) as { e: number; n: number; sp: string; h: number }[]) {
        const p: Pt = [t.e - origin.e, -(t.n - origin.n)];
        if (!inRect(p, rect)) continue;
        govTrees.push({ p, code: encodeTreeKind(speciesKind(t.sp), treeScale(t.h)) });
      }
      stats.govTreesInRect = govTrees.length;
    } else if (cfg.govTrees) console.warn(`找不到行道樹資料 ${cfg.govTrees},只用規則種樹`);
    const fr: FurnitureRoad[] = roads.map((r) => ({ id: r.osmId, name: r.name, highway: r.highway, width: r.width, sidewalk: r.sidewalk, ...(roadExtra.get(r.osmId) ?? { lit: false, bridge: false }), pts: dequantPts(r.pts) }));
    const f = placeFurniture(
      fr,
      {
        shops: buildings.filter((b) => b.s).map((b) => dequantPts(b.rings[0])),
        waterways: waterways.map((w) => ({ pts: dequantPts(w.pts), w: w.w })),
        junctions: streetRaw.junctions,
        shopBuildings: buildings.filter((b) => b.s).map((b) => ({ ring: dequantPts(b.rings[0]), h: b.h / 10, id: b.id, ...(govType.get(b.id) === GOV_ROW_TYPE && { dense: true }) })),
        govTrees,
        ...(signalNodes && { signalNodes }),
        rings: [...buildings.map((b) => dequantPts(b.rings[0])), ...landmarks.flatMap((l) => l.rings.map((r) => dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt)))], water: areas.filter((a) => a.k === 2).map((a) => dequantPts(a.ring)) },
      streetRaw.crosswalks.map((c) => ({ p: c.p, v: [Math.cos(c.v), Math.sin(c.v)] as Pt, reach: c.reach, sig: c.sig })),
      busStops,
      streetRaw.approaches ?? [],
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
    for (let i = 2; i < furniture.trees.length; i += 3) {
      inc(`furnitureTreeKind${decodeTreeKind(furniture.trees[i]).kind}`);
      if (furniture.trees[i] >= TREE_SCALE_CODE) inc('furnitureTreesGov');
    }
    for (const l of f.lights) if (inRect(l.p, dr)) furniture.lights.push(q(l.p[0]), q(l.p[1]), ang(l.a));
    for (const s of f.signals) if (inRect(s.p, dr)) furniture.signals.push(q(s.p[0]), q(s.p[1]), ang(s.a), Math.round(s.arm * 10));
    for (const s of f.scooters) if (inRect(s.p, dr)) furniture.scooters.push(q(s.p[0]), q(s.p[1]), ang(s.a), s.n, ang(s.f));
    stats.furnitureScooterRows = furniture.scooters.length / 5;
    for (let i = 3; i < furniture.scooters.length; i += 5) inc('furnitureScooters', furniture.scooters[i]);
    stats.furnitureTrees = furniture.trees.length / 3;
    stats.furnitureLights = furniture.lights.length / 3;
    stats.furnitureSignals = furniture.signals.length / 4;
    stats.signalCrosswalks = streetRaw.crosswalks.filter((c) => c.sig).length;
    // 每個路口放號誌的篩選過程(Cooper 2026-11-12):進入路口方向 → 主要道路 → 有交叉的主要道路
    const ap = streetRaw.approaches ?? [];
    stats.signalApproaches = ap.length;
    stats.signalAtIntersections = intersectionSignals(ap).length;
  }

  /** 下沉地標外框內的水面與橋(OSM),給 Blender 腳本畫碗底的湖與橋;座標同外框(X 東、Y 北、原點 = 地標形心) */
  const sinkFeatures = (l: WorldLandmark) => {
    const rings = l.rings.map((r) => dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt));
    const toB = (pts: Pt[]) => pts.map(([x, z]) => [round2(x - l.x), round2(-(z - l.z))]);
    const inside = (pts: Pt[]) => rings.some((r) => pointInPolygon(centroid(pts), r));
    const water: number[][][] = [];
    const bridges: number[][][] = [];
    for (const e of els) {
      const t = e.tags ?? {};
      if (e.type !== 'way' || !e.geometry) continue;
      const pts = e.geometry.map(toW);
      if (t.natural === 'water' && inside(pts)) water.push(toB(cleanRing(pts)));
      else if (t.bridge && t.highway && inside(pts)) bridges.push(toB(pts));
    }
    return { water, bridges };
  };
  // 給 Blender 地標腳本用的外框:原點 = 地標形心,Blender 座標 X = 東、Y = 北(= 世界 -Z),單位公尺
  writeFileSync(
    join(ROOT, `data/landmarks/footprints-${areaName}.json`),
    JSON.stringify(
      {
        說明: '由 tools/map-build/build.ts 產生,勿手改。Blender 座標:X 東、Y 北、原點 = 地標形心;h = landmarks.json 的 height(查到的實際高度),沒有時用 OSM 高度或樓層推估(公尺)',
        area: areaName,
        landmarks: Object.fromEntries(
          landmarks.map((l) => [l.id, { name: l.name, h: l.h / 10, ...(l.sink && { sink: l.sink, rail: SINK_RAIL_H, ...sinkFeatures(l) }), rings: l.rings.map((r) => { const out: number[][] = []; for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT, -r[i + 1] / QUANT]); return out; }) }]),
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

  // ---- 高架捷運(decisions/0030):主線軌道(有路線名稱、不是機廠 / 側線)→ 橋中心線、墩柱、車站 ----
  let viaduct: WorldJson['viaduct'];
  if (cfg.rail && existsSync(join(ROOT, cfg.rail))) {
    const els: OsmEl[] = JSON.parse(readFileSync(join(ROOT, cfg.rail), 'utf8')).elements;
    const tracks = els.filter((e) => e.type === 'way' && e.tags?.railway && !e.tags.service && e.geometry).map((e) => e.geometry!.map(toW));
    const stops = els.filter((e) => e.type === 'node' && e.tags?.railway === 'station' && e.lat !== undefined).map((e) => ({ name: e.tags!.name ?? '', p: toW({ lat: e.lat!, lon: e.lon! }) }));
    const v = buildViaduct(tracks, stops, roads.map((r) => ({ pts: dequantPts(r.pts), width: r.width })), [rect.minX, rect.minZ, rect.maxX, rect.maxZ]);
    viaduct = {
      lines: v.lines.map(qPts),
      piers: v.piers.flatMap((p) => [q(p.p[0]), q(p.p[1]), Math.round(p.a * 1000)]),
      stations: v.stations.map((s) => ({ name: s.name, x: round2(s.p[0]), z: round2(s.p[1]), a: Math.round(s.a * 1000) })),
    };
    // 車站的路邊連通建築(OSM 名稱「捷運○○站」、還留在建築裡的):換識別色、從站體側面拉一條空橋過去(decisions/0033)
    const byId = new Map(buildings.map((b) => [b.id, b]));
    for (const st of viaduct.stations) {
      const ux = Math.cos(st.a / 1000), uz = Math.sin(st.a / 1000);
      const bridges: number[][] = [];
      for (const e of raw.elements as OsmEl[]) {
        if (e.tags?.name !== `捷運${st.name}站`) continue;
        const b = byId.get(e.id);
        if (!b) continue;
        const color = VIADUCT.identity[st.name];
        if (color) b.k = color;
        const ring = dequantPts(b.rings[0]);
        // 建築外框上離站體中心線最近的點(沿線位置限制在站體長度內)
        let best: { d: number; q: Pt } | null = null;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], c = ring[(i + 1) % ring.length];
          for (let k = 0; k <= 10; k++) {
            const q: Pt = [a[0] + ((c[0] - a[0]) * k) / 10, a[1] + ((c[1] - a[1]) * k) / 10];
            const du = (q[0] - st.x) * ux + (q[1] - st.z) * uz;
            if (Math.abs(du) > VIADUCT.stationHalf[0] - 4) continue;
            const dv = Math.abs(-(q[0] - st.x) * uz + (q[1] - st.z) * ux);
            if (!best || dv < best.d) best = { d: dv, q };
          }
        }
        if (!best || best.d > VIADUCT.bridgeMax || best.d < VIADUCT.stationHalf[1] + 2) continue;
        const du = (best.q[0] - st.x) * ux + (best.q[1] - st.z) * uz;
        const side = Math.sign(-(best.q[0] - st.x) * uz + (best.q[1] - st.z) * ux);
        const hw = VIADUCT.stationHalf[1];
        const p1: Pt = [st.x + ux * du - uz * hw * side, st.z + uz * du + ux * hw * side];
        bridges.push([round2(p1[0]), round2(p1[1]), round2(best.q[0]), round2(best.q[1])]);
        inc('viaductBridges');
      }
      if (bridges.length) st.b = bridges;
    }
    stats.viaductLengthM = v.lines.reduce((t, l) => t + l.slice(1).reduce((u, p, i) => u + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0);
    stats.viaductPiers = v.piers.length;
    stats.viaductPierSlots = v.pierSlots;
    stats.viaductPiersSkipped = v.pierSkipped;
    stats.viaductStations = v.stations.length;
  }
  // ---- 知名地點(decisions/0031):位置、接送點、對應的建築 ----
  const places: NonNullable<WorldJson['places']> = [];
  {
    const cfgPlaces: { id: string; name: string; glyph?: string; color: string; osm?: number; landmark?: string; station?: string; at?: [number, number]; sign?: boolean; road?: string }[] =
      JSON.parse(readFileSync(join(ROOT, 'data/landmarks/places.json'), 'utf8')).places;
    const rawById = new Map<number, OsmEl>(raw.elements.map((e: OsmEl) => [e.id, e]));
    const solids = [...buildings.map((b) => dequantPts(b.rings[0])), ...landmarks.flatMap((l) => l.rings.map((r) => dequantPts(r).map(([x, z]) => [x + l.x, z + l.z] as Pt)))];
    const placeRoads = roads.map((r) => ({ name: r.name, highway: r.highway, width: r.width, pts: dequantPts(r.pts) }));
    const mean = (pts: Pt[]): Pt => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
    for (const c of cfgPlaces) {
      let anchor: Pt | null = null;
      let b: WorldBuilding | undefined;
      let lm: string | undefined;
      if (c.landmark) {
        const l = landmarks.find((x) => x.id === c.landmark);
        if (l) [anchor, lm] = [[l.x, l.z], l.id];
      } else if (c.station) {
        const st = viaduct?.stations.find((x) => x.name === c.station);
        if (st) anchor = [st.x, st.z];
      } else if (c.at) {
        anchor = toW({ lat: c.at[0], lon: c.at[1] });
        b = buildings.find((x) => pointInPolygon(anchor!, dequantPts(x.rings[0])));
      } else if (c.osm) {
        b = buildings.find((x) => x.id === c.osm);
        if (b) anchor = areaCentroid(dequantPts(b.rings[0]));
        else {
          const e = rawById.get(c.osm);
          const geo = e?.geometry ?? e?.members?.flatMap((m) => m.geometry ?? []);
          if (geo?.length) anchor = mean(geo.map(toW));
        }
      }
      if (!anchor || !inRect(anchor, rect)) {
        inc('placesMissing');
        console.warn(`知名地點找不到位置:${c.id} ${c.name}`);
        continue;
      }
      const pick = placePickup(anchor, placeRoads, solids, !!c.station, c.road ?? '');
      if (!pick) {
        inc('placesMissing');
        console.warn(`知名地點找不到接送點:${c.id} ${c.name}`);
        continue;
      }
      if (b) b.k = c.color;
      places.push({
        id: c.id, name: c.name, glyph: c.glyph ?? c.name.slice(0, 1), color: c.color,
        x: round2(anchor[0]), z: round2(anchor[1]), px: round2(pick.p[0]), pz: round2(pick.p[1]), road: pick.road,
        ...(b && { b: b.id, h: b.h / 10 }), ...(lm && { landmark: lm, h: landmarks.find((x) => x.id === lm)!.h / 10 }), ...(c.sign === false && { sign: 0 as const }),
      });
      inc('places');
    }
  }
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
    ...(viaduct && { viaduct }),
    ...(places.length && { places }),
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
