/*
 * 虚拟实验平台 —— 实验注册表（配置驱动）。
 *
 * 设计原则：
 * 1. 所有实验共用统一的五区页面（信息 / 操作 / 测量 / AI 导师 / 记录）；
 * 2. 实验现象与测量值由各实验自带的“规则引擎”按科学公式计算，
 *    AI 只读取结果进行讲解，不参与计算；
 * 3. 新增实验时只需注册元数据并提供一个实验模块，不重写页面框架。
 */

export const SUBJECTS = {
  physics: { label: "物理", icon: "⚡" },
  chemistry: { label: "化学", icon: "🧪" },
  biology: { label: "生物", icon: "🔬" },
  geography: { label: "地理", icon: "🌍" },
};

export const STAGES = {
  junior: "初中",
  senior: "高中",
};

export const EXPERIMENT_STATUS = {
  available: "可操作",
  soon: "即将上线",
};

export const experiments = [
  {
    id: "series-circuit",
    subject: "physics",
    stage: "junior",
    title: "探究串联电路中的电流规律",
    status: "available",
    sceneHash: "#laboratory/circuit",
    duration: "约 30 分钟",
    difficulty: "B 级 · 基础测量",
    icon: "🔌",
    summary:
      "亲手连接电池、开关和两只灯泡组成的串联电路，用电流表测量不同位置的电流，验证串联电路中各处电流相等的规律。",
    objectives: [
      "学会按电路图连接简单的串联电路",
      "能正确判断通路、断路和短路",
      "通过测量验证串联电路中各处电流相等（Iₐ = I_b = I_c）",
      "理解电流与电压、电阻之间的关系",
    ],
    principle:
      "串联电路只有一条电流路径，电路中各处电流相等；总电阻等于各用电器电阻之和（R = R₁ + R₂）。根据欧姆定律 I = U / R 计算电流，灯泡两端电压 U₁ = I·R₁、U₂ = I·R₂。",
    equipment: ["干电池组", "开关", "小灯泡 L₁、L₂", "电流表", "导线若干"],
    safety: [
      "严禁用导线直接连接电池正负极，短路会损坏电源；",
      "连接电路时开关应保持断开，检查无误后再闭合；",
      "真实实验必须在教师指导下进行。",
    ],
    loadModule: () => import("./series-circuit/index.js"),
  },

  {
    id: "acid-base-indicator",
    subject: "chemistry",
    stage: "junior",
    title: "酸碱指示剂与溶液性质",
    status: "available",
    duration: "约 25 分钟",
    difficulty: "B 级 · 规则观察",
    icon: "🧫",
    summary:
      "对 6 种模拟溶液分别滴加石蕊和酚酞，颜色变化由验证过的规则表驱动，填写观察记录表并归纳变色规律。",
    objectives: [
      "认识常见酸碱指示剂的变色规律",
      "学会根据现象判断溶液的酸碱性",
      "区分观察事实与实验结论",
    ],
    principle:
      "紫色石蕊遇酸变红、遇碱变蓝，中性呈紫色；无色酚酞遇碱变红，遇酸或中性不变色。变色结果来自经验证的规则表，而非 AI 随机生成。",
    equipment: ["6 种模拟溶液", "紫色石蕊试液", "无色酚酞试液", "试管与滴管"],
    safety: ["模拟实验无真实化学品；真实实验须佩戴护目镜并在教师指导下进行。"],
    loadModule: () => import("./acid-base-indicator/index.js"),
  },

  {
    id: "microscope-cells",
    subject: "biology",
    stage: "junior",
    title: "显微镜观察细胞",
    status: "available",
    duration: "约 30 分钟",
    difficulty: "B 级 · 图像观察",
    icon: "🔬",
    summary:
      "调节虚拟显微镜的目镜物镜、粗准焦螺旋与光圈，观察程序绘制的洋葱表皮和口腔上皮标本，正确标注细胞结构。",
    objectives: [
      "掌握显微镜的基本操作步骤",
      "识别细胞壁、细胞膜、细胞核等结构",
      "比较植物细胞与动物细胞结构的异同",
    ],
    principle:
      "显微镜放大倍数 = 目镜倍数 × 物镜倍数；成像清晰度由焦距偏差按规则判定，标本为程序绘制的教学示意图，结构判定由规则引擎完成。",
    equipment: ["虚拟显微镜", "洋葱表皮标本", "人口腔上皮细胞标本", "结构标签"],
    safety: ["取镜安放要轻拿轻放；观察真实标本时遵守实验室纪律。"],
    loadModule: () => import("./microscope-cells/index.js"),
  },

  {
    id: "seasons",
    subject: "geography",
    stage: "junior",
    title: "地球公转与四季形成",
    status: "available",
    sceneHash: "#laboratory/seasons",
    duration: "约 25 分钟",
    difficulty: "B 级 · 模型探究",
    icon: "🌗",
    summary:
      "拖动地球沿公转轨道运动，观察太阳直射点移动与昼夜半球变化；记录不同城市、不同节气的太阳高度和昼长数据。",
    objectives: [
      "理解地球公转与地轴倾斜方向不变的特点",
      "说出太阳直射点移动与昼夜长短变化的规律",
      "解释四季形成的根本原因",
    ],
    principle:
      "黄赤交角约 23.5°，公转中太阳直射点 δ=23.5°·sin θ 在南北回归线间移动；正午太阳高度 H=90°−|φ−δ|，昼长 L=12−(24/π)·arcsin(tan φ·tan δ)，均由公式实时计算。",
    equipment: ["日地运动二维模型", "太阳直射点标记", "数据记录表"],
    safety: ["纯虚拟观察实验，遵守课堂纪律即可。"],
    loadModule: () => import("./seasons/index.js"),
  },

  {
    id: "solar-system-scene",
    subject: "geography",
    stage: "junior",
    title: "太阳系 3D 观察（已有场景）",
    status: "available",
    externalHash: "#laboratory",
    duration: "自由探索",
    difficulty: "A 级 · 自由观察",
    icon: "🪐",
    summary:
      "已上线的 Three.js 太阳系三维场景：旋转、缩放、点击天体查看直径、自转与公转数据，作为地理实验的观察工具。",
    objectives: ["认识太阳与八大行星", "理解自转与公转", "比较行星的基本特征"],
    principle: "真实天文数据驱动的三维模型。",
    equipment: ["浏览器", "鼠标 / 触屏"],
    safety: [],
  },
];

export function getExperimentById(id) {
  return experiments.find((item) => item.id === id) || null;
}
