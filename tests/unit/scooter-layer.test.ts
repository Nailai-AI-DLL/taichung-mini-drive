// 機車 InstancedMesh(src/render/scooters.ts,0015 §11.8):矩陣、卸載、容量擴充(驗收 2026-11-01:原本沒有任何測試)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ScooterLayer } from '../../src/render/scooters';

const setup = () => {
  const scene = new THREE.Scene();
  const layer = new ScooterLayer(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), [new THREE.Color(1, 0, 0), new THREE.Color(0, 0, 1)]);
  const mesh = () => scene.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh | undefined;
  return { scene, layer, mesh };
};

describe('ScooterLayer', () => {
  it('實例矩陣:局部 +x 轉到 (cos a, 0, sin a),原點平移到 (x, 0, z);顏色依色號', () => {
    const { layer, mesh } = setup();
    const a = 0.7;
    layer.set({}, new Float32Array([10, 20, a, 1]));
    const m = new THREE.Matrix4();
    mesh()!.getMatrixAt(0, m);
    const px = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(px.x).toBeCloseTo(10 + Math.cos(a), 5);
    expect(px.z).toBeCloseTo(20 + Math.sin(a), 5);
    const o = new THREE.Vector3().applyMatrix4(m);
    expect([o.x, o.y, o.z]).toEqual([10, 0, 20]);
    const col = new THREE.Color();
    mesh()!.getColorAt(0, col);
    expect(col.b).toBeCloseTo(1, 5);
    expect(mesh()!.count).toBe(1);
  });

  it('卸載一格後只剩其他格的機車;全部卸載後 0 台', () => {
    const { layer, mesh } = setup();
    const k1 = {}, k2 = {};
    layer.set(k1, new Float32Array([0, 0, 0, 0, 1, 0, 0, 0]));
    layer.set(k2, new Float32Array([50, 50, 0, 1]));
    expect(mesh()!.count).toBe(3);
    layer.delete(k1);
    expect(mesh()!.count).toBe(1);
    const m = new THREE.Matrix4();
    mesh()!.getMatrixAt(0, m);
    expect(new THREE.Vector3().applyMatrix4(m).x).toBe(50);
    layer.delete(k2);
    expect(mesh()!.count).toBe(0);
  });

  it('超過容量(1024)時換更大的 InstancedMesh,場景裡只有一個', () => {
    const { scene, layer, mesh } = setup();
    // 先載入少量(容量 1024),再載入一格大的,總數超過原容量
    layer.set({}, new Float32Array([-1, 0, 0, 0]));
    expect(mesh()!.instanceMatrix.count).toBe(1024);
    const many = new Float32Array(1499 * 4);
    for (let i = 0; i < 1499; i++) many[i * 4] = i + 1;
    layer.set({}, many);
    expect(mesh()!.count).toBe(1500);
    expect(mesh()!.instanceMatrix.count).toBeGreaterThanOrEqual(1500);
    expect(scene.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(1);
    const m = new THREE.Matrix4();
    mesh()!.getMatrixAt(1499, m);
    expect(new THREE.Vector3().applyMatrix4(m).x).toBe(1499);
  });
});
