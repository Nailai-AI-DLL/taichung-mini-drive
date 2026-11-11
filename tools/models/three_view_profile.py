# 從 Q 版 MINI 三視圖量輪廓(decisions/0016 §13):側視取每一欄的最上 / 最下輪廓,正視、後視取每一列的最左 / 最右。
# 圖是插畫(深色描邊),輪廓 = 深色描邊像素(亮度 < DARK);天線這種細長突起用中位數濾掉。
# 用法:python3 tools/models/three_view_profile.py <三視圖> <輸出資料夾>
# 輸出:profile.json(正規化到車長 = 1 / 車寬 = 1 的輪廓)與 overlay.png(紅線疊在原圖上,給 Cooper 確認)
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

DARK = 110
# 三個小圖的範圍(x0, y0, x1, y1;像素),依 2026-11-11 Cooper 給的三視圖量
CROPS = {'front': (28, 650, 375, 915), 'side': (395, 650, 962, 915), 'rear': (980, 640, 1275, 915)}
# 不算輪廓的範圍(正視圖左上角的「!」符號)
EXCLUDE = [(28, 640, 90, 700)]

src, outdir = Path(sys.argv[1]), Path(sys.argv[2])
outdir.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert('RGB')
px = im.load()
dark = lambda x, y: sum(px[x, y]) / 3 < DARK and not any(a <= x < c and b <= y < e for a, b, c, e in EXCLUDE)


def median_filter(v, k=7):
    out = []
    for i in range(len(v)):
        w = sorted(x for x in v[max(0, i - k):i + k + 1] if x is not None)
        out.append(w[len(w) // 2] if w else None)
    return out


result = {}
ov = im.copy()
d = ImageDraw.Draw(ov)
for name, (x0, y0, x1, y1) in CROPS.items():
    cols = range(x0, x1)
    top = [next((y for y in range(y0, y1) if dark(x, y)), None) for x in cols]
    bot = [next((y for y in range(y1 - 1, y0, -1) if dark(x, y)), None) for x in cols]
    top, bot = median_filter(top), median_filter(bot)
    xs = [x for x, t in zip(cols, top) if t is not None]
    left, right = min(xs), max(xs)
    ground = max(b for b in bot if b is not None)
    roof = min(t for t in top if t is not None)
    L = right - left
    H = ground - roof
    prof = []
    for x, t, b in zip(cols, top, bot):
        if t is None:
            continue
        prof.append([round((x - left) / L, 4), round((ground - t) / L, 4), round((ground - b) / L, 4)])
    result[name] = {'px': {'left': left, 'right': right, 'roof': roof, 'ground': ground}, 'heightOverLength': round(H / L, 4), 'profile': prof}
    d.line([(x, t) for x, t in zip(cols, top) if t is not None], fill=(255, 0, 0), width=2)
    d.line([(x, b) for x, b in zip(cols, bot) if b is not None], fill=(0, 120, 255), width=2)
    d.rectangle((left, roof, right, ground), outline=(255, 0, 255), width=1)
# ---- 側視的細部:每一欄的車頂底(米白結束)、腰線(第一個車身綠)、輪子位置 ----
x0, y0, x1, y1 = CROPS['side']
sd = result['side']['px']
L = sd['right'] - sd['left']
G = sd['ground']
is_cream = lambda c: c[0] > 215 and c[1] > 205 and c[2] > 170 and c[0] - c[2] > 12
is_green = lambda c: c[1] > c[0] + 18 and c[1] > c[2] + 5
detail = []
for x in range(sd['left'], sd['right'] + 1):
    t = next((y for y in range(y0, y1) if dark(x, y)), None)
    if t is None:
        continue
    ys = range(t, G)
    roof_bot = next((y for y in ys if is_cream(px[x, y])), None)
    if roof_bot is not None:
        roof_bot = next((y for y in range(roof_bot, G) if not is_cream(px[x, y]) and not dark(x, y)), roof_bot)
    belt = next((y for y in ys if is_green(px[x, y])), None)
    detail.append([round((x - sd['left']) / L, 4), round((G - t) / L, 4), None if roof_bot is None else round((G - roof_bot) / L, 4), None if belt is None else round((G - belt) / L, 4)])
result['sideDetail'] = detail
# 輪子:下緣貼地(離地 < 3 px)的連續欄 = 輪胎;取最寬的兩段
bot = result['side']['profile']
runs, cur = [], []
for u, _, b in bot:
    if b * L < 3:
        cur.append(u)
    elif cur:
        runs.append(cur)
        cur = []
if cur:
    runs.append(cur)
runs = sorted(runs, key=len, reverse=True)[:2]
result['wheels'] = sorted([{'center': round((r[0] + r[-1]) / 2, 4), 'contact': round(r[-1] - r[0], 4)} for r in runs], key=lambda w: w['center'])
(outdir / 'profile.json').write_text(json.dumps(result))
print('wheels', result['wheels'])
step = max(1, len(detail) // 24)
for row in detail[::step]:
    print('side u=%.3f top=%.3f roofBot=%s belt=%s' % (row[0], row[1], row[2], row[3]))
ov.crop((0, 600, 1290, 941)).save(outdir / 'overlay.png')
for k in CROPS:
    print(k, result[k]['px'], 'H/L', result[k]['heightOverLength'])
