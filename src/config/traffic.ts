// 路上的其他車輛(decisions/0028,Cooper 2026-11-13:「路上我想增加其他車輛,用簡單的方塊呈現就好…車輛帶有碰撞系統」)。
// 全部是遊戲規則 / 外觀推論,不是實測;實際玩過後再調。
export const TRAFFIC = {
  /** 玩家附近維持的車輛數 */
  count: 30,
  /** 生成距離(離玩家,公尺)與消失距離 */
  spawnMin: 90,
  spawnMax: 220,
  despawn: 280,
  /** 生成時離其他車至少多遠(公尺) */
  spawnGap: 18,
  /** 巡航時速範圍(km/h) */
  speedKmh: [30, 45] as readonly [number, number],
  /** 加速、煞車(m/s²) */
  accel: 2.5,
  brake: 9,
  /** 前方有東西:看前方 lookAhead 公尺、左右 lookSide 公尺;距離 ≤ stopGap 就停住 */
  lookAhead: 14,
  lookSide: 1.7,
  stopGap: 6,
  /** 到路口時直走的機率(有得直走時);其餘隨機轉到別條路 */
  straight: 0.7,
  /** 被別的車卡住超過這麼久(秒)就消失重生(避免路口互卡) */
  stuckSeconds: 6,
  /** 車道寬(公尺),用來把路面分成幾個車道 */
  laneWidth: 3.3,
  /** 車身追上車道位置的速率(1/秒;越大越貼線,越小轉彎越圓) */
  follow: 4,
  /** 不開進去的道路 */
  skipHighways: ['service'] as readonly string[],
  /** 車身尺寸(公尺):長、高、寬;車廂(上半)長、高、寬 */
  body: [4.2, 0.75, 1.8] as readonly [number, number, number],
  cabin: [2.2, 0.6, 1.6] as readonly [number, number, number],
  /** 車身離地 */
  clearance: 0.3,
  /** 車廂和車身同色(Cooper 2026-11-13:「其他汽車我想改成上下方塊相同顏色」)。
   *  顏色只剩白、黑、黃,黃色 = 計程車(Cooper 2026-11-15,decisions/0037);比例是推論,試玩後再調 */
  colors: ['#F2F2EC', '#2B2F36', '#F4C20D'] as readonly string[],
  /** 各顏色出現的權重(和 colors 同順序) */
  colorWeights: [0.4, 0.3, 0.3] as readonly number[],
  /** colors 裡哪一個是計程車(車頂加小方塊) */
  taxiColor: 2,
  /** 計程車車頂燈箱(公尺):邊長、高、顏色 */
  taxiSign: { size: 0.45, height: 0.3, color: '#FFFFFF' },
  /** 公車(綠色長方形,Cooper 2026-11-15):尺寸 長、高、寬(公尺)、離地、顏色;只走 busRoads 的道路 */
  bus: { size: [11, 2.9, 2.5] as readonly [number, number, number], clearance: 0.35, color: '#3E9B4F' },
  /** 生成在公車可走的道路上時,有多少機率是公車 */
  busShare: 0.15,
  busRoads: ['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'] as readonly string[],
};
