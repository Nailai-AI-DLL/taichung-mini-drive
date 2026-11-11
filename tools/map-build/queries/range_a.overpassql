// 範圍 A:台中車站 ↔ 七期(南,西,北,東 = 24.130,120.630,24.175,120.695,約 6.6 × 5.0 km),
// 外擴約 150 m 緩衝,建置時再裁回。內容和 m0_area.overpassql 相同:道路、建築(含 multipolygon)、綠地、水系。
[out:json][timeout:300][maxsize:1073741824];
(
  way["highway"](24.1286,120.6285,24.1764,120.6965);
  way["building"](24.1286,120.6285,24.1764,120.6965);
  relation["building"](24.1286,120.6285,24.1764,120.6965);
  way["leisure"~"^(park|garden|pitch|playground)$"](24.1286,120.6285,24.1764,120.6965);
  way["landuse"~"^(grass|recreation_ground|village_green|forest|meadow)$"](24.1286,120.6285,24.1764,120.6965);
  relation["leisure"="park"](24.1286,120.6285,24.1764,120.6965);
  way["natural"~"^(water|wood|scrub|grassland)$"](24.1286,120.6285,24.1764,120.6965);
  way["waterway"](24.1286,120.6285,24.1764,120.6965);
);
out geom;
