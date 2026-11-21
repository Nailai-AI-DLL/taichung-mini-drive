// 決策索引自動產生(2026-11-21 審查 M10:docs/README.md 手寫索引停在 0015)。
// 讀 docs/decisions/NNNN-*.md 的標題(第一行 #)與「狀態」行,改寫 docs/README.md 裡
// <!-- decisions:start --> 與 <!-- decisions:end --> 之間的清單。
// 用法:node tools/dev/decision-index.mjs        (改寫 docs/README.md)
//       node tools/dev/decision-index.mjs --check (索引過期就以結束碼 1 離開,給測試 / CI 用)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'docs/decisions');
const README = join(ROOT, 'docs/README.md');
const START = '<!-- decisions:start -->';
const END = '<!-- decisions:end -->';

export function decisionIndex(files, read) {
  return files
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()
    .map((f) => {
      const text = read(f);
      const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? f).replace(/^\d{4}\s*/, '').trim();
      const status = text.match(/^狀態\s*[:：]\s*(.+)$/m)?.[1]?.trim();
      const short = status && status.length > 60 ? status.slice(0, 60) + '…' : status;
      return `   - \`${f}\` ${title}${short ? `(${short})` : ''}`;
    })
    .join('\n');
}

const list = decisionIndex(readdirSync(DIR), (f) => readFileSync(join(DIR, f), 'utf8'));
const readme = readFileSync(README, 'utf8');
const a = readme.indexOf(START), b = readme.indexOf(END);
if (a < 0 || b < a) throw new Error(`docs/README.md 找不到 ${START} / ${END}`);
const next = readme.slice(0, a + START.length) + '\n' + list + '\n   ' + readme.slice(b);
if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('docs/README.md 的決策索引過期,請執行 node tools/dev/decision-index.mjs');
    process.exit(1);
  }
  console.log('決策索引是最新的');
} else {
  writeFileSync(README, next);
  console.log(`已更新決策索引(${list.split('\n').length} 份)`);
}
