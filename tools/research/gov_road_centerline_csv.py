#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
臺中市千分之一道路圖(114 年版,data.gov.tw 162899)的道路中心線 R0002 DBF → CSV(decisions/0046)。
欄位沿用道路寬度 CSV(83822,road_width_match.py 讀的格式),另加 左向車道數、右向車道數、單雙向、區分級別。
用法:python3 -I tools/research/gov_road_centerline_csv.py <R0002.dbf> <輸出.csv>
只讀 DBF(標準函式庫),不執行任何下載內容。
"""
import csv
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
f = open(src, 'rb')
h = f.read(32)
n, hl, rl = struct.unpack('<IHH', h[4:12])
fd = f.read(hl - 32)
fields, off, p = [], 1, 0
while p + 32 <= len(fd) and fd[p] != 0x0d:
    fields.append((fd[p:p + 11].split(b'\0')[0].decode(), off, fd[p + 16]))
    off += fd[p + 16]
    p += 32
f.seek(hl)
data = f.read(n * rl)
MAP = [('編號', 'ID'), ('圖名代碼', 'R2A'), ('路名', 'R2B'), ('地區', 'R2C'), ('巷', 'R2D'), ('弄', 'R2E'), ('速限', 'R2I'), ('路寬', 'R2J'),
       ('民國年', 'R2L'), ('長度', 'R2N'), ('TM2度分帶97X坐標', 'R2O'), ('TM2度分帶97Y坐標', 'R2P'), ('EndX坐標', 'R2Q'), ('EndY坐標', 'R2R'),
       ('道路型態分類', 'R2S'), ('左向車道數', 'R2G'), ('右向車道數', 'R2H'), ('單雙向', 'R2F'), ('區分級別', 'R2K')]
with open(dst, 'w', encoding='utf-8-sig', newline='') as o:
    w = csv.writer(o)
    w.writerow([a for a, _ in MAP])
    for i in range(n):
        r = data[i * rl:(i + 1) * rl]
        rec = {k: r[s:s + l].decode('utf-8', 'replace').strip() for k, s, l in fields}
        w.writerow([rec.get(b, '') for _, b in MAP])
print(n, 'rows ->', dst)
