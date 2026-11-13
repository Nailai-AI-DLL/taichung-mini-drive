// 路上的其他車輛(decisions/0028)
import { describe, expect, it } from 'vitest';
import { Traffic, mulberry32 } from '../../src/traffic/traffic';
import { TRAFFIC } from '../../src/config/traffic';
import type { RoadWay } from '../../src/map/types';

const way = (osmId: number, points: number[], o: Partial<RoadWay> = {}): RoadWay => ({ osmId, name: 'r' + osmId, nameEn: '', highway: 'residential', oneway: false, width: 12, points, ...o });
// 十字路:東西向(z = 0)與南北向(x = 0),在原點相接;各長 800 m
const cross = () => [way(1, [-400, 0, 0, 0, 400, 0]), way(2, [0, -400, 0, 0, 0, 400])];
const run = (t: Traffic, seconds: number, player = { x: 0, z: 0 }) => {
  for (let i = 0; i < seconds * 60; i++) t.update(1 / 60, player);
};

describe('其他車輛', () => {
  it('會補到定額,都生成在離玩家夠遠的路上', () => {
    const t = new Traffic(cross(), mulberry32(1));
    // 只跑一步:剛生成、還沒移動,位置就是生成位置
    for (let i = 0; i < 40; i++) {
      const before = new Set(t.cars.map((c) => c.id));
      t.update(1 / 60, { x: 0, z: 0 });
      for (const c of t.cars) if (!before.has(c.id)) expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(TRAFFIC.spawnMin * 0.8 - 1);
    }
    expect(t.cars.length).toBeGreaterThan(8);
    expect(t.cars.length).toBeLessThanOrEqual(TRAFFIC.count);
  });

  it('生成位置離玩家至少 spawnMin × 0.8,彼此至少 spawnGap', () => {
    const t = new Traffic(cross(), mulberry32(2));
    const seen: { x: number; z: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const c = t.spawn(0, 0);
      if (!c) continue;
      expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(TRAFFIC.spawnMin * 0.8);
      for (const o of seen) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(TRAFFIC.spawnGap);
      seen.push({ x: c.x, z: c.z });
    }
    expect(seen.length).toBeGreaterThan(5);
  });

  it('靠右行駛:雙向道上,車子在行車方向的右半邊', () => {
    const t = new Traffic([way(1, [-400, 0, 400, 0])], mulberry32(3));
    run(t, 3, { x: 0, z: 200 });
    expect(t.cars.length).toBeGreaterThan(3);
    for (const c of t.cars) {
      // 往 +x 開(dir = 1):右側是 +z;往 −x 開:右側是 −z
      expect(Math.sign(c.z)).toBe(c.dir);
      expect(Math.abs(c.z)).toBeLessThan(6);
      expect(Math.cos(c.heading) * c.dir).toBeGreaterThan(0.9);
    }
  });

  it('單行道只順向開', () => {
    const t = new Traffic([way(1, [-400, 0, 400, 0], { oneway: true })], mulberry32(4));
    run(t, 3, { x: 0, z: 200 });
    expect(t.cars.length).toBeGreaterThan(2);
    for (const c of t.cars) expect(c.dir).toBe(1);
  });

  it('車速不超過巡航上限;前方有玩家會停下來,不會撞上去', () => {
    const t = new Traffic([way(1, [-400, 0, 400, 0], { oneway: true, width: 3.3 })], mulberry32(5));
    let c = t.spawn(-200, 0);
    for (let i = 0; i < 50 && !c; i++) c = t.spawn(-200, 0);
    if (!c) throw new Error('生成失敗');
    // 玩家停在它前方 40 m 的車道上
    const tx = t.target(c);
    const player = { x: tx.x + 40, z: tx.z };
    let minGap = Infinity;
    for (let i = 0; i < 10 * 60; i++) {
      t.update(1 / 60, player);
      const me = t.cars.find((o) => o.id === c.id);
      if (!me) break;
      expect(me.speed).toBeLessThanOrEqual(TRAFFIC.speedKmh[1] / 3.6 + 1e-6);
      if (me.x < player.x) minGap = Math.min(minGap, player.x - me.x);
    }
    const me = t.cars.find((o) => o.id === c.id)!;
    expect(me.speed).toBeLessThan(0.1);
    // 中心距:兩台車各長約 4 m,要大於 4.5 m 車身才沒有重疊
    expect(minGap).toBeGreaterThan(4.5);
  });

  it('到路口會轉到別條路;不開進服務道路', () => {
    // 服務道路和主路共用折點 (200, 0):車子經過這個路口也不能轉進去
    const ways = [way(1, [-400, 0, 0, 0, 200, 0, 400, 0]), way(2, [0, -400, 0, 0, 0, 400]), way(3, [200, 0, 200, 300], { highway: 'service' })];
    const t = new Traffic(ways, mulberry32(6));
    const visited = new Set<number>();
    const turned = new Set<number>();
    const first = new Map<number, number>();
    // 玩家站在路口外(站在路口正中央的話,四個方向的車都會停下來禮讓)
    for (let i = 0; i < 60 * 60; i++) {
      t.update(1 / 60, { x: 120, z: 120 });
      for (const c of t.cars) {
        visited.add(c.way);
        if (!first.has(c.id)) first.set(c.id, c.way);
        else if (first.get(c.id) !== c.way) turned.add(c.id);
      }
    }
    expect(visited.has(2)).toBe(false);
    expect(turned.size).toBeGreaterThan(0);
  });

  it('離玩家太遠會消失;回傳消失的 id', () => {
    const t = new Traffic(cross(), mulberry32(7));
    run(t, 2);
    const ids = t.cars.map((c) => c.id);
    const gone = t.update(1 / 60, { x: 5000, z: 5000 });
    expect(gone.sort()).toEqual(ids.sort());
    expect(t.cars.length).toBe(0);
  });
});
