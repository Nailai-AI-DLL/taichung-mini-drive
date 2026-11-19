// 將 WorldJson 寫出為分區格式:public/map/<area>/index.json + public/map/<area>/tiles/<tx>_<tz>.json
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DEFAULT_TILE_SIZE, splitWorldIntoTiles } from '../../../src/map/tiles';
import type { WorldJson } from '../../../src/map/types';

export function writeWorldTiles(outDir: string, json: WorldJson, tileSize = DEFAULT_TILE_SIZE) {
  const { index, tiles } = splitWorldIntoTiles(json, tileSize);
  const tilesDir = join(outDir, 'tiles');
  rmSync(tilesDir, { recursive: true, force: true });
  mkdirSync(tilesDir, { recursive: true });

  const indexText = JSON.stringify(index);
  writeFileSync(join(outDir, 'index.json'), indexText);

  let totalTileBytes = 0;
  let maxTileBytes = 0;
  let maxTileKey = '';
  for (const [key, tile] of tiles) {
    const text = JSON.stringify(tile);
    const bytes = Buffer.byteLength(text);
    totalTileBytes += bytes;
    if (bytes > maxTileBytes) {
      maxTileBytes = bytes;
      maxTileKey = key;
    }
    writeFileSync(join(tilesDir, `${key}.json`), text);
  }

  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const indexBytes = Buffer.byteLength(indexText);
  const indexGzip = gzipSync(indexText).byteLength;
  const avgBytes = tiles.size ? totalTileBytes / tiles.size : 0;
  console.log(
    `輸出分區 ${outDir}/index.json(${kb(indexBytes)},gzip ${kb(indexGzip)}) + ${tiles.size} 個分區檔 tiles/*.json(合計 ${kb(totalTileBytes)},平均 ${kb(avgBytes)}/檔,最大 ${maxTileKey} ${kb(maxTileBytes)})`,
  );
  return { index, tiles, indexBytes, indexGzip, totalTileBytes, maxTileBytes };
}
