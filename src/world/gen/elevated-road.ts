// 3D 立體高架道路與上下匝道網格生成(台 74 線快速道路、光明陸橋、交流道匝道):
// - roadDeck:3D 瀝青路面與車道標線(物理摩擦係數 1.0,可平順行駛與爬坡);
// - roadBarrier:橋面板箱梁底部、兩側水泥防撞護欄(匝道匯入/匯出處自動開口)與下方橋墩(避開地面車道)。
import { PALETTE, hexToRgb } from '../../config/palette';
import { PLAIN_CODE } from './extrude';
import { addBox, quad } from './furniture';
import type { Pt } from './geom';
import type { MeshBuilder } from './mesh';

type Rgb = [number, number, number];

export interface ElevatedRoadPiece {
  osmId?: number;
  pts: Pt[];
  elev: number[];
  width: number;
  lanes?: number;
  oneway?: boolean;
}

export const ELEVATED_ROAD_CFG = {
  /** 路面與標線相對高程基準的微小高度偏移(公尺,與平面 Y_ROAD / Y_MARK 對齊) */
  yRoad: 0.03,
  yMark: 0.05,
  /** 箱梁底板最大厚度、兩側水泥護欄高度與寬度、頂部綠框高(公尺) */
  slabDepth: 0.85,
  barrierH: 1.0,
  barrierW: 0.36,
  railH: 0.16,
  /** 達到多少高度才開始生護欄、箱梁底板與下方橋墩(公尺) */
  minBarrierY: 0.35,
  minSlabY: 0.5,
  minPierY: 4.5,
  /** 橋墩間距、柱身半長×半寬、帽梁高度(公尺) */
  pierSpacing: 32,
  pierHalf: [1.0, 0.75] as readonly [number, number],
  capH: 1.1,
  colors: {
    slabSide: '#D4D7DA',
    slabBottom: '#969DA4',
    barrier: '#DCDFD9',
    rail: '#4D8B55',
    pier: '#C5C7C2',
  },
};

function segNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dz / l, -dx / l];
}

/** 計算折線各頂點的左右橫向偏移點與單位斜接向量 */
function miterEdges(line: Pt[], halfW: number): { left: Pt[]; right: Pt[]; miters: Pt[] } {
  const n = line.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const miters: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(n - 1, i + 1)];
    const n1 = segNormal(i > 0 ? prev : line[i], i > 0 ? line[i] : next);
    const n2 = segNormal(i < n - 1 ? line[i] : prev, i < n - 1 ? next : line[i]);
    let mx = n1[0] + n2[0];
    let mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      mx = n1[0];
      mz = n1[1];
    } else {
      mx /= ml;
      mz /= ml;
    }
    const dot = mx * n1[0] + mz * n1[1];
    const scale = Math.min(halfW / Math.max(dot, 1e-3), halfW * 2.5);
    const p = line[i];
    left.push([p[0] + mx * scale, p[1] + mz * scale]);
    right.push([p[0] - mx * scale, p[1] - mz * scale]);
    miters.push([mx * (scale / Math.max(halfW, 1e-3)), mz * (scale / Math.max(halfW, 1e-3))]);
  }
  return { left, right, miters };
}

/** 在 3D 斜坡端點補上與坡面共平面的傾斜圓盤端蓋(填補轉角與相接縫隙,且高度夾在 [minY, maxY] 內絕不突出高架平面) */
function addTiltedDisc(
  mb: MeshBuilder,
  c: Pt,
  yCenter: number,
  tx: number,
  tz: number,
  slope: number,
  r: number,
  rgb: Rgb,
  minY: number,
  maxY: number,
  segments = 12,
) {
  const center = mb.vertex(c[0], yCenter, c[1], 0, 1, 0, rgb);
  const ring: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const rx = Math.cos(a) * r;
    const rz = Math.sin(a) * r;
    const y = Math.min(maxY, Math.max(minY, yCenter + (rx * tx + rz * tz) * slope));
    ring.push(mb.vertex(c[0] + rx, y, c[1] + rz, 0, 1, 0, rgb));
  }
  for (let i = 0; i < segments; i++) {
    const u = ring[i];
    const v = ring[(i + 1) % segments];
    if (mb.isUpward(center, u, v)) mb.tri(center, u, v);
    else mb.tri(center, v, u);
  }
}

/** 畫一條貼合 3D 坡面的標線帶(實線或虛線) */
function add3DMarkStrip(
  mb: MeshBuilder,
  pts: Pt[],
  elev: number[],
  miters: Pt[],
  lateralOffset: number,
  lineW: number,
  yOff: number,
  rgb: Rgb,
  dashed: boolean,
) {
  const shifted: Pt[] = pts.map((p, i) => [
    p[0] + miters[i][0] * lateralOffset,
    p[1] + miters[i][1] * lateralOffset,
  ]);
  const emitSpan = (a: Pt, ya: number, b: Pt, yb: number) => {
    const n = segNormal(a, b);
    const hw = lineW / 2;
    const v0 = mb.vertex(a[0] + n[0] * hw, ya + yOff, a[1] + n[1] * hw, 0, 1, 0, rgb);
    const v1 = mb.vertex(a[0] - n[0] * hw, ya + yOff, a[1] - n[1] * hw, 0, 1, 0, rgb);
    const v2 = mb.vertex(b[0] - n[0] * hw, yb + yOff, b[1] - n[1] * hw, 0, 1, 0, rgb);
    const v3 = mb.vertex(b[0] + n[0] * hw, yb + yOff, b[1] + n[1] * hw, 0, 1, 0, rgb);
    if (mb.isUpward(v0, v1, v2)) {
      mb.tri(v0, v1, v2);
      mb.tri(v0, v2, v3);
    } else {
      mb.tri(v0, v2, v1);
      mb.tri(v0, v3, v2);
    }
  };

  if (!dashed) {
    for (let i = 0; i + 1 < shifted.length; i++) {
      emitSpan(shifted[i], elev[i], shifted[i + 1], elev[i + 1]);
    }
    return;
  }

  // 虛線:畫 4 m、空 6 m(週期 10 m)
  const dashOn = 4, dashCycle = 10;
  let distAcc = 0;
  for (let i = 0; i + 1 < shifted.length; i++) {
    const a = shifted[i], b = shifted[i + 1];
    const ya = elev[i], yb = elev[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 1e-3) continue;
    let s = 0;
    while (s < segLen - 1e-3) {
      const phase = (distAcc + s) % dashCycle;
      if (phase < dashOn) {
        const step = Math.min(segLen - s, dashOn - phase);
        const t0 = s / segLen, t1 = (s + step) / segLen;
        const p0: Pt = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1: Pt = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        emitSpan(p0, ya + (yb - ya) * t0, p1, ya + (yb - ya) * t1);
        s += step;
      } else {
        s += Math.min(segLen - s, dashCycle - phase);
      }
    }
    distAcc += segLen;
  }
}

/**
 * 檢查高架路段側邊點 (px, py, pz) 是否落在另一條匯入/匯出的高架匝道或主線路面內。
 * 若落在另一條高架路面內,代表此處是匝道匯流開口(Gore Area),不立水泥護欄以免擋住匯入車流。
 */
function isSideInMergeZone(
  px: number,
  py: number,
  pz: number,
  selfPiece: ElevatedRoadPiece,
  selfSegIdx: number,
  allPieces: readonly ElevatedRoadPiece[],
): boolean {
  for (const other of allPieces) {
    const n = other.pts.length;
    const sa = selfPiece.pts[selfSegIdx], sb = selfPiece.pts[selfSegIdx + 1];
    const sdx = sb[0] - sa[0], sdz = sb[1] - sa[1];
    const sl = Math.hypot(sdx, sdz) || 1;
    for (let j = 0; j + 1 < n; j++) {
      if (other === selfPiece && Math.abs(j - selfSegIdx) <= 1) continue;
      const a = other.pts[j], b = other.pts[j + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const ol = Math.sqrt(len2);
      // 對向單行道(方向夾角 > 90°,即點積 < -0.2)之間必須保留中央分隔護欄,不可視為匯流開口!
      if ((sdx * dx + sdz * dz) / (sl * ol) < -0.2) continue;
      const rawT = ((px - a[0]) * dx + (pz - a[1]) * dz) / len2;
      // 排除純粹前後端點相接的同一條路延伸(rawT 落在線段外且與自身共用端點)
      const sharesEndpoint =
        Math.hypot(a[0] - sa[0], a[1] - sa[1]) < 0.2 ||
        Math.hypot(a[0] - sb[0], a[1] - sb[1]) < 0.2 ||
        Math.hypot(b[0] - sa[0], b[1] - sa[1]) < 0.2 ||
        Math.hypot(b[0] - sb[0], b[1] - sb[1]) < 0.2;
      if (sharesEndpoint) {
        // 若兩段方向幾乎一致(夾角 < 10°,cos > 0.985)且同寬,屬於直路延續,不是匝道匯流
        const cos = Math.abs((sdx * dx + sdz * dz) / (sl * ol));
        if (cos > 0.985 && Math.abs(other.width - selfPiece.width) < 1.0) continue;
      }
      const t = Math.max(0, Math.min(1, rawT));
      const qx = a[0] + dx * t, qz = a[1] + dz * t;
      const d = Math.hypot(px - qx, pz - qz);
      if (d > other.width / 2 - 0.05) continue;
      const oy = (other.elev[j] ?? 0) + ((other.elev[j + 1] ?? 0) - (other.elev[j] ?? 0)) * t;
      if (Math.abs(py - oy) < 2.5) return true;
    }
  }
  return false;
}

/** 點到平面道路折線的最近距離(避開橋墩落點用) */
function distToPolyline(p: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)));
  }
  return best;
}

/**
 * 生成一格內所有高架道路與匝道的 3D 網格:
 * - deckMb:3D 路面 + 標線(也供物理 addStaticRoadDeck 使用);
 * - barrierMb:兩側水泥防撞護欄 + 箱梁底板 + 橋墩(也供物理 addStaticTrimesh 碰撞使用)。
 */
export function addElevatedRoads(
  deckMb: MeshBuilder,
  barrierMb: MeshBuilder,
  pieces: readonly ElevatedRoadPiece[],
  contextPieces: readonly ElevatedRoadPiece[] = pieces,
  groundRoads: readonly { pts: Pt[]; width: number }[] = [],
  cfg = ELEVATED_ROAD_CFG,
) {
  if (!pieces.length) return;
  deckMb.code = PLAIN_CODE;
  barrierMb.code = PLAIN_CODE;

  const roadRgb = hexToRgb(PALETTE.road);
  const whiteRgb = hexToRgb(PALETTE.markWhite);
  const yellowRgb = hexToRgb(PALETTE.markYellow);
  const slabSideRgb = hexToRgb(cfg.colors.slabSide);
  const slabBottomRgb = hexToRgb(cfg.colors.slabBottom);
  const barrierRgb = hexToRgb(cfg.colors.barrier);
  const railRgb = hexToRgb(cfg.colors.rail);
  const pierRgb = hexToRgb(cfg.colors.pier);

  const placedPiers: Pt[] = [];

  for (const r of pieces) {
    const n = r.pts.length;
    if (n < 2 || r.elev.length < n) continue;
    const halfW = r.width / 2;
    const { left, right, miters } = miterEdges(r.pts, halfW);

    // 1. 3D 瀝青路面(deckMb)
    const up = (mb: MeshBuilder, a: number, b: number, c: number) =>
      mb.isUpward(a, b, c) ? mb.tri(a, b, c) : mb.tri(a, c, b);

    for (let i = 0; i + 1 < n; i++) {
      const y0 = r.elev[i] + cfg.yRoad;
      const y1 = r.elev[i + 1] + cfg.yRoad;
      const dx = r.pts[i + 1][0] - r.pts[i][0];
      const dz = r.pts[i + 1][1] - r.pts[i][1];
      const segLen = Math.hypot(dx, dz) || 1;
      const slope = (y1 - y0) / segLen;
      const nl = Math.hypot(slope, 1);
      const nx = ((-dx / segLen) * slope) / nl;
      const ny = 1 / nl;
      const nz = ((-dz / segLen) * slope) / nl;

      const v0 = deckMb.vertex(left[i][0], y0, left[i][1], nx, ny, nz, roadRgb);
      const v1 = deckMb.vertex(right[i][0], y0, right[i][1], nx, ny, nz, roadRgb);
      const v2 = deckMb.vertex(right[i + 1][0], y1, right[i + 1][1], nx, ny, nz, roadRgb);
      const v3 = deckMb.vertex(left[i + 1][0], y1, left[i + 1][1], nx, ny, nz, roadRgb);
      up(deckMb, v0, v1, v2);
      up(deckMb, v0, v2, v3);

      // 首尾端點若在空中(> 0.25 m),補上與坡面同斜率的圓盤端蓋,消除彎道或分塊接縫
      const segMinY = Math.min(y0, y1);
      const segMaxY = Math.max(y0, y1);
      if (i === 0 && r.elev[0] > 0.25) {
        addTiltedDisc(deckMb, r.pts[0], y0, dx / segLen, dz / segLen, slope, halfW, roadRgb, segMinY, segMaxY);
      }
      if (i === n - 2 && r.elev[n - 1] > 0.25) {
        addTiltedDisc(deckMb, r.pts[n - 1], y1, dx / segLen, dz / segLen, slope, halfW, roadRgb, segMinY, segMaxY);
      }
    }

    // 2. 路面標線(兩側邊線 + 車道分隔虛線)
    const edgeOff = Math.max(0.5, halfW - 0.4);
    add3DMarkStrip(deckMb, r.pts, r.elev, miters, edgeOff, 0.15, cfg.yMark, r.oneway ? yellowRgb : whiteRgb, false);
    add3DMarkStrip(deckMb, r.pts, r.elev, miters, -edgeOff, 0.15, cfg.yMark, whiteRgb, false);
    const lanes = r.lanes ?? (r.width >= 9.5 ? 3 : r.width >= 6.5 ? 2 : 1);
    for (let k = 1; k < lanes; k++) {
      const laneOff = -halfW + (k * r.width) / lanes;
      add3DMarkStrip(deckMb, r.pts, r.elev, miters, laneOff, 0.15, cfg.yMark, whiteRgb, true);
    }

    // 3. 箱梁底板與兩側水泥防撞護欄(barrierMb)
    let pierAcc = 0;
    for (let i = 0; i + 1 < n; i++) {
      const e0 = r.elev[i], e1 = r.elev[i + 1];
      const y0 = e0 + cfg.yRoad, y1 = e1 + cfg.yRoad;
      const maxE = Math.max(e0, e1);
      const a = r.pts[i], b = r.pts[i + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segLen < 1e-3) continue;
      const sn = segNormal(a, b);

      // 箱梁混凝土底板與側緣梁腹(低高度段 < 3.2 m 為實心引道擋土牆,底緣貼地;較高段轉為懸空箱梁)
      if (maxE >= cfg.minSlabY) {
        const abutment0 = e0 < 3.2;
        const abutment1 = e1 < 3.2;
        const d0 = abutment0 ? y0 : Math.min(cfg.slabDepth, Math.max(0.18, e0 * 0.55));
        const d1 = abutment1 ? y1 : Math.min(cfg.slabDepth, Math.max(0.18, e1 * 0.55));
        const b0 = Math.max(0.0, y0 - d0);
        const b1 = Math.max(0.0, y1 - d1);
        const L0 = left[i], L1 = left[i + 1];
        const R0 = right[i], R1 = right[i + 1];
        // 底面(朝下;僅懸空段需要畫底面)
        if (!abutment0 || !abutment1) {
          quad(
            barrierMb,
            [
              [L0[0], b0, L0[1]],
              [L1[0], b1, L1[1]],
              [R1[0], b1, R1[1]],
              [R0[0], b0, R0[1]],
            ],
            [0, -1, 0],
            slabBottomRgb,
          );
        }
        // 左側梁腹/擋土牆(朝左 +sn)
        quad(
          barrierMb,
          [
            [L0[0], b0, L0[1]],
            [L0[0], y0, L0[1]],
            [L1[0], y1, L1[1]],
            [L1[0], b1, L1[1]],
          ],
          [sn[0], 0, sn[1]],
          slabSideRgb,
        );
        // 右側梁腹/擋土牆(朝右 -sn)
        quad(
          barrierMb,
          [
            [R1[0], b1, R1[1]],
            [R1[0], y1, R1[1]],
            [R0[0], y0, R0[1]],
            [R0[0], b0, R0[1]],
          ],
          [-sn[0], 0, -sn[1]],
          slabSideRgb,
        );
      }

      // 兩側水泥防撞護欄(匯流處自動開口;地面入口端高度平滑漸升)
      if (maxE >= cfg.minBarrierY) {
        const bw = cfg.barrierW;
        const bh0 = Math.min(cfg.barrierH, Math.max(0.18, e0 * 1.15));
        const bh1 = Math.min(cfg.barrierH, Math.max(0.18, e1 * 1.15));
        const rh = cfg.railH;
        for (const side of [1, -1] as const) {
          // 取本段三個取樣點檢查是否與其他高架匝道/主線匯流重疊
          let inMerge = false;
          for (const t of [0.2, 0.5, 0.8]) {
            const mx = miters[i][0] + (miters[i + 1][0] - miters[i][0]) * t;
            const mz = miters[i][1] + (miters[i + 1][1] - miters[i][1]) * t;
            const px = a[0] + (b[0] - a[0]) * t + mx * (halfW - 0.1) * side;
            const pz = a[1] + (b[1] - a[1]) * t + mz * (halfW - 0.1) * side;
            const py = e0 + (e1 - e0) * t;
            if (isSideInMergeZone(px, py, pz, r, i, contextPieces)) {
              inMerge = true;
              break;
            }
          }
          if (inMerge) continue;

          // 護欄內緣與外緣點
          const inOff = (halfW - bw * 0.5) * side;
          const outOff = (halfW + bw * 0.5) * side;
          const i0: Pt = [a[0] + miters[i][0] * inOff, a[1] + miters[i][1] * inOff];
          const i1: Pt = [b[0] + miters[i + 1][0] * inOff, b[1] + miters[i + 1][1] * inOff];
          const o0: Pt = [a[0] + miters[i][0] * outOff, a[1] + miters[i][1] * outOff];
          const o1: Pt = [b[0] + miters[i + 1][0] * outOff, b[1] + miters[i + 1][1] * outOff];
          const t0 = y0 + bh0, t1 = y1 + bh1;
          const rt0 = t0 + rh, rt1 = t1 + rh;

          if (side === 1) {
            // 左側護欄:內面朝右(-sn)、外面朝左(+sn)
            quad(barrierMb, [[i1[0], y1, i1[1]], [i1[0], t1, i1[1]], [i0[0], t0, i0[1]], [i0[0], y0, i0[1]]], [-sn[0], 0, -sn[1]], barrierRgb);
            quad(barrierMb, [[o0[0], y0, o0[1]], [o0[0], t0, o0[1]], [o1[0], t1, o1[1]], [o1[0], y1, o1[1]]], [sn[0], 0, sn[1]], barrierRgb);
            // 護欄頂部快速道路綠框
            quad(barrierMb, [[i1[0], t1, i1[1]], [i1[0], rt1, i1[1]], [i0[0], rt0, i0[1]], [i0[0], t0, i0[1]]], [-sn[0], 0, -sn[1]], railRgb);
            quad(barrierMb, [[o0[0], t0, o0[1]], [o0[0], rt0, o0[1]], [o1[0], rt1, o1[1]], [o1[0], t1, o1[1]]], [sn[0], 0, sn[1]], railRgb);
            quad(barrierMb, [[o0[0], rt0, o0[1]], [i0[0], rt0, i0[1]], [i1[0], rt1, i1[1]], [o1[0], rt1, o1[1]]], [0, 1, 0], railRgb);
          } else {
            // 右側護欄:內面朝左(+sn)、外面朝右(-sn)
            quad(barrierMb, [[i0[0], y0, i0[1]], [i0[0], t0, i0[1]], [i1[0], t1, i1[1]], [i1[0], y1, i1[1]]], [sn[0], 0, sn[1]], barrierRgb);
            quad(barrierMb, [[o1[0], y1, o1[1]], [o1[0], t1, o1[1]], [o0[0], t0, o0[1]], [o0[0], y0, o0[1]]], [-sn[0], 0, -sn[1]], barrierRgb);
            quad(barrierMb, [[i0[0], t0, i0[1]], [i0[0], rt0, i0[1]], [i1[0], rt1, i1[1]], [i1[0], t1, i1[1]]], [sn[0], 0, sn[1]], railRgb);
            quad(barrierMb, [[o1[0], t1, o1[1]], [o1[0], rt1, o1[1]], [o0[0], rt0, o0[1]], [o0[0], t0, o0[1]]], [-sn[0], 0, -sn[1]], railRgb);
            quad(barrierMb, [[i0[0], rt0, i0[1]], [o0[0], rt0, o0[1]], [o1[0], rt1, o1[1]], [i1[0], rt1, i1[1]]], [0, 1, 0], railRgb);
          }
        }
      }

      // 4. 下方混凝土橋墩(每 pierSpacing 一根,避開下方平面道路車道)
      pierAcc += segLen;
      if (pierAcc >= cfg.pierSpacing && (e0 + e1) * 0.5 >= cfg.minPierY) {
        pierAcc = 0;
        const mid: Pt = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
        const midY = (y0 + y1) * 0.5 - cfg.slabDepth;
        const onGroundRoad = groundRoads.some((gr) => distToPolyline(mid, gr.pts) < gr.width * 0.5 + 1.4);
        const tooCloseToPier = placedPiers.some((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) < 14);
        if (!onGroundRoad && !tooCloseToPier && midY > 2.0) {
          placedPiers.push(mid);
          const d: Pt = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen];
          addBox(barrierMb, mid, d, cfg.pierHalf[0], cfg.pierHalf[1], 0, midY - cfg.capH, pierRgb, false);
          addBox(barrierMb, mid, [-d[1], d[0]], Math.max(2.2, halfW * 0.78), cfg.pierHalf[0] + 0.15, midY - cfg.capH, midY, pierRgb);
        }
      }
    }
  }
}
