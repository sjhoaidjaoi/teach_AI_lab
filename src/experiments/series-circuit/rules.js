/*
 * 串联电路实验 —— 纯物理规则引擎（与界面、AI 完全解耦）。
 *
 * 输入：电路连接状态（导线、开关、电源电压、灯泡电阻）
 * 输出：电路状态诊断 + 按欧姆定律计算的测量值
 *
 * 该模块不依赖 DOM，也不调用 AI，可直接用 Node 单测验证。
 */

export const TERMINALS = {
  BATTERY_POS: "b+",
  BATTERY_NEG: "b-",
  SWITCH_1: "s1",
  SWITCH_2: "s2",
  BULB1_A: "l1a",
  BULB1_B: "l1b",
  BULB2_A: "l2a",
  BULB2_B: "l2b",
};

export const TERMINAL_LABELS = {
  "b+": "电源正极",
  "b-": "电源负极",
  s1: "开关接线柱 1",
  s2: "开关接线柱 2",
  l1a: "灯泡 L₁ 接线柱 A",
  l1b: "灯泡 L₁ 接线柱 B",
  l2a: "灯泡 L₂ 接线柱 A",
  l2b: "灯泡 L₂ 接线柱 B",
};

export const VOLTAGE_OPTIONS = [1.5, 3, 4.5, 6];
export const RESISTANCE_OPTIONS = [5, 10, 15];

export const INITIAL_STATE = {
  voltage: 3,
  r1: 10,
  r2: 10,
  switchClosed: false,
  wires: [],
};

const ALL_TERMINALS = Object.values(TERMINALS);

/** 根据功率给出定性亮度等级（仅用于灯泡视觉表现，不参与测量读数）。 */
function brightnessLevel(power) {
  if (power < 0.05) return 0; // 不发光
  if (power < 0.15) return 1; // 灯丝微红
  if (power < 0.45) return 2; // 较亮
  return 3; // 很亮
}

/**
 * 在“外电路”图上枚举 start → end 的全部简单路径。
 * 注意：不经过电源内部那条边——回路必须经由外电路器材构成。
 *
 * 边的格式：{ a, b, tag }，tag 为 wire / switch / bulb1 / bulb2。
 */
function enumeratePaths(state) {
  const edges = [];

  state.wires.forEach(([a, b]) => {
    edges.push({ a, b, tag: "wire" });
  });

  if (state.switchClosed) {
    edges.push({ a: TERMINALS.SWITCH_1, b: TERMINALS.SWITCH_2, tag: "switch" });
  }

  edges.push({ a: TERMINALS.BULB1_A, b: TERMINALS.BULB1_B, tag: "bulb1" });
  edges.push({ a: TERMINALS.BULB2_A, b: TERMINALS.BULB2_B, tag: "bulb2" });

  const adjacency = new Map();

  edges.forEach(({ a, b, tag }) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ node: b, tag });
    adjacency.get(b).push({ node: a, tag });
  });

  const paths = [];

  function dfs(current, visitedNodes, usedEdges) {
    if (current === TERMINALS.BATTERY_NEG) {
      paths.push({ nodes: [...visitedNodes], tags: usedEdges.map((e) => e.tag) });
      return;
    }

    for (const { node, tag } of adjacency.get(current) || []) {
      if (visitedNodes.has(node)) continue;
      visitedNodes.add(node);
      usedEdges.push({ tag });
      dfs(node, visitedNodes, usedEdges);
      usedEdges.pop();
      visitedNodes.delete(node);
    }
  }

  dfs(TERMINALS.BATTERY_POS, new Set([TERMINALS.BATTERY_POS]), []);
  return paths;
}

/** 统计各接线柱上连接的导线数量。 */
function wireDegrees(state) {
  const degree = new Map(ALL_TERMINALS.map((node) => [node, 0]));

  state.wires.forEach(([a, b]) => {
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  });

  return degree;
}

/**
 * 规则引擎主函数。
 *
 * 返回 code：
 * - valid        规范的串联通路
 * - short        短路（存在不经过任何灯泡就回到负极的路径）
 * - open-switch  接线完整但开关断开
 * - incomplete   器材未接完整（存在悬空接线柱）
 * - open-circuit 开关闭合但仍构不成回路（导线缺失/接错）
 * - non-series   构成了回路，但不是规范的串联（有多余路径/并联接法）
 */
export function analyzeCircuit(state) {
  const degree = wireDegrees(state);
  const unwired = ALL_TERMINALS.filter((node) => degree.get(node) === 0);

  const paths = enumeratePaths(state);

  /* ---------- 短路优先判定：存在一条不经过任何灯泡的回路 ---------- */

  const shortPath = paths.find((path) => !path.tags.includes("bulb1") && !path.tags.includes("bulb2"));

  if (shortPath) {
    return {
      code: "short",
      statusText: "短路！",
      ammeterReadable: false,
      errors: [
        {
          code: "short",
          message:
            "电源正负极之间存在不经过灯泡的导线，这是短路。短路电流极大，会烧坏电源，请立即断开开关并拆除多余导线。",
        },
      ],
      unwiredTerminals: unwired,
      path: shortPath.nodes,
      metrics: null,
    };
  }

  /* ---------- 规范串联回路判定 ---------- */

  const canonicalPath = paths.find((path) => {
    const tags = path.tags;
    const coversAllNodes = ALL_TERMINALS.every((node) => path.nodes.includes(node));

    const count = (tag) => tags.filter((item) => item === tag).length;

    return (
      coversAllNodes &&
      count("bulb1") === 1 &&
      count("bulb2") === 1 &&
      count("switch") === 1 &&
      tags.length === 7 // 4 条导线 + 开关 + 2 只灯泡
    );
  });

  if (canonicalPath && paths.length === 1) {
    const totalR = state.r1 + state.r2;
    const current = state.voltage / totalR;
    const u1 = current * state.r1;
    const u2 = current * state.r2;
    const power1 = current * current * state.r1;
    const power2 = current * current * state.r2;

    return {
      code: "valid",
      statusText: "串联通路",
      ammeterReadable: true,
      errors: [],
      unwiredTerminals: [],
      path: canonicalPath.nodes,
      metrics: {
        totalResistance: round(totalR),
        current: round(current, 3),
        voltage1: round(u1, 2),
        voltage2: round(u2, 2),
        power1: round(power1, 3),
        power2: round(power2, 3),
        brightness1: brightnessLevel(power1),
        brightness2: brightnessLevel(power2),
      },
    };
  }

  /* ---------- 无回路时的细分诊断 ---------- */

  if (paths.length === 0) {
    if (unwired.length > 0) {
      return {
        code: "incomplete",
        statusText: "电路未接完整",
        ammeterReadable: false,
        errors: [
          {
            code: "incomplete",
            message: `还有接线柱没有连接导线：${unwired
              .map((node) => TERMINAL_LABELS[node])
              .join("、")}。请参照电路图把器材依次接入回路。`,
          },
        ],
        unwiredTerminals: unwired,
        metrics: null,
      };
    }

    if (!state.switchClosed) {
      return {
        code: "open-switch",
        statusText: "断路（开关断开）",
        ammeterReadable: true,
        errors: [
          {
            code: "open-switch",
            message: "电路接线已经完整，但开关处于断开状态，电路中没有电流。闭合开关试试。",
          },
        ],
        unwiredTerminals: [],
        metrics: {
          totalResistance: round(state.r1 + state.r2),
          current: 0,
          voltage1: 0,
          voltage2: 0,
          power1: 0,
          power2: 0,
          brightness1: 0,
          brightness2: 0,
        },
      };
    }

    return {
      code: "open-circuit",
      statusText: "断路",
      ammeterReadable: false,
      errors: [
        {
          code: "open-circuit",
          message:
            "开关虽然闭合，但电流无法从正极回到负极。请检查导线连接顺序：电源 → 开关 → L₁ → L₂ → 电源，组成一个闭合的环。",
        },
      ],
      unwiredTerminals: [],
      metrics: null,
    };
  }

  /* ---------- 有回路但不是规范串联（并联 / 多余导线） ---------- */

  return {
    code: "non-series",
    statusText: "不是规范的串联电路",
    ammeterReadable: false,
    errors: [
      {
        code: "non-series",
        message:
          "电流出现了不止一条路径，或有灯泡被导线旁路。本实验要求两只灯泡首尾相连组成串联电路，请拆除多余的导线，保证回路中只有一条路径。",
      },
    ],
    unwiredTerminals: unwired,
    metrics: null,
  };
}

/** 电流表在指定测量点的读数；无有效电流时返回 0，短路/错误状态返回 null。 */
export function readAmmeter(analysis) {
  if (!analysis || !analysis.ammeterReadable || !analysis.metrics) return null;
  return analysis.metrics.current;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
