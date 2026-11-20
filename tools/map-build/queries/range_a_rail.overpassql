// 範圍 A(擴大版)的捷運軌道(decisions/0030)與車站。範圍同 range_a.overpassql。
[out:json][timeout:120];
(
  way["railway"~"^(subway|light_rail|monorail)$"](24.1286,120.6185,24.2034,120.7015);
  node["railway"~"^(station|stop)$"]["station"~"subway|light_rail"](24.1286,120.6185,24.2034,120.7015);
  node["public_transport"="station"]["subway"="yes"](24.1286,120.6185,24.2034,120.7015);
  nwr["name"~"TSUTAYA|蔦屋"](24.1286,120.6185,24.2034,120.7015);
  nwr["brand"~"TSUTAYA|蔦屋"](24.1286,120.6185,24.2034,120.7015);
);
out geom;
