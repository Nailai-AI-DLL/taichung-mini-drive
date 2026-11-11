// q02:區域 B 內 building=* 的 way/relation(只要標籤+中心點),以及 building:part(找最高建物用)。
[out:json][timeout:90][maxsize:134217728];
(
  way["building"](24.130,120.590,24.200,120.700);
  relation["building"](24.130,120.590,24.200,120.700);
);
out tags center;
(
  way["building:part"](24.130,120.590,24.200,120.700);
  relation["building:part"](24.130,120.590,24.200,120.700);
);
out tags center;
