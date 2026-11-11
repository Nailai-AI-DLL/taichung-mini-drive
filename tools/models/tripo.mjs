// Tripo 官方 API(decisions/0016 §15):多視角參考圖 → 3D 模型(GLB)。只用官方 API,不裝第三方 MCP。
// 金鑰從專案根目錄的 .env 讀(TRIPO_API_KEY=...;.env 已在 .gitignore)。腳本不會印出金鑰。
// API 依據(2026-11-11 查):https://developers.tripo3d.com/en/docs/quick-start、/en/docs/files、
//   /en/docs/generation-multiview-to-model/standard、/en/docs/account、/en/models/v3-1
//
// 用法:
//   node tools/models/tripo.mjs balance                         查點數(不扣點)
//   node tools/models/tripo.mjs multiview <參考圖資料夾> <輸出資料夾> [--parts] [--texture] [--detailed] [--quad] [--dry]
//     參考圖資料夾要有 ref-front.png、ref-left.png、ref-rear.png、ref-right.png(tools/models/clean_reference.py 產生)
//     --dry 只印出要送的參數與估計點數,不上傳、不扣點
//   node tools/models/tripo.mjs fetch <task_id> <輸出資料夾>     重新查詢 / 下載某個任務(模型網址 5 分鐘就失效)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
// 金鑰(tsk_ 開頭,從 platform.tripo3d.ai 申請)只在 .ai 網域有效;官方文件寫的 openapi.tripo3d.com 會回 401(2026-11-11 實測)
const BASE = process.env.TRIPO_BASE ?? 'https://openapi.tripo3d.ai/v3';
const MODEL = 'v3.1-20260211';
/** 點數(Tripo 官方價格表,2026-11-11 查,多視角 H3.1):基本 + 加購 */
const COST = { noTexture: 20, standardTexture: 30, detailedGeometry: 20, quad: 5, parts: 20 };

function key() {
  if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
  const k = process.env.TRIPO_API_KEY;
  if (!k) throw new Error('找不到 TRIPO_API_KEY:請在專案根目錄的 .env 加一行 TRIPO_API_KEY=你的金鑰');
  return k;
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${key()}`, ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.code !== 0) throw new Error(`Tripo ${path} 失敗:HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.data;
}

async function upload(file) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), file.split('/').pop());
  return (await api('/files', { method: 'POST', body: form })).file_token;
}

async function poll(taskId) {
  for (;;) {
    const t = await api(`/tasks/${taskId}`);
    process.stdout.write(`\r任務 ${taskId}:${t.status} ${t.progress ?? 0}%   `);
    if (t.status === 'success') {
      process.stdout.write('\n');
      return t;
    }
    if (['failed', 'cancelled', 'banned', 'expired'].includes(t.status)) throw new Error(`\n任務結束但沒有成功:${t.status}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function save(task, outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${task.task_id}.json`), JSON.stringify(task, null, 1));
  for (const [name, url] of [['model.glb', task.output?.model_url], ['preview.webp', task.output?.rendered_image_url]]) {
    if (!url) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下載 ${name} 失敗:HTTP ${res.status}(模型網址 5 分鐘失效,可用 fetch 指令重抓)`);
    writeFileSync(join(outDir, `${task.task_id}-${name}`), Buffer.from(await res.arrayBuffer()));
    console.log('已存', join(outDir, `${task.task_id}-${name}`));
  }
  console.log('扣點', task.credits_consumed ?? 'not_stated');
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a) => !a.startsWith('--'));

if (cmd === 'balance') {
  const b = await api('/account/balance');
  console.log(`Tripo 點數:可用 ${b.balance},凍結中 ${b.frozen}`);
} else if (cmd === 'multiview') {
  const [refDir, outDir] = args.map((a) => resolve(a));
  const views = { front: 'ref-front.png', left: 'ref-left.png', back: 'ref-rear.png', right: 'ref-right.png' };
  const body = {
    model: MODEL,
    // 分零件要求不上貼圖(官方文件);車子本來就照 palette 上純色
    texture: flags.has('--texture') && !flags.has('--parts'),
    pbr: false,
    generate_parts: flags.has('--parts'),
    geometry_quality: flags.has('--detailed') ? 'detailed' : 'standard',
    quad: flags.has('--quad'),
    export_orientation: '+x',
  };
  const est = (body.texture ? COST.standardTexture : COST.noTexture) + (body.geometry_quality === 'detailed' ? COST.detailedGeometry : 0) + (body.quad ? COST.quad : 0) + (body.generate_parts ? COST.parts : 0);
  console.log('要送的參數', JSON.stringify(body), `估計 ${est} 點(依官方價格表,實際以回傳的 credits_consumed 為準)`);
  if (flags.has('--dry')) process.exit(0);
  const inputs = [];
  for (const [view, file] of Object.entries(views)) {
    const p = join(refDir, file);
    if (!existsSync(p)) throw new Error(`缺參考圖 ${p}`);
    inputs.push({ [view]: await upload(p) });
    console.log('已上傳', view);
  }
  const { task_id } = await api('/generation/multiview-to-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, inputs }) });
  console.log('任務', task_id);
  await save(await poll(task_id), outDir);
} else if (cmd === 'fetch') {
  const [taskId, outDir] = args;
  await save(await api(`/tasks/${taskId}`), resolve(outDir));
} else {
  console.log('用法見檔案開頭註解');
}
