// 將既有的 public/map/<area>/world.json 切分為 index.json + tiles/<tx>_<tz>.json
// 用法:npx tsx tools/map-build/tile.ts --area range-a
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignElevatedRoads, cleanElevatedGroundStreet } from '../../src/map/elevated';
import type { WorldJson } from '../../src/map/types';
import { writeWorldTiles } from './lib/write-tiles';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const idx = process.argv.indexOf('--area');
const areaName = idx >= 0 ? process.argv[idx + 1] : 'range-a';
const outDir = join(ROOT, 'public/map', areaName);
const worldPath = join(outDir, 'world.json');
const json = JSON.parse(readFileSync(worldPath, 'utf8')) as WorldJson;
const elevatedCount = assignElevatedRoads(json.roads);
const cleanedStrips = cleanElevatedGroundStreet(json);
if (elevatedCount > 0 || cleanedStrips > 0) {
  json.meta.stats.elevatedRoads = elevatedCount;
  writeFileSync(worldPath, JSON.stringify(json));
  console.log(`已計算 ${elevatedCount} 條 3D 高架道路與上下匝道高程(清除 ${cleanedStrips} 條地面重複標線) → ${worldPath}`);
}
writeWorldTiles(outDir, json);
