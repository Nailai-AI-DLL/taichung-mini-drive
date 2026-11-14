// 範圍 A 的捷運軌道(decisions/0030,Cooper 2026-11-14:「可以下載捷運資料」;要做文心路的高架橋外型)。
// 同時查蔦屋書店(TSUTAYA BOOKSTORE 台中市政店)的位置:它是開在樓裡的店,建築資料裡沒有(Cooper 給的地址:市政北二路18之1號)。
// 範圍和 range_a.overpassql 相同。
[out:json][timeout:120];
(
  way["railway"~"^(subway|light_rail|monorail)$"](24.1286,120.6285,24.1764,120.6965);
  node["railway"~"^(station|stop)$"]["station"~"subway|light_rail"](24.1286,120.6285,24.1764,120.6965);
  node["public_transport"="station"]["subway"="yes"](24.1286,120.6285,24.1764,120.6965);
  nwr["name"~"TSUTAYA|蔦屋"](24.1286,120.6285,24.1764,120.6965);
  nwr["brand"~"TSUTAYA|蔦屋"](24.1286,120.6285,24.1764,120.6965);
);
out geom;
