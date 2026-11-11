// q01:區域 B(24.130,120.590,24.200,120.700)內所有可行駛道路 way,含完整幾何。
// 區域 A 的統計由腳本把幾何裁切到 A bbox 後計算(A 完全包含於 B)。
[out:json][timeout:90][maxsize:134217728];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](24.130,120.590,24.200,120.700);
out geom;
