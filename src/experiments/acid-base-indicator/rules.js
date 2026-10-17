/*
 * 化学实验“酸碱指示剂与溶液性质” —— 纯规则引擎。
 *
 * 颜色变化完全由经过验证的指示剂变色规则表查表得出，与界面、AI 解耦；
 * pH 为模拟溶液的预设值（教学常见物质），不使用 AI 生成。
 */

export const PROPERTY_LABELS = {
  acid: "酸性",
  neutral: "中性",
  alkaline: "碱性",
};

/** 教学用模拟溶液清单（pH 为常温下的近似值）。 */
export const SOLUTIONS = [
  { id: "vinegar", name: "白醋", ph: 3, property: "acid" },
  { id: "lemonade", name: "柠檬水", ph: 4, property: "acid" },
  { id: "water", name: "蒸馏水", ph: 7, property: "neutral" },
  { id: "baking-soda", name: "小苏打水", ph: 9, property: "alkaline" },
  { id: "soap", name: "肥皂水", ph: 10, property: "alkaline" },
  { id: "lime-water", name: "澄清石灰水", ph: 12, property: "alkaline" },
];

/** 指示剂变色规则表（唯一事实来源）。 */
export const INDICATORS = {
  litmus: {
    id: "litmus",
    name: "紫色石蕊试液",
    short: "石蕊",
    colors: {
      acid: { css: "#dc2626", label: "变红色" },
      neutral: { css: "#7c3aed", label: "呈紫色（不变色）" },
      alkaline: { css: "#2563eb", label: "变蓝色" },
    },
  },
  phenolphthalein: {
    id: "phenolphthalein",
    name: "无色酚酞试液",
    short: "酚酞",
    colors: {
      acid: { css: "rgba(226,232,240,0.55)", label: "不变色（无色）" },
      neutral: { css: "rgba(226,232,240,0.55)", label: "不变色（无色）" },
      alkaline: { css: "#ec4899", label: "变红色" },
    },
  },
};

export function getSolutionById(id) {
  return SOLUTIONS.find((item) => item.id === id) || null;
}

export function getIndicatorById(id) {
  return INDICATORS[id] || null;
}

/**
 * 查表得到观察结果：
 * 返回 { colorCss, colorLabel, propertyLabel, ph, solutionName, indicatorName }
 */
export function observe(solutionId, indicatorId) {
  const solution = getSolutionById(solutionId);
  const indicator = getIndicatorById(indicatorId);

  if (!solution || !indicator) return null;

  const result = indicator.colors[solution.property];

  return {
    solutionId: solution.id,
    solutionName: solution.name,
    indicatorId: indicator.id,
    indicatorName: indicator.name,
    colorCss: result.css,
    colorLabel: result.label,
    property: solution.property,
    propertyLabel: PROPERTY_LABELS[solution.property],
    ph: solution.ph,
  };
}
