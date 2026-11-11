// q03:區域 B 內水系、鐵路、鐵路路線 relation、公園、水體、有 ele 的 node。
[out:json][timeout:90][maxsize:134217728];
(
  way["waterway"](24.130,120.590,24.200,120.700);
);
out geom;
(
  relation["waterway"](24.130,120.590,24.200,120.700);
);
out tags;
(
  way["railway"~"^(rail|subway|light_rail|narrow_gauge|construction|disused|abandoned)$"](24.130,120.590,24.200,120.700);
);
out geom;
(
  relation["route"~"^(train|subway|light_rail|railway|tracks)$"](24.130,120.590,24.200,120.700);
);
out tags;
(
  way["leisure"="park"](24.130,120.590,24.200,120.700);
  relation["leisure"="park"](24.130,120.590,24.200,120.700);
  way["natural"="water"](24.130,120.590,24.200,120.700);
  relation["natural"="water"](24.130,120.590,24.200,120.700);
);
out tags center;
(
  node["ele"](24.130,120.590,24.200,120.700);
);
out;
