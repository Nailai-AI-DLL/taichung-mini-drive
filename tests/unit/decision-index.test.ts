// 決策索引要跟 docs/decisions 同步(2026-11-21 審查 M10:手寫索引停在 0015、最近 16 個 commit 沒寫決策)。
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

describe('決策文件', () => {
  it('docs/README.md 的決策索引是最新的(否則執行 node tools/dev/decision-index.mjs)', () => {
    expect(() => execFileSync('node', [join(ROOT, 'tools/dev/decision-index.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('編號連續、不重號', () => {
    const nums = readdirSync(join(ROOT, 'docs/decisions'))
      .filter((f) => /^\d{4}-.*\.md$/.test(f))
      .map((f) => Number(f.slice(0, 4)))
      .sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    nums.forEach((n, i) => expect(n).toBe(i + 1));
  });
});
