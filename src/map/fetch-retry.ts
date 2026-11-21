// 地圖下載的網路容錯(2026-11-21 審查 H6,decisions/0057):逾時、重試與指數退避。

/** 單一請求逾時(毫秒);手機網路慢時 1 MB 分區也應在這之內下載完 */
export const FETCH_TIMEOUT_MS = 15000;

/** HTTP 錯誤(帶狀態碼;4xx 視為永久失敗,不重試) */
export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string, message?: string) {
    super(message ?? `HTTP ${status}: ${url}`);
  }
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/** 加上逾時的 fetch:超過 timeoutMs 就中止並丟出錯誤 */
export async function fetchWithTimeout(
  doFetch: typeof fetch,
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new Error(`逾時 ${timeoutMs} ms: ${url}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([doFetch(url, ctrl ? { signal: ctrl.signal } : undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** 失敗後再試幾次(預設 2,也就是最多 3 次) */
  retries?: number;
  timeoutMs?: number;
  /** 第一次重試前等待毫秒數,之後每次加倍(預設 1000) */
  baseDelayMs?: number;
  /** 測試注入用 */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 逾時 + 重試的 fetch,回傳 ok 的 Response。
 * 網路錯誤、逾時、5xx 會重試;4xx 直接丟 HttpError(不重試)。
 */
export async function fetchRetry(doFetch: typeof fetch, url: string, opts: RetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(base * 2 ** (attempt - 1));
    try {
      const res = await fetchWithTimeout(doFetch, url, opts.timeoutMs);
      if (res.ok) return res;
      const err = new HttpError(res.status, url);
      if (err.permanent) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof HttpError && e.permanent) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 串流分區失敗後的等待時間:2 s、4 s、8 s… 最多 60 s */
export function retryBackoffMs(failures: number): number {
  return Math.min(60000, 2000 * 2 ** Math.max(0, failures - 1));
}
