// 「接送慈慈」玩法的數值與台詞(decisions/0029;草案 docs/design/pickup-cici-draft.md)。
// Cooper 2026-11-13 拍板的規則標「拍板」;其餘數值是先給的預設(「先這樣設計,實際玩過後再調整」)。
export const PICKUP = {
  /** 接送點離出發點的直線距離(公尺)。路程約是直線的 routeFactor 倍 → 約 400–900 m */
  range: [300, 650] as readonly [number, number],
  routeFactor: 1.35,
  /** 時間額度 = 路程 ÷ paceKmh × slack;額度用完不耐煩值剛好從 0 漲到 100% */
  paceKmh: 30,
  slack: 1.5,
  /** 拍板:接到慈慈時,不耐煩值降一半 */
  pickupKeep: 0.5,
  /** 拍板:上一局成功,這局漲得比較慢。漲速倍率 = max(minRate, 1 − respectSlow × 尊敬) */
  respectSlow: 0.08,
  minRate: 0.5,
  /** 拍板:成功 +1 尊敬;失敗「扣一點就好」→ −1(最低 0) */
  respectWin: 1,
  respectLose: 1,
  /** 拍板:撞到東西要加不耐煩值(百分點);同一次碰撞 hitCooldown 秒內只算一次 */
  hitCar: 8,
  hitWall: 4,
  hitCooldown: 1,
  /**
   * 拍板(2026-11-13):按 R 回到路面要加不耐煩值,「會被慈慈念危險駕駛」。幅度是我先給的,待試玩後調。
   * (順便擋掉作弊:高速經過目標按 R 會瞬間停車、直接算到站)
   */
  resetPenalty: 10,
  /** 判定撞擊:一個物理步(1/60 秒)內車速變化超過這麼多(m/s)。全力煞車一步約 0.2 m/s,不會誤判 */
  hitDeltaV: 1.6,
  /** 撞擊點 hitCarRange 公尺內有其他車 → 算撞車,否則算撞牆 / 桿子 */
  hitCarRange: 4.5,
  /** 接到 / 送到的判定:離目標 ≤ arriveDist 公尺、車速 ≤ arriveKmh */
  arriveDist: 8,
  arriveKmh: 5,
  /** 成功 / 失敗畫面停留(秒),之後自動開下一局 */
  resultSeconds: 4,
  /** 接送點立在路緣外多遠(公尺) */
  curbOffset: 1.0,
  /** 不選這些道路當接送點 */
  skipHighways: ['service', 'trunk', 'motorway'] as readonly string[],
  /** 接送點所在道路至少多寬(公尺) */
  minRoadWidth: 6,
  name: '慈慈',
};

/** 慈慈的台詞(第一版,Cooper 可直接改這裡;{place} 會換成目的地) */
export const LINES = {
  call: ['我在{place},快來接我!', '來{place}接我,不要讓我等太久喔。', '我到{place}了,你在哪?'],
  nag50: ['你到哪了?', '還要多久啊?', '我等很久了耶。'],
  nag80: ['你再不來我要生氣了!', '快一點啦!', '我真的要生氣了喔!'],
  picked: ['終於來了。載我去{place}。', '走吧,我要去{place}。', '上車了,去{place},快。'],
  hitCar: ['你會不會開車啊!', '小心一點啦!', '嚇死我了!'],
  hitWall: ['欸!看路!', '你撞到東西了啦!'],
  reset: ['危險駕駛!', '你這樣是危險駕駛耶!', '危險駕駛啦,好好開!'],
  win: ['到了,謝謝你。開得不錯嘛。', '這次還可以,下次也找你。', '嗯,有進步。'],
  lose: ['算了,我自己叫車。', '我不等了!', '氣死我了,不坐了!'],
} as const;
export type LineKey = keyof typeof LINES;
