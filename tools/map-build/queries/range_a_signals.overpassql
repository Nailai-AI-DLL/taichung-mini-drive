// 範圍 A 的號誌點(decisions/0047,Cooper 2026-11-16:「可以繼續檢查紅綠燈位置」):
// highway=traffic_signals(路口號誌)與 crossing=traffic_signals(有號誌的行人穿越道),只拿來比對遊戲依規則放的號誌。
// 範圍和 range_a.overpassql 相同。
[out:json][timeout:120];
(
  node["highway"="traffic_signals"](24.1286,120.6285,24.1764,120.6965);
  node["crossing"="traffic_signals"](24.1286,120.6285,24.1764,120.6965);
);
out;
