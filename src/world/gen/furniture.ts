// 街道傢俱幾何(decisions/0015 第四批):行道樹(5 種樹形)、路燈、號誌桿、機車、直式招牌、公車站。純幾何、頂點色,和建築同材質畫(代碼 PLAIN_CODE,不畫窗)。
// 位置來自 world.json 的 furniture(建置端 tools/map-build/lib/furniture.ts 擺好);樹的大小、色調、轉向由位置雜湊決定。
import {
  BUS_POLE_H, BUS_SHELTER_D, BUS_SHELTER_H, BUS_SHELTER_L, SIGN_DEPTH, SIGN_THICK, SIGN_WALL_GAP, TREE_SPECIES,
  LIGHT_ARM, LIGHT_H, LIGHT_HEAD, LIGHT_R, SCOOTER_SLOT, SIGNAL_BOX, SIGNAL_H, SIGNAL_R, TREE_CROWN_R, TREE_CROWN_Y, TREE_TRUNK_R, TREE_DISPLAY_JITTER, decodeTreeKind, treeDisplayScale,
} from '../../config/furniture';
import { hash32, type Pt } from './geom';
import { GLOW_CODE, MeshBuilder } from './mesh';
import { PLAIN_CODE } from './extrude';
import type { MeshArrays } from '../../map/types';

type Rgb = [number, number, number];
type V3 = [number, number, number];

export interface FurnitureColors {
  crown: Rgb[];
  trunk: Rgb;
  pole: Rgb;
  lampHead: Rgb;
  signalBox: Rgb;
  /** 紅、黃、綠 */
  lamps: Rgb[];
  /** 各樹種的樹冠色(TREE_SPECIES 順序;球形另用 crown 的三色變化)、椰子樹幹 */
  speciesCrown: Rgb[];
  palmTrunk: Rgb;
  signBoards: Rgb[];
  signText: Rgb;
  signTextOnWhite: Rgb;
  busBlue: Rgb;
  busRoof: Rgb;
  busGlass: Rgb;
}

const POLE_SEGMENTS = 6;

/** 細分一次的正二十面體(42 點、80 面),單位球;樹冠用平滑著色,看起來圓圓的 */
const SPHERE = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: [number, number, number][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l] as [number, number, number];
  });
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const mid = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let i = mid.get(k);
    if (i === undefined) {
      const x = v[a][0] + v[b][0], y = v[a][1] + v[b][1], z = v[a][2] + v[b][2];
      const l = Math.hypot(x, y, z);
      i = v.push([x / l, y / l, z / l]) - 1;
      mid.set(k, i);
    }
    return i;
  };
  const faces: number[][] = [];
  for (const [a, b, c] of f) {
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  // 統一成右手定則法向量朝外(和 MeshBuilder 其他面一致)
  for (const fc of faces) {
    const [a, b, c] = fc.map((i) => v[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * (a[0] + b[0] + c[0]) + n[1] * (a[1] + b[1] + c[1]) + n[2] * (a[2] + b[2] + c[2]) < 0) [fc[1], fc[2]] = [fc[2], fc[1]];
  }
  return { v, faces };
})();

const rnd = (p: Pt, k: number) => hash32(Math.round(p[0] * 10) * 73856093 + Math.round(p[1] * 10) * 19349663 + k) / 4294967296;

/** 橢球(平滑著色):中心 (x, y, z)、水平半徑 rx、垂直半徑 ry、繞 y 轉 rot */
function ellipsoid(mb: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rot: number, rgb: Rgb) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const base = mb.vertexCount;
  for (const [x0, y0, z0] of SPHERE.v) {
    const vx = x0 * cs - z0 * sn, vz = x0 * sn + z0 * cs;
    // 橢球法向量 ∝ (x/rx², y/ry², z/rz²);用比例近似即可
    const nx = vx / rx, ny = y0 / ry, nz = vz / rx;
    const l = Math.hypot(nx, ny, nz);
    mb.vertex(x + vx * rx, y + y0 * ry, z + vz * rx, nx / l, ny / l, nz / l, rgb);
  }
  for (const [a, b, d] of SPHERE.faces) mb.tri(base + a, base + b, base + d);
}

/**
 * 行道樹,kind = 樹種(TREE_SPECIES):球形(樟樹)、層狀(小葉欖仁)、叢生(榕樹)、椰子(大王椰子)、尖塔(落羽松)。
 * 大小、高度、轉向由位置雜湊決定,同一種也不會整排一模一樣。
 */
export function addTree(mb: MeshBuilder, p: Pt, c: FurnitureColors, code = 0) {
  // code = 樹形 + 大小倍率(0042;src/config/furniture.ts 的 decodeTreeKind)
  const { kind, scale } = decodeTreeKind(code);
  addTreeAt(mb, p, c, kind, (0.9 + rnd(p, 1) * 0.25) * scale, (0.92 + rnd(p, 2) * 0.16) * scale, rnd(p, 4) * Math.PI * 2);
}

/** 一棵樹:s = 樹冠大小倍率、hs = 高度倍率、rot = 朝向 */
function addTreeAt(mb: MeshBuilder, p: Pt, c: FurnitureColors, kind: number, s: number, hs: number, rot: number) {
  const r = TREE_CROWN_R * s;
  const green = c.speciesCrown[kind] ?? c.crown[0];
  switch (kind) {
    case TREE_SPECIES.Tiered: {
      // 小葉欖仁:細高的幹,三層扁平的水平枝葉,越上層越小
      const top = 5.6 * hs;
      addCylinder(mb, p, TREE_TRUNK_R * 0.8, 0, top, c.trunk, true);
      const layers: [number, number][] = [[0.55, 1.2], [0.75, 0.9], [0.93, 0.6]];
      layers.forEach(([fy, fr], i) => ellipsoid(mb, p[0], top * fy, p[1], r * fr, r * 0.26, rot + i, shade(green, 1 - i * 0.04 + 0.04)));
      return;
    }
    case TREE_SPECIES.Cluster: {
      // 榕樹:矮壯的幹,三團樹冠擠在一起,樹冠寬
      const cy = 3.7 * hs;
      addCylinder(mb, p, TREE_TRUNK_R * 1.3, 0, cy - 0.6, c.trunk, false);
      ellipsoid(mb, p[0], cy + 0.3, p[1], r * 0.85, r * 0.75, rot, green);
      for (const k of [0, 1]) {
        const t = rot + k * 2.4 + 0.8;
        ellipsoid(mb, p[0] + Math.cos(t) * r * 0.65, cy - 0.15, p[1] + Math.sin(t) * r * 0.65, r * 0.65, r * 0.55, rot + k, shade(green, 0.94 + k * 0.08));
      }
      return;
    }
    case TREE_SPECIES.Palm: {
      // 大王椰子:高而直的灰白樹幹,頂端一圈下垂的葉片(兩面都畫)
      const h = 7.5 * hs;
      addCylinder(mb, p, TREE_TRUNK_R * 1.15, 0, h, c.palmTrunk, true);
      // 葉子:Cooper 2026-11-01 要加長(原本約 2.6 m、像小傘)→ 約 3.8–4.6 m,分三段往外拱起再下垂(0015 §11.11)
      const fronds = 10;
      for (let i = 0; i < fronds; i++) {
        const t = rot + (i / fronds) * Math.PI * 2;
        const d: Pt = [Math.cos(t), Math.sin(t)];
        const n: Pt = [-d[1], d[0]];
        const len = r * (2.0 + rnd(p, 20 + i) * 0.4);
        const at = (f: number, dy: number, w: number, side: number): V3 => [p[0] + d[0] * len * f + n[0] * w * side, h + dy, p[1] + d[1] * len * f + n[1] * w * side];
        const T: V3 = [p[0], h, p[1]];
        const E = at(1, -1.7, 0, 0);
        const g = shade(green, 0.92 + rnd(p, 40 + i) * 0.14);
        const [L1, R1] = [at(0.35, 0.55, 0.32, 1), at(0.35, 0.55, 0.32, -1)];
        const [L2, R2] = [at(0.7, -0.25, 0.22, 1), at(0.7, -0.25, 0.22, -1)];
        doubleTri(mb, T, L1, R1, g);
        doubleTri(mb, L1, L2, R2, g);
        doubleTri(mb, L1, R2, R1, g);
        doubleTri(mb, L2, E, R2, g);
      }
      return;
    }
    case TREE_SPECIES.Cone: {
      // 落羽松:短幹,細長圓錐樹冠
      const base = 1.3 * hs;
      const top = 7.2 * hs;
      addCylinder(mb, p, TREE_TRUNK_R, 0, base + 0.4, c.trunk, false);
      addCone(mb, p, r * 0.75, base, top, green);
      return;
    }
    default: {
      // 樟樹:略扁的球
      const cy = TREE_CROWN_Y * hs;
      addCylinder(mb, p, TREE_TRUNK_R, 0, cy - r * 0.5, c.trunk, false);
      ellipsoid(mb, p[0], cy, p[1], r, r * 0.85, rot, c.crown[Math.floor(rnd(p, 3) * c.crown.length)]);
    }
  }
}

/** 圓錐(側面平滑著色、底面朝下) */
function addCone(mb: MeshBuilder, c: Pt, r: number, y0: number, y1: number, rgb: Rgb) {
  const seg = 10;
  const k = r / (y1 - y0);
  const apex: number[] = [];
  const rim: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const nx = Math.cos(t), nz = Math.sin(t);
    const l = Math.hypot(1, k);
    rim.push(mb.vertex(c[0] + nx * r, y0, c[1] + nz * r, nx / l, k / l, nz / l, rgb));
    const tm = ((i + 0.5) / seg) * Math.PI * 2;
    apex.push(mb.vertex(c[0], y1, c[1], Math.cos(tm) / l, k / l, Math.sin(tm) / l, rgb));
  }
  // 角度遞增是從 +x 轉向 +z;外側法向量朝外時繞向為 (rim_i, apex_i, rim_i+1)(同 addCylinder)
  for (let i = 0; i < seg; i++) mb.tri(rim[i], apex[i], rim[i + 1]);
  const bottom: number[] = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    bottom.push(mb.vertex(c[0] + Math.cos(t) * r, y0, c[1] + Math.sin(t) * r, 0, -1, 0, rgb));
  }
  for (let i = 1; i + 1 < seg; i++) mb.tri(bottom[0], bottom[i], bottom[i + 1]);
}

/** 兩面都畫的三角形(椰子葉):正反各一組頂點,法向量相反 */
function doubleTri(mb: MeshBuilder, a: V3, b: V3, c: V3, rgb: Rgb) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const sgn of [1, -1]) {
    const i = [a, b, c].map((q) => mb.vertex(q[0], q[1], q[2], nx * sgn, ny * sgn, nz * sgn, rgb));
    if (sgn > 0) mb.tri(i[0], i[1], i[2]);
    else mb.tri(i[0], i[2], i[1]);
  }
}

function shade(rgb: Rgb, k: number): Rgb {
  return [Math.min(255, Math.round(rgb[0] * k)), Math.min(255, Math.round(rgb[1] * k)), Math.min(255, Math.round(rgb[2] * k))];
}

/**
 * 直式招牌:貼牆處 p、伸出方向 a(外牆外側法向量)、高度 y0–y1、底色編號 ci。
 * 板子垂直於外牆;字用淺色方塊代表(由上往下排,畫在沿街看得到的兩面),不用貼圖。
 */
export function addSign(mb: MeshBuilder, p: Pt, a: number, y0: number, y1: number, ci: number, c: FurnitureColors) {
  const n: Pt = [Math.cos(a), Math.sin(a)];
  const t: Pt = [-n[1], n[0]];
  const board = c.signBoards[ci % c.signBoards.length];
  const text = ci % c.signBoards.length === 3 ? c.signTextOnWhite : c.signText;
  const cx = p[0] + n[0] * (SIGN_WALL_GAP + SIGN_DEPTH / 2), cz = p[1] + n[1] * (SIGN_WALL_GAP + SIGN_DEPTH / 2);
  const code0 = mb.code;
  mb.code = GLOW_CODE; // 夜裡招牌板發光(0042)
  addBox(mb, [cx, cz], n, SIGN_DEPTH / 2, SIGN_THICK / 2, y0, y1, board);
  mb.code = code0;
  // 固定架:貼牆的一小段深色
  addBox(mb, [p[0] + n[0] * (SIGN_WALL_GAP / 2), p[1] + n[1] * (SIGN_WALL_GAP / 2)], n, SIGN_WALL_GAP / 2, 0.04, y1 - 0.4, y1 - 0.3, shade(board, 0.6), false);
  const ch = 0.46, gap = 0.16;
  const count = Math.floor((y1 - y0 - gap) / (ch + gap));
  for (let i = 0; i < count; i++) {
    const top = y1 - gap - i * (ch + gap);
    for (const side of [1, -1]) {
      const o = (SIGN_THICK / 2 + 0.01) * side;
      const q = (along: number, y: number): V3 => [cx + n[0] * along + t[0] * o, y, cz + n[1] * along + t[1] * o];
      quad(mb, [q(-ch / 2, top - ch), q(ch / 2, top - ch), q(ch / 2, top), q(-ch / 2, top)], [t[0] * side, 0, t[1] * side], text);
    }
  }
}

/**
 * 公車站:p = 站牌或候車亭中心,a = 朝向車道。
 * 站牌:細桿 + 頂端藍色牌子(板面朝道路兩個方向,開車看得到)+ 白色橫條。
 * 候車亭:背板(淺灰藍)、兩支後柱、往車道伸出的屋頂(藍)、長椅。
 */
export function addBusStop(mb: MeshBuilder, p: Pt, a: number, shelter: boolean, c: FurnitureColors) {
  const f: Pt = [Math.cos(a), Math.sin(a)];
  const d: Pt = [-f[1], f[0]];
  if (!shelter) {
    addCylinder(mb, p, 0.05, 0, BUS_POLE_H, c.pole, true);
    const pc = along(p, f, 0.32);
    addBox(mb, pc, f, 0.3, 0.025, BUS_POLE_H - 0.85, BUS_POLE_H, c.busBlue);
    for (const side of [1, -1]) {
      const o = 0.035 * side;
      const q = (u: number, y: number): V3 => [pc[0] + f[0] * u + d[0] * o, y, pc[1] + f[1] * u + d[1] * o];
      quad(mb, [q(-0.24, BUS_POLE_H - 0.5), q(0.24, BUS_POLE_H - 0.5), q(0.24, BUS_POLE_H - 0.38), q(-0.24, BUS_POLE_H - 0.38)], [d[0] * side, 0, d[1] * side], c.signText);
    }
    return;
  }
  const L = BUS_SHELTER_L, D = BUS_SHELTER_D, H = BUS_SHELTER_H;
  const back = along(p, f, -(D / 2 - 0.08));
  addBox(mb, back, d, L / 2 - 0.1, 0.04, 0.25, H - 0.15, c.busGlass);
  for (const u of [-1, 1]) addCylinder(mb, along(back, d, u * (L / 2 - 0.08)), 0.06, 0, H, c.pole, false);
  addBox(mb, along(p, f, 0.05), d, L / 2 + 0.1, D / 2 + 0.1, H, H + 0.12, c.busRoof);
  addBox(mb, along(p, f, -(D / 2 - 0.4)), d, L / 2 - 0.6, 0.2, 0.42, 0.5, shade(c.pole, 0.85));
}

/** 路燈:桿子 + 往車道伸出的懸臂 + 燈頭。a = 懸臂朝向 */
export function addStreetLight(mb: MeshBuilder, p: Pt, a: number, c: FurnitureColors) {
  const d: Pt = [Math.cos(a), Math.sin(a)];
  addCylinder(mb, p, LIGHT_R, 0, LIGHT_H, c.pole, true);
  const y = LIGHT_H - 0.15;
  addBox(mb, along(p, d, LIGHT_ARM / 2), d, LIGHT_ARM / 2, 0.05, y - 0.05, y + 0.05, c.pole);
  addBox(mb, along(p, d, LIGHT_ARM + LIGHT_HEAD / 2 - 0.1), d, LIGHT_HEAD / 2, 0.16, y - 0.12, y + 0.06, c.lampHead);
}

/** 號誌桿:桿子 + 懸臂 + 懸臂末端的橫式燈箱(紅黃綠三燈,前後兩面都畫)。a = 懸臂朝向,arm = 懸臂長 */
export function addSignal(mb: MeshBuilder, p: Pt, a: number, arm: number, c: FurnitureColors) {
  const d: Pt = [Math.cos(a), Math.sin(a)];
  const n: Pt = [-d[1], d[0]];
  addCylinder(mb, p, SIGNAL_R, 0, SIGNAL_H, c.pole, true);
  const y = SIGNAL_H - 0.3;
  addBox(mb, along(p, d, arm / 2), d, arm / 2, 0.07, y - 0.07, y + 0.07, c.pole);
  const [bl, bh, bd] = SIGNAL_BOX;
  const center = along(p, d, Math.max(bl / 2, arm - bl / 2));
  const y0 = y - 0.07 - bh;
  addBox(mb, center, d, bl / 2, bd / 2, y0, y - 0.07, c.signalBox);
  // 三個燈:沿懸臂排列,貼在燈箱前後兩面(稍微浮出,避免和燈箱面重疊閃爍)
  const lamp = bh * 0.55;
  for (let i = 0; i < 3; i++) {
    const lc = along(center, d, (i - 1) * bl * 0.31);
    for (const side of [1, -1]) {
      const fc: Pt = [lc[0] + n[0] * side * (bd / 2 + 0.01), lc[1] + n[1] * side * (bd / 2 + 0.01)];
      const ym = y0 + bh / 2;
      const q: [number, number, number][] = [
        [fc[0] - d[0] * lamp / 2, ym - lamp / 2, fc[1] - d[1] * lamp / 2],
        [fc[0] + d[0] * lamp / 2, ym - lamp / 2, fc[1] + d[1] * lamp / 2],
        [fc[0] + d[0] * lamp / 2, ym + lamp / 2, fc[1] + d[1] * lamp / 2],
        [fc[0] - d[0] * lamp / 2, ym + lamp / 2, fc[1] - d[1] * lamp / 2],
      ];
      const code0 = mb.code;
      mb.code = GLOW_CODE; // 夜裡號誌燈發光(0042)
      quad(mb, q, [n[0] * side, 0, n[1] * side], c.lamps[i]);
      mb.code = code0;
    }
  }
}

/**
 * 一台機車(速克達):腳踏板、後車身、座墊、尾燈、前擋板、龍頭、把手用長方體(不畫底面),前後輪是八角柱。
 * f = 車頭朝向;顏色、微小的角度與前後錯位由位置雜湊決定(一排才不會整齊得像複製貼上)。
 * 局部座標:沿車頭方向 x(以車長中心為 0)、橫向 hb 為半寬。
 */
const SCOOTER_PARTS: [number, number, number, number, number, 0 | 1 | 2][] = [
  // [中心 x, 半長, 半寬, y0, y1, 顏色 0 車身 / 1 深色 / 2 尾燈]
  [0.05, 0.42, 0.17, 0.2, 0.36, 0], // 腳踏板
  [-0.4, 0.38, 0.22, 0.3, 0.68, 0], // 後車身
  [-0.36, 0.34, 0.17, 0.68, 0.77, 1], // 座墊
  [-0.79, 0.02, 0.1, 0.5, 0.58, 2], // 尾燈
  [0.5, 0.1, 0.21, 0.26, 0.95, 0], // 前擋板
  [0.5, 0.05, 0.05, 0.95, 1.02, 1], // 龍頭
  [0.5, 0.04, 0.32, 1.02, 1.07, 1], // 把手
];
const WHEEL_R = 0.2;
const WHEEL_X = 0.58;
const WHEEL_SEGMENTS = 6;

/**
 * 機車樣板(MeshArrays):原點、車頭朝 +x 的一台,代碼 PLAIN_CODE。車身部分是白色,執行端用 InstancedMesh 的
 * instanceColor 乘上車身色(深色部件、尾燈也會被乘到,淺色車幾乎看不出來)。
 * 不逐台生成網格:密集的格子近 400 台、約 9 萬個頂點,單格生成 20–50 ms,高速開車卡頓(e2e 2026-11-01 最長 133 ms;0015 §11.8)。
 */
export function scooterTemplate(dark: Rgb, tail: Rgb): MeshArrays {
  const mb = new MeshBuilder({ wall: true });
  mb.code = PLAIN_CODE;
  const rgb: Rgb[] = [[255, 255, 255], dark, tail];
  const d: Pt = [1, 0];
  for (const [x, ha, hb, y0, y1, k] of SCOOTER_PARTS) addBox(mb, [x, 0], d, ha, hb, y0, y1, rgb[k], false);
  for (const x of [-WHEEL_X, WHEEL_X]) addWheel(mb, [x, 0], d, WHEEL_R, 0.06, dark);
  return mb.toArrays();
}

/** 每台機車的擺放 [x, z, 車頭朝向, 車身色編號](輸出到 out);角度、前後錯位、顏色由位置雜湊決定 */
export function scooterPoses(rows: readonly { p: Pt; a: number; n: number; f: number }[], colorCount: number): Float32Array {
  const out = new Float32Array(rows.reduce((t, r) => t + r.n, 0) * 4);
  let o = 0;
  for (const r of rows)
    for (let i = 0; i < r.n; i++) {
      const p: Pt = [r.p[0] + Math.cos(r.a) * i * SCOOTER_SLOT, r.p[1] + Math.sin(r.a) * i * SCOOTER_SLOT];
      const a = r.f + (rnd(p, 11) - 0.5) * 0.24;
      const shift = (rnd(p, 12) - 0.5) * 0.2;
      out[o++] = p[0] + Math.cos(a) * shift;
      out[o++] = p[1] + Math.sin(a) * shift;
      out[o++] = a;
      out[o++] = Math.floor(rnd(p, 13) * colorCount);
    }
  return out;
}

/** 輪子:軸心水平、垂直於 d 的六角柱(胎面平滑著色,兩側平面) */
function addWheel(mb: MeshBuilder, c: Pt, d: Pt, r: number, hw: number, rgb: Rgb) {
  const n: Pt = [-d[1], d[0]];
  // 圓周上的點:沿 d 的 cos、沿 y 的 sin
  const ring = (k: number) => {
    const t = (k / WHEEL_SEGMENTS) * Math.PI * 2;
    return [Math.cos(t), Math.sin(t)];
  };
  const P = (k: number, side: number): [number, number, number] => {
    const [cx, sy] = ring(k);
    return [c[0] + d[0] * cx * r + n[0] * hw * side, r + sy * r, c[1] + d[1] * cx * r + n[1] * hw * side];
  };
  for (let k = 0; k < WHEEL_SEGMENTS; k++) {
    const [ca, sa] = ring(k + 0.5);
    quad(mb, [P(k, -1), P(k + 1, -1), P(k + 1, 1), P(k, 1)], [d[0] * ca, sa, d[1] * ca], rgb);
  }
  // 兩側平面:每側的點共用,扇形三角化;繞向依第一個三角形和法向量決定
  for (const side of [-1, 1]) {
    const pts = Array.from({ length: WHEEL_SEGMENTS }, (_, k) => P(k, side));
    const ids = pts.map(([x, y, z]) => mb.vertex(x, y, z, n[0] * side, 0, n[1] * side, rgb));
    const [a, b, cc] = pts;
    const cx = (b[1] - a[1]) * (cc[2] - a[2]) - (b[2] - a[2]) * (cc[1] - a[1]);
    const cz = (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]);
    const flip = cx * n[0] * side + cz * n[1] * side < 0;
    for (let k = 1; k + 1 < WHEEL_SEGMENTS; k++) {
      if (flip) mb.tri(ids[0], ids[k + 1], ids[k]);
      else mb.tri(ids[0], ids[k], ids[k + 1]);
    }
  }
}

function along(p: Pt, d: Pt, s: number): Pt {
  return [p[0] + d[0] * s, p[1] + d[1] * s];
}

/** 直立圓柱(側面平滑著色);cap = 加頂蓋 */
function addCylinder(mb: MeshBuilder, c: Pt, r: number, y0: number, y1: number, rgb: Rgb, cap: boolean) {
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i <= POLE_SEGMENTS; i++) {
    const t = (i / POLE_SEGMENTS) * Math.PI * 2;
    const nx = Math.cos(t), nz = Math.sin(t);
    bottom.push(mb.vertex(c[0] + nx * r, y0, c[1] + nz * r, nx, 0, nz, rgb));
    top.push(mb.vertex(c[0] + nx * r, y1, c[1] + nz * r, nx, 0, nz, rgb));
  }
  for (let i = 0; i < POLE_SEGMENTS; i++) {
    // 角度遞增是從 +x 轉向 +z;外側法向量朝外時三角形繞向為 (b_i, t_i, b_i+1)
    mb.tri(bottom[i], top[i], bottom[i + 1]);
    mb.tri(bottom[i + 1], top[i], top[i + 1]);
  }
  if (cap) {
    const ring: Pt[] = [];
    for (let i = 0; i < POLE_SEGMENTS; i++) {
      const t = (i / POLE_SEGMENTS) * Math.PI * 2;
      ring.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]);
    }
    mb.flatPolygon(ring, y1, rgb);
  }
}

/** 長方體:中心 c、長軸 d(水平單位向量)方向半長 ha、垂直於 d 的半寬 hb、高度 y0–y1;每面各自的頂點(硬邊);bottom = false 不畫底面 */
export function addBox(mb: MeshBuilder, c: Pt, d: Pt, ha: number, hb: number, y0: number, y1: number, rgb: Rgb, bottom = true) {
  const n: Pt = [-d[1], d[0]];
  const P = (sa: number, sb: number, y: number): [number, number, number] => [c[0] + d[0] * ha * sa + n[0] * hb * sb, y, c[1] + d[1] * ha * sa + n[1] * hb * sb];
  quad(mb, [P(1, -1, y0), P(1, 1, y0), P(1, 1, y1), P(1, -1, y1)], [d[0], 0, d[1]], rgb);
  quad(mb, [P(-1, 1, y0), P(-1, -1, y0), P(-1, -1, y1), P(-1, 1, y1)], [-d[0], 0, -d[1]], rgb);
  quad(mb, [P(1, 1, y0), P(-1, 1, y0), P(-1, 1, y1), P(1, 1, y1)], [n[0], 0, n[1]], rgb);
  quad(mb, [P(-1, -1, y0), P(1, -1, y0), P(1, -1, y1), P(-1, -1, y1)], [-n[0], 0, -n[1]], rgb);
  quad(mb, [P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1)], [0, 1, 0], rgb);
  if (bottom) quad(mb, [P(-1, 1, y0), P(1, 1, y0), P(1, -1, y0), P(-1, -1, y0)], [0, -1, 0], rgb);
}

/** 四邊形(四點共面),三角形繞向依法向量 nrm 決定 */
export function quad(mb: MeshBuilder, q: [number, number, number][], nrm: [number, number, number], rgb: Rgb) {
  const i = q.map(([x, y, z]) => mb.vertex(x, y, z, nrm[0], nrm[1], nrm[2], rgb));
  const [a, b, c] = q;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] >= 0) {
    mb.tri(i[0], i[1], i[2]);
    mb.tri(i[0], i[2], i[3]);
  } else {
    mb.tri(i[0], i[2], i[1]);
    mb.tri(i[0], i[3], i[2]);
  }
}

/**
 * Tripo 樣板物件的擺放(decisions/0020):每個 5 個數 [種類 PROP_KIND, x, z, 朝向, 大小倍數]。
 * 樹(整組樣板):樣板前緣朝 +z,轉成朝向最近的道路(roads 為這一格的道路折線);找不到道路就用位置雜湊的朝向。
 * 路燈:朝向 = 懸臂朝向、大小 1。
 */
export function propPoses(trees: readonly Pt[], lights: readonly { p: Pt; a: number }[], treeScale: [number, number], roads: readonly Pt[][] = [], treeCodes: readonly number[] = []): Float32Array {
  const out = new Float32Array((trees.length + lights.length) * 5);
  let o = 0;
  for (const [i, p] of trees.entries()) {
    // 實測樹(0042)依樹高放大縮小;規則樹倍率 1
    const k = decodeTreeKind(treeCodes[i] ?? 0).scale;
    const q = nearestOnLines(p, roads);
    // 局部 +z 轉到世界 (−sin a, cos a);要它指向道路 (dx, dz) → a = atan2(−dx, dz)
    const a = q ? Math.atan2(-(q[0] - p[0]), q[1] - p[1]) : rnd(p, 4) * Math.PI * 2;
    out.set([0, p[0], p[1], a, k * (treeScale[0] + rnd(p, 1) * (treeScale[1] - treeScale[0]))], o);
    o += 5;
  }
  for (const l of lights) {
    out.set([1, l.p[0], l.p[1], l.a, 1], o);
    o += 5;
  }
  return out;
}

/** 折線群上離 p 最近的點(沒有折線或 p 就在線上時回傳 null) */
export function nearestOnLines(p: Pt, lines: readonly Pt[][]): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (const l of lines)
    for (let i = 0; i + 1 < l.length; i++) {
      const [ax, az] = l[i], [bx, bz] = l[i + 1];
      const dx = bx - ax, dz = bz - az;
      const L = dx * dx + dz * dz;
      const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L)) : 0;
      const x = ax + dx * t, z = az + dz * t;
      const d = (x - p[0]) ** 2 + (z - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = [x, z];
      }
    }
  return best && bd > 1e-6 ? best : null;
}

/**
 * 程式生成樹的擺放(0044):每棵 [樹形, x, z, 朝向, 大小];畫面用 InstancedMesh(src/render/props.ts),
 * 5 種樹形各一個樣板,不用每格重新產生樹的幾何(4.6 萬棵時分塊生成會卡)。
 * 大小 = 實測樹高倍率(0042)× 每棵 0.9–1.15 的亂數;朝向亂數。
 */
export function genTreePoses(trees: readonly Pt[], codes: readonly number[]): Float32Array {
  const out = new Float32Array(trees.length * 5);
  const [jMin, jMax] = TREE_DISPLAY_JITTER;
  const jSpan = jMax - jMin;
  trees.forEach((p, i) => {
    const { kind, scale } = decodeTreeKind(codes[i] ?? 0);
    out.set([kind, p[0], p[1], rnd(p, 4) * Math.PI * 2, treeDisplayScale(scale) * (jMin + rnd(p, 1) * jSpan)], i * 5);
  });
  return out;
}

/** 樹形樣板(0044):在原點、大小倍率 1 的一棵樹 */
export function treeTemplate(kind: number, c: FurnitureColors): MeshArrays {
  const mb = new MeshBuilder();
  addTreeAt(mb, [0, 0], c, kind, 1, 1, 0);
  return mb.toArrays();
}
