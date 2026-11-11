# 改前 / 改後截圖並排成一張對照圖(左改前、右改後,每列一個機位)。
# 用法:python3 tools/shots/compare.py <樣張資料夾>   例:python3 tools/shots/compare.py docs/art/furniture-sample
# 讀 <資料夾>/before/*.jpg 與 after/*.jpg(同檔名配對;只有改後的列左邊留白),輸出 <資料夾>/compare.jpg。需要 Pillow。
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
after = sorted((root / 'after').glob('*.jpg'))
W = 800  # 每張縮到這個寬度
rows = []
for a in after:
    b = root / 'before' / a.name
    ia = Image.open(a)
    h = round(ia.height * W / ia.width)
    ib = Image.open(b).resize((W, h)) if b.exists() else Image.new('RGB', (W, h), (240, 240, 240))
    rows.append((a.stem, ib, ia.resize((W, h))))
LABEL = 28
out = Image.new('RGB', (W * 2 + 10, sum(r[1].height + LABEL for r in rows)), (255, 255, 255))
d = ImageDraw.Draw(out)
y = 0
for name, ib, ia in rows:
    # 預設字型沒有中文,標籤用英文
    d.text((8, y + 8), f'{name}   left = before, right = after', fill=(60, 60, 60))
    out.paste(ib, (0, y + LABEL))
    out.paste(ia, (W + 10, y + LABEL))
    y += ib.height + LABEL
out.save(root / 'compare.jpg', quality=82)
print(root / 'compare.jpg', out.size)
