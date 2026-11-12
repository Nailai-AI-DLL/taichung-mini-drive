// 雙黃線平順度量測(decisions/0018):讀建好的 world.json,找「兩條黃線、左右對稱」的標線,
// 沿線每 1 m 重新取樣,算每個取樣點離「前後各 1 m 兩點連線」多遠(側向偏移)。
// 平順的彎道(半徑 100 m)只有約 0.5 cm;鋸齒、折角會變大。數字越小越平順。
// 用法:npx tsx tools/dev/yellow-roughness.ts [range-a]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUANT, type WorldJson } from '../../src/map/types';

/** dense:只算每公尺 ≥ 0.8 個頂點的(對向車道配對的雙黃線,每 1 m 取樣一點);false = 只算其他(雙向道路自己的雙黃線) */
export function yellowRoughness(area = 'range-a', dense?: boolean) {
  const json = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/map', area, 'world.json'), 'utf8')) as WorldJson;
  const devs: number[] = [];
  let verts = 0;
  let len = 0;
  let strips = 0;
  for (const s of json.street?.strips ?? []) {
    const y = s.m.filter((m) => m.c === 1);
    if (y.length !== 2 || Math.abs(y[0].o + y[1].o) > 1e-6) continue;
    const p: [number, number][] = [];
    for (let i = 0; i < s.pts.length; i += 2) p.push([s.pts[i] / QUANT, s.pts[i + 1] / QUANT]);
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    if (dense !== undefined && (p.length / Math.max(1, cum[cum.length - 1]) >= 0.8) !== dense) continue;
    strips++;
    verts += p.length;
    len += cum[cum.length - 1];
    const total = cum[cum.length - 1];
    const at = (d: number): [number, number] => {
      let i = 1;
      while (i < p.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t];
    };
    for (let d = 1; d + 1 <= total; d += 1) {
      const a = at(d - 1), m = at(d), b = at(d + 1);
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const l = Math.hypot(ex, ez) || 1;
      devs.push(Math.abs(((m[0] - a[0]) * ez - (m[1] - a[1]) * ex) / l));
    }
  }
  devs.sort((a, b) => a - b);
  const q = (f: number) => devs.length ? devs[Math.min(devs.length - 1, Math.floor(devs.length * f))] : 0;
  return { strips, lengthM: Math.round(len), vertsPerM: +(verts / Math.max(1, len)).toFixed(2), p50cm: +(q(0.5) * 100).toFixed(1), p95cm: +(q(0.95) * 100).toFixed(1), maxCm: +(q(1) * 100).toFixed(1) };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log('配對雙黃線', yellowRoughness(process.argv[2], true), '\n雙向道路雙黃線', yellowRoughness(process.argv[2], false));
