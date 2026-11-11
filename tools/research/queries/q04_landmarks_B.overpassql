// q04:區域 B 內名稱(name / name:zh / alt_name / old_name / official_name)符合地標關鍵字的元素,含完整幾何。
// node 排除公車站等 highway / public_transport 節點以降噪。
[out:json][timeout:90][maxsize:134217728];
(
  way[~"^(name|name:zh|name:zh-Hant|alt_name|old_name|official_name)$"~"歌劇院|車站|臺中驛|台中驛|市政|議會|自然科學博物館|美術館|臺中公園|台中公園|中山公園|湖心亭|秋紅谷|草悟道|勤美|新光三越|遠百|Top City|宮原眼科|第二市場|審計新村|一中街|逢甲|路思義|洲際|棒球場|中友"](24.130,120.590,24.200,120.700);
  relation[~"^(name|name:zh|name:zh-Hant|alt_name|old_name|official_name)$"~"歌劇院|車站|臺中驛|台中驛|市政|議會|自然科學博物館|美術館|臺中公園|台中公園|中山公園|湖心亭|秋紅谷|草悟道|勤美|新光三越|遠百|Top City|宮原眼科|第二市場|審計新村|一中街|逢甲|路思義|洲際|棒球場|中友"](24.130,120.590,24.200,120.700);
  node[~"^(name|name:zh|name:zh-Hant|alt_name|old_name|official_name)$"~"歌劇院|車站|臺中驛|台中驛|市政|議會|自然科學博物館|美術館|臺中公園|台中公園|中山公園|湖心亭|秋紅谷|草悟道|勤美|新光三越|遠百|Top City|宮原眼科|第二市場|審計新村|一中街|逢甲|路思義|洲際|棒球場|中友"][!"highway"][!"public_transport"](24.130,120.590,24.200,120.700);
);
out geom;
