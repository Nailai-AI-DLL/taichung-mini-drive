// 車輛手感參數(初版,M0)。手感取向:輕快好甩好開(Cooper 2026-10-12 拍板 Q7)。
// 尺寸參考 MINI Cooper F55 五門的公開規格量級(長約 4.0 m、寬約 1.7 m);60 週年細節不影響物理。
// 全部參數可在遊戲內按 ` 開啟調參面板即時調整,核定後再寫回這裡與測試。
export interface VehicleParams {
  mass: number; // kg
  /** 碰撞箱半尺寸(x = 前後、y = 上下、z = 左右),公尺 */
  halfExtents: [number, number, number];
  /** 質心相對車體中心的下移量(公尺),越低越不容易翻 */
  comDrop: number;
  wheelRadius: number;
  wheelBaseHalf: number; // 前後輪到車體中心的距離
  trackHalf: number; // 左右輪到中心線的距離
  wheelY: number; // 懸吊連接點高度(相對車體中心)
  suspensionRest: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionForce: number;
  frictionSlip: number;
  sideFriction: number;
  /** 每個驅動輪的引擎力(N) */
  engineForce: number;
  reverseForce: number;
  brakeForce: number;
  maxSpeedKmh: number;
  maxReverseKmh: number;
  /** 低速最大轉向角(弧度) */
  steerMaxLow: number;
  /** 高速(steerFadeKmh 以上)最大轉向角 */
  steerMaxHigh: number;
  steerFadeKmh: number;
  /** 打方向時轉向角追上目標的速度(每秒);越小,輕點一下轉得越少 */
  steerSpeed: number;
  /** 放開 / 回正時的速度(每秒);比 steerSpeed 快,放開後不會繼續轉過頭 */
  steerReturnSpeed: number;
  /** 手煞車時後輪側向抓地倍率(越小越好甩) */
  handbrakeSideGrip: number;
  handbrakeRearBrake: number;
  /** 下壓力係數:每 (m/s)² 的向下力(N) */
  downforce: number;
  linearDamping: number;
  angularDamping: number;
}

export const DEFAULT_PARAMS: VehicleParams = {
  mass: 1250,
  // 車長、軸距照 Q 版三視圖改短(Cooper 2026-11-11 選 A,decisions/0016 §13.2;原 halfExtents x 1.95、wheelBaseHalf 1.28)
  halfExtents: [1.63, 0.42, 0.85],
  comDrop: 0.45,
  wheelRadius: 0.33,
  wheelBaseHalf: 1.0,
  trackHalf: 0.76,
  wheelY: -0.15,
  suspensionRest: 0.32,
  suspensionStiffness: 32,
  suspensionCompression: 2.6,
  suspensionRelaxation: 3.2,
  maxSuspensionForce: 60000,
  frictionSlip: 2.4,
  sideFriction: 1.6,
  engineForce: 1950,
  reverseForce: 900,
  brakeForce: 55,
  // 極速 120 km/h(Cooper 2026-11-16:「車速幫我增加到最快可以到 120,方便我繞整張地圖確認內容」,decisions/0040);
  // 之前 60(市區法規,2026-11-12,0017),更早 130
  maxSpeedKmh: 120,
  maxReverseKmh: 30,
  // 轉向收斂(Cooper 2026-11-12:「輕輕按一下就會過頭」,decisions/0017);原 0.6 / 0.16 / 110 / 5、回正同 5
  // 量測(tools/dev/handling-probe.ts):40 km/h 輕點 0.15 秒車頭轉 19.9° → 5.8°;20 km/h 迴轉半徑 4.2 → 5.7 m
  steerMaxLow: 0.45,
  steerMaxHigh: 0.2,
  steerFadeKmh: 60,
  steerSpeed: 2.5,
  steerReturnSpeed: 8,
  handbrakeSideGrip: 0.3,
  handbrakeRearBrake: 18,
  downforce: 5,
  linearDamping: 0.06,
  angularDamping: 1.2,
};
