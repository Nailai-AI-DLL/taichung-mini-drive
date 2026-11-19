// 瀏覽器端與雲端載入地圖(world.json,格式 v2)並分到格子。
// 支援三種來源優先序:網址參數 ?mapUrl= → 環境變數 VITE_MAP_URL(Cloudflare R2 等外部雲端)→ 同站 ${BASE_URL}map(GitHub Pages / 本機)。
import type { WorldJson } from './types';
import { decodeWorld, type World } from '../world/chunks';

export interface MapUrlOptions {
  /** 網址查詢字串(預設讀 location.search) */
  search?: string;
  /** 建置期雲端地圖網址(預設讀 import.meta.env.VITE_MAP_URL) */
  envMapUrl?: string;
  /** 網站基底路徑(預設讀 import.meta.env.BASE_URL) */
  baseUrl?: string;
}

export interface FetchWorldOptions extends MapUrlOptions {
  /** 載入狀態回報(給開場畫面顯示) */
  onStatus?: (text: string) => void;
  /** 自訂 fetch(單元測試注入用) */
  fetchFn?: typeof fetch;
}

/** 解析地圖資料的基底網址(不含結尾斜線) */
export function resolveMapBaseUrl(opts: MapUrlOptions = {}): string {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const fromQuery = new URLSearchParams(search).get('mapUrl')?.trim();
  if (fromQuery) return fromQuery.replace(/\/+$/, '');
  const envUrl = (opts.envMapUrl ?? (import.meta.env?.VITE_MAP_URL as string | undefined))?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const base = opts.baseUrl ?? import.meta.env?.BASE_URL ?? '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}map`;
}

/** 組合指定區域的地圖資源網址(例如 world.json、skyline.json) */
export function mapAssetUrl(area: string, file = 'world.json', opts: MapUrlOptions = {}): string {
  const cleanFile = file.replace(/^\/+/, '');
  return `${resolveMapBaseUrl(opts)}/${encodeURIComponent(area)}/${cleanFile}`;
}

/** 組合未來大範圍分區(Region Tile)的雲端網址 */
export function regionTileUrl(area: string, rx: number, rz: number, opts: MapUrlOptions = {}): string {
  return mapAssetUrl(area, `tiles/${rx}_${rz}.json`, opts);
}

export async function fetchWorld(area: string, opts: FetchWorldOptions = {}): Promise<World> {
  const url = mapAssetUrl(area, 'world.json', opts);
  opts.onStatus?.('下載地圖資料…');
  const doFetch = opts.fetchFn ?? fetch;
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`地圖載入失敗 (${res.status}): ${url}`);
  opts.onStatus?.('解析地圖資料…');
  const json = (await res.json()) as WorldJson;
  return decodeWorld(json);
}
