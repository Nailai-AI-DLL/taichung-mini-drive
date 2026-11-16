// 玩家車大燈(decisions/0043):夜裡開、白天關;一直掛著(開關不改燈數,材質不重新編譯)。
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarMesh } from '../../src/render/scene';
import { DEFAULT_PARAMS } from '../../src/vehicle/params';
import { HEADLIGHT } from '../../src/config/look';

describe('大燈', () => {
  it('預設關(強度 0)但已掛在車上;夜裡打開;照射點在車頭前方、比燈低', () => {
    const car = new CarMesh(DEFAULT_PARAMS);
    const spots: THREE.SpotLight[] = [];
    car.group.traverse((o) => (o as THREE.SpotLight).isSpotLight && spots.push(o as THREE.SpotLight));
    expect(spots).toHaveLength(1);
    expect(car.headlight.intensity).toBe(0);
    car.setHeadlights(true);
    expect(car.headlight.intensity).toBe(HEADLIGHT.intensity);
    car.setHeadlights(false);
    expect(car.headlight.intensity).toBe(0);
    const t = car.headlight.target.position, p = car.headlight.position;
    expect(t.x - p.x).toBeGreaterThan(10);
    expect(t.y).toBeLessThan(p.y);
  });
});
