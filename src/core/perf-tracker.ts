// 單幀效能與偶發卡頓追蹤器:記錄每幀各子系統耗時、FPS 分布(平均 / 1% Low)與最慢的 5 幀。
// 不依賴 DOM 與 three.js,可在 Node 單元測試中使用。

export interface FrameWork {
  physics: number;
  stream: number;
  build: number;
  meshes: number;
  colliders: number;
  minimap: number;
  render: number;
  chunks: number;
}

const emptyWork = (): FrameWork => ({
  physics: 0,
  stream: 0,
  build: 0,
  meshes: 0,
  colliders: 0,
  minimap: 0,
  render: 0,
  chunks: 0,
});

export class PerfTracker {
  frames = 0;
  fps = 0;
  readonly work: FrameWork = emptyWork();
  private prevWork: FrameWork = emptyWork();
  private worstFrames: { ms: number; at: number; prev: FrameWork }[] = [];
  private frameTimes: number[] = [];
  private fpsAcc = 0;
  private fpsFrames = 0;
  private maxFrameMs = 0;
  private last: number;

  constructor(now = typeof performance !== 'undefined' ? performance.now() : 0) {
    this.last = now;
  }

  /** 每幀開頭呼叫:結算上一幀間隔、更新最慢幀與 FPS,並歸零本幀的 work 分項;回傳限制在 0.1 秒內的 dt */
  beginFrame(now: number): number {
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const rawMs = rawDt * 1000;
    this.maxFrameMs = Math.max(this.maxFrameMs, rawMs);
    // 這一幀的間隔反映的是上一幀做的事:記下上一幀的分項
    if (this.frames > 60 && (this.worstFrames.length < 5 || rawMs > this.worstFrames[this.worstFrames.length - 1].ms)) {
      this.worstFrames.push({ ms: rawMs, at: this.frames, prev: this.prevWork });
      this.worstFrames.sort((a, b) => b.ms - a.ms).splice(5);
    }
    for (const k of Object.keys(this.work) as (keyof FrameWork)[]) this.work[k] = 0;

    const dt = Math.min(0.1, rawDt);
    this.last = now;
    this.frames++;
    this.fpsAcc += dt;
    this.fpsFrames++;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    return dt;
  }

  /** 每幀結尾呼叫:保存本幀的 work 供下一幀檢查是否造成卡頓 */
  endFrame() {
    this.prevWork = { ...this.work };
  }

  avgFps(): number {
    if (!this.frameTimes.length) return 0;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    return sum > 0 ? this.frameTimes.length / sum : 0;
  }

  p1LowFps(): number {
    if (!this.frameTimes.length) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const worst = sorted[Math.floor(sorted.length * 0.99)] ?? 1;
    return worst > 0 ? 1 / worst : 0;
  }

  /** 讀取兩次呼叫之間的最長單幀(ms)並歸零 */
  consumeMaxFrameMs(): number {
    const m = this.maxFrameMs;
    this.maxFrameMs = 0;
    return m;
  }

  /** 回傳最慢的幾幀與它們前一幀做了什麼(__game.perf 用) */
  reportWorst() {
    return this.worstFrames.map((f) => ({
      ms: +f.ms.toFixed(1),
      at: f.at,
      prev: Object.fromEntries(Object.entries(f.prev).map(([k, v]) => [k, +v.toFixed(1)])),
    }));
  }
}
