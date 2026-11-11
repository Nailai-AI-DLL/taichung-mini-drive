// q05:補查。(1) 臺中之鑽候選 way 1529973208 幾何;(2) 宮原眼科 node 3124088457 周邊 30m 的建物輪廓;
// (3) 國立自然科學博物館園區(way 219414222)內所有建物輪廓。
[out:json][timeout:60][maxsize:67108864];
way(1529973208);
out geom;
node(3124088457);
way["building"](around:30);
out geom;
way(219414222);
map_to_area->.m;
(
  way["building"](area.m);
  relation["building"](area.m);
);
out geom;
