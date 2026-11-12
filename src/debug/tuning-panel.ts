// 調參面板(按 ` 開關):即時調整車輛手感,方便 Cooper 試開時一起定數值。
import GUI from 'lil-gui';
import type { Vehicle } from '../vehicle/vehicle';
import { DEFAULT_PARAMS } from '../vehicle/params';

export function createTuningPanel(vehicle: Vehicle) {
  const gui = new GUI({ title: '手感調參(` 開關)' });
  const p = vehicle.params;
  const apply = () => vehicle.applyParams();
  const f1 = gui.addFolder('動力與煞車');
  f1.add(p, 'engineForce', 500, 4000, 50).name('引擎力/輪 (N)');
  f1.add(p, 'brakeForce', 5, 120, 1).name('煞車力');
  f1.add(p, 'maxSpeedKmh', 30, 200, 5).name('極速 (km/h)');
  const f2 = gui.addFolder('轉向與甩尾');
  f2.add(p, 'steerMaxLow', 0.2, 0.9, 0.01).name('低速轉向角');
  f2.add(p, 'steerMaxHigh', 0.05, 0.5, 0.01).name('高速轉向角');
  f2.add(p, 'steerSpeed', 1, 15, 0.5).name('轉向反應');
  f2.add(p, 'steerReturnSpeed', 1, 20, 0.5).name('回正速度');
  f2.add(p, 'steerFadeKmh', 20, 150, 5).name('轉向角衰減到底的車速 (km/h)');
  f2.add(p, 'handbrakeSideGrip', 0.05, 1, 0.01).name('手煞車後輪抓地');
  f2.add(p, 'sideFriction', 0.5, 4, 0.05).name('側向抓地').onChange(apply);
  f2.add(p, 'frictionSlip', 0.5, 6, 0.1).name('輪胎摩擦').onChange(apply);
  const f3 = gui.addFolder('懸吊與穩定');
  f3.add(p, 'suspensionStiffness', 10, 80, 1).name('懸吊硬度').onChange(apply);
  f3.add(p, 'downforce', 0, 20, 0.5).name('下壓力');
  f3.add(p, 'angularDamping', 0, 5, 0.1).name('角阻尼').onChange(apply);
  gui.add(
    {
      copy: () => {
        const diff = Object.fromEntries(
          Object.entries(p).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((DEFAULT_PARAMS as unknown as Record<string, unknown>)[k])),
        );
        const text = JSON.stringify(diff, null, 2);
        navigator.clipboard?.writeText(text).catch(() => {});
        console.log('手感參數(與預設不同的部分):', text);
      },
    },
    'copy',
  ).name('複製目前參數');
  gui.hide();
  return gui;
}
