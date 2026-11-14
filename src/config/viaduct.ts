// 文心路高架捷運(綠線)的外型(decisions/0030,Cooper 2026-11-14:「主要是想要捷運高架的外型…一出現就知道現在在文心路上」;不做列車)。
// 尺寸都是外觀推論(實際橋高、梁深 not_stated),不是實測。
export const VIADUCT = {
  /** 橋面寬、橋面底離地、橋面板厚、護欄高與厚(公尺) */
  deckWidth: 9,
  deckY: 10,
  deckDepth: 1.1,
  parapetH: 1.3,
  parapetW: 0.35,
  /** 一段橋面最長多長(公尺;彎道會切得更細) */
  spanLen: 15,
  /** 墩柱間距、柱身半長(沿橋)× 半寬(橫向)、帽梁半長(橫向)× 半寬(沿橋)× 高 */
  pierSpacing: 30,
  pierHalf: [1.0, 0.7] as readonly [number, number],
  capHalf: [3.4, 1.1] as readonly [number, number],
  capH: 1.4,
  /**
   * 墩柱離「橫交道路」的車道邊緣至少多遠(公尺);放不下時沿橋前後挪這些距離再試,都不行就不放(路口上方拉長跨距)。
   * 和橋平行的道路(文心路自己的兩側車道)不這樣檢查:墩柱橫向挪到兩側車道中間的縫上(最多挪 pierSideMax),
   * 因為地圖裡文心路的分隔島很窄、有些路段兩側車道幾乎貼在一起(政府路寬把分隔島算進去了),照車道淨空會有一半放不下。
   */
  pierClear: 0.4,
  pierSideMax: 4,
  /** 和橋的夾角餘弦 ≥ 此值算平行 */
  pierParallelCos: 0.85,
  pierShift: [0, 4, -4, 8, -8, 12, -12] as readonly number[],
  /**
   * 車站(decisions/0033;依據 docs/art/mrt-station-reference.md,尺寸是 OSM 外框量測 + 照片目測,信心低):
   * 道路中央、坐在高架橋上的白色長盒,約 100 × 28 m;由下往上:船底形裙板(底寬較窄)→ 白色水平百葉帶 → 玻璃帶 → 白色薄屋頂。
   * hull = 裙板 [底高, 頂高, 底部半寬];louver / glass = 各帶的 [底, 頂];roof = 屋頂板 [底, 頂, 外挑]。
   */
  stationHalf: [50, 14] as readonly [number, number],
  hull: [8, 11.2, 8] as readonly [number, number, number],
  louver: [11.2, 14.6] as readonly [number, number],
  glass: [14.6, 19.0] as readonly [number, number],
  roof: [19.0, 19.7, 0.9] as readonly [number, number, number],
  /** 弧形屋簷(CJ930 標的站):中段拱起多高、兩端往下包多少、沿長邊分幾段 */
  archRise: 1.6,
  archDrop: 2.6,
  archSegments: 12,
  /** CJ930 標(白色弧形 / 微波浪屋簷);其餘(CJ920)是平薄屋頂 */
  archStations: ['水安宮', '文心森林公園', '南屯', '豐樂公園'] as readonly string[],
  /** 站體下方墩柱加密:站體範圍內每這麼多公尺一根(一般路段 30 m) */
  stationPierSpacing: 15,
  /** 空橋:從站體側面接到路邊的連通建築;[底高, 頂高, 半寬];下半實牆、上半一圈帶狀窗 */
  bridge: [10.4, 15.2, 2.6] as readonly [number, number, number],
  bridgeWindow: [12.9, 14.6] as readonly [number, number],
  /** 連通建築離站體中心最遠多少公尺還接空橋 */
  bridgeMax: 70,
  /**
   * 路邊連通建築的識別色(照片目視估計);not_stated 的站(文華高中、文心櫻花、豐樂公園)不改色。
   * 文心崇德是灰色棋盤格 + 銅橘入口,這裡只取銅橘;市政府是灰褐格柵 + 綠色玻璃,取綠灰。
   */
  identity: { 南屯: '#F2C81E', 四維國小: '#F0A11E', 水安宮: '#A8D46F', 文心森林公園: '#7DC243', 文心崇德: '#C8653A', 市政府: '#7FA391', 文心中清: '#B8BCC0' } as Readonly<Record<string, string>>,
  /** 顏色:橋面、護欄(綠線的淡黃綠防護牆)、護欄頂的綠框、墩柱、站體各帶 */
  colors: {
    deck: '#D4D7DA', parapet: '#B9D67E', rail: '#6FAE3C', pier: '#C8C9C4',
    hull: '#DCDDD9', louver: '#F2F2F0', glass: '#A9C2C6', roof: '#F5F5F3', mullion: '#FFFFFF', under: '#8C9196',
    bridgeWall: '#E4E5E2', bridgeGlass: '#9FBFC4',
  },
  /** 墩柱碰撞高度(公尺) */
  pierHitH: 6,
};
