// P0 地標(decisions/0013):位置驗收(M1:地標座標與參考座標誤差 < 10 m)、挖掉原建築、碰撞量體。
// 需要先建置:npm run map:build:range-a
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../helpers/load-map';
import { worldToLonLat } from '../../src/map/projection';
import { buildChunk, SINK_RAIL_H } from '../../src/world/chunks';
import { centroid, pointInPolygon, type Pt } from '../../src/world/gen/geom';
import { QUANT } from '../../src/map/types';
import { PARAPET_HEIGHT } from '../../src/world/gen/extrude';

const world = loadWorld('range-a');
const cfg = JSON.parse(readFileSync(join(__dirname, '../../data/landmarks/landmarks.json'), 'utf8')).landmarks as {
  id: string;
  ref: [number, number];
  height?: number;
}[];

/** 兩個經緯度的距離(公尺,haversine) */
function distM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('P0 地標', () => {
  it('設定檔的 5 個地標都有輸出', () => {
    expect(world.json.landmarks.map((l) => l.id).sort()).toEqual(cfg.map((c) => c.id).sort());
  });

  for (const c of cfg) {
    it(`${c.id}:位置與參考座標誤差 < 10 m`, () => {
      const l = world.json.landmarks.find((l) => l.id === c.id)!;
      const [lon, lat] = worldToLonLat(l.x, l.z, world.json.meta.origin);
      expect(distM(lat, lon, c.ref[0], c.ref[1])).toBeLessThan(10);
    });
  }

  // 寫死預期值:只讀設定檔的話,height 被刪掉時測試會跟著略過(驗收發現的問題)
  const REAL_H: Record<string, number> = { opera: 37.7, 'station-new': 37, 'station-old': 21, 'city-hall': 43.2, council: 69.8 };
  it('有查到實際高度的地標，用實際高度取代 OSM 推估(歌劇院 OSM 推估 19.2 m,實際 37.7 m)', () => {
    for (const [id, h] of Object.entries(REAL_H)) expect(world.json.landmarks.find((l) => l.id === id)!.h / 10, id).toBeCloseTo(h, 1);
  });

  it('碰撞與替代量體的高度等於地標高度', () => {
    for (const c of world.chunks.values()) {
      if (!c.landmarks.length) continue;
      const m = buildChunk(c);
      c.landmarks.forEach((l, i) => {
        const pos = m.landmarkSolids[i].position;
        let top = -Infinity;
        for (let k = 1; k < pos.length; k += 3) top = Math.max(top, pos[k]);
        // 下沉地標(decisions/0035):只有欄杆高、沒有女兒牆
        if (l.sink) expect(top, l.id).toBeCloseTo(SINK_RAIL_H, 1);
        // 擠出量體頂端多一道女兒牆
        else expect(top - PARAPET_HEIGHT, l.id).toBeCloseTo(REAL_H[l.id] ?? l.h, 1);
      });
    }
  });

  it('地標外框內沒有殘留的一般建築', () => {
    for (const l of world.json.landmarks) {
      const rings = l.rings.map((r) => {
        const out: Pt[] = [];
        for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT + l.x, r[i + 1] / QUANT + l.z]);
        return out;
      });
      for (const b of world.json.buildings) {
        const ring: Pt[] = [];
        for (let i = 0; i < b.rings[0].length; i += 2) ring.push([b.rings[0][i] / QUANT, b.rings[0][i + 1] / QUANT]);
        const ctr = centroid(ring);
        expect(rings.some((r) => pointInPolygon(ctr, r)), `建築 ${b.id} 在地標 ${l.id} 內`).toBe(false);
      }
    }
  });

  it('每個地標所在的格子都會生成碰撞量體', () => {
    let n = 0;
    for (const c of world.chunks.values()) {
      if (!c.landmarks.length) continue;
      const m = buildChunk(c);
      expect(m.landmarkSolids).toHaveLength(c.landmarks.length);
      for (const s of m.landmarkSolids) expect(s.index.length).toBeGreaterThan(0);
      n += c.landmarks.length;
    }
    expect(n).toBe(world.json.landmarks.length);
  });
});
