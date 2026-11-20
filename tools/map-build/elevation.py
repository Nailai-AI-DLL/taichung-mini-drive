"""
從內政部 20 m DTM(臺中市分幅,政府資料開放授權第 1 版)產出遊戲執行端使用的規則網格高程檔 elevation.json。

- 只讀 zip 裡的 .grd 文字數值,不解壓、不執行任何內容(同 tools/map-build/skyline.py)。
- 以 40 m 網格取樣並做輕微平滑(消除 20 m DTM 殘留的橋梁/建築高程尖刺),讓道路與斜坡行駛平順。
- 以出生點(spawn)周圍高程作為 y = 0 基準(datum),寫入相對高程(量化至 0.1 m 整數,乘上 10),檔案極輕量(gzip < 50 KB)。

用法:
  python3 tools/map-build/elevation.py data/elevation/moi_dtm20_taichung/taichung_dem20.zip public/map/range-a/index.json public/map/range-a/elevation.json
"""
import json
import math
import os
import sys
import zipfile

STEP = 40          # 輸出網格間距(公尺,須為 20 的倍數)
MARGIN = 200       # 超出 bounds 往外多取的緩衝距離(公尺)
QUANT_H = 10       # 高程量化倍數(0.1 m)


def parse_hdr(text):
    out = {}
    for ln in text.splitlines():
        p = ln.split()
        if len(p) >= 2:
            out[p[0].lower()] = p[1]
    return out


def smooth_grid(grid, cols, rows, passes=2):
    cur = grid[:]
    for _ in range(passes):
        nxt = cur[:]
        for r in range(rows):
            r0 = max(0, r - 1)
            r1 = min(rows - 1, r + 1)
            for c in range(cols):
                c0 = max(0, c - 1)
                c1 = min(cols - 1, c + 1)
                # 3x3 加權平均(中心權重 4,四鄰 2,四角 1)
                wsum = 0.0
                vsum = 0.0
                for rr in range(r0, r1 + 1):
                    for cc in range(c0, c1 + 1):
                        w = 4.0 if (rr == r and cc == c) else (2.0 if (rr == r or cc == c) else 1.0)
                        vsum += cur[rr * cols + cc] * w
                        wsum += w
                nxt[r * cols + c] = vsum / wsum
        cur = nxt
    return cur


def main():
    if len(sys.argv) < 4:
        print("用法: python3 tools/map-build/elevation.py <dem.zip> <index.json|world.json> <out elevation.json>")
        sys.exit(2)
    zip_path, world_path, out_path = sys.argv[1:4]
    wdata = json.load(open(world_path, encoding="utf-8"))
    meta = wdata["meta"]
    spawn = wdata["spawn"]
    oe, on = meta["origin"]["e"], meta["origin"]["n"]
    bx0, bz0, bx1, bz1 = meta["bounds"]

    minX = int(math.floor((bx0 - MARGIN) / STEP) * STEP)
    maxX = int(math.ceil((bx1 + MARGIN) / STEP) * STEP)
    minZ = int(math.floor((bz0 - MARGIN) / STEP) * STEP)
    maxZ = int(math.ceil((bz1 + MARGIN) / STEP) * STEP)
    cols = (maxX - minX) // STEP + 1
    rows = (maxZ - minZ) // STEP + 1

    e_min, e_max = oe + minX - STEP, oe + maxX + STEP
    n_min, n_max = on - maxZ - STEP, on - minZ + STEP

    # 收集每個目標網格附近 20m DTM 樣本的平均高程
    acc_sum = [0.0] * (cols * rows)
    acc_cnt = [0] * (cols * rows)

    z = zipfile.ZipFile(zip_path)
    tiles_read = 0
    samples_used = 0
    for h in [i.filename for i in z.infolist() if i.filename.endswith("dem.hdr")]:
        grd_name = h[:-4] + ".grd"
        # 快速檢查該分幅第一行座標是否可能落在大致範圍內
        lines = z.read(grd_name).decode("ascii").splitlines()
        if not lines:
            continue
        first = lines[0].split()
        last = lines[-1].split()
        if len(first) == 3 and len(last) == 3:
            fe, fn = float(first[0]), float(first[1])
            le, ln_ = float(last[0]), float(last[1])
            te0, te1 = min(fe, le), max(fe, le)
            tn0, tn1 = min(fn, ln_), max(fn, ln_)
            if te1 < e_min or te0 > e_max or tn1 < n_min or tn0 > n_max:
                continue
        tiles_read += 1
        for ln in lines:
            p = ln.split()
            if len(p) != 3:
                continue
            e, n, zz = float(p[0]), float(p[1]), float(p[2])
            if zz <= -999:
                continue
            if not (e_min <= e <= e_max and n_min <= n <= n_max):
                continue
            wx = e - oe
            wz = -(n - on)
            c = int(round((wx - minX) / STEP))
            r = int(round((wz - minZ) / STEP))
            if 0 <= c < cols and 0 <= r < rows:
                idx = r * cols + c
                acc_sum[idx] += zz
                acc_cnt[idx] += 1
                samples_used += 1

    if samples_used == 0:
        raise RuntimeError("範圍內找不到任何 DTM 高程點")

    # 填入平均值,缺值處用最近鄰補齊
    avg_all = sum(acc_sum) / max(1, sum(acc_cnt))
    grid = [acc_sum[i] / acc_cnt[i] if acc_cnt[i] > 0 else None for i in range(cols * rows)]
    # 簡單多輪擴散補缺值
    for _ in range(10):
        missing = 0
        nxt = grid[:]
        for r in range(rows):
            for c in range(cols):
                i = r * cols + c
                if grid[i] is not None:
                    continue
                missing += 1
                nb = []
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < rows and 0 <= cc < cols and grid[rr * cols + cc] is not None:
                        nb.append(grid[rr * cols + cc])
                if nb:
                    nxt[i] = sum(nb) / len(nb)
        grid = nxt
        if missing == 0:
            break
    grid = [avg_all if v is None else v for v in grid]

    # 輕微平滑 2 輪,濾除橋梁/建物高程尖刺
    grid = smooth_grid(grid, cols, rows, passes=2)

    # 以出生點高程為基準面 y = 0
    sc = max(0, min(cols - 1, int(round((spawn["x"] - minX) / STEP))))
    sr = max(0, min(rows - 1, int(round((spawn["z"] - minZ) / STEP))))
    datum = grid[sr * cols + sc]
    rel = [round((v - datum) * QUANT_H) for v in grid]

    out = {
        "source": "內政部 20 m DTM 臺中市分幅(政府資料開放授權第 1 版)",
        "minX": minX,
        "minZ": minZ,
        "step": STEP,
        "cols": cols,
        "rows": rows,
        "datum": round(datum, 2),
        "quant": QUANT_H,
        "heights": rel,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    min_h = min(rel) / QUANT_H
    max_h = max(rel) / QUANT_H
    print(
        f"DTM 地形產出: {cols}x{rows} (step {STEP} m), 讀取 {tiles_read} 分幅 / {samples_used} 樣本, "
        f"基準面 {datum:.1f} m, 相對高程 {min_h:+.1f}..{max_h:+.1f} m -> {out_path} ({os.path.getsize(out_path) // 1024} KB)"
    )


if __name__ == "__main__":
    main()
