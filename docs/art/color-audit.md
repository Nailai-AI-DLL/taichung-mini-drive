# 17 棟地標配色查核表(模型色 vs 真實建物色)

- 日期:2026-11-15
- 範圍:`tools/models/landmark_<id>.py` 的 `C = {...}` 色票(17 支腳本;`landmark_kit.py` 沒有色碼)。每支腳本的每個色碼都列在下面。
- 性質:**只做研究,沒有改任何程式或模型。** 是否要改、要改多少,由 Cooper 決定。

## 0. 方法與注意事項

### 0.1 取色方法(可重做)

1. 用 Commons API 找照片,檢查 `DateTimeOriginal`,選**最新、白天、順光或陰天散射光**的照片。
2. 瀏覽器開 `https://commons.wikimedia.org/wiki/Special:FilePath/<檔名>?width=1280`(會轉到 upload/thumb.wikimedia.org,同源可以讀像素)。
3. 在頁面裡用 canvas 讀出指定矩形區域的像素,取 R、G、B **各自的中位數**當「照片取樣色」。只在記憶體裡讀,沒有存任何檔。
4. Esri 航照:`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=<lon0,lat0,lon1,lat1>&bboxSR=4326&imageSR=3857&size=800,600&format=png&f=image`,用同一個方法取樣。
5. 「建議色碼」= 照片取樣色,再依光線(陰天偏暗、逆光、反光)人工修正,所以一律標成**目視估計**。
6. 「建議修改總表」的排序依據:目前色和建議色的 RGB 歐氏距離,用 Python 算出來(腳本見 §19)。

### 0.2 判定規則

- **一致**:色相相同,而且明度差在光線造成的誤差範圍內(大致是 RGB 距離 < 約 40,或照片在陰影中但色相吻合)。
- **建議修改**:色相不同,或明度差明顯超過光線誤差,而且至少有一張可開啟的非 Google 白天照片支持。
- **資料不足**:沒有白天照片、只有夜景,或照片中那個部位太小或被遮住。

### 0.3 系統性發現(請 Cooper 先看)

- **玻璃類的色碼普遍太亮、太淡。** 市府、議會、歌劇院、千禧酒店的玻璃,在白天照片裡都明顯比模型暗(深藍、深藍綠)。原因是 M1「方案丙:真實淡雅」把所有色碼刻意調淡過(`docs/art/landmarks-reference.md` §1.4 的標題)。
- **要不要「完全照實」,還是「照實但保留淡雅」,是風格決策,由 Cooper 拍板。** 本表的「建議色碼」是照實的版本。如果要保留淡雅,建議改成「目前色和建議色的中間值」。
- 查了 14 個 OSM way(IKEA、麥當勞、金錢豹、歌劇院、新站、舊站、市政大樓、議會、新光、林酒店、千禧、朝馬、T&R 廣場、圓滿劇場頂蓋),都**沒有** `building:colour` 或 `roof:colour` 標籤。

### 0.4 照片清單(本次實際取樣的)

| 代號 | URL | 拍攝時間 | 光線 |
|---|---|---|---|
| OP1 | https://commons.wikimedia.org/wiki/File:National_Taichung_Theater_aerial_view_2019.jpg | 2019 | 陰天散射光,空拍(主要依據) |
| OP2 | https://commons.wikimedia.org/wiki/File:國家表演藝術中心-臺中國家歌劇院外觀.jpg | 2016-07-13 | 白天,後製很重(HDR),只當輔助 |
| OP3 | https://commons.wikimedia.org/wiki/File:National_Taichung_Theater_(2024-03-09).jpg | 2024-03-09 17:21 | 逆光,牆在陰影中,**不用來判斷牆色** |
| SN1 | https://commons.wikimedia.org/wiki/File:Taichung_Railway_Station,_Aug_2024.jpg | 2024-08-25 12:38 | 晴天 |
| SN2 | https://commons.wikimedia.org/wiki/File:Aerial_view_of_Taichung_Railway_Station_and_Cityscape_20210904.jpg | 2021-09-04 | 空拍,調過色(去飽和),只看明度 |
| SO1 | https://commons.wikimedia.org/wiki/File:Taichung_Old_Station,_Aug_2024.jpg | 2024-08-24 14:27 | 陰天 |
| SO2 | https://commons.wikimedia.org/wiki/File:Facade_of_the_old_Taichung_Station.png | 2024 | 陰天 |
| CH1 | https://commons.wikimedia.org/wiki/File:Taichung_City_Hall_20230824.jpg | 2023-08-24 11:49 | 陰天(主要依據) |
| CH2 | https://commons.wikimedia.org/wiki/File:Taichung_City_Government,_Nov_2024_(1).jpg | 2024-11-17 12:40 | 晴天,但照片偏青色調色,只當輔助 |
| CO1 | https://commons.wikimedia.org/wiki/File:Taichung_City_Council_Hall_20230823_01.jpg | 2023-08-23 13:16 | 晴天 |
| SK1 | https://commons.wikimedia.org/wiki/File:Shin_Kong_Mitsukoshi_Taichung_Store_2025.png | 2025-09-26 | 晴天;正面大多在陰影中 |
| SK2 | https://commons.wikimedia.org/wiki/File:View_of_Shin_Kong_Mitsukoshi_Taichung_and_a_newly_built_building.jpg | 2018-08-05 13:01 | 晴天,背面受光 |
| TC1 | https://commons.wikimedia.org/wiki/File:Top_City台中大遠百_2019.jpg | 2019-05-23 | 陰天空拍,有霧霾 |
| TC2 | SK1(同一張,左側是大遠百) | 2025-09-26 | 晴天 |
| TG1 | https://commons.wikimedia.org/wiki/File:Tiger_City_View_201905.jpg | 2019-05 | 陰天 |
| LN1 | https://commons.wikimedia.org/wiki/File:The_Lin_Hotel_Taichung-01.2024-05-10.jpg | 2024-05-10 | 晴天,玻璃正面受光、有反光 |
| ML1 | https://commons.wikimedia.org/wiki/File:Millennium_Vee_Hotel_Taichung_20130429.jpg | 2013-04-29 | 晴天(**最新的外觀照片只到 2013**) |
| MG1 | https://commons.wikimedia.org/wiki/File:Maple_Garden,_Taichung,_Nov_2024_(1).jpg | 2024-11-17 | 晴天,照片偏暖、調過色 |
| FA1 | https://commons.wikimedia.org/wiki/File:2022_entrance_of_the_Fulfillment_Amphitheater_01.jpg | 2022 | 晴天 |
| TS1 | https://commons.wikimedia.org/wiki/File:TSUTAYA_BOOKSTORE_Taichung_2019.jpg | 2019-05 | **黃昏 / 夜間,開燈** |
| CM1 | https://commons.wikimedia.org/wiki/File:朝馬國民運動中心.jpg | 2017-01-24 | 陰天 |
| ESRI-IK | Esri World Imagery export(IKEA 屋頂,bbox 120.6420,24.1468,120.6444,24.1487) | 不詳 | 航照,偏暖 |

---

## 1. opera 臺中國家歌劇院(`tools/models/landmark_opera.py`)

| 部位 | 腳本變數名(檔案:行號) | 目前色碼 | 真實觀察(描述 + 建議色碼) | 依據來源(+年份) | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 主牆 | `wall`(landmark_opera.py:35) | `#E4E2DC` | 偏冷的淺灰清水混凝土,不是暖米白。陰天空拍取樣 `#8E9CA8`–`#A2A9B5`;晴天會再亮一些。建議 `#B3B8BC`(目視估計) | OP1(2019);OP2(2016) | 中 | 建議修改 |
| 開口白框 | `frame`(:36) | `#F4F3EF` | 開口邊緣是明顯的白色細框 | OP1、OP2 | 高 | 一致 |
| 玻璃帷幕 | `glass`(:37) | `#7E949B` | 深藍綠、反光很暗。OP1 取樣 `#2E4245`,OP2 取樣 `#316D81`。建議 `#3E5A60`(目視估計) | OP1(2019);OP2(2016) | 中 | 建議修改 |
| 洞窟內曲面 | `cave`(:38) | `#EDEBE6` | 洞窟內部比主牆亮的淺灰白曲面。OP1 取樣 `#B5BFC4`(陰天)。主牆如果調暗,這裡維持較亮就能保留對比 | OP1(2019) | 中 | 一致 |
| 屋頂舞台塔 | `tower`(:39) | `#7A7E82` | 偏藍的深灰方盒。OP1 取樣 `#4F5A6B`。建議 `#5A6270`(目視估計) | OP1(2019) | 中 | 建議修改 |
| 屋頂綠地 | `green`(:40) | `#B9CBA8` | 屋頂的綠地和白色曲面混在一起,取樣不乾淨 | OP1 | 低 | 資料不足 |

## 2. station-new 臺中車站新站(`tools/models/landmark_station_new.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 屋頂金屬 | `roof`(landmark_station_new.py:50) | `#C9CDD0` | 銀灰色金屬殼。SN2 取樣 `#ADB1A9`–`#B6BBB0`(照片調過色,明度可以參考) | SN2(2021) | 中 | 一致 |
| 屋頂肋條 / 陰影 | `rib`(:51) | `#A9AEB2` | 肋條和屋簷底面是灰色偏青。SN1 取樣 `#6E8B95`(屋簷,背光)、SN2 取樣 `#808C88` | SN1(2024)、SN2 | 中 | 一致 |
| 樹枝狀柱 | `column`(:52) | `#EEF0F0` | 白色 / 淺灰的分叉鋼柱 | SN1(2024) | 中 | 一致 |
| 玻璃立面 | `glass`(:53) | `#9FB3BC` | 灰藍玻璃。SN1 取樣 `#899EAA` | SN1(2024) | 中 | 一致 |
| 高架橋 / 基座 | `base`(:54) | `#CFCBC3` | 淺灰混凝土(SN1 廣場階梯一帶,混到植栽) | SN1 | 低 | 一致 |

## 3. station-old 臺中驛舊站(`tools/models/landmark_station_old.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 紅磚牆 | `brick`(landmark_station_old.py:45) | `#A86A5C` | 紅磚。陰天取樣 `#936B5E`(SO1)、`#7C5E56`/`#764C45`(SO2)。晴天會比這些亮,所以目前色可以接受 | SO1、SO2(2024) | 中 | 一致 |
| 白色飾帶 / 山牆 | `cream`(:46) | `#EDE6D6` | 米白洗石子。陰影中取樣 `#9D998E`,色相吻合 | SO2(2024) | 中 | 一致 |
| 四坡屋頂 | `roof`(:47) | `#6B7078` | 深灰石板瓦。SO2 取樣 `#6D717A` | SO2(2024) | 高 | 一致 |
| 鐘塔帽頂 / 尖針 | `cap`(:48) | `#565C63` | 鐘塔比屋頂更暗,是深灰略帶綠(尖頂有銅綠)。SO2 取樣 `#363B42`。建議 `#3E4446`(目視估計) | SO2(2024) | 中 | 建議修改 |
| 鐘面 | `clock`(:49) | `#F4F2EC` | 白色鐘面 | SO2(2024) | 高 | 一致 |
| 迴廊雨棚 | `canopy`(:50) | `#8C8B82` | 雨棚屋面是暗灰略帶苔綠。取樣 `#5F5E52`(SO1)、`#605E52`(SO2)。建議 `#6A685C`(目視估計) | SO1、SO2(2024) | 中 | 建議修改 |
| 窗(暗面) | `window`(:51) | `#5F6670` | 窗是暗灰。取樣 `#474F50`、`#575550` | SO1(2024) | 中 | 一致 |

## 4. city-hall 臺灣大道市政大樓(`tools/models/landmark_city_hall.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 玻璃帷幕 | `glass`(landmark_city_hall.py:38) | `#8A9BAE` | 深藍玻璃,比目前暗很多。CH1 陰天取樣 `#40546B`/`#475A73`;CH2 晴天(偏青)取樣 `#1E3A56`。建議 `#4A5E78`(目視估計) | CH1(2023)、CH2(2024) | 中 | 建議修改 |
| 水平分格線 | `line`(:39) | `#B5C0CB` | 照片解析度下看不出獨立的淺色線 | CH1 | 低 | 資料不足 |
| 中央深色方框 | `frame`(:40) | `#4E5257` | 近黑的炭灰。CH1 取樣 `#2A2A30`、CH2 取樣 `#19232E`。建議 `#2C2C32`(目視估計) | CH1、CH2 | 中 | 建議修改 |
| 方框內凹面 | `inner`(:41;用在 :97 的 recess) | `#7F96A3` | 框內**左半是不透光的深色實板**(取樣 `#231D26`),**右半是深色玻璃**(取樣 `#2C4052`)。兩者都很暗。建議 `#2C4052`(如果只用一色;目視估計) | CH1(2023)、CH2(2024) | 中 | 建議修改 |
| 西段米色百葉帶 | `louver`(:42) | `#D9D2C3` | 這兩張正面照片裡看不出來 | — | 低 | 資料不足 |
| 川堂天花板 | `soffit`(:43) | `#A9B1B8` | 腳本自己標「推論」;照片中看不到 | — | 低 | 資料不足 |

## 5. council 臺中市議會(`tools/models/landmark_council.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 玻璃帷幕 | `glass`(landmark_council.py:41) | `#8EA2B8` | 反射天空的中藍玻璃。取樣 `#476890`(上段)、`#557396`(中段)、`#6587AF`(亮部)。建議 `#5A78A0`(目視估計) | CO1(2023) | 中高 | 建議修改 |
| 玻璃分格線 | `line`(:42) | `#B8C4D0` | 有細密水平線,但線本身取不到乾淨樣本 | CO1 | 低 | 一致 |
| 方洞頂板 / 內壁 | `hole`(:43) | `#5C6066` | 方洞頂板在陰影中,幾乎是黑色。取樣 `#212221`。建議 `#2A2B2C`(目視估計) | CO1(2023) | 高 | 建議修改 |
| 方洞弧形下緣 | `trim`(:44) | `#E8EAEC` | 白 / 銀色的弧邊。取樣 `#C3D5ED`(帶天空反光) | CO1(2023) | 中 | 一致 |
| 洞內空中花園 | `green`(:45) | `#A9C29A` | 照片看不到洞底的植栽 | — | 低 | 資料不足 |

## 6. shin-kong 新光三越中港店(`tools/models/landmark_shin_kong.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 側牆淺灰板 | `wall`(landmark_shin_kong.py:33) | `#B9BDC0` | 受光的淺色金屬板。取樣 `#D5D0CC` | SK1(2025) | 中 | 一致 |
| 紅褐面磚(方柱、角塔) | `brick`(:34) | `#8A5A52` | 實際上比較接近**灰紫褐 / 玫瑰灰**,不是磚紅。受光取樣 `#A89598`/`#CCC1C2`(SK2),陰影取樣 `#675D5F`(SK1),空拍取樣 `#706171`(TC1)。建議 `#8C7475`(目視估計) | SK1(2025)、SK2(2018)、TC1(2019) | 中 | 建議修改 |
| 圓筒銀白板 | `drum`(:35) | `#D9DDDD` | 銀白金屬板,會反射藍天。取樣 `#99B2BC` | SK1(2025) | 中 | 一致 |
| 圓筒深色橫線 | `band`(:36) | `#3A4046` | 每層一圈深色線 | SK1(2025) | 中 | 一致 |
| 圓筒玻璃 | `glass`(:37) | `#5E9A96` | 直條玻璃看起來是**灰藍**,不是藍綠。取樣 `#96A7B0`、`#8CA9BB`。建議 `#7F9EAD`(目視估計) | SK1(2025) | 低 | 建議修改 |
| 光環格柵 | `halo`(:38) | `#C6CCD1` | 透空的金屬格柵。逆光取樣 `#71818A`;格柵本身是淺灰金屬 | SK1(2025) | 中 | 一致 |
| 鋼構裙樓 | `podium`(:39) | `#4A5560` | 深灰藍鋼構。取樣 `#405464` | SK1(2025) | 中 | 一致 |
| 紅色簷線 | `eave`(:40) | `#D8262E` | 鮮紅外挑雨遮。底面陰影取樣 `#792E38` | SK2(2018) | 中 | 一致 |
| 背面頂層黃板 | `yellow`(:41) | `#E2B33A` | 受光時是**淡黃 / 奶油黃**。取樣 `#F4D6AA`。建議 `#E8C77A`(目視估計) | SK2(2018) | 中低 | 建議修改 |

## 7. top-city 大遠百(`tools/models/landmark_top_city.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 前棟側牆 | `side`(landmark_top_city.py:35) | `#D9D9D6` | 白灰金屬板。晴天受光取樣 `#E5DEC3`/`#F8F3DD`(TC2);陰天空拍取樣 `#8F999D`(TC1) | TC2(2025)、TC1(2019) | 中 | 一致 |
| 後棟中灰 | `rear`(:36) | `#A7AAAD` | 中灰金屬板。取樣 `#8A9699` | TC1(2019) | 中 | 一致 |
| 正面薄荷綠玻璃 | `mint`(:37) | `#A9CFC2` | 淡灰綠玻璃,比目前稍微灰一點。取樣 `#B7C5C2`(TC1);受光 `#D9E2CE`;陰影 `#89A7B1`(TC2) | TC1、TC2 | 中 | 一致 |
| 水平條紋 | `stripe`(:38) | `#D6EAE2` | 淺色條紋 | TC1 | 低 | 一致 |
| 露台內凹 | `recess`(:39) | `#55605F` | 沒有乾淨樣本 | — | 低 | 資料不足 |
| 露台白柱 | `white`(:40) | `#F2F2EE` | 沿用既有報告 Q2(2011)的觀察,本次沒有重新取樣 | Q2(2011) | 低 | 資料不足 |
| 中段凸出玻璃盒 | `glassbox`(:41) | `#CFE6DE` | 本次沒有重新取樣 | — | 低 | 資料不足 |
| 入口大廳 | `lobby`(:42) | `#C8B27A` | **原本的依據是夜景的室內暖光(Q4 2013 夜景)**,不能代表白天的外觀。白天應該是透明玻璃反光,但沒有找到白天的正面低角度照片 | Q4(夜景) | 低 | 資料不足 |
| 金色精品店面 | `gold`(:43) | `#D4A93A` | 同上,依據是夜景 | Q4(夜景) | 低 | 資料不足 |
| 轉角橘色直條 | `orange`(:44) | `#E07A1F` | 橘色直條,色相吻合。受光取樣 `#FDBB67`,空拍有霧霾取樣 `#C08D7C` | TC2(2025)、TC1 | 中 | 一致 |
| 後棟頂部紫色帶 | `purple`(:45) | `#7A5AA6` | 空拍有霧霾,取樣 `#88829C`(灰紫);飽和度看不準 | TC1(2019) | 低 | 一致 |

## 8. tiger-city 老虎城(`tools/models/landmark_tiger_city.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 主牆長條板 | `wall`(landmark_tiger_city.py:31) | `#D5D6D3` | 淺灰白。陰天取樣 `#ADB0B7`/`#AFB1B7` | TG1(2019) | 中 | 一致 |
| 水平接縫 | `line`(:32) | `#BFC1BE` | 細水平線 | TG1 | 低 | 一致 |
| 底層玻璃店面 | `shop`(:33) | `#8FA8A3` | 騎樓下的店面玻璃很暗,是深灰綠。取樣 `#415152`、`#424A4A`。建議 `#4A5A5A`(目視估計) | TG1(2019) | 中低 | 建議修改 |
| 凹口暗面 | `recess`(:34) | `#4B5357` | 取樣 `#424A4A` | TG1 | 中 | 一致 |
| 圓柱 | `column`(:35) | `#ECECE8` | 白柱。陰天取樣 `#A4B0B3` | TG1 | 中 | 一致 |
| 西臂屋簷 | `eave`(:36) | `#5A5D60` | 灰色屋簷。取樣 `#81868D` | TG1 | 低 | 一致 |
| 藍色招牌 | `sign`(:37) | `#2D7FC4` | 藍色圓形標誌 | TG1(2019) | 中 | 一致 |
| 玻璃樓梯塔 | `stair`(:38) | `#9DB7AE` | 本次沒有重新取樣(既有報告 R2 2024) | — | 低 | 資料不足 |

## 9. the-lin 林酒店(`tools/models/landmark_the_lin.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 銅棕色玻璃 | `glass`(landmark_the_lin.py:32) | `#9C5A4A` | 受光的主立面是**偏粉的玫瑰銅色**。取樣 `#C49582`、`#C09081`(含反光);背光側翼取樣 `#4E444A`。目前色落在兩者之間但偏暗、偏紅。建議 `#B07A6A`(目視估計) | LN1(2024) | 中 | 建議修改 |
| 米白樓層線 | `line`(:33) | `#EDE4D6` | 每層一條白線,看得很清楚 | LN1(2024) | 高 | 一致 |
| 象牙色石材裙樓 | `stone`(:34) | `#E9DFCB` | 取樣 `#DED3C3`、`#CBC3B7` | LN1(2024) | 高 | 一致 |
| 拱窗暗面 | `arch`(:35) | `#5A4A40` | 拱窗內很暗。取樣 `#3C3837` | LN1(2024) | 中 | 一致 |
| 屋頂 | `roof`(:36) | `#C9C2B6` | 沒有屋頂照片 | — | 低 | 資料不足 |

## 10. millennium 日月千禧酒店(`tools/models/landmark_millennium.py`)

> 能找到的外觀照片最新只到 2013(Commons 搜尋「Millennium Hotel Taichung」「日月千禧」),無法確認之後有沒有重新粉刷。

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 白色方格牆 | `white`(landmark_millennium.py:33) | `#F1F1EC` | 白牆 | ML1(2013) | 高 | 一致 |
| 方窗玻璃 | `window`(:34) | `#4F8198` | 窗是深藍。取樣 `#2A486D`。建議 `#34506E`(目視估計) | ML1(2013) | 中 | 建議修改 |
| 中央藍玻璃帶 | `blue`(:35) | `#3E6F8E` | 深藍。取樣 `#22456B`(暗部)、`#4C6990`(反光)。建議 `#2E5478`(目視估計) | ML1(2013) | 中 | 建議修改 |
| 雲朵陽台 | `cloud`(:36) | `#FFFFFF` | 白色波浪板 | ML1(2013) | 高 | 一致 |
| 屋頂紅 logo | `red`(:37) | `#D7262E` | 紅色直條,太小,取不到乾淨樣本 | ML1(2013) | 低 | 一致 |
| 裙樓樓板 | `slab`(:38) | `#FAFAF7` | 白色水平樓板 | ML1(2013) | 中 | 一致 |
| 裙樓玻璃 | `podium_glass`(:39) | `#8FB3C2` | 裙樓玻璃反射後是深青綠。取樣 `#334E4E`(局部被樹影影響)。建議 `#3E5A5C`(目視估計) | ML1(2013) | 中低 | 建議修改 |

## 11. mcdonalds 麥當勞文心二店(`tools/models/landmark_mcdonalds.py`)

> 沒有任何白天外觀照片。Commons 只有一張 2013 年從**店內 2 樓**往外拍的照片(m1),既有報告 `places4-reference.md` §一也是這樣記載。台灣麥當勞 2021 年起陸續改裝,2013 年的室內照片不能代表現在的外觀。

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 1 樓深灰外牆 | `body`(landmark_mcdonalds.py:26) | `#3E3F42` | not_stated(腳本自己標推估) | — | 低 | 資料不足 |
| 2 樓玻璃 | `glass`(:27) | `#9DB3B8` | 依據是 m1 室內照片 | m1(2013,室內) | 低 | 資料不足 |
| 白色細框 | `frame`(:28) | `#E8E8E4` | 同上 | m1 | 低 | 資料不足 |
| 紅色飾帶 | `red`(:29) | `#D2402F` | 同上(室內樑側) | m1 | 低 | 資料不足 |
| 木紋挑簷 | `wood`(:30) | `#C9A27A` | 同上 | m1 | 低 | 資料不足 |
| 取餐窗雨遮 | `awning`(:31) | `#B8321F` | not_stated(推估) | — | 低 | 資料不足 |
| 屋頂 | `roof`(:32) | `#4A4A4A` | 只有 Esri 航照的低信心判讀 | Esri | 低 | 資料不足 |
| 女兒牆黃條 | `yellow`(:33) | `#FFC72C` | `#FFC72C` 是麥當勞品牌黃;**位置**是推估 | — | 低 | 資料不足 |
| 門 | `door`(:34) | `#6E8C92` | not_stated | — | 低 | 資料不足 |

## 12. ikea IKEA 台中店(`tools/models/landmark_ikea.py`)

> Commons 的「IKEA Taichung」15 張照片全部是室內;網路搜尋也沒有找到可用的非 Google 白天外觀照片。

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 主立面藍 | `blue`(landmark_ikea.py:29) | `#0058A3` | 這是 IKEA 品牌藍;航照中女兒牆邊緣是藍紫色,符合但不是立面照片 | ESRI-IK | 低 | 資料不足 |
| 黃色部位 | `yellow`(:30) | `#FFDB00` | 這是 IKEA 品牌黃;航照中東南角有黃框線(取樣混色 `#7B745B`) | ESRI-IK | 低 | 資料不足 |
| 1 樓停車層 | `park`(:31) | `#3A3F44` | not_stated | — | 低 | 資料不足 |
| 屋頂花園草地 | `garden`(:32) | `#7FA34A` | 航照取樣 `#637543`(航照偏暖、偏暗,方向一致) | ESRI-IK | 中低 | 一致 |
| 花園步道 | `path`(:33) | `#C9C6BE` | 航照取樣 `#B9B19C`–`#C4BCAC` | ESRI-IK | 中 | 一致 |
| 太陽能板 | `solar`(:34) | `#2B3550` | 航照取樣 `#545C54`(航照偏綠灰,色相難判) | ESRI-IK | 低 | 一致 |
| 機房 / 平屋頂 | `plant`(:35) | `#9A9A96` | 航照取樣 `#747567` | ESRI-IK | 低 | 一致 |

## 13. fulfillment 圓滿戶外劇場(`tools/models/landmark_fulfillment.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 殼體 | `shell`(landmark_fulfillment.py:34) | `#ECEEEE` | 白色曲面殼。晴天取樣 `#DEE2E7`、`#D3D8DF` | FA1(2022) | 高 | 一致 |
| 殼底陰影面 | `under`(:35) | `#C9CDD0` | 陰影面取樣 `#78838A`。Blender 會自己算陰影,底色維持淺灰合理 | FA1(2022) | 中 | 一致 |
| 天窗玻璃 | `sky`(:36) | `#5F7480` | 取樣 `#7E949D` | FA1(2022) | 中 | 一致 |
| 舞台 | `stage`(:37) | `#3A3D40` | 這張照片看不到舞台 | — | 低 | 資料不足 |
| 後台建物 | `back`(:38) | `#D9DBD8` | 看不到 | — | 低 | 資料不足 |
| 前方小屋 | `booth`(:39) | `#D0D2CF` | 看不到;用途也是 not_stated | — | 低 | 資料不足 |

## 14. maple-garden 秋紅谷(`tools/models/landmark_maple_garden.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 碗底草地 | `grass`(landmark_maple_garden.py:32) | `#6E9A3C` | 草坪綠。受光取樣 `#91925C`(照片偏暖) | MG1(2024) | 中 | 一致 |
| 草坡 | `slope`(:33) | `#7FA845` | 同上 | MG1 | 中 | 一致 |
| 步道 | `path`(:34) | `#D8D2C4` | 淺米灰碎石步道。取樣 `#CCC2B1` | MG1(2024) | 高 | 一致 |
| 擋土牆 / 亭基座 | `wall`(:35) | `#B8B8B2` | 取樣 `#7A7570`(陰影中) | MG1 | 低 | 一致 |
| 卵石湖岸 | `pebble`(:36) | `#CFC8BA` | 本次沒有取到乾淨樣本 | — | 低 | 資料不足 |
| 湖水 | `lake`(:37) | `#4F7F7A` | 2024 照片中湖面是**暗橄欖綠**,不是藍綠。取樣 `#575841`;既有報告航照也記為 `#3F5E3A`。建議 `#4F5E44`(目視估計;照片調過色,所以信心中) | MG1(2024);places4-reference.md §二 B | 中 | 建議修改 |
| 橋(2024 現況) | `bridge`(:38) | `#E0502A` | 橘紅色。取樣 `#BB3319`(局部陰影)。2024 已經改成橘紅,目前色正確 | MG1(2024) | 高 | 一致 |
| 橋欄杆格柵 | `lattice`(:39) | `#EDEDED` | 白格柵 | MG1(2024) | 中 | 一致 |
| 玻璃亭屋頂 | `roof`(:40) | `#F2F2EE` | 白色薄屋頂 | MG1(2024) | 高 | 一致 |
| 玻璃亭玻璃 | `glass`(:41) | `#7FA8A8` | 取樣 `#686F5E`(混到室內與樹影) | MG1 | 低 | 一致 |
| 欄杆 | `rail`(:42) | `#5A5F63` | 深色欄杆 | MG1 | 中 | 一致 |
| 喬木 | `tree`(:43) | `#4E7A3A` | 樹冠背光取樣 `#20352E`;色相吻合 | MG1 | 中 | 一致 |
| 紅葉 | `maple`(:44) | `#B5442E` | 2024-11 照片沒有明顯紅葉 | MG1 | 低 | 資料不足 |
| 樹幹 | `trunk`(:45) | `#6B5440` | 太細,取不到樣本 | — | 低 | 資料不足 |

## 15. golden-jaguar 金錢豹(`tools/models/landmark_golden_jaguar.py`)

> 唯一的立面依據是業者官網首頁的**夜景**橫幅(j1)。夜景不能用來判斷白天的牆色。Commons 只有 `Golden Jaguar Shizheng Store 20070415.jpg`,但那是 2007 年的**市政店**,不是這一棟。網路搜尋也沒有找到可用的非 Google 白天照片。

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 米色立面 | `wall`(landmark_golden_jaguar.py:25) | `#D9C9A8` | 依據是夜景 | j1(夜景) | 低 | 資料不足 |
| 橫向分割線 | `line`(:26) | `#C7B692` | 同上 | j1 | 低 | 資料不足 |
| 門框 | `frame`(:27) | `#B89A6A` | 同上 | j1 | 低 | 資料不足 |
| 金色燈柱 | `gold`(:28) | `#E8B860` | 同上(這是燈光色) | j1 | 低 | 資料不足 |
| 頂部燈帶 | `light`(:29) | `#F3E6C8` | 同上(這是燈光色) | j1 | 低 | 資料不足 |
| 深色窗框 | `bronze`(:30) | `#5A4630` | 同上 | j1 | 低 | 資料不足 |
| 屋頂 | `roof`(:31) | `#DCD6C8` | 依據是 Esri 航照(既有報告),本次沒有重新取樣 | Esri | 低 | 資料不足 |
| 屋頂機電區 | `plant`(:32) | `#555555` | 同上 | Esri | 低 | 資料不足 |

## 16. tsutaya 蔦屋書店 / T&R 廣場(`tools/models/landmark_tsutaya.py`)

> Commons 唯一的照片 TS1 是**黃昏開燈**時拍的(木板取樣 `#552C1E`,受燈光影響)。既有報告提到的白天照片(台中市建築師公會、銳宇官網、部落格)只能在網頁上看,沒有授權可以作為取樣依據,所以白天的顏色本次判為資料不足。色相(木褐、黑框)和既有描述一致。

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 柚木板 | `wood`(landmark_tsutaya.py:28) | `#7A4A2E` | 黃昏取樣 `#552C1E`;白天 not_stated | TS1(2019,黃昏) | 低 | 資料不足 |
| 木板亮面 | `woodlit`(:29) | `#9A6440` | 同上 | TS1 | 低 | 資料不足 |
| 街角深咖啡格柵盒 | `box`(:30) | `#4A3426` | 同上 | TS1 | 低 | 資料不足 |
| 黑框 / 欄杆 | `metal`(:31) | `#2B2B2B` | 黑色金屬,不受光線影響(取樣 `#131112`) | TS1 | 中 | 一致 |
| 玻璃 | `glass`(:32) | `#6F7F80` | 白天顏色 not_stated | — | 低 | 資料不足 |
| 綠化 | `green`(:33) | `#5E8A3A` | 有垂掛植栽 | TS1 | 中 | 一致 |
| 階梯面 | `stair`(:34) | `#6B5340` | 同木板 | TS1 | 低 | 資料不足 |
| 階梯燈條 | `steplight`(:35) | `#E8D3A0` | 暖白燈條(看照片就是燈光色) | TS1 | 中 | 一致 |

## 17. chaoma 朝馬國民運動中心(`tools/models/landmark_chaoma.py`)

| 部位 | 腳本變數名 | 目前色碼 | 真實觀察 | 依據 | 信心 | 判定 |
|---|---|---|---|---|---|---|
| 橘色外框 | `orange`(landmark_chaoma.py:30) | `#F2A33A` | 亮橘。陰天取樣 `#FDAD64`、`#FDA540`、`#FEAD4F` | CM1(2017) | 高 | 一致 |
| 橘色陰影面 | `orange2`(:31) | `#D9862A` | 取樣 `#B87341` | CM1 | 中 | 一致 |
| 玻璃帷幕 | `glass`(:32) | `#2F5A50` | 深綠玻璃。取樣 `#354946` | CM1(2017) | 中 | 一致 |
| 灰色實板 | `panel`(:33) | `#9A9A96` | 玻璃間的灰板 | CM1 | 中 | 一致 |
| 東南角塔 | `tower`(:34) | `#4A4A4C` | 深灰。取樣 `#3E383B` | CM1(2017) | 高 | 一致 |
| 1 樓玻璃 | `ground`(:35) | `#6F8A88` | 取樣 `#5E5949`(混到柱子和陰影) | CM1 | 低 | 一致 |
| 屋頂太陽能板 | `solar`(:36) | `#3E4A5A` | 本次沒有重新取樣航照 | — | 低 | 資料不足 |
| 藍色馬賽克門框 | `mosaic`(:37) | `#2E4FA8` | 藍色馬賽克。陰天取樣 `#424866`(比目前灰);色相吻合 | CM1(2017) | 中 | 一致 |
| 門框內緣 | `frame_in`(:38) | `#3A3D40` | 暗色 | CM1 | 中 | 一致 |

---

## 18. 建議修改總表(依 RGB 距離由大到小)

> 距離由 §19 的腳本算出。「面積」是這個部位在遊戲畫面裡的醒目程度(推論)。

| # | 棟 | 部位(變數名,檔案:行號) | 目前 → 建議 | RGB 距離 | 信心 | 面積 | 來源 |
|---|---|---|---|---:|---|---|---|
| 1 | millennium | 裙樓玻璃(`podium_glass`,landmark_millennium.py:39) | `#8FB3C2` → `#3E5A5C` | 157.8 | 中低 | 中 | https://commons.wikimedia.org/wiki/File:Millennium_Vee_Hotel_Taichung_20130429.jpg (2013) |
| 2 | city-hall | 方框內凹面(`inner`,landmark_city_hall.py:41) | `#7F96A3` → `#2C4052` | 144.4 | 中 | 中 | https://commons.wikimedia.org/wiki/File:Taichung_City_Hall_20230824.jpg (2023) |
| 3 | tiger-city | 底層店面玻璃(`shop`,landmark_tiger_city.py:33) | `#8FA8A3` → `#4A5A5A` | 127.2 | 中低 | 小 | https://commons.wikimedia.org/wiki/File:Tiger_City_View_201905.jpg (2019) |
| 4 | opera | 玻璃帷幕(`glass`,landmark_opera.py:37) | `#7E949B` → `#3E5A60` | 104.6 | 中 | 大 | https://commons.wikimedia.org/wiki/File:National_Taichung_Theater_aerial_view_2019.jpg (2019) |
| 5 | city-hall | 玻璃帷幕(`glass`,landmark_city_hall.py:38) | `#8A9BAE` → `#4A5E78` | 103.6 | 中 | **大(整棟)** | https://commons.wikimedia.org/wiki/File:Taichung_City_Hall_20230824.jpg (2023);https://commons.wikimedia.org/wiki/File:Taichung_City_Government,_Nov_2024_(1).jpg (2024) |
| 6 | council | 方洞頂板(`hole`,landmark_council.py:43) | `#5C6066` → `#2A2B2C` | 93.1 | 高 | 中 | https://commons.wikimedia.org/wiki/File:Taichung_City_Council_Hall_20230823_01.jpg (2023) |
| 7 | opera | 主牆(`wall`,landmark_opera.py:35) | `#E4E2DC` → `#B3B8BC` | 72.0 | 中 | **大(整棟)** | https://commons.wikimedia.org/wiki/File:National_Taichung_Theater_aerial_view_2019.jpg (2019) |
| 8 | council | 玻璃帷幕(`glass`,landmark_council.py:41) | `#8EA2B8` → `#5A78A0` | 71.0 | 中高 | **大(整棟)** | https://commons.wikimedia.org/wiki/File:Taichung_City_Council_Hall_20230823_01.jpg (2023) |
| 9 | millennium | 方窗玻璃(`window`,landmark_millennium.py:34) | `#4F8198` → `#34506E` | 70.0 | 中 | 中 | https://commons.wikimedia.org/wiki/File:Millennium_Vee_Hotel_Taichung_20130429.jpg (2013) |
| 10 | shin-kong | 背面黃板(`yellow`,landmark_shin_kong.py:41) | `#E2B33A` → `#E8C77A` | 67.3 | 中低 | 小 | https://commons.wikimedia.org/wiki/File:View_of_Shin_Kong_Mitsukoshi_Taichung_and_a_newly_built_building.jpg (2018) |
| 11 | maple-garden | 湖水(`lake`,landmark_maple_garden.py:37) | `#4F7F7A` → `#4F5E44` | 63.3 | 中 | 中 | https://commons.wikimedia.org/wiki/File:Maple_Garden,_Taichung,_Nov_2024_(1).jpg (2024) |
| 12 | city-hall | 中央深色方框(`frame`,landmark_city_hall.py:40) | `#4E5257` → `#2C2C32` | 63.0 | 中 | 中 | https://commons.wikimedia.org/wiki/File:Taichung_City_Hall_20230824.jpg (2023) |
| 13 | station-old | 迴廊雨棚(`canopy`,landmark_station_old.py:50) | `#8C8B82` → `#6A685C` | 61.8 | 中 | 中 | https://commons.wikimedia.org/wiki/File:Taichung_Old_Station,_Aug_2024.jpg (2024) |
| 14 | the-lin | 銅棕玻璃(`glass`,landmark_the_lin.py:32) | `#9C5A4A` → `#B07A6A` | 49.5 | 中 | **大(整棟)** | https://commons.wikimedia.org/wiki/File:The_Lin_Hotel_Taichung-01.2024-05-10.jpg (2024) |
| 15 | opera | 屋頂舞台塔(`tower`,landmark_opera.py:39) | `#7A7E82` → `#5A6270` | 46.2 | 中 | 小 | https://commons.wikimedia.org/wiki/File:National_Taichung_Theater_aerial_view_2019.jpg (2019) |
| 16 | station-old | 鐘塔帽頂(`cap`,landmark_station_old.py:48) | `#565C63` → `#3E4446` | 44.6 | 中 | 小 | https://commons.wikimedia.org/wiki/File:Facade_of_the_old_Taichung_Station.png (2024) |
| 17 | shin-kong | 紅褐面磚(`brick`,landmark_shin_kong.py:34) | `#8A5A52` → `#8C7475` | 43.6 | 中 | **大** | https://commons.wikimedia.org/wiki/File:View_of_Shin_Kong_Mitsukoshi_Taichung_and_a_newly_built_building.jpg (2018);https://commons.wikimedia.org/wiki/File:Shin_Kong_Mitsukoshi_Taichung_Store_2025.png (2025) |
| 18 | shin-kong | 圓筒玻璃(`glass`,landmark_shin_kong.py:37) | `#5E9A96` → `#7F9EAD` | 40.4 | 低 | 中 | https://commons.wikimedia.org/wiki/File:Shin_Kong_Mitsukoshi_Taichung_Store_2025.png (2025) |
| 19 | millennium | 中央藍玻璃帶(`blue`,landmark_millennium.py:35) | `#3E6F8E` → `#2E5478` | 38.3 | 中 | 大 | https://commons.wikimedia.org/wiki/File:Millennium_Vee_Hotel_Taichung_20130429.jpg (2013) |

**最明顯的錯誤**(距離大,而且面積大、信心至少中):#5 市府玻璃、#4 歌劇院玻璃、#7 歌劇院主牆、#8 議會玻璃、#6 議會方洞頂板。

## 19. 排序驗證腳本

存在 session 暫存區,沒有放進專案:`/private/tmp/claude-501/-Users-cooperfu-Projects-3D-Racing/10fc9f5b-ab17-41ec-863f-c0cd0062066a/scratchpad/dist.py`。內容是把上表的 (目前色, 建議色) 換成 RGB,算 `sqrt(ΔR²+ΔG²+ΔB²)`,再由大到小排序。結果和 §18 的「RGB 距離」欄相同。

## 20. 資料不足清單

| 棟 | 部位 | 原因 |
|---|---|---|
| mcdonalds | **全部 9 色** | 沒有任何外觀照片(只有 2013 的室內照片);店面可能已經改裝過 |
| golden-jaguar | **全部 8 色** | 立面只有官網夜景;屋頂只有航照 |
| ikea | 立面 `blue`、`yellow`、`park` | 沒有任何外觀照片;藍黃只有品牌慣例和航照邊緣的間接證據 |
| tsutaya | `wood`、`woodlit`、`box`、`glass`、`stair` | Commons 唯一的照片是黃昏開燈;白天照片只有業者 / 部落格網頁(只能看,不能當取樣依據) |
| top-city | `lobby`、`gold`(依據是夜景)、`white`、`glassbox`、`recess` | 沒有白天正面的低角度照片 |
| city-hall | `line`、`louver`、`soffit` | 照片中看不出來 |
| council | `green` | 洞底看不到 |
| opera | `green` | 屋頂綠地和白色曲面混在一起 |
| fulfillment | `stage`、`back`、`booth` | 白天照片中看不到 |
| maple-garden | `pebble`、`maple`、`trunk` | 沒有乾淨樣本;2024-11 照片沒有明顯紅葉 |
| the-lin | `roof` | 沒有屋頂照片 |
| tiger-city | `stair` | 本次沒有重新取樣 |
| chaoma | `solar` | 本次沒有重新取樣航照 |
| millennium | (全部可判,但)照片只到 2013 | 無法確認 2013 年之後有沒有改色 |

- 完全查不到可靠白天照片的:**3 棟**(麥當勞、金錢豹、IKEA 立面)。
- 白天照片不足、只有黃昏的:**1 棟**(蔦屋 / T&R 廣場)。

## 21. 決策與放棄的方案

- **取樣用 canvas 讀像素中位數,不用肉眼估。** 理由:可以重做、有數字。限制:照片有曝光、白平衡和後製的差異(CH2、SN2、MG1 都調過色),所以建議色仍然是目視估計。
- **放棄 Mapillary**:網頁版地圖在瀏覽器面板中無法顯示(看起來是 WebGL 的問題),API 又需要 token。
- **放棄**業者網站與部落格照片的取樣:沒有開放授權,而且任務要求以可開啟的來源為準;這些只列為「只能看」的參考。
- **不用夜景判斷牆色**(金錢豹 j1、大遠百 Q4、蔦屋 TS1),依任務規則一律判為資料不足。
- 依任務限制,本次只新增本檔,沒有另外寫 `docs/decisions/`。如果需要把「完全照實 vs 保留淡雅」的決策記錄下來,請 Cooper 指示。
