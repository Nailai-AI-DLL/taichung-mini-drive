// 座標系:經緯度(WGS84)→ TWD97 TM2(EPSG:3826)公尺座標 → 遊戲世界座標。
// 遊戲世界:1 單位 = 1 公尺;+X = 東,-Z = 北,+Y = 上。原點由各區域的 origin 決定。
// TWD97 與 WGS84 差異在公分~公尺級,遊戲用途直接視為相同。
import proj4 from 'proj4';

export const EPSG_3826 =
  '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';

const toTm2 = proj4('WGS84', EPSG_3826);

/** 經緯度 → TWD97 TM2 [東距 E, 北距 N](公尺) */
export function lonLatToTm2(lon: number, lat: number): [number, number] {
  const [e, n] = toTm2.forward([lon, lat]);
  return [e, n];
}

/** TWD97 TM2 → 經緯度 [lon, lat] */
export function tm2ToLonLat(e: number, n: number): [number, number] {
  const [lon, lat] = toTm2.inverse([e, n]);
  return [lon, lat];
}

/** 世界座標原點(TM2 公尺)。 */
export interface Origin {
  e: number;
  n: number;
}

/** 經緯度 → 世界座標 [x, z] */
export function lonLatToWorld(lon: number, lat: number, origin: Origin): [number, number] {
  const [e, n] = lonLatToTm2(lon, lat);
  return [e - origin.e, -(n - origin.n)];
}

/** 世界座標 → 經緯度 [lon, lat] */
export function worldToLonLat(x: number, z: number, origin: Origin): [number, number] {
  return tm2ToLonLat(x + origin.e, -z + origin.n);
}

/**
 * 羅盤方位角(度,北 = 0、東 = 90,順時針)→ 世界座標平面上的單位方向 [dx, dz]。
 */
export function bearingToDir(bearingDeg: number): [number, number] {
  const r = (bearingDeg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}
