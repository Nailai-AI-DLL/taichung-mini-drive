// 折線工具:累積長度、依長度取點 / 取子段、左右平移。建置端(標線生成)與執行端(虛線、分隔島)共用。
import type { Pt } from './geom';

/** 每個頂點的累積長度 */
export function cumLength(line: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return out;
}

/** 長度 s 處的點與單位切線方向(超出範圍時夾在兩端) */
export function pointAt(line: Pt[], cum: number[], s: number): { p: Pt; dir: Pt } {
  const n = line.length;
  let i = 1;
  while (i < n - 1 && cum[i] < s) i++;
  const a = line[i - 1];
  const b = line[i];
  const len = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / len));
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return { p: [a[0] + dx * t, a[1] + dz * t], dir: [dx / l, dz / l] };
}

/** 長度 s0 到 s1 的子折線 */
export function sliceLine(line: Pt[], cum: number[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [pointAt(line, cum, s0).p];
  for (let i = 1; i < line.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(line[i]);
  out.push(pointAt(line, cum, s1).p);
  return out;
}

/** 左側法向量(與 ribbon.ts 相同:x 向右、z 向下的平面上,行進方向的左手邊) */
export function leftNormal(dir: Pt): Pt {
  return [dir[1], -dir[0]];
}

/** 每個頂點的斜接法向量與縮放(轉角處讓平移後的線與原線保持等距;過尖時截斷) */
export function miterNormals(line: Pt[]): { n: Pt; k: number }[] {
  const n = line.length;
  const seg = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dz / l, -dx / l];
  };
  const out: { n: Pt; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const n1 = i > 0 ? seg(line[i - 1], line[i]) : seg(line[0], line[1]);
    const n2 = i < n - 1 ? seg(line[i], line[i + 1]) : n1;
    let mx = n1[0] + n2[0];
    let mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) [mx, mz] = n1;
    else [mx, mz] = [mx / ml, mz / ml];
    const dot = mx * n1[0] + mz * n1[1];
    out.push({ n: [mx, mz], k: Math.min(1 / Math.max(dot, 1e-3), 2.5) });
  }
  return out;
}

/** 往左平移 d 公尺(d < 0 往右) */
export function offsetLine(line: Pt[], d: number): Pt[] {
  return miterNormals(line).map(({ n, k }, i) => [line[i][0] + n[0] * d * k, line[i][1] + n[1] * d * k]);
}

/** 虛線:從折線起點開始,畫 on 公尺、空 off 公尺,回傳每一段實線 */
export function dashes(line: Pt[], on: number, off: number): Pt[][] {
  const cum = cumLength(line);
  const total = cum[cum.length - 1];
  const out: Pt[][] = [];
  for (let s = 0; s < total; s += on + off) out.push(sliceLine(line, cum, s, Math.min(total, s + on)));
  return out.filter((d) => d.length >= 2);
}
