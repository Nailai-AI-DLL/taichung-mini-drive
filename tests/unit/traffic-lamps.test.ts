// 其他車輛的車燈(decisions/0047):夜裡才顯示,數量跟車子一致,頭燈在車頭、尾燈在車尾。
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TrafficLayer } from '../../src/render/traffic';
import type { TrafficCar } from '../../src/traffic/traffic';

const car = (id: number, kind: 'car' | 'bus', x: number): TrafficCar =>
  ({ id, x, z: 0, heading: 0, speed: 0, cruise: 0, pace: 0, way: 0, from: 0, dir: 1, s: 0, lane: 0, color: 0, kind, stuck: 0 });

describe('其他車輛的車燈', () => {
  it('白天不顯示;夜裡顯示，數量 = 車數;頭燈在 +x(車頭)、尾燈在 −x', () => {
    const scene = new THREE.Scene();
    const layer = new TrafficLayer(scene);
    const lamps = scene.children.filter((o) => o.name.startsWith('traffic-lamps')) as THREE.InstancedMesh[];
    expect(lamps).toHaveLength(4);
    layer.sync([car(1, 'car', 0), car(2, 'car', 20), car(3, 'bus', 40)]);
    expect(lamps.every((m) => !m.visible)).toBe(true);
    layer.setNight(true);
    layer.sync([car(1, 'car', 0), car(2, 'car', 20), car(3, 'bus', 40)]);
    const carLamps = lamps.filter((m) => m.name.endsWith('car'));
    const busLamps = lamps.filter((m) => m.name.endsWith('bus'));
    expect(carLamps.map((m) => m.count)).toEqual([2, 2]);
    expect(busLamps.map((m) => m.count)).toEqual([1, 1]);
    const [head, tail] = carLamps.map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!; });
    expect(head.min.x).toBeGreaterThan(0);
    expect(tail.max.x).toBeLessThan(0);
  });
});
