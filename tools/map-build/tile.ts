// 將既有的 public/map/<area>/world.json 切分為 index.json + tiles/<tx>_<tz>.json
// 用法:npx tsx tools/map-build/tile.ts --area range-a
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorldJson } from '../../src/map/types';
import { writeWorldTiles } from './lib/write-tiles';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const idx = process.argv.indexOf('--area');
const areaName = idx >= 0 ? process.argv[idx + 1] : 'range-a';
const outDir = join(ROOT, 'public/map', areaName);
const json = JSON.parse(readFileSync(join(outDir, 'world.json'), 'utf8')) as WorldJson;
writeWorldTiles(outDir, json);
