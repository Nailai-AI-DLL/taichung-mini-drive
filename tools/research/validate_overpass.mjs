// 驗證 Overpass 回應是否為完整的 JSON 結果。
// 用法:node tools/research/validate_overpass.mjs <檔案>
// 通過(exit 0)的條件:能完整 JSON.parse、有 elements 陣列、沒有 remark。
// Overpass 逾時或記憶體不足時可能仍回 HTTP 200,但 JSON 裡會帶 remark("runtime error: ...")且資料不完整,
// 所以有 remark 一律視為失敗(參考 mrdoob/slop-newyork tools/overpass.sh 的做法)。
import { readFileSync } from 'node:fs';

const file = process.argv[2];
try {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data.elements)) {
    console.error('沒有 elements 陣列');
    process.exit(1);
  }
  if (data.remark) {
    console.error(`回應帶 remark(資料可能不完整):${String(data.remark).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`elements ${data.elements.length}`);
} catch (e) {
  console.error(`不是完整的 JSON:${e.message.slice(0, 200)}`);
  process.exit(1);
}
