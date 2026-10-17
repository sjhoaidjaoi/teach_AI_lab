/*
 * 生物实验“显微镜观察细胞” —— 纯规则引擎。
 *
 * 光学规则：总放大倍数 = 目镜 × 物镜；成像清晰度由焦距偏差决定；
 * 视野亮度影响观察效果；结构与标注正确性由标本结构表判定。
 */

export const EYEPIECES = [5, 10, 16];
export const OBJECTIVES = [10, 40];

/** 每种标本的最优焦距与结构清单（唯一事实来源）。 */
export const SPECIMENS = {
  onion: {
    id: "onion",
    name: "洋葱表皮细胞",
    optimalFocus: 52,
    structures: ["细胞壁", "细胞核", "液泡"],
    note: "植物细胞：有细胞壁和液泡，表皮细胞无叶绿体。",
  },
  cheek: {
    id: "cheek",
    name: "人口腔上皮细胞",
    optimalFocus: 48,
    structures: ["细胞膜", "细胞质", "细胞核"],
    note: "动物细胞：无细胞壁和液泡，由细胞膜包裹。",
  },
};

/** 总放大倍数（倍）。 */
export function totalMagnification(eyepiece, objective) {
  return Number(eyepiece) * Number(objective);
}

/**
 * 成像质量规则：
 * - 清晰：焦距偏差 ≤ 8
 * - 模糊程度随偏差增大；光圈 <35 视野过暗，>90 略微过曝
 */
export function imageQuality(focus, light, specimenId) {
  const specimen = SPECIMENS[specimenId];
  const optimal = specimen ? specimen.optimalFocus : 50;
  const deviation = Math.abs(Number(focus) - optimal);

  const tooDark = Number(light) < 35;
  const tooBright = Number(light) > 90;
  const clear = deviation <= 8 && !tooDark && !tooBright;

  return {
    clear,
    deviation: Math.round(deviation),
    blurPx: Math.min(10, Math.round(deviation / 6 * 10) / 10),
    tooDark,
    tooBright,
    hint: tooDark
      ? "视野太暗，请调大光圈"
      : tooBright
        ? "视野过亮，请调小光圈"
        : deviation > 8
          ? deviation > 0
            ? Number(focus) > optimal
              ? "物镜压得太近，请向上调节粗准焦螺旋"
              : "物镜离得太远，请向下调节粗准焦螺旋"
            : "成像清晰"
          : "成像清晰",
  };
}

/**
 * 标注判分：placed 结构集合 vs 标准结构清单。
 * 返回 { correct[], missing[] }。
 */
export function checkLabels(specimenId, placed) {
  const specimen = SPECIMENS[specimenId];
  const found = specimen ? specimen.structures : [];

  return {
    correct: found.filter((name) => placed?.[name]),
    missing: found.filter((name) => !placed?.[name]),
  };
}
