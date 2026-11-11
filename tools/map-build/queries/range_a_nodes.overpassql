// 範圍 A 的點資料(decisions/0015 第四批):公車站。範圍同 range_a.overpassql(含 150 m 緩衝)。
// 另存一個檔,不用重抓整份道路建築資料。
[out:json][timeout:120];
(
  node["highway"="bus_stop"](24.1286,120.6285,24.1764,120.6965);
  node["public_transport"="platform"]["bus"="yes"](24.1286,120.6285,24.1764,120.6965);
);
out body;
