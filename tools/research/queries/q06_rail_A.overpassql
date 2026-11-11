// q06:範圍 A(24.130,120.630,24.175,120.695)內所有鐵道 way(含 bridge/layer/tunnel 標籤,完整幾何)、
// 車站(railway=station/halt 與 public_transport=station),以及鐵路/捷運 route relation(只要標籤)。
// 用途:tools/research/range_a_rail.py,判斷台鐵與捷運綠線在範圍 A 內的高架段落。
[out:json][timeout:90][maxsize:67108864];
(
  way["railway"~"^(rail|subway|light_rail|narrow_gauge|monorail|tram|funicular|construction|proposed|disused|abandoned|preserved|platform)$"](24.130,120.630,24.175,120.695);
);
out geom;
(
  node["railway"~"^(station|halt|stop)$"](24.130,120.630,24.175,120.695);
  way["railway"~"^(station|halt)$"](24.130,120.630,24.175,120.695);
  node["public_transport"="station"](24.130,120.630,24.175,120.695);
  way["public_transport"="station"](24.130,120.630,24.175,120.695);
);
out tags center;
(
  relation["route"~"^(train|subway|light_rail|railway|tracks)$"](24.130,120.630,24.175,120.695);
);
out tags;
