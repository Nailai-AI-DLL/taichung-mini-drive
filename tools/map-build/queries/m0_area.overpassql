// M0:臺中國家歌劇院(24.16293,120.64052)周邊 1 km² 再外擴約 150 m 緩衝,
// 建置時再裁回 1 km × 1 km。取道路、建築、公園綠地、水系的完整幾何。
// bbox = south,west,north,east
[out:json][timeout:120][maxsize:268435456];
(
  way["highway"](24.15710,120.63413,24.16876,120.64691);
  way["building"](24.15710,120.63413,24.16876,120.64691);
  relation["building"](24.15710,120.63413,24.16876,120.64691);
  way["leisure"~"^(park|garden|pitch|playground)$"](24.15710,120.63413,24.16876,120.64691);
  way["landuse"~"^(grass|recreation_ground|village_green|forest|meadow)$"](24.15710,120.63413,24.16876,120.64691);
  relation["leisure"="park"](24.15710,120.63413,24.16876,120.64691);
  way["natural"~"^(water|wood|scrub|grassland)$"](24.15710,120.63413,24.16876,120.64691);
  way["waterway"](24.15710,120.63413,24.16876,120.64691);
);
out geom;
