# 把 Cooper 的 Q 版三視圖整理成給「多視角轉 3D」用的乾淨參考圖(decisions/0016 §14)。
# 照 Cooper 的決定(§13.1):綠車身改黑、標誌與字樣全部去掉、車牌留白;背景改成乾淨的淺灰。
# 不用 AI 重畫:直接改原圖像素,比例和原圖完全一致(重畫可能改到比例)。
# 用法:python3 tools/models/clean_reference.py <三視圖> <輸出資料夾>
# 輸出:ref-front.png、ref-left.png(側視,車頭朝左 = 車子左側)、ref-right.png(左側鏡射)、ref-rear.png、contact.png(四張並排)
import sys
from pathlib import Path
from PIL import Image, ImageDraw

BG = (238, 238, 238)
BODY = (30, 32, 36)          # 黑車身(在原圖綠色亮度 40 時的顏色)
GREEN_REF_LUM = 40.0
# 三個視圖在原圖的範圍(x0, y0, x1, y1)
VIEWS = {'front': (28, 650, 375, 915), 'left': (395, 650, 962, 915), 'rear': (980, 640, 1275, 915)}
# 要清掉的東西(座標相對於該視圖範圍的左上角)。kind:
#   body = 換成附近的車身色(標誌、徽章、字樣)、plate = 車牌留白、dark = 換成深色(水箱罩上的紅 S)、
#   hub = 輪轂中央的標誌畫成深灰圓、bg = 換成背景(符號)
CLEAN = {
    'front': [('body', (150, 108, 202, 128)), ('dark', (218, 143, 242, 163)), ('plate', (135, 172, 218, 206)), ('bg', (12, 0, 62, 52))],
    'left': [('body', (208, 126, 290, 196)), ('hub', (126, 205, 9)), ('hub', (471, 205, 9))],
    'rear': [('body', (133, 108, 164, 128)), ('plate', (109, 127, 190, 160)), ('body', (183, 161, 240, 179))],
}

lum = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
is_green = lambda c: c[1] > c[0] + 12 and c[1] >= c[2]


def clean_view(img, name):
    im = img.copy()
    px = im.load()
    W, H = im.size
    for kind, box in CLEAN[name]:
        d = ImageDraw.Draw(im)
        if kind == 'plate':
            x0, y0, x1, y1 = box
            d.rounded_rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), radius=4, fill=(246, 246, 243), outline=(40, 40, 44), width=2)
        elif kind == 'hub':
            cx, cy, r = box
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(58, 61, 66))
        elif kind == 'bg':
            d.rectangle(box, fill=(254, 248, 241))
        elif kind == 'body':
            # 每一列用左右邊緣的顏色線性內插填滿:徽章連描邊一起消失,車身原本的上下明暗保留
            x0, y0, x1, y1 = box
            for y in range(y0, y1):
                a, b = px[x0 - 1, y], px[x1, y]
                for x in range(x0, x1):
                    t = (x - x0 + 1) / (x1 - x0 + 1)
                    px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        else:
            x0, y0, x1, y1 = box
            # 範圍內的亮色 / 紅色像素(紅 S)換成範圍邊緣的深色
            ring = [px[x, y] for x in range(x0, x1) for y in (y0, y1 - 1)] + [px[x, y] for y in range(y0, y1) for x in (x0, x1 - 1)]
            pick = [c for c in ring if (is_green(c) if kind == 'body' else lum(c) < 60)]
            fill = tuple(sorted(c[i] for c in pick)[len(pick) // 2] for i in range(3)) if pick else (20, 50, 40)
            for x in range(x0, x1):
                for y in range(y0, y1):
                    c = px[x, y]
                    if kind == 'body' and not (is_green(c) and lum(c) < 90):
                        px[x, y] = fill
                    elif kind == 'dark' and lum(c) >= 60 or (kind == 'dark' and c[0] > c[1] + 40):
                        px[x, y] = fill
    # 綠車身 → 黑車身(保留明暗)
    for x in range(W):
        for y in range(H):
            c = px[x, y]
            if is_green(c):
                k = lum(c) / GREEN_REF_LUM
                px[x, y] = tuple(min(255, int(v * k)) for v in BODY)
    # 背景(含地上的影子)換成淺灰:從四角和底邊往內填。
    # 先填一個標記色再換成 BG:Pillow 的 floodfill 在「填入色和起點色差距 ≤ thresh」時會直接跳過不填(實測踩到)
    MARK = (255, 0, 255)
    for seed in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)] + [(x, H - 1) for x in range(0, W, 20)]:
        if px[seed] != MARK:
            ImageDraw.floodfill(im, seed, MARK, thresh=48)
    for x in range(W):
        for y in range(H):
            c = px[x, y]
            # 地上的棕色影子:多視角轉 3D 會把它當成實體做成一塊板子,只在畫面下方 25% 找(尾燈的紅不會被誤判)
            shadow = y > H * 0.75 and c[0] > 130 and c[0] - c[2] > 35 and c[0] - c[1] < 60 and lum(c) > 100
            if c == MARK or shadow:
                px[x, y] = BG
    return im


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    img = Image.open(src).convert('RGB')
    views = {}
    for name, box in VIEWS.items():
        v = clean_view(img.crop(box), name)
        # 方形畫布、置中、四周留白(多視角轉 3D 的輸入)
        s = int(max(v.size) * 1.15)
        canvas = Image.new('RGB', (s, s), BG)
        canvas.paste(v, ((s - v.width) // 2, (s - v.height) // 2))
        views[name] = canvas.resize((1024, 1024), Image.LANCZOS)
    views['right'] = views['left'].transpose(Image.FLIP_LEFT_RIGHT)
    for k, v in views.items():
        v.save(out / f'ref-{k}.png')
    contact = Image.new('RGB', (4 * 512, 512), BG)
    for i, k in enumerate(['front', 'left', 'rear', 'right']):
        contact.paste(views[k].resize((512, 512)), (i * 512, 0))
    contact.save(out / 'contact.png')
    print('OK', out)


main()
