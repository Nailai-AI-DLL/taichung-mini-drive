// 街道細節(標線、枕木紋、停止線、分隔島、路緣)的尺寸(decisions/0015)。
// 標線尺寸照《道路交通標誌標線號誌設置規則》,條號與原文見 docs/research/road-markings-tw.md;
// 標「推論」的是依路寬判斷該畫什麼的遊戲規則,不是法規。

/** 車道線、行車分向線:白 / 黃虛線,線段 4 m、間距 6 m、線寬 10 cm(第 181、182 條) */
export const DASH_ON = 4;
export const DASH_OFF = 6;
export const LINE_W = 0.1;
/** 分向限制線:雙黃實線,線寬與兩線間隔皆 10 cm(第 165 條)。推論:每向 ≥ 2 車道才用雙黃線,否則用黃虛線(第 181 條行車分向線) */
export const DOUBLE_GAP = 0.1;
/** 路面邊線:白實線 15 cm(第 183 條;有人行道的路段可不設) */
export const EDGE_W = 0.15;
/** 停止線:白實線 30–40 cm,取 40 cm;與行人穿越道淨距 2–3 m,取 2.5 m(第 170 條) */
export const STOP_W = 0.4;
export const STOP_CLEAR = 2.5;
/** 枕木紋行人穿越道:枕木線寬 40 cm、間隔 40–80 cm 取 60 cm、線段長 2–8 m 取 4 m(第 185 條) */
export const BAR_W = 0.4;
export const BAR_GAP = 0.6;
export const BAR_LEN = 4;

/** 推論:每條車道寬 3.3 m(與 tools/map-build/lib/roads.ts 的 LANE_WIDTH 相同) */
export const LANE = 3.3;
/** 推論:最外側車道之外剩下 ≥ 2 m 時,當成機慢車道,以快慢車道分隔線(白實線,第 183-1 條)分開 */
export const SLOW_LANE_MIN = 2;
/** 推論:雙向道路面寬 ≥ 8 m 才畫中線(法規是 6 m 以上,但台中 6–8 m 巷道實際上多半沒畫) */
export const CENTER_MIN_W = 8;
/** 推論:路面寬 < 5.5 m 的路不畫任何標線 */
export const MARK_MIN_W = 5.5;
/** 推論:標線離路面邊緣 0.3 m(邊線、最外側車道線的基準;法規無此數值) */
export const EDGE_INSET = 0.3;
/** 推論:路面寬 ≥ 7 m 的路、且橫交道路也 ≥ 7 m 才畫停止線 */
export const STOP_MIN_W = 7;

/** 推論:路口範圍 = 橫交道路半寬 + 這段距離內不畫縱向標線 */
export const JUNCTION_PAD = 1.0;
/**
 * 推論:夾角 sin < 0.5(約 30°)且符合下列之一,是同一條路的延續,不算路口:
 * 同名;或兩條 way 在這個 node 都是端點、而且這裡只有這兩條一般道路(換段改名、過橋)。
 * 其餘不同名的路斜交多淺都算路口(例:弘孝路以 28° 接臺灣大道),但夾角 < 30° 的分岔、匯入只切斷標線,不畫停止線
 */
export const CONTINUE_SIN = 0.5;
/** 推論:斜交時路口範圍、穿越道範圍依 1/sin 放大,sin 下限 0.35(約 20°),範圍上限 40 m;比這更斜的穿越道不畫 */
export const MIN_SIN = 0.35;
export const ZONE_MAX = 40;
/** 推論:枕木紋沿穿越方向最多 ±30 m */
export const CROSSWALK_MAX_H = 30;
/**
 * 推論:枕木紋的近端離路口範圍 ≤ 此值才算「這個路口的穿越道」,鋪面延伸過去(法規:穿越道距橫交路面邊緣 3–5 m)。
 * 原為 25 m,會吃到隔壁路口的枕木紋,把兩個路口之間的梅川一起鋪掉(2026-11-01 驗收)
 */
export const PAVE_BAND_REACH = 6;
/** 推論:兩向車道之間的空隙超過此值(公尺)就不補路口鋪面,當成不是同一條路的兩向 */
export const PAVE_MAX_GAP = 30;
/** 路口鋪面沿道路的取樣間距(公尺);越密邊緣越貼路緣,資料越大 */
export const PAVE_STEP = 3;
/** 路口鋪面往兩側路面內多蓋多少(公尺),避免邊緣細縫 */
export const PAVE_OVERLAP = 0.3;
/** 推論:同一條路上兩個路口範圍相距小於此值就合併(分隔幹道的路口會被拆成兩個 node;
 *  原為 12 m,臺灣大道 × 文心路這種大路口中間會剩一小段虛線,2026-10-31 改 18 m;台中街廓最短約 50 m) */
export const ZONE_MERGE = 18;
/** 推論:分隔島:兩條同名對向單行道之間的空隙寬度在這個範圍內才填 */
export const MEDIAN_MIN = 0.6;
export const MEDIAN_MAX = 15;
/** 對向車道配對的取樣間距(公尺):分隔島與雙黃線的折線點距;也決定雙黃線停在停止線前最多多遠 */
export const PAIR_STEP = 1;
/** 取樣點相隔超過 PAIR_STEP × 這個倍數就視為中斷(中間有點被略過) */
export const PAIR_BREAK = 1.5;
/**
 * 配對雙黃線(兩條對向單行道中點)的平滑:前後各 YELLOW_SMOOTH 公尺取平均(6 m 時半徑 80 m 的彎道會往內縮 8.8 cm,4 m 約 4 cm),再簡化到偏差 YELLOW_SIMPLIFY 公尺以內。
 * 原因(decisions/0018):中點每 1 m 一點,最近點投影在對向道路的頂點處會卡住跳動,寫檔又量化到 10 cm,
 * 黃線看起來歪歪扭扭(每公尺側向偏移中位數 1.3 cm、p95 5.4 cm;雙向道路自己的雙黃線是 0)。
 */
export const YELLOW_SMOOTH = 4;
export const YELLOW_SIMPLIFY = 0.03;
/** 推論:兩條路的方向餘弦 < 此值才算「對向平行」(約 145° 以上) */
export const ANTI_PARALLEL = -0.8;
/** 推論:檢查分隔島中間有沒有夾別條路時,在空隙中央與兩側 1/3 處各取一點 */
export const MEDIAN_PROBE = 1 / 3;
/** 推論:停止線離路段端點至少多遠才畫(太靠近端點時屬於下一條 way 的路口) */
export const STOP_END_MIN = 0.5;
/** 推論:路口之間剩不到這個長度就不畫縱向標線 */
export const STRIP_MIN_LEN = 2;
/** 推論:分隔島頭離枕木紋的距離(公尺) */
export const MEDIAN_NOSE = 0.5;
/** 推論:分隔島路緣(淺色邊)寬度 */
export const MEDIAN_CURB = 0.3;
/** 推論:人行道路緣石:路面外側一圈淺色帶的寬度 */
export const CURB_W = 0.3;
