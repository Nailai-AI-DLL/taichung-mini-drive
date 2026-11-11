// 畫面質感(decisions/0016 方向 A「風格化精緻」):光照、後製、天空。全部是品味數值,樣張給 Cooper 看後再定。
// 每個效果都可以單獨關掉(網址 ?fx=-gtao,-bloom 或 __game.setFx),方便前後對照。

/** 改版前的光照(fx 關掉 light 時用,前後對照) */
export const LOOK_LIGHT_OLD = {
  sunColor: '#fff4e6',
  sunIntensity: 2.4,
  sunOffset: [-60, 120, 40] as [number, number, number],
  hemiSky: '#ffffff',
  hemiGround: '#f3e9d2',
  hemiIntensity: 1.9,
  skyTop: '#CFE0EA',
  skyHorizon: '#EAEDEE',
  fogNear: 260,
  fogFar: 720,
};

/**
 * 光照(0016 §9,參考《Six Stars》但要更明亮):明亮的金黃午後。太陽偏暖、環境光亮而偏藍,陰影不髒;
 * 天空頂端飽和藍、地平線暖杏色;霧用地平線色,遠景帶一點暖色空氣感。
 */
export const LOOK_LIGHT = {
  sunColor: '#fff0d8',
  sunIntensity: 3.3,
  /** 太陽相對車子的位置(公尺):x 東、y 高、z 南 */
  sunOffset: [-85, 95, 60] as [number, number, number],
  hemiSky: '#d4e8ff',
  hemiGround: '#efe2cc',
  hemiIntensity: 1.75,
  /** 天空漸層(頂、地平線)與霧(地平線色、起點、終點;公尺) */
  skyTop: '#2f9bf0',
  skyHorizon: '#d4f0ff',
  fogNear: 300,
  /** 不超過串流載入半徑(800 m),否則遠處沒載入的地方會露出來 */
  fogFar: 800,
};

/** 環境光遮蔽(GTAO):牆角、建築底、樹下變暗,畫面立體 */
export const LOOK_AO = {
  /** 以畫面解析度的比例計算(0.5 = 半解析度,省效能) */
  scale: 0.5,
  radius: 2.4,
  distanceExponent: 1.5,
  thickness: 3,
  samples: 12,
  /** 0–1,疊上去的強度 */
  intensity: 1,
  /** 距離淡出(公尺):遠處深度精度不夠,重建的法向量有雜訊,霧裡的建築和雲會出現髒髒的暗點;這段距離內逐漸取消 */
  fadeNear: 120,
  fadeFar: 260,
};

/** 泛光:只讓很亮的地方(天空、白色標線、受光的淺色牆)微微發光 */
export const LOOK_BLOOM = { strength: 0.06, radius: 0.4, threshold: 0.95 };

/**
 * 調色(在色調映射之後、畫面色彩空間做):
 * saturation 飽和度倍率、contrast 對比(S 曲線強度)、warm 亮部偏暖 / 暗部偏冷的量、vignette 暗角強度
 */
export const LOOK_GRADE = { saturation: 1.15, contrast: 0.14, warm: 0.03, vignette: 0.14 };

/** 雲:低多邊形的白色蓬鬆雲團(參考圖二),浮在 minY–maxY,散在整個區域 */
export const LOOK_CLOUDS = { count: 70, minY: 110, maxY: 230, minSize: 60, maxSize: 120, color: '#ffffff', shade: '#dbe8f5' };

/** 可單獨開關的效果名稱 */
export const FX_NAMES = ['light', 'gtao', 'bloom', 'grade', 'smaa', 'clouds'] as const;
export type FxName = (typeof FX_NAMES)[number];
