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
  /** 車站(跨在路上的站體):半長、半寬、站體底高與頂高、屋頂挑出與厚度 */
  stationHalf: [42, 11] as readonly [number, number],
  stationY: [9.2, 17] as readonly [number, number],
  roofOver: 1.2,
  roofH: 0.7,
  /** 顏色:混凝土、護欄、墩柱、站體、屋頂(綠線的綠) */
  colors: { deck: '#D4D7DA', parapet: '#E6E8EA', pier: '#BFC4C9', station: '#F2F3F1', roof: '#3FA36B', band: '#3FA36B' },
  /** 墩柱碰撞高度(公尺) */
  pierHitH: 6,
};
