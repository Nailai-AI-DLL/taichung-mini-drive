// 瀏覽器端載入地圖(world.json,格式 v2)並分到格子
import type { WorldJson } from './types';
import { decodeWorld, type World } from '../world/chunks';

export async function fetchWorld(area: string): Promise<World> {
  const json = (await fetch(`${import.meta.env.BASE_URL}map/${area}/world.json`).then((r) => r.json())) as WorldJson;
  return decodeWorld(json);
}
