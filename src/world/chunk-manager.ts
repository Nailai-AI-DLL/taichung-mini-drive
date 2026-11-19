// 分塊場景與物理管理器:橋接 ChunkStreamer 與 Three.js 場景 / Rapier 物理世界,並預留地形與高架橋路面碰撞掛載。
import type * as THREE from 'three';
import {
  addStaticFurniture,
  addStaticRoadDeck,
  addStaticTrimesh,
  removeBody,
  type PhysicsWorld,
} from '../physics/world';
import { addChunkFurniture, addChunkMeshes, addLandmark, removeChunkMeshes } from '../render/scene';
import type { FrameWork } from '../core/perf-tracker';
import { colliderMeshes, furnitureCollision, type ChunkMeshes, type World } from './chunks';
import { ChunkStreamer } from './streamer';
import { TileStreamer } from '../map/tiles';
import type { MeshArrays } from '../map/types';

export interface LiveChunk {
  objects: THREE.Object3D[][];
  bodies: ReturnType<typeof addStaticTrimesh>[];
}

export class WorldChunkManager {
  readonly streamer: ChunkStreamer;
  readonly tileStreamer: TileStreamer;
  readonly live = new Map<string, LiveChunk>();

  constructor(
    readonly world: World,
    readonly scene: THREE.Scene,
    readonly pw: PhysicsWorld,
    private readonly work?: FrameWork,
    /** 未來擴充:從單格網格抽出地形或高架橋路面碰撞網格(摩擦係數 1.0) */
    private readonly roadDeckMeshes?: (m: ChunkMeshes) => MeshArrays[],
  ) {
    this.streamer = new ChunkStreamer(world, {
      onLoad: (src, m) => {
        const t0 = performance.now();
        const objects = [
          addChunkMeshes(scene, m),
          ...src.landmarks.map((lm, i) => addLandmark(scene, lm, m.landmarkSolids[i])),
        ];
        const t1 = performance.now();
        const bodies = colliderMeshes(m).map((a) => addStaticTrimesh(pw, a.position, a.index));
        if (this.roadDeckMeshes) {
          for (const d of this.roadDeckMeshes(m)) bodies.push(addStaticRoadDeck(pw, d.position, d.index));
        }
        if (this.work) {
          this.work.meshes += t1 - t0;
          this.work.colliders += performance.now() - t1;
          this.work.chunks++;
        }
        this.live.set(src.key, { objects, bodies });
      },
      // 兩段生成(0015 §11.10):街道傢俱晚一幀以上才生成,接到這一格的建築網格與物理
      onFurniture: (src, f) => {
        const l = this.live.get(src.key);
        if (!l) return;
        const t0 = performance.now();
        addChunkFurniture(scene, l.objects[0], f);
        const t1 = performance.now();
        l.bodies.push(addStaticFurniture(pw, furnitureCollision(src)));
        if (this.work) {
          this.work.meshes += t1 - t0;
          this.work.colliders += performance.now() - t1;
        }
      },
      onUnload: (src) => {
        const l = this.live.get(src.key);
        if (!l) return;
        for (const o of l.objects) removeChunkMeshes(scene, o);
        for (const b of l.bodies) removeBody(pw, b);
        this.live.delete(src.key);
      },
    });
    this.tileStreamer = new TileStreamer(world, {
      onChunksChanged: (keys) => this.streamer.invalidateChunks(keys),
    });
  }

  /** 開場載入出生點周圍所有格子 */
  loadAll(x: number, z: number) {
    return this.streamer.loadAll(x, z);
  }

  /** 每幀依目標位置更新分區 Tile 下載/卸載與 250 m 格子串流並記錄耗時 */
  update(x: number, z: number) {
    const t0 = performance.now();
    const tileState = this.tileStreamer.update(x, z);
    const built = this.streamer.totalBuildMs;
    // 若本幀剛套用了 1 個 1 km 分區 Tile,將 3D 網格生成讓到下一幀,避免單幀耗時疊加
    const res = this.streamer.update(x, z, this.streamer.opts.budgetMs, !tileState.applied);
    if (this.work) {
      this.work.stream = performance.now() - t0;
      this.work.build = this.streamer.totalBuildMs - built;
    }
    return res;
  }

  get loadedCount(): number {
    return this.streamer.loaded.size;
  }

  get totalCount(): number {
    return this.world.chunks.size;
  }

  get maxChunkMs(): number {
    return this.streamer.maxChunkMs;
  }

  get tilesLoaded(): number {
    return this.world.tiles?.loaded.size ?? 0;
  }

  get tilesTotal(): number {
    return this.world.tiles?.available.size ?? 0;
  }
}
