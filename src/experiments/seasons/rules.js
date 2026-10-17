/*
 * 地理实验“地球公转与四季形成” —— 纯规则引擎。
 *
 * 全部数据按天文学公式计算：
 * - 太阳直射点纬度 δ = 23.5°·sin(θ)，θ 为轨道位置角（0°=春分，90°=夏至）
 * - 正午太阳高度 H = 90° - |当地纬度 φ - δ|
 * - 昼长 L = 12 - (24/π)·arcsin(tan φ · tan δ)（极昼极夜时取 24/0）
 */

export const AXIAL_TILT = 23.5;

export const CITIES = [
  { id: "beijing", name: "北京", lat: 39.9 },
  { id: "guangzhou", name: "广州", lat: 23.1 },
  { id: "mohe", name: "漠河", lat: 52.9 },
  { id: "sanya", name: "三亚", lat: 18.2 },
  { id: "sydney", name: "悉尼（南半球）", lat: -33.9 },
];

/** 四个关键节气对应的轨道位置角。 */
export const KEY_POSITIONS = [
  { angle: 0, name: "春分", month: "3 月下旬" },
  { angle: 90, name: "夏至", month: "6 月下旬" },
  { angle: 180, name: "秋分", month: "9 月下旬" },
  { angle: 270, name: "冬至", month: "12 月下旬" },
];

/** 太阳直射点纬度（北正南负）。 */
export function solarDeclination(positionDeg) {
  const rad = (Number(positionDeg) * Math.PI) / 180;
  return Math.round(AXIAL_TILT * Math.sin(rad) * 10) / 10;
}

/** 正午太阳高度（°）。 */
export function noonSunHeight(latDeg, declinationDeg) {
  return Math.round((90 - Math.abs(Number(latDeg) - Number(declinationDeg))) * 10) / 10;
}

/** 昼长（小时，保留 2 位；极昼极夜取 24/0）。 */
export function dayLength(latDeg, declinationDeg) {
  const latRad = (Number(latDeg) * Math.PI) / 180;
  const decRad = (Number(declinationDeg) * Math.PI) / 180;
  const arg = Math.tan(latRad) * Math.tan(decRad);

  if (arg >= 1) return 24; // 极昼
  if (arg <= -1) return 0; // 极夜

  // L = (24/π)·arccos(−tanφ·tanδ) = 12 + (24/π)·arcsin(tanφ·tanδ)
  const hours = 12 + (24 / Math.PI) * Math.asin(arg);
  return Math.round(hours * 100) / 100;
}

/** 轨道位置角 → 最近节气名称。 */
export function positionName(angleDeg) {
  let nearest = KEY_POSITIONS[0];
  let minDiff = Infinity;

  KEY_POSITIONS.forEach((item) => {
    const diff = Math.min(
      Math.abs(angleDeg - item.angle),
      360 - Math.abs(angleDeg - item.angle)
    );
    if (diff < minDiff) {
      minDiff = diff;
      nearest = item;
    }
  });

  return minDiff <= 5 ? `${nearest.name}（${nearest.month}）` : "介于节气之间";
}

/** 汇总某城市某位置的全部数据。 */
export function computeSunData(latDeg, positionDeg) {
  const declination = solarDeclination(positionDeg);
  return {
    declination,
    sunHeight: noonSunHeight(latDeg, declination),
    dayLength: dayLength(latDeg, declination),
  };
}
