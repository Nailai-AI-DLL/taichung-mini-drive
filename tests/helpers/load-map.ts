// Node 測試用:讀取建置好的地圖(需先執行 npm run map:build:m0 / map:build:range-a)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldJson } from '../../src/map/types';
import { decodeWorld, type World } from '../../src/world/chunks';

export function loadWorld(area = 'm0'): World {
  const json = JSON.parse(readFileSync(join(__dirname, '../../public/map', area, 'world.json'), 'utf8')) as WorldJson;
  return decodeWorld(json);
}
