// 場景:天空、光影、地面、地圖網格、M0 灰色方塊車。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE } from '../config/palette';
import type { MeshArrays } from '../map/types';
import { furnitureColors, type ChunkMeshes, type FurnitureMeshes } from '../world/chunks';
import type { VehicleParams } from '../vehicle/params';
import { createBuildingMaterial, setBuildingNight } from './building-material';
import { buildingLookFromSearch } from '../config/buildings';
import { createClouds } from './clouds';
import type { MiniCar } from './mini-car';
import { HEADLIGHT, LOOK_LIGHT, LOOK_LIGHT_OLD, LOOK_NIGHT } from '../config/look';
import { ScooterLayer } from './scooters';
import { PropLayer, type Variant } from './props';
import { propsMode } from '../config/props';
import { treeTemplate } from '../world/gen/furniture';
import { scooterTemplate } from '../world/gen/furniture';
import { hexToRgb } from '../config/palette';

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 色調映射(decisions/0015 第二批):受光面不再直接爆成白色,保留牆面原本的淡色;
  // Neutral 對 0.8 以下的顏色幾乎不改,方案丙色票維持原樣
  renderer.toneMapping = THREE.NeutralToneMapping;
  return renderer;
}

export interface World3D {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  clouds: THREE.Object3D;
}

/** 太陽相對車子的位置(followSun 用;setLook 切換新舊光照時一起換) */
let sunOffset: [number, number, number] = LOOK_LIGHT.sunOffset;

let lookOn = true;
let nightOn = false;

/** 切換新舊光照(decisions/0016;on = false 是改版前,前後對照用);夜景開著時只記下來,關夜景時再套用 */
export function setLook(w: World3D, on: boolean) {
  lookOn = on;
  if (!nightOn) applyLight(w, on ? LOOK_LIGHT : LOOK_LIGHT_OLD);
}

/** 夜景開關(decisions/0042,N 鍵):天空、霧、月光;建築窗燈 / 店面 / 招牌發光;夜裡關太陽陰影 */
export function setNight(w: World3D, on: boolean) {
  nightOn = on;
  applyLight(w, on ? LOOK_NIGHT : lookOn ? LOOK_LIGHT : LOOK_LIGHT_OLD);
  // 不切 castShadow(會讓所有材質重新編譯、卡一下;0042 驗收),改成陰影強度 0
  w.sun.shadow.intensity = on ? 0 : 1;
  setBuildingNight(on);
}

export function isNight() {
  return nightOn;
}

function applyLight(w: World3D, L: typeof LOOK_LIGHT) {
  w.sun.color.set(L.sunColor);
  w.sun.intensity = L.sunIntensity;
  w.hemi.color.set(L.hemiSky);
  w.hemi.groundColor.set(L.hemiGround);
  w.hemi.intensity = L.hemiIntensity;
  sunOffset = L.sunOffset;
  (w.scene.background as THREE.Texture | null)?.dispose();
  w.scene.background = skyGradient(L.skyTop, L.skyHorizon);
  w.scene.fog = new THREE.Fog(L.skyHorizon, L.fogNear, L.fogFar);
}

/** 地面平面要蓋住整個區域,再往外多 GROUND_MARGIN(鏡頭遠裁切 1500 m,霧在 720 m 已全白) */
export const GROUND_MARGIN = 1000;

/** 地面平面的中心與大小:區域邊界 [minX, minZ, maxX, maxZ] 往外擴 GROUND_MARGIN */
export function groundPlane(bounds: [number, number, number, number]) {
  const [minX, minZ, maxX, maxZ] = bounds;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX + 2 * GROUND_MARGIN, h: maxZ - minZ + 2 * GROUND_MARGIN };
}

/**
 * 地面平面;holes = 下沉地標的外框(世界座標 [x, z],decisions/0035),在地面挖洞讓模型往下凹。
 * ShapeGeometry 在 XY 平面,轉 -90° 後 (x, y) → (x, 0, -y),所以形狀座標用 (x, -z)。
 */
export function groundGeometry(bounds: [number, number, number, number], holes: [number, number][][] = []): THREE.BufferGeometry {
  const gp = groundPlane(bounds);
  if (!holes.length) return new THREE.PlaneGeometry(gp.w, gp.h).rotateX(-Math.PI / 2).translate(gp.cx, 0, gp.cz);
  const [x0, x1, z0, z1] = [gp.cx - gp.w / 2, gp.cx + gp.w / 2, gp.cz - gp.h / 2, gp.cz + gp.h / 2];
  const shape = new THREE.Shape([new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0), new THREE.Vector2(x0, -z0)]);
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

export function createScene(bounds: [number, number, number, number], holes: [number, number][][] = []): World3D {
  const scene = new THREE.Scene();
  scene.background = skyGradient(LOOK_LIGHT.skyTop, LOOK_LIGHT.skyHorizon);
  scene.fog = new THREE.Fog(LOOK_LIGHT.skyHorizon, LOOK_LIGHT.fogNear, LOOK_LIGHT.fogFar);

  // 光照數值在 src/config/look.ts(decisions/0016:午後斜陽、天空偏藍、地面偏暖);改版前的值是 LOOK_LIGHT_OLD
  const hemi = new THREE.HemisphereLight(LOOK_LIGHT.hemiSky, LOOK_LIGHT.hemiGround, LOOK_LIGHT.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(LOOK_LIGHT.sunColor, LOOK_LIGHT.sunIntensity);
  sun.position.set(...LOOK_LIGHT.sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90;
  sc.right = 90;
  sc.top = 90;
  sc.bottom = -90;
  sc.near = 10;
  sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  // 原本固定 4000 × 4000 m,蓋不到範圍 A(6.6 × 5.0 km)的東西兩側,露出天空色
  const ground = new THREE.Mesh(groundGeometry(bounds, holes), new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
  ground.receiveShadow = true;
  scene.add(ground);
  const clouds = createClouds(bounds);
  scene.add(clouds);
  return { scene, sun, hemi, clouds };
}

/** 陰影只在車子附近計算:光源跟著車移動 */
export function followSun(sun: THREE.DirectionalLight, x: number, z: number) {
  sun.position.set(x + sunOffset[0], sunOffset[1], z + sunOffset[2]);
  sun.target.position.set(x, 0, z);
}

function skyGradient(top: string, horizon: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  // 頂點色存的是 sRGB 0–255,轉成線性空間給 three.js
  const lin = new Float32Array(m.color.length);
  const c = new THREE.Color();
  for (let i = 0; i < m.color.length; i += 3) {
    c.setRGB(m.color[i] / 255, m.color[i + 1] / 255, m.color[i + 2] / 255, THREE.SRGBColorSpace);
    lin[i] = c.r;
    lin[i + 1] = c.g;
    lin[i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(lin, 3));
  if (m.wall) geo.setAttribute('aWall', new THREE.BufferAttribute(m.wall, 2));
  geo.setIndex(new THREE.BufferAttribute(m.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** 地面類每高 1 m 往鏡頭方向的深度偏移(NDC)。各層只差幾毫米,靠這個決定前後,遠處才不會閃爍 */
export const GROUND_DEPTH_BIAS = 1e-3;

/**
 * 地面類材質:頂點色 + 依高度的深度偏移。綠地、人行道、路面、標線疊在幾乎同一個平面上,
 * 只靠幾毫米的高度差,在 300 m 外深度精度不夠會互相閃爍;偏移量只有幾公分高的東西會被蓋住,看不出來。
 */
function createGroundMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n\tgl_Position.z -= position.y * ${GROUND_DEPTH_BIAS.toExponential()} * gl_Position.w;`,
    );
  };
  return mat;
}

let groundMat: THREE.Material | null = null;
let buildingMat: THREE.Material | null = null;
let scooters: ScooterLayer | null = null;
let props: PropLayer | null = null;

/** Tripo 街道物件圖層(除錯 / 測試讀數量用) */
export function propLayer() {
  return props;
}

/** 兩組網格接成一組(建築 + 屋頂附加物 + 街道傢俱:同材質畫成一個 draw call,碰撞體只用建築) */
function concatArrays(a: MeshArrays, b: MeshArrays): MeshArrays {
  if (!b.index.length) return a;
  if (!a.index.length) return b;
  const n = a.position.length / 3;
  const cat = <T extends Float32Array | Uint8Array | Uint32Array>(x: T, y: T): T => {
    const out = new (x.constructor as new (len: number) => T)(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const index = cat(a.index, b.index);
  for (let i = a.index.length; i < index.length; i++) index[i] += n;
  return {
    position: cat(a.position, b.position),
    normal: cat(a.normal, b.normal),
    color: cat(a.color, b.color),
    index,
    ...(a.wall && b.wall && { wall: cat(a.wall, b.wall) }),
  };
}

/** 一格地圖的場景物件:地面類 1 個網格、建築(含屋頂附加物、街道傢俱)1 個網格(共用材質) */
export function addChunkMeshes(scene: THREE.Scene, m: ChunkMeshes): THREE.Object3D[] {
  groundMat ??= createGroundMaterial();
  buildingMat ??= createBuildingMaterial(buildingLookFromSearch(globalThis.location?.search ?? ''));
  const out: THREE.Object3D[] = [];
  if (m.ground.index.length) {
    const ground = new THREE.Mesh(toGeometry(m.ground), groundMat);
    ground.receiveShadow = true;
    out.push(ground);
  }
  const solid = concatArrays(concatArrays(m.buildings, m.roofProps), m.furniture);
  if (solid.index.length) out.push(solidMesh(toGeometry(solid)));
  scene.add(...out);
  addScooters(scene, out, m.scooters);
  addProps(scene, out, m.props);
  return out;
}

/** 建築(含屋頂附加物、街道傢俱)網格;userData.solid 讓第二段生成的傢俱找得到它 */
function solidMesh(geo: THREE.BufferGeometry) {
  const mesh = new THREE.Mesh(geo, buildingMat!);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.solid = true;
  return mesh;
}

function addScooters(scene: THREE.Scene, out: THREE.Object3D[], poses: Float32Array) {
  if (!poses.length) return;
  scooters ??= new ScooterLayer(
    scene,
    toGeometry(scooterTemplate(hexToRgb(PALETTE.scooterDark), hexToRgb(PALETTE.signalLamps[0]))),
    buildingMat!,
    PALETTE.scooterBody.map((h) => new THREE.Color(h)),
  );
  // 空物件當這一格機車的代號:removeChunkMeshes 看到它就從共用的 InstancedMesh 拿掉
  const tag = new THREE.Object3D();
  tag.userData.scooters = true;
  scooters.set(tag, poses);
  scene.add(tag);
  out.push(tag);
}

/** 程式生成樹的圖層(0044):5 種樹形各做一個樣板,和其他傢俱一樣用 Lambert 頂點色 */
function genTreeLayer(scene: THREE.Scene) {
  const fc = furnitureColors();
  const variants: Variant[][] = [0, 1, 2, 3, 4].map((k) => [
    { geometry: toGeometry(treeTemplate(k, fc)), material: new THREE.MeshLambertMaterial({ vertexColors: true }), mesh: null },
  ]);
  return PropLayer.fromVariants(scene, variants, ['tree-round', 'tree-tiered', 'tree-cluster', 'tree-palm', 'tree-cone']);
}

/** Tripo 樣板物件(樹、路燈):和機車一樣用空物件當這一格的代號 */
function addProps(scene: THREE.Scene, out: THREE.Object3D[], poses: Float32Array) {
  if (!poses.length) return;
  props ??= propsMode() === 'gen' ? genTreeLayer(scene) : new PropLayer(scene, import.meta.env.BASE_URL);
  const tag = new THREE.Object3D();
  tag.userData.props = true;
  props.set(tag, poses);
  scene.add(tag);
  out.push(tag);
}

/**
 * 兩段生成的第二段(src/world/streamer.ts 的 onFurniture):街道傢俱接到這一格建築網格的後面,
 * 換一個 geometry(draw call 不增加;只轉換新加的頂點);機車加進共用的 InstancedMesh。
 * objects = 第一段 addChunkMeshes 回傳的陣列(會被加入新物件,卸載時一起移除)。
 */
export function addChunkFurniture(scene: THREE.Scene, objects: THREE.Object3D[], f: FurnitureMeshes) {
  buildingMat ??= createBuildingMaterial(buildingLookFromSearch(globalThis.location?.search ?? ''));
  if (f.furniture.index.length) {
    const add = toGeometry(f.furniture);
    const mesh = objects.find((o) => o.userData.solid) as THREE.Mesh | undefined;
    if (mesh) {
      const old = mesh.geometry;
      mesh.geometry = appendGeometry(old, add);
      old.dispose();
      add.dispose();
    } else {
      const m = solidMesh(add);
      scene.add(m);
      objects.push(m);
    }
  }
  addScooters(scene, objects, f.scooters);
  addProps(scene, objects, f.props);
}

/** 兩個 geometry(屬性相同)接成一個;頂點色已在 toGeometry 轉成線性,不用再轉 */
function appendGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(a.attributes)) {
    const x = a.getAttribute(name) as THREE.BufferAttribute, y = b.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array);
    arr.set(y.array as Float32Array, x.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  const ia = a.getIndex()!.array as Uint32Array, ib = b.getIndex()!.array as Uint32Array;
  const n = (a.getAttribute('position') as THREE.BufferAttribute).count;
  const idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + n;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function removeChunkMeshes(scene: THREE.Scene, meshes: THREE.Object3D[]) {
  for (const m of meshes) {
    scene.remove(m);
    if (m.userData.scooters) scooters?.delete(m);
    if (m.userData.props) props?.delete(m);
    // 地標模型的 geometry 由快取共用,不在這裡釋放
    if ((m as THREE.Mesh).isMesh && !m.userData.shared) (m as THREE.Mesh).geometry.dispose();
  }
  // 清空陣列:還在載入中的地標模型看到空陣列,就不會再加進場景
  meshes.length = 0;
}

const landmarkCache = new Map<string, Promise<THREE.Object3D | null>>();

/** 載入地標 GLB(同一檔只載一次);檔案不存在或不是 GLB 時回傳 null,不在 console 報錯 */
function loadLandmarkModel(url: string): Promise<THREE.Object3D | null> {
  let p = landmarkCache.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        // Vite 對不存在的檔案會回 index.html,所以也要檢查內容類型
        if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return null;
        const gltf = await new GLTFLoader().parseAsync(await r.arrayBuffer(), '');
        gltf.scene.traverse((o) => {
          o.userData.shared = true;
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
        });
        return gltf.scene;
      })
      .catch((e) => {
        console.warn('地標模型載入失敗,改用外框量體', url, e);
        return null;
      });
    landmarkCache.set(url, p);
  }
  return p;
}

/**
 * 地標:先放外框擠出的量體;模型載入成功就換成模型(原點 = 外框形心)。
 * 回傳的陣列會在模型載入後被更新,卸載時整個傳給 removeChunkMeshes。
 */
export function addLandmark(scene: THREE.Scene, lm: { model: string; x: number; z: number }, solid: MeshArrays): THREE.Object3D[] {
  buildingMat ??= createBuildingMaterial(buildingLookFromSearch(globalThis.location?.search ?? ''));
  const fallback = new THREE.Mesh(toGeometry(solid), buildingMat);
  fallback.castShadow = fallback.receiveShadow = true;
  scene.add(fallback);
  const objs: THREE.Object3D[] = [fallback];
  loadLandmarkModel(`${import.meta.env.BASE_URL}${lm.model}`).then((model) => {
    if (!model || !objs.length) return; // 載入失敗,或在載入前已被卸載
    const inst = model.clone(true);
    inst.position.set(lm.x, 0, lm.z);
    scene.remove(fallback);
    fallback.geometry.dispose();
    scene.add(inst);
    objs.splice(0, objs.length, inst);
  });
  return objs;
}

/**
 * 玩家車輛外觀。先顯示方塊車,MINI 模型(tools/models/mini_f55.py 產生的 GLB)載入完成後替換。
 * 模型原點 = 物理車體中心,+X 車頭、+Z 右側,與 src/vehicle/vehicle.ts 一致。
 */
export class CarMesh {
  readonly group = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private placeholder: THREE.Object3D[] = [];

  /** 大燈(0043):白天強度 0,夜裡打開;一直掛在場景裡,開關不會讓材質重新編譯 */
  readonly headlight = new THREE.SpotLight(HEADLIGHT.color, 0, HEADLIGHT.distance, HEADLIGHT.angle, HEADLIGHT.penumbra, HEADLIGHT.decay);

  constructor(private p: VehicleParams) {
    const [hx, hy, hz] = p.halfExtents;
    this.headlight.name = 'car-headlight';
    this.headlight.position.set(...HEADLIGHT.pos);
    this.headlight.target.position.set(HEADLIGHT.pos[0] + HEADLIGHT.aim, HEADLIGHT.pos[1] - HEADLIGHT.drop, 0);
    this.group.add(this.headlight, this.headlight.target);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      new THREE.MeshLambertMaterial({ color: '#2A2D33' }), // 黑車身(F55 60 週年,黑車身白車頂)
    );
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 1.1, 0.55, hz * 1.8),
      new THREE.MeshLambertMaterial({ color: '#ECEBE6' }), // 白車頂
    );
    cabin.position.set(-0.2, hy + 0.27, 0);
    cabin.castShadow = true;
    // 車頭方向標記(淺色前燈條),M0 方便辨識前後
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, hz * 1.6), new THREE.MeshLambertMaterial({ color: '#fff7d6' }));
    nose.position.set(hx + 0.02, 0.05, 0);
    this.group.add(body, cabin, nose);
    this.placeholder.push(body, cabin, nose);

    const wheelGeo = new THREE.CylinderGeometry(p.wheelRadius, p.wheelRadius, 0.26, 16).rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: '#3a3a42' });
    const pos: [number, number][] = [
      [p.wheelBaseHalf, -p.trackHalf],
      [p.wheelBaseHalf, p.trackHalf],
      [-p.wheelBaseHalf, -p.trackHalf],
      [-p.wheelBaseHalf, p.trackHalf],
    ];
    for (const [x, z] of pos) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, p.wheelY, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      this.group.add(pivot);
      this.wheels.push(pivot);
      this.spinners.push(w);
    }
  }

  /** 換成程式生成的 MINI(decisions/0016 §12;src/render/mini-car.ts) */
  useModel(car: MiniCar) {
    for (const o of this.placeholder) this.group.remove(o);
    this.placeholder = [];
    this.group.add(car.body);
    this.spinners.forEach((old, i) => {
      const w = car.makeWheel();
      this.wheels[i].remove(old);
      this.wheels[i].add(w);
      this.spinners[i] = w;
    });
  }

  /**
   * 載入 MINI 模型(車身 + 一個輪子,四輪共用);失敗時保留方塊車。
   * wheelUrl 給 null:輪子就是車身的一部分,不另外掛會轉的輪子(AI 模型切出來的輪子只有外側一層殼、轉起來會晃,0016 §15.6)。
   * wheelTrackHalf:模型輪子實際的半輪距(和物理 trackHalf 不同時,視覺輪子往內 / 外移,物理不動);
   * mirrorRight:右側輪子鏡射(AI 模型只切出一個左輪,右側要翻面輪框才朝外)
   */
  async loadModel(bodyUrl: string, wheelUrl: string | null, opts: { wheelTrackHalf?: number; mirrorRight?: boolean } = {}) {
    const loader = new GLTFLoader();
    const [bodyGltf, wheelGltf] = await Promise.all([loader.loadAsync(bodyUrl), wheelUrl ? loader.loadAsync(wheelUrl) : null]);
    const castShadow = (o: THREE.Object3D) =>
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.castShadow = true;
      });
    const body = bodyGltf.scene;
    castShadow(body);
    for (const o of this.placeholder) this.group.remove(o);
    this.placeholder = [];
    this.group.add(body);
    this.spinners.forEach((old, i) => {
      if (!wheelGltf) {
        // 空節點:sync 照樣設轉動角度,但沒有東西可看
        const empty = new THREE.Object3D();
        this.wheels[i].remove(old);
        this.wheels[i].add(empty);
        this.spinners[i] = empty;
        return;
      }
      const w = wheelGltf.scene.clone(true);
      castShadow(w);
      // 掛點在 ±trackHalf(z);z > 0 是右側(Blender -Y)
      const side = Math.sign(this.wheels[i].position.z) || 1;
      if (opts.wheelTrackHalf !== undefined) w.position.z = side * (opts.wheelTrackHalf - this.p.trackHalf);
      if (opts.mirrorRight && side > 0) w.scale.z = -1;
      this.wheels[i].remove(old);
      this.wheels[i].add(w);
      this.spinners[i] = w;
    });
  }

  /** 夜景開大燈(0043):聚光燈 + 車燈玻璃發光 */
  setHeadlights(on: boolean) {
    this.headlight.intensity = on ? HEADLIGHT.intensity : 0;
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && typeof m.userData?.headLens === 'number') m.emissiveIntensity = on ? HEADLIGHT.lens : m.userData.headLens;
    });
  }

  sync(pos: { x: number; y: number; z: number }, rot: { x: number; y: number; z: number; w: number }, wheels: { suspension: number; steering: number; rotation: number }[]) {
    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    wheels.forEach((w, i) => {
      this.wheels[i].position.y = this.p.wheelY - w.suspension;
      this.wheels[i].rotation.y = w.steering;
      this.spinners[i].rotation.z = -w.rotation;
    });
  }
}
