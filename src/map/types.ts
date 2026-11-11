// 地圖資料格式 v2(world.json,見 docs/decisions/0012)。建置端(tools/map-build)與執行端(src)共用。
// 只存 2D 描述,座標為「世界座標 × 10」的整數(0.1 m);網格在執行端依分塊生成(src/world/)。

import type { Origin } from './projection';

/** 座標量化:世界座標(公尺)× QUANT 取整數 */
export const QUANT = 10;

/** world.json 內的道路(座標已量化) */
export interface WorldRoad {
  osmId: number;
  name: string; // 中文路名(OSM name),無名稱為空字串
  nameEn: string;
  highway: string;
  oneway: boolean;
  width: number; // 路面寬(公尺)
  sidewalk: number; // 單側人行道寬(公尺),0 = 不畫
  /** 寬度來源:gov = 臺中市政府路寬換算(0011),default = 依道路等級預設,override = 手動 */
  widthFrom: 'gov' | 'default' | 'override';
  /** [x0, z0, x1, z1, ...],世界座標 × 10 的整數,已裁切到區域內 */
  pts: number[];
}

export interface WorldBuilding {
  id: number;
  h: number; // 高度 × 10(整數)
  /** 細分類(src/config/buildings.ts 的 KIND);外牆色在執行端依 id 從該類色票選 */
  t: number;
  /** 1 = 一樓畫店面(臨大路或本身有商店標籤);沒有這個欄位 = 不畫 */
  s?: 1;
  /** 和隔壁建築相接、不做圓角的外環頂點索引(對應 rings[0]);沒有這個欄位 = 全部做圓角 */
  c?: number[];
  /** rings[0] 外環,其餘為中庭(內環);座標量化同道路 */
  rings: number[][];
}

/** 面狀地物:0 綠地,1 運動場,2 水面 */
export interface WorldArea {
  k: 0 | 1 | 2;
  ring: number[];
}

export interface WorldWaterway {
  w: number; // 寬度(公尺)
  pts: number[];
}

/** 地標(decisions/0013):外框用於碰撞與模型未載入時的替代量體;模型原點 = 外框形心 (x, z) */
export interface WorldLandmark {
  id: string;
  name: string;
  model: string; // 相對於 public/ 的 GLB 路徑
  x: number; // 世界座標(公尺)
  z: number;
  h: number; // 高度 × 10(整數),用於碰撞與替代量體
  /** 外框(可多個),座標量化同道路 */
  rings: number[][];
}

/**
 * 街道細節(decisions/0015):標線、枕木紋、分隔島。座標量化同道路。
 * 只在 meta.detailRect 範圍內產生(樣張區;Cooper 確認後擴大到整區)。
 */
export interface WorldStreet {
  /**
   * 縱向標線(車道線、中線、邊線、快慢分隔線)與停止線:沿中心折線 pts(量化)平移 o 公分畫線。
   * 平移在執行端算,雙黃線兩條線的 10 cm 間距才不會被 0.1 m 的座標量化吃掉。
   * c 0 白 / 1 黃;d 1 = 虛線(4 m 畫、6 m 空,從 pts 起點開始);w 線寬(公分);o 往左平移(公分,負值往右)
   */
  strips: { pts: number[]; m: { c: 0 | 1; d: 0 | 1; w: number; o: number }[] }[];
  /**
   * 枕木紋行人穿越道:中心 p(量化);枕木線沿穿越方向 v 排列,範圍 ±h(公寸);
   * 枕木線本身沿行車方向 u,長度固定(src/config/street.ts BAR_LEN)。v、u 為 atan2(z, x) 角度(毫弧度)
   */
  crosswalks: { p: [number, number]; v: number; u: number; h: number }[];
  /** 分隔島:中心折線(量化)與各點寬度(公寸) */
  medians: { pts: number[]; ws: number[] }[];
  /**
   * 路口鋪面:每個路口一個凸多邊形(量化),蓋住各路面之間沒鋪到的地方
   * (分隔幹道交叉時,兩條路的分隔帶空隙在路口中央重疊,會露出下面的人行道色)
   */
  junctions?: number[][];
}

/**
 * 街道傢俱(decisions/0015 第四批):位置在建置端算好(tools/map-build/lib/furniture.ts),幾何在執行端生成。
 * 座標量化同道路;角度為 atan2(z, x) 毫弧度。只在 meta.detailRect 範圍內。
 */
export interface WorldFurniture {
  /** 行道樹 [x, z, 樹種(src/config/furniture.ts 的 TREE_SPECIES), ...] */
  trees: number[];
  /** 路燈 [x, z, 懸臂朝向, ...] */
  lights: number[];
  /** 號誌桿 [x, z, 懸臂朝向, 懸臂長(公寸), ...] */
  signals: number[];
  /** 機車排 [第一台 x, z, 排列方向, 台數, 車頭朝向, ...];第 i 台沿排列方向 i × SCOOTER_SLOT(src/config/furniture.ts) */
  scooters: number[];
  /** 直式招牌 [貼牆處 x, z, 伸出方向, 底高(公寸), 頂高(公寸), 底色編號, ...] */
  signs: number[];
  /** 公車站 [x, z, 朝向車道, 1 = 候車亭 / 0 = 只有站牌, ...] */
  busStops: number[];
}

export interface MapMeta {
  area: string;
  origin: Origin;
  originLonLat: [number, number];
  /** 區域邊界(世界座標,公尺)[minX, minZ, maxX, maxZ] */
  bounds: [number, number, number, number];
  chunkSize: number;
  osmTimestamp: string;
  builtAt: string;
  stats: Record<string, number>;
  /** 街道細節的範圍(世界座標)[minX, minZ, maxX, maxZ];沒有就是不產生(decisions/0015) */
  detailRect?: [number, number, number, number];
}

export interface WorldJson {
  version: 2;
  meta: MapMeta;
  spawn: { x: number; z: number; headingDeg: number; label: string };
  roads: WorldRoad[];
  buildings: WorldBuilding[];
  areas: WorldArea[];
  waterways: WorldWaterway[];
  landmarks: WorldLandmark[];
  street?: WorldStreet;
  furniture?: WorldFurniture;
}

/** 路名索引用的道路(座標為公尺) */
export interface RoadWay {
  osmId: number;
  name: string;
  nameEn: string;
  highway: string;
  oneway: boolean;
  width: number;
  /** 世界座標折線 [x0, z0, x1, z1, ...] */
  points: number[];
}

/** 一組可渲染的網格:位置、法向量、頂點色(sRGB u8)、索引 */
export interface MeshArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Uint8Array;
  index: Uint32Array;
  /** 建築才有:每頂點 [沿牆距離, 建築代碼](src/world/gen/mesh.ts 的 packBuildingCode) */
  wall?: Float32Array;
}

export function dequant(pts: number[]): number[] {
  return pts.map((v) => v / QUANT);
}

export function roadWayOf(r: WorldRoad): RoadWay {
  return { osmId: r.osmId, name: r.name, nameEn: r.nameEn, highway: r.highway, oneway: r.oneway, width: r.width, points: dequant(r.pts) };
}
