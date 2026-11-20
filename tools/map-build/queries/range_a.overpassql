// 範圍 A(擴大版:核心區 + 逢甲/水湳/北屯/洲際棒球場 + 台74線西段與北段;南,西,北,東 = 24.130,120.620,24.202,120.700,約 8.2 × 8.0 km),
// 外擴約 150 m 緩衝,建置時再裁回。內容和 m0_area.overpassql 相同:道路、建築(含 multipolygon)、綠地、水系。
[out:json][timeout:300][maxsize:1073741824];
(
  way["highway"](24.1286,120.6185,24.2034,120.7015);
  way["building"](24.1286,120.6185,24.2034,120.7015);
  relation["building"](24.1286,120.6185,24.2034,120.7015);
  way["leisure"~"^(park|garden|pitch|playground)$"](24.1286,120.6185,24.2034,120.7015);
  way["landuse"~"^(grass|recreation_ground|village_green|forest|meadow)$"](24.1286,120.6185,24.2034,120.7015);
  relation["leisure"="park"](24.1286,120.6185,24.2034,120.7015);
  way["natural"~"^(water|wood|scrub|grassland)$"](24.1286,120.6185,24.2034,120.7015);
  way["waterway"](24.1286,120.6185,24.2034,120.7015);
);
out geom;
