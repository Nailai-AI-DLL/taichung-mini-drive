"""臺中市行道樹分佈圖(data.gov.tw 109853,KMZ)→ 範圍內樹木 JSON(decisions/0042)。
用法:python3 -I tools/map-build/gov_trees.py <doc.kml> <輸出.json> <minE> <minN> <maxE> <maxN>
座標用 KML 屬性表裡的 TWD97 X/Y(部分筆的經緯度欄位不可靠,不用)。只讀,不執行 KML 內任何東西。
輸出:[{"e":TM2 東距,"n":TM2 北距,"sp":樹種名,"h":樹高(公尺,0 = 未標),"loc":地點類別}]
"""
import json
import re
import sys

kml, out, e0, n0, e1, n1 = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
pat = re.compile(r'<td>([^<]+)</td>\s*<td>([^<]*)</td>')
trees, seen = [], set()
with open(kml, encoding='utf-8') as f:
    txt = f.read()
for p in txt.split('<Placemark')[1:]:
    a = dict(pat.findall(p))
    try:
        e, n = float(a['X坐標_TW']), float(a['Y坐標_TW'])
    except (KeyError, ValueError):
        continue
    if not (e0 <= e <= e1 and n0 <= n <= n1):
        continue
    key = (round(e, 1), round(n, 1))
    if key in seen:  # 重複的點(同一棵描兩次)
        continue
    seen.add(key)
    try:
        h = float(a.get('樹高_公') or 0)
    except ValueError:
        h = 0.0
    trees.append({'e': round(e, 2), 'n': round(n, 2), 'sp': a.get('樹種名', ''), 'h': round(h, 2), 'loc': a.get('地點類', '')})
with open(out, 'w', encoding='utf-8') as f:
    json.dump(trees, f, ensure_ascii=False, separators=(',', ':'))
print(len(trees), 'trees ->', out)
