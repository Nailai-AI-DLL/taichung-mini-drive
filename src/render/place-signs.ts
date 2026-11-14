// 知名地點的招牌(decisions/0031):一塊寫著名稱的板子(只有文字,不放商標圖案)。
// 有對應建築的立在樓頂靠路那一側;沒有建築的(公園、捷運站、開在樓裡的店)立在接送點旁的桿子上。
// 文字用 canvas 畫成貼圖;板子用不受光照的材質,背光也看得清楚。全區只有十幾個,開機時一次建好。
import * as THREE from 'three';
import { toonMaterial } from './car-style';

export const PLACE_SIGN = {
  /** 樓頂招牌:每個字寬、板高、離屋頂(公尺) */
  roofChar: 3.4,
  roofH: 4.6,
  roofGap: 0.8,
  /** 路邊招牌:每個字寬、板高、板底離地、桿子粗細 */
  poleChar: 1.5,
  poleH: 2.1,
  poleY: 4.6,
  poleR: 0.14,
  thick: 0.35,
  font: "900 112px 'jf-openhuninn', 'PingFang TC', 'Noto Sans TC', sans-serif",
};

export interface PlaceSignSpec {
  name: string;
  color: string;
  /** 板子中心下緣的位置與朝向(板面法向量的水平方向,弧度 atan2(z, x)) */
  x: number;
  z: number;
  facing: number;
  /** 樓頂招牌給屋頂高度;路邊招牌不給 */
  roofY?: number;
}

/** 招牌寬度(公尺):全形字算 1 格、半形算 0.6 格,左右各留半格 */
export function signWidth(name: string, charW: number): number {
  let n = 0;
  for (const ch of name) n += ch.charCodeAt(0) < 128 ? 0.6 : 1;
  return (n + 1) * charW;
}

function textTexture(name: string, color: string, aspect: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.height = 192;
  c.width = Math.round(192 * aspect);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.strokeRect(9, 9, c.width - 18, c.height - 18);
  g.fillStyle = '#fff';
  g.font = PLACE_SIGN.font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 字太寬就壓窄,不超出邊框
  g.fillText(name, c.width / 2, c.height / 2 + 6, c.width - 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createPlaceSign(s: PlaceSignSpec): THREE.Group {
  const cfg = PLACE_SIGN;
  const roof = s.roofY !== undefined;
  const w = signWidth(s.name, roof ? cfg.roofChar : cfg.poleChar), h = roof ? cfg.roofH : cfg.poleH;
  const face = new THREE.MeshBasicMaterial({ map: textTexture(s.name, s.color, w / h) });
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(0.6) });
  // BoxGeometry 的材質順序:+x、−x、+y、−y、+z、−z;文字在 ±z 兩面
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, cfg.thick), [edge, edge, edge, edge, face, face]);
  const g = new THREE.Group();
  g.name = `place-sign-${s.name}`;
  const y0 = roof ? s.roofY! + cfg.roofGap : cfg.poleY;
  board.position.y = y0 + h / 2;
  g.add(board);
  const post = toonMaterial('#3A4658');
  if (roof) {
    for (const k of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, cfg.roofGap, 0.3), post);
      leg.position.set((w / 2 - 1) * k, s.roofY! + cfg.roofGap / 2, 0);
      g.add(leg);
    }
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(cfg.poleR, cfg.poleR, y0, 8), post);
    pole.position.y = y0 / 2;
    pole.castShadow = true;
    g.add(pole);
  }
  g.position.set(s.x, 0, s.z);
  // 板面法向量(局部 +z)轉到 (cos f, 0, sin f):繞 y 轉 θ 會把 +z 轉到 (sin θ, 0, cos θ) → θ = π/2 − f
  g.rotation.y = Math.PI / 2 - s.facing;
  return g;
}
