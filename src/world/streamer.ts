// 分塊串流:依車子位置決定哪些格子要生成、哪些要卸載(docs/decisions/0012)。
// 只管「哪一格、何時」;實際加進場景與物理世界由 hooks 負責,方便在 Node 測試。
import { buildChunk, buildFurniture, type ChunkMeshes, type ChunkSrc, type FurnitureMeshes, type World } from './chunks';

export interface StreamerOptions {
  /** 格子最近點距車子小於這個距離就生成(公尺) */
  loadRadius: number;
  /** 大於這個距離就卸載(公尺);比 loadRadius 大,避免在邊界來回生成 */
  unloadRadius: number;
  /** 每次 update 最多花多少毫秒生成(至少生成一格) */
  budgetMs: number;
}

export interface StreamerHooks {
  onLoad(src: ChunkSrc, meshes: ChunkMeshes): void;
  /**
   * 有這個 hook 時分兩段生成:onLoad 只帶地面、建築(meshes.furniture 是空的),
   * 街道傢俱留到之後的 update 再生成、用這個 hook 交出去(同一幀不會又生成格子又生成傢俱,除非預算還有剩)。
   * 格子在傢俱生成前就被卸載的話,不會呼叫。
   */
  onFurniture?(src: ChunkSrc, furniture: FurnitureMeshes): void;
  onUnload(src: ChunkSrc): void;
}

export const DEFAULT_STREAMER: StreamerOptions = { loadRadius: 800, unloadRadius: 950, budgetMs: 4 };

/** 點到格子矩形的最近距離 */
export function distToChunk(c: ChunkSrc, x: number, z: number): number {
  const dx = Math.max(c.rect.minX - x, 0, x - c.rect.maxX);
  const dz = Math.max(c.rect.minZ - z, 0, z - c.rect.maxZ);
  return Math.hypot(dx, dz);
}

export class ChunkStreamer {
  readonly loaded = new Set<string>();
  /** 最近一次 update 的生成耗時與格數(效能量測用) */
  lastStats = { generated: 0, unloaded: 0, ms: 0 };
  /** 單格生成的最長耗時(毫秒) */
  maxChunkMs = 0;
  /** buildChunk(純計算,不含加進場景與物理)的累計耗時(毫秒) */
  totalBuildMs = 0;
  /** 已載入、還沒生成街道傢俱的格子(兩段生成時) */
  private furniturePending = new Set<string>();

  constructor(
    private world: World,
    private hooks: StreamerHooks,
    readonly opts: StreamerOptions = DEFAULT_STREAMER,
    private now: () => number = () => performance.now(),
  ) {}

  /** 每幀呼叫:卸載太遠的格子,依距離由近到遠生成缺少的格子,直到用完時間預算 */
  update(x: number, z: number, budgetMs = this.opts.budgetMs) {
    const t0 = this.now();
    let unloaded = 0;
    for (const key of this.loaded) {
      const c = this.world.chunks.get(key)!;
      if (distToChunk(c, x, z) > this.opts.unloadRadius) {
        this.hooks.onUnload(c);
        this.loaded.delete(key);
        this.furniturePending.delete(key);
        unloaded++;
      }
    }
    const missing: [number, ChunkSrc][] = [];
    for (const c of this.world.chunks.values()) {
      if (this.loaded.has(c.key)) continue;
      const d = distToChunk(c, x, z);
      if (d <= this.opts.loadRadius) missing.push([d, c]);
    }
    missing.sort((a, b) => a[0] - b[0]);
    const split = !!this.hooks.onFurniture;
    let generated = 0;
    let furnished = 0;
    for (const [, c] of missing) {
      if (generated > 0 && this.now() - t0 >= budgetMs) break;
      const s = this.now();
      const meshes = buildChunk(c, !split);
      this.totalBuildMs += this.now() - s;
      this.hooks.onLoad(c, meshes);
      this.maxChunkMs = Math.max(this.maxChunkMs, this.now() - s);
      this.loaded.add(c.key);
      if (split) this.furniturePending.add(c.key);
      generated++;
    }
    // 街道傢俱:這一幀沒生成格子就至少做一格;有生成格子就只在預算還有剩時做
    if (split && this.furniturePending.size) {
      const pend = [...this.furniturePending].map((k) => this.world.chunks.get(k)!).sort((a, b) => distToChunk(a, x, z) - distToChunk(b, x, z));
      for (const c of pend) {
        if ((generated > 0 || furnished > 0) && this.now() - t0 >= budgetMs) break;
        const s = this.now();
        const f = buildFurniture(c);
        this.totalBuildMs += this.now() - s;
        this.hooks.onFurniture!(c, f);
        this.maxChunkMs = Math.max(this.maxChunkMs, this.now() - s);
        this.furniturePending.delete(c.key);
        furnished++;
      }
    }
    this.lastStats = { generated, unloaded, ms: this.now() - t0 };
    return { ...this.lastStats, pending: missing.length - generated, furniturePending: this.furniturePending.size };
  }

  /** 開場用:不限時間,把半徑內的格子全部生成 */
  loadAll(x: number, z: number) {
    return this.update(x, z, Infinity);
  }
}
