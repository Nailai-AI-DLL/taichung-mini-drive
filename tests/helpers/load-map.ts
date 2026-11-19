// Node 測試用:讀取建置好的地圖(需先執行 npm run map:pull 或 npm run map:build:range-a)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldJson } from '../../src/map/types';
import { decodeWorld, type World } from '../../src/world/chunks';

export function mapFilePath(area = 'm0', file = 'world.json'): string {
  return join(__dirname, '../../public/map', area, file);
}

export function readMapJson<T = WorldJson>(area = 'm0', file = 'world.json'): T {
  const p = mapFilePath(area, file);
  if (!existsSync(p)) {
    throw new Error(`找不到 ${p}。若剛 clone 專案,請先執行 "npm run map:pull" 從 map-data 分支拉取地圖資料。`);
  }
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function loadWorld(area = 'm0'): World {
  return decodeWorld(readMapJson<WorldJson>(area, 'world.json'));
}
