// 「接送慈慈」(decisions/0029):Cooper 2026-11-13 拍板的規則都要有測試
import { describe, expect, it } from 'vitest';
import { ImpactDetector, PickupGame, impatienceRate, pickSpot, pickSpotWithFallback, type Spot } from '../../src/game/pickup';
import { PICKUP } from '../../src/config/pickup';
import { mulberry32 } from '../../src/traffic/traffic';
import type { RoadWay } from '../../src/map/types';

const spots = (list: Spot[]) => {
  let i = 0;
  return () => list[i++ % list.length];
};
const A: Spot = { x: 400, z: 0, label: '甲路' };
const B: Spot = { x: 400, z: 500, label: '乙路' };
const game = (respect = 0) => new PickupGame(spots([A, B]), mulberry32(1), respect);
const far = { x: 0, z: 0, speedKmh: 30 };
const tick = (g: PickupGame, seconds: number, p = far) => {
  const ev = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) ev.push(...g.update(1 / 60, p));
  return ev;
};

/** 放著不管,跑到這一局失敗為止;回傳期間的事件 */
const untilFail = (g: PickupGame) => {
  const ev = [];
  for (let i = 0; i < 600 * 60 && g.phase !== 'failed'; i++) ev.push(...g.update(1 / 60, far));
  return ev;
};

describe('不耐煩值', () => {
  it('時間額度 = 路程 ÷ 30 km/h × 1.5:額度用完剛好 100%', () => {
    const dist = 400;
    const budget = ((dist * PICKUP.routeFactor) / (30 / 3.6)) * 1.5;
    expect(impatienceRate(dist, 0) * budget).toBeCloseTo(100);
  });

  it('開局從 0 開始持續上升;超過 100% 失敗', () => {
    const g = game();
    g.start(far);
    expect(g.impatience).toBe(0);
    tick(g, 10);
    const at10 = g.impatience;
    expect(at10).toBeGreaterThan(0);
    const ev = tick(g, 200);
    expect(ev.some((e) => e.type === 'failed')).toBe(true);
  });

  it('拍板:上一局成功,這局漲得比較慢;最慢到 minRate', () => {
    expect(impatienceRate(400, 1)).toBeLessThan(impatienceRate(400, 0));
    expect(impatienceRate(400, 1) / impatienceRate(400, 0)).toBeCloseTo(1 - PICKUP.respectSlow);
    expect(impatienceRate(400, 99) / impatienceRate(400, 0)).toBeCloseTo(PICKUP.minRate);
  });
});

describe('一局的流程', () => {
  it('接到(停在旁邊)→ 不耐煩值降一半、換成目的地;送到 → 成功、尊敬 +1', () => {
    const g = game();
    g.start(far);
    tick(g, 20);
    const before = g.impatience;
    // 擦過去(車速太快)不算
    expect(tick(g, 0.5, { x: A.x + 3, z: A.z, speedKmh: 30 }).some((e) => e.type === 'picked')).toBe(false);
    const ev = g.update(1 / 60, { x: A.x + 3, z: A.z, speedKmh: 2 });
    expect(ev.some((e) => e.type === 'picked')).toBe(true);
    expect(g.phase).toBe('dropoff');
    expect(g.impatience).toBeCloseTo(before * PICKUP.pickupKeep, 0);
    expect(g.target).toEqual(B);
    const ev2 = g.update(1 / 60, { x: B.x, z: B.z + 5, speedKmh: 0 });
    expect(ev2.some((e) => e.type === 'delivered')).toBe(true);
    expect(g.phase).toBe('success');
    expect(g.respect).toBe(1);
  });

  it('成功或失敗後停幾秒自動開下一局,不耐煩值歸零', () => {
    const g = game();
    g.start(far);
    untilFail(g);
    expect(g.phase).toBe('failed');
    const ev = tick(g, PICKUP.resultSeconds + 0.1);
    expect(ev.some((e) => e.type === 'round')).toBe(true);
    expect(g.phase).toBe('pickup');
    expect(g.impatience).toBeLessThan(1);
  });

  it('拍板:失敗尊敬只扣一點(−1),不歸零、不低於 0', () => {
    const g = game(3);
    g.start(far);
    untilFail(g);
    expect(g.respect).toBe(2);
    const z = game(0);
    z.start(far);
    untilFail(z);
    expect(z.respect).toBe(0);
  });

  it('拍板:撞到東西加不耐煩值(撞車比撞牆多);冷卻時間內只算一次;結算畫面不算', () => {
    const g = game();
    g.start(far);
    g.hit('car');
    expect(g.impatience).toBeCloseTo(PICKUP.hitCar);
    g.hit('car');
    expect(g.impatience).toBeCloseTo(PICKUP.hitCar);
    tick(g, PICKUP.hitCooldown + 0.1);
    const v = g.impatience;
    g.hit('wall');
    expect(g.impatience).toBeCloseTo(v + PICKUP.hitWall);
    expect(PICKUP.hitCar).toBeGreaterThan(PICKUP.hitWall);
    untilFail(g);
    expect(g.hit('car')).toEqual([]);
  });

  it('台詞:開局叫車帶地點;50% 和 80% 各催一次', () => {
    const g = game();
    const ev = g.start(far);
    const call = ev.find((e) => e.type === 'say');
    expect(call && call.type === 'say' && call.text.includes('甲路')).toBe(true);
    const says = untilFail(g).filter((e) => e.type === 'say').map((e) => (e.type === 'say' ? e.key : ''));
    expect(says.filter((k) => k === 'nag50').length).toBe(1);
    expect(says.filter((k) => k === 'nag80').length).toBe(1);
    expect(says).toContain('lose');
  });
});

describe('挑不到地點', () => {
  it('開局挑不到:不會當掉,之後每步重試,挑到就開始', () => {
    let ok = false;
    const g = new PickupGame(() => (ok ? A : null), mulberry32(1));
    expect(g.start(far)).toEqual([]);
    expect(tick(g, 1)).toEqual([]);
    expect(g.impatience).toBe(0);
    ok = true;
    expect(tick(g, 0.1).some((e) => e.type === 'round')).toBe(true);
  });

  it('上一局成功後,下一局實際漲得比較慢', () => {
    const g = game();
    g.start(far);
    const r0 = g.rate;
    g.update(1 / 60, { x: A.x, z: A.z, speedKmh: 0 });
    g.update(1 / 60, { x: B.x, z: B.z, speedKmh: 0 });
    expect(g.phase).toBe('success');
    // 下一局的接人點又是 A(測試用的輪流清單),從同一個位置出發 → 距離一樣,漲速應該變慢
    tick(g, PICKUP.resultSeconds + 0.1, far);
    expect(g.phase).toBe('pickup');
    expect(g.rate).toBeCloseTo(r0 * (1 - PICKUP.respectSlow));
  });
});

describe('接送點', () => {
  const way = (name: string, points: number[], o: Partial<RoadWay> = {}): RoadWay => ({ osmId: 1, name, nameEn: '', highway: 'residential', oneway: false, width: 12, points, ...o });
  const ways = [way('大路', [-1000, 0, 1000, 0]), way('', [0, -1000, 0, 1000]), way('停車場', [0, 300, 600, 300], { highway: 'service' }), way('小巷', [0, -300, 600, -300], { width: 4 })];

  it('距離在範圍內、在有名字的夠寬道路的路緣外;不選服務道路、窄巷、沒名字的路', () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 50; i++) {
      const s = pickSpot(ways, { x: 0, z: 0 }, rand)!;
      expect(s).toBeTruthy();
      const d = Math.hypot(s.x, s.z);
      expect(d).toBeGreaterThanOrEqual(PICKUP.range[0]);
      expect(d).toBeLessThanOrEqual(PICKUP.range[1]);
      expect(s.label).toBe('大路');
      expect(Math.abs(s.z)).toBeCloseTo(12 / 2 + PICKUP.curbOffset);
    }
  });

  it('位置檢查沒過的點不選;正常距離挑不到時放寬距離再挑(驗收 2026-11-13)', () => {
    // 只接受 z > 0 那一側
    const rand = mulberry32(5);
    for (let i = 0; i < 30; i++) expect(pickSpot(ways, { x: 0, z: 0 }, rand, [], PICKUP, (_x, z) => z > 0)!.z).toBeGreaterThan(0);
    expect(pickSpot(ways, { x: 0, z: 0 }, rand, [], PICKUP, () => false)).toBeNull();
    // 路只有 200 m 長:正常距離(300–650 m)挑不到,放寬後(150–1300 m)挑得到
    const short = [way('短路', [0, 0, 200, 0])];
    expect(pickSpot(short, { x: 0, z: 0 }, mulberry32(6))).toBeNull();
    const s = pickSpotWithFallback(short, { x: 0, z: 0 }, mulberry32(6));
    expect(s).toBeTruthy();
    expect(Math.hypot(s!.x, s!.z)).toBeGreaterThanOrEqual(PICKUP.range[0] * 0.5);
  });

  it('附近有地標就用地標名稱;沒有合適的路回傳 null', () => {
    const s = pickSpot([ways[0]], { x: 0, z: 0 }, mulberry32(3), [{ name: '歌劇院', x: 400, z: 0 }, { name: '歌劇院', x: -400, z: 0 }, { name: '歌劇院', x: 600, z: 0 }, { name: '歌劇院', x: -600, z: 0 }]);
    expect(s!.label).toBe('歌劇院');
    expect(pickSpot([ways[2]], { x: 0, z: 0 }, mulberry32(3))).toBeNull();
  });
});

describe('撞擊判定', () => {
  it('一步內車速劇變才算;正常加減速、第一步、reset 後那一步都不算', () => {
    const d = new ImpactDetector();
    expect(d.step(16, 0)).toBe(false);
    expect(d.step(15.8, 0)).toBe(false); // 全力煞車
    expect(d.step(10, 0)).toBe(true); // 撞牆
    d.reset();
    expect(d.step(0, 0)).toBe(false);
    expect(d.step(0, 3)).toBe(true); // 被側撞
  });
});
