// Overpass 下載防呆(docs/decisions/0009 T3)。
// 用本機假伺服器模擬各種壞回應,確認舊的好資料不會被蓋掉、好回應才會原子替換。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = process.env.FETCH_OVERPASS_SCRIPT ?? resolve(__dirname, '../../tools/research/fetch_overpass.sh');
const GOOD_OLD = JSON.stringify({ osm3s: {}, elements: [{ type: 'node', id: 1 }] });
const GOOD_NEW = JSON.stringify({ osm3s: {}, elements: [{ type: 'node', id: 2 }, { type: 'node', id: 3 }] });

// 路徑決定回應內容
const RESPONSES: Record<string, [number, string]> = {
  '/good': [200, GOOD_NEW],
  '/remark': [200, JSON.stringify({ osm3s: {}, elements: [{ type: 'node', id: 9 }], remark: 'runtime error: Query timed out' })],
  '/truncated': [200, GOOD_NEW.slice(0, 30)],
  '/html200': [200, '<html><body>error</body></html>'],
  '/noelements': [200, JSON.stringify({ osm3s: {} })],
  '/busy': [429, 'Too Many Requests'],
  '/bad-gateway': [502, '<html>502</html>'],
};

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const [code, body] = RESPONSES[req.url ?? ''] ?? [404, 'not found'];
    req.resume();
    req.on('end', () => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

function run(endpoints: string[], dir: string, out = join(dir, 'out.json')) {
  const query = join(dir, 'q.overpassql');
  writeFileSync(query, '[out:json];node(1);out;');
  return new Promise<number>((done) =>
    execFile(
      'bash',
      [SCRIPT, query, out],
      { env: { ...process.env, OVERPASS_ENDPOINTS: endpoints.map((p) => base + p).join(' '), OVERPASS_ROUNDS: '1', OVERPASS_SLEEP: '0' } },
      (err) => done(err ? ((err as { code?: number }).code ?? 1) : 0),
    ),
  );
}

function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), 'overpass-test-'));
  writeFileSync(join(dir, 'out.json'), GOOD_OLD);
  return dir;
}

const leftovers = (dir: string) => readdirSync(dir).filter((f) => f.includes('.tmp.'));

describe('fetch_overpass.sh', () => {
  for (const bad of ['/remark', '/truncated', '/html200', '/noelements', '/busy', '/bad-gateway']) {
    it(`壞回應 ${bad}:失敗結束,舊檔不變,不留暫存檔`, async () => {
      const dir = freshDir();
      expect(await run([bad], dir)).not.toBe(0);
      expect(readFileSync(join(dir, 'out.json'), 'utf8')).toBe(GOOD_OLD);
      expect(leftovers(dir)).toEqual([]);
    });
  }

  it('第一個端點壞、第二個好:改用第二個並替換輸出檔', async () => {
    const dir = freshDir();
    expect(await run(['/remark', '/good'], dir)).toBe(0);
    expect(readFileSync(join(dir, 'out.json'), 'utf8')).toBe(GOOD_NEW);
    expect(leftovers(dir)).toEqual([]);
    const log = readFileSync(join(dir, 'fetch_log.tsv'), 'utf8').trim().split('\n');
    expect(log.map((l) => l.split('\t')[2])).toEqual(['http_status', '200-invalid', '200']);
    // mktemp 建立的檔案是 600,替換後要是一般資料檔的 644
    expect(statSync(join(dir, 'out.json')).mode & 0o777).toBe(0o644);
  });

  it('輸出資料夾不存在:不發請求,立即以代碼 2 結束', async () => {
    const dir = freshDir();
    const t0 = Date.now();
    expect(await run(['/good'], dir, join(dir, 'missing', 'out.json'))).toBe(2);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
