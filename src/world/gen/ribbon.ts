// 帶狀路面與圓盤(道路、人行道、水道)。建置端與執行端共用。
import type { Pt } from './geom';
import type { MeshBuilder } from './mesh';

/**
 * 帶狀路面:沿折線左右各偏移 width/2(轉角用斜接,過尖時截斷),兩端加圓形端蓋。
 * 圓形端蓋讓路口的接縫自然填滿;重疊的路面同色同高,不會產生可見的閃爍。
 * maxCrossStep > 0 時,寬度大於 maxCrossStep 的大馬路會做橫向細分,確保寬路面平順貼合 3D 地形曲面而不被地形刺穿。
 */
export function addRibbon(mb: MeshBuilder, line: Pt[], width: number, y: number, rgb: [number, number, number], caps = true, maxCrossStep = 0) {
  const n = line.length;
  if (n < 2) return;
  const h = width / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(n - 1, i + 1)];
    // 前後段的法向量(左側)
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
    const scale = Math.min(h / Math.max(dot, 1e-3), h * 2.5);
    const p = line[i];
    left.push([p[0] + mx * scale, p[1] + mz * scale]);
    right.push([p[0] - mx * scale, p[1] - mz * scale]);
  }
  const up = (a: number, b: number, c: number) => (mb.isUpward(a, b, c) ? mb.tri(a, b, c) : mb.tri(a, c, b));
  const cols = maxCrossStep > 0 && width > maxCrossStep ? Math.min(8, Math.ceil(width / maxCrossStep)) : 1;
  if (cols === 1) {
    let pl = mb.vertex(left[0][0], y, left[0][1], 0, 1, 0, rgb);
    let pr = mb.vertex(right[0][0], y, right[0][1], 0, 1, 0, rgb);
    for (let i = 1; i < n; i++) {
      const cl = mb.vertex(left[i][0], y, left[i][1], 0, 1, 0, rgb);
      const cr = mb.vertex(right[i][0], y, right[i][1], 0, 1, 0, rgb);
      up(pl, pr, cr);
      up(pl, cr, cl);
      pl = cl;
      pr = cr;
    }
  } else {
    const emitRow = (idx: number): number[] => {
      const row: number[] = new Array(cols + 1);
      const lx = left[idx][0], lz = left[idx][1];
      const dx = right[idx][0] - lx, dz = right[idx][1] - lz;
      for (let c = 0; c <= cols; c++) {
        const t = c / cols;
        row[c] = mb.vertex(lx + dx * t, y, lz + dz * t, 0, 1, 0, rgb);
      }
      return row;
    };
    let prevRow = emitRow(0);
    for (let i = 1; i < n; i++) {
      const curRow = emitRow(i);
      for (let c = 0; c < cols; c++) {
        up(prevRow[c], prevRow[c + 1], curRow[c + 1]);
        up(prevRow[c], curRow[c + 1], curRow[c]);
      }
      prevRow = curRow;
    }
  }
  if (caps) {
    addDisc(mb, line[0], h, y, rgb, 14, maxCrossStep);
    addDisc(mb, line[n - 1], h, y, rgb, 14, maxCrossStep);
  }
}

export function addDisc(mb: MeshBuilder, c: Pt, r: number, y: number, rgb: [number, number, number], segments = 14, maxRadialStep = 0) {
  const center = mb.vertex(c[0], y, c[1], 0, 1, 0, rgb);
  const ringsCount = maxRadialStep > 0 && r > maxRadialStep ? Math.min(4, Math.ceil(r / maxRadialStep)) : 1;
  let prevRing: number[] | null = null;
  for (let rk = 1; rk <= ringsCount; rk++) {
    const rr = (r * rk) / ringsCount;
    const ring: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring.push(mb.vertex(c[0] + Math.cos(a) * rr, y, c[1] + Math.sin(a) * rr, 0, 1, 0, rgb));
    }
    if (!prevRing) {
      for (let i = 0; i < segments; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % segments];
        if (mb.isUpward(center, a, b)) mb.tri(center, a, b);
        else mb.tri(center, b, a);
      }
    } else {
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        const a = prevRing[i], b = prevRing[j], d = ring[i], e = ring[j];
        if (mb.isUpward(a, d, e)) mb.tri(a, d, e);
        else mb.tri(a, e, d);
        if (mb.isUpward(a, e, b)) mb.tri(a, e, b);
        else mb.tri(a, b, e);
      }
    }
    prevRing = ring;
  }
}

function segNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  // 左側法向量(x 向右、z 向下的平面上,逆時針轉 90°)
  return [dz / l, -dx / l];
}
