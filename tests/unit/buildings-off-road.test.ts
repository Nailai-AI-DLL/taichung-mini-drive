// 建築不壓到車道(decisions/0026,Cooper 2026-11-13:「這棟建築物蓋到道路上了」)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROAD_CLEAR_MARGIN, clearBuildingsOffRoads } from '../../tools/map-build/lib/buildings';
import type { Pt } from '../../src/world/gen/geom';

const road = (highway = 'residential', bridge = false) => ({ pts: [[-50, 0], [50, 0]] as Pt[], width: 12, highway, bridge });
const box = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

describe('建築不壓到車道', () => {
  it('伸進車道的部分被切到車道邊緣外,其他部分不動', () => {
    // 車道 z ∈ [−6, 6];建築 z ∈ [4, 20] 伸進去 2 m
    const [r] = clearBuildingsOffRoads([box(-10, 4, 10, 20)], [road()]);
    expect(r.status).toBe('clipped');
    const zs = r.ring.map((p) => p[1]);
    expect(Math.min(...zs)).toBeCloseTo(6 + ROAD_CLEAR_MARGIN);
    expect(Math.max(...zs)).toBeCloseTo(20);
  });

  it('沒壓到的建築原樣;高架橋下的建築不切', () => {
    expect(clearBuildingsOffRoads([box(-10, 8, 10, 20)], [road()])[0].status).toBe('ok');
    expect(clearBuildingsOffRoads([box(-10, 4, 10, 20)], [road('primary', true)])[0].status).toBe('ok');
  });

  it('一般道路直接穿過建築 → 整棟拿掉;服務道路穿過 → 不動', () => {
    expect(clearBuildingsOffRoads([box(-10, -10, 10, 10)], [road()])[0].status).toBe('removed');
    expect(clearBuildingsOffRoads([box(-10, -10, 10, 10)], [road('service')])[0].status).toBe('through-service');
  });

  it('大半都在車道裡的小建築整棟拿掉', () => {
    expect(clearBuildingsOffRoads([box(-3, 1, 3, 7)], [road()])[0].status).toBe('removed');
  });

  it('實際地圖:一般道路(非服務道路、非橋)的車道上,伸進超過 1 m 的建築不到 10 棟', () => {
    const w = JSON.parse(readFileSync(new URL('../../public/map/range-a/world.json', import.meta.url), 'utf8'));
    const deq = (v: number[]) => v.reduce<Pt[]>((o, _, i) => (i % 2 ? o : [...o, [v[i] / 10, v[i + 1] / 10]]), []);
    // 再跑一次清理:已經清過的地圖,應該幾乎沒有東西要切(量化誤差 0.1 m 內)
    const rings: Pt[][] = w.buildings.map((b: { rings: number[][] }) => deq(b.rings[0]));
    const roads = w.roads.filter((r: { highway: string }) => r.highway !== 'service').map((r: { pts: number[]; width: number; highway: string }) => ({ pts: deq(r.pts), width: r.width - 2, highway: r.highway }));
    const res = clearBuildingsOffRoads(rings, roads);
    expect(res.filter((r) => r.status !== 'ok').length).toBeLessThan(10);
  }, 60000);
});
