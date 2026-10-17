/*
 * 串联电路 —— 虚拟操作区（B 区）。
 * 纯 SVG 电路图 + 参数控件；单一状态源 state 驱动渲染。
 * 所有物理判定都委托 rules.js，本文件不做任何科学计算。
 */

import {
  TERMINALS,
  TERMINAL_LABELS,
  VOLTAGE_OPTIONS,
  RESISTANCE_OPTIONS,
  INITIAL_STATE,
  analyzeCircuit,
} from "./rules.js";

/* 接线柱在电路图中的坐标 */
const POINTS = {
  [TERMINALS.BATTERY_POS]: { x: 70, y: 120 },
  [TERMINALS.BATTERY_NEG]: { x: 70, y: 260 },
  [TERMINALS.SWITCH_1]: { x: 210, y: 70 },
  [TERMINALS.SWITCH_2]: { x: 340, y: 70 },
  [TERMINALS.BULB1_A]: { x: 440, y: 120 },
  [TERMINALS.BULB1_B]: { x: 540, y: 120 },
  [TERMINALS.BULB2_A]: { x: 540, y: 260 },
  [TERMINALS.BULB2_B]: { x: 440, y: 260 },
};

/* 电流表 a / b / c 三个测量点对应的导线端点与显示位置 */
export const AMMETER_POINTS = [
  {
    id: "a",
    label: "A 点",
    detail: "电源正极与开关之间",
    wire: [TERMINALS.BATTERY_POS, TERMINALS.SWITCH_1],
  },
  {
    id: "b",
    label: "B 点",
    detail: "灯泡 L₁ 与 L₂ 之间",
    wire: [TERMINALS.BULB1_B, TERMINALS.BULB2_A],
  },
  {
    id: "c",
    label: "C 点",
    detail: "灯泡 L₂ 与电源负极之间",
    wire: [TERMINALS.BULB2_B, TERMINALS.BATTERY_NEG],
  },
];

function cloneState(state) {
  return {
    ...state,
    wires: state.wires.map((wire) => [...wire]),
  };
}

function wireExists(state, a, b) {
  return state.wires.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/** 判断某条导线是否位于指定节点路径上。 */
function wireOnPath(wire, path) {
  if (!path) return false;

  return path.some((node, index) => {
    const next = path[index + 1];
    if (!next) return false;
    return (
      (node === wire[0] && next === wire[1]) ||
      (node === wire[1] && next === wire[0])
    );
  });
}

function midpoint(a, b) {
  return {
    x: (POINTS[a].x + POINTS[b].x) / 2,
    y: (POINTS[a].y + POINTS[b].y) / 2,
  };
}

export function createSimulator(rootEl, api = {}, initialState = null) {
  let state = initialState ? cloneState(initialState) : cloneState(INITIAL_STATE);
  let selectedTerminal = null;

  function emit(logType, logText) {
    if (logType && logText) api.log?.(logType, logText);
    const analysis = analyzeCircuit(state);
    api.onStateChange?.(cloneState(state), analysis);
    renderSvg(analysis);
    renderControls();
  }

  /* ---------------- 渲染：外壳 + 控件 ---------------- */

  function mount() {
    rootEl.innerHTML = `
      <div class="circuit-sim">
        <div class="circuit-toolbar">
          <label class="circuit-control">
            <span>电源电压</span>
            <select id="ctrl-voltage">
              ${VOLTAGE_OPTIONS.map(
                (v) => `
                <option value="${v}" ${state.voltage === v ? "selected" : ""}>
                  ${v} V（${v / 1.5} 节干电池）
                </option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>灯泡 L₁ 电阻</span>
            <select id="ctrl-r1">
              ${RESISTANCE_OPTIONS.map(
                (r) => `
                <option value="${r}" ${state.r1 === r ? "selected" : ""}>
                  ${r} Ω
                </option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>灯泡 L₂ 电阻</span>
            <select id="ctrl-r2">
              ${RESISTANCE_OPTIONS.map(
                (r) => `
                <option value="${r}" ${state.r2 === r ? "selected" : ""}>
                  ${r} Ω
                </option>`
              ).join("")}
            </select>
          </label>

          <button type="button" class="button button-secondary" id="ctrl-switch">
            ${state.switchClosed ? "断开开关" : "闭合开关"}
          </button>

          <button type="button" class="button button-secondary" id="ctrl-clear">
            清空导线
          </button>
        </div>

        <p class="circuit-hint">
          操作：先点一个接线柱（圆点），再点另一个即可连接导线；点击已有导线可以拆除。
        </p>

        <div class="circuit-canvas-wrap">
          <svg id="circuit-svg" viewBox="0 0 620 330"
               class="circuit-svg" role="img"
               aria-label="串联电路接线图"></svg>
        </div>
      </div>
    `;

    rootEl.querySelector("#ctrl-voltage").addEventListener("change", (event) => {
      state.voltage = Number(event.target.value);
      emit("param", `电源电压调整为 ${state.voltage} V`);
    });

    rootEl.querySelector("#ctrl-r1").addEventListener("change", (event) => {
      state.r1 = Number(event.target.value);
      emit("param", `灯泡 L₁ 电阻调整为 ${state.r1} Ω`);
    });

    rootEl.querySelector("#ctrl-r2").addEventListener("change", (event) => {
      state.r2 = Number(event.target.value);
      emit("param", `灯泡 L₂ 电阻调整为 ${state.r2} Ω`);
    });

    rootEl.querySelector("#ctrl-switch").addEventListener("click", () => {
      state.switchClosed = !state.switchClosed;
      emit(
        "switch",
        state.switchClosed ? "闭合开关" : "断开开关"
      );
    });

    rootEl.querySelector("#ctrl-clear").addEventListener("click", () => {
      if (state.wires.length === 0) return;
      state.wires = [];
      selectedTerminal = null;
      emit("wire", "拆除全部导线，重新开始连接");
    });

    const analysis = analyzeCircuit(state);
    api.onStateChange?.(cloneState(state), analysis);
    renderSvg(analysis);
    renderControls();
  }

  function renderControls() {
    const switchBtn = rootEl.querySelector("#ctrl-switch");
    if (switchBtn) {
      switchBtn.textContent = state.switchClosed ? "断开开关" : "闭合开关";
      switchBtn.classList.toggle("is-on", state.switchClosed);
    }
  }

  /* ---------------- 渲染：SVG 电路图 ---------------- */

  function renderSvg(analysis) {
    const svg = rootEl.querySelector("#circuit-svg");
    if (!svg) return;

    const activePath = analysis.path || null;

    const wireColor = (wire) => {
      if (analysis.code === "short" && wireOnPath(wire, activePath)) {
        return "#dc2626";
      }
      if (analysis.code === "valid" && wireOnPath(wire, activePath)) {
        return "#2563eb";
      }
      return "#94a3b8";
    };

    const ammeterPosition = api.getAmmeterPosition?.() || null;
    const ammeterPoint = AMMETER_POINTS.find(
      (point) => point.id === ammeterPosition
    );

    svg.innerHTML = `
      <defs>
        <radialGradient id="bulb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fde68a" stop-opacity="0.95"/>
          <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- 导线层 -->
      ${state.wires
        .map(([a, b]) => {
          const p1 = POINTS[a];
          const p2 = POINTS[b];
          const color = wireColor([a, b]);
          return `
            <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
                  stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
            <line class="wire-hit" data-wire-a="${a}" data-wire-b="${b}"
                  x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
                  stroke="transparent" stroke-width="20" stroke-linecap="round"
                  style="cursor:pointer"/>
          `;
        })
        .join("")}

      <!-- 电源 -->
      ${renderBattery()}

      <!-- 开关 -->
      ${renderSwitch()}

      <!-- 灯泡 -->
      ${renderBulb("l1", TERMINALS.BULB1_A, TERMINALS.BULB1_B, analysis.metrics?.brightness1 ?? 0, "L₁", state.r1)}
      ${renderBulb("l2", TERMINALS.BULB2_A, TERMINALS.BULB2_B, analysis.metrics?.brightness2 ?? 0, "L₂", state.r2)}

      <!-- 电流表位置标识 -->
      ${renderAmmeter(ammeterPoint)}

      <!-- 接线柱层 -->
      ${Object.entries(POINTS)
        .map(([node, point]) => {
          const isSelected = selectedTerminal === node;
          const isUnwired = analysis.unwiredTerminals.includes(node);
          return `
            <circle class="wire-node ${isSelected ? "is-selected" : ""} ${
              isUnwired ? "is-unwired" : ""
            }" data-node="${node}"
              cx="${point.x}" cy="${point.y}" r="9"/>
          `;
        })
        .join("")}
    `;

    /* 事件委托：接线柱点击连接，导线点击拆除 */

    svg.querySelectorAll(".wire-node").forEach((circle) => {
      circle.addEventListener("click", (event) => {
        event.stopPropagation();
        handleTerminalClick(circle.dataset.node);
      });

      circle.addEventListener("mouseenter", () => {
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = TERMINAL_LABELS[circle.dataset.node] || "";
        circle.appendChild(title);
      });
    });

    svg.querySelectorAll(".wire-hit").forEach((line) => {
      line.addEventListener("click", (event) => {
        event.stopPropagation();
        const a = line.dataset.wireA;
        const b = line.dataset.wireB;
        state.wires = state.wires.filter(
          ([x, y]) => !((x === a && y === b) || (x === b && y === a))
        );
        selectedTerminal = null;
        emit("wire", `拆除导线：${TERMINAL_LABELS[a]} ↔ ${TERMINAL_LABELS[b]}`);
      });
    });
  }

  function renderBattery() {
    const pos = POINTS[TERMINALS.BATTERY_POS];
    const neg = POINTS[TERMINALS.BATTERY_NEG];
    const midY = (pos.y + neg.y) / 2;

    return `
      <g>
        <line x1="${pos.x}" y1="${pos.y}" x2="${pos.x}" y2="${midY - 14}"
              stroke="#334155" stroke-width="3"/>
        <line x1="${pos.x}" y1="${neg.y}" x2="${pos.x}" y2="${midY + 22}"
              stroke="#334155" stroke-width="3"/>
        <line x1="${pos.x - 16}" y1="${midY - 8}" x2="${pos.x + 16}" y2="${midY - 8}"
              stroke="#334155" stroke-width="5" stroke-linecap="round"/>
        <line x1="${pos.x - 10}" y1="${midY + 14}" x2="${pos.x + 10}" y2="${midY + 14}"
              stroke="#334155" stroke-width="3" stroke-linecap="round"/>
        <text x="${pos.x - 24}" y="${midY - 14}" font-size="15" fill="#dc2626" font-weight="700">+</text>
        <text x="${pos.x - 24}" y="${midY + 22}" font-size="15" fill="#334155" font-weight="700">−</text>
        <text x="${pos.x - 34}" y="${midY + 52}" font-size="13" fill="#475569">电源 ${state.voltage}V</text>
      </g>
    `;
  }

  function renderSwitch() {
    const p1 = POINTS[TERMINALS.SWITCH_1];
    const p2 = POINTS[TERMINALS.SWITCH_2];

    const bladeEnd = state.switchClosed
      ? { x: p2.x, y: p2.y }
      : { x: p1.x + (p2.x - p1.x) * 0.72, y: p1.y - 26 };

    return `
      <g>
        <line x1="${p1.x}" y1="${p1.y}" x2="${bladeEnd.x}" y2="${bladeEnd.y}"
              stroke="#334155" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${p1.x}" cy="${p1.y}" r="3" fill="#334155"/>
        <circle cx="${p2.x}" cy="${p2.y}" r="3" fill="#334155"/>
        <text x="${(p1.x + p2.x) / 2 - 16}" y="${p1.y - 34}" font-size="13" fill="#475569">
          开关（${state.switchClosed ? "闭合" : "断开"}）
        </text>
      </g>
    `;
  }

  function renderBulb(id, terminalA, terminalB, brightness, label, resistance) {
    const pa = POINTS[terminalA];
    const pb = POINTS[terminalB];
    const cx = (pa.x + pb.x) / 2;
    const cy = (pa.y + pb.y) / 2;

    const glowRadius = [0, 30, 42, 54][brightness];
    const glowOpacity = [0, 0.5, 0.75, 1][brightness];

    return `
      <g>
        ${
          glowRadius
            ? `<circle cx="${cx}" cy="${cy}" r="${glowRadius}"
                fill="url(#bulb-glow)" opacity="${glowOpacity}"/>`
            : ""
        }
        <line x1="${pa.x}" y1="${pa.y}" x2="${cx - 18}" y2="${cy}"
              stroke="#334155" stroke-width="2.5"/>
        <line x1="${pb.x}" y1="${pb.y}" x2="${cx + 18}" y2="${cy}"
              stroke="#334155" stroke-width="2.5"/>
        <circle cx="${cx}" cy="${cy}" r="18" fill="#ffffff"
          stroke="#334155" stroke-width="2.5"/>
        <line x1="${cx - 12}" y1="${cy - 12}" x2="${cx + 12}" y2="${cy + 12}"
          stroke="#94a3b8" stroke-width="1.5"/>
        <line x1="${cx + 12}" y1="${cy - 12}" x2="${cx - 12}" y2="${cy + 12}"
          stroke="#94a3b8" stroke-width="1.5"/>
        <text x="${cx - 8}" y="${cy + 42}" font-size="13" fill="#475569">
          ${label}（${resistance}Ω）
        </text>
      </g>
    `;
  }

  function renderAmmeter(point) {
    if (!point) return "";
    if (!wireExists(state, point.wire[0], point.wire[1])) return "";

    const center = midpoint(point.wire[0], point.wire[1]);

    return `
      <g>
        <circle cx="${center.x}" cy="${center.y}" r="14" fill="#ffffff"
          stroke="#2563eb" stroke-width="2.5"/>
        <text x="${center.x}" y="${center.y + 5}" text-anchor="middle"
          font-size="14" font-weight="700" fill="#2563eb">A</text>
        <text x="${center.x}" y="${center.y - 20}" text-anchor="middle"
          font-size="12" fill="#2563eb" font-weight="700">${point.label}</text>
      </g>
    `;
  }

  /* ---------------- 交互 ---------------- */

  function handleTerminalClick(node) {
    if (!selectedTerminal) {
      selectedTerminal = node;
      renderSvg(analyzeCircuit(state));
      return;
    }

    if (selectedTerminal === node) {
      selectedTerminal = null;
      renderSvg(analyzeCircuit(state));
      return;
    }

    if (wireExists(state, selectedTerminal, node)) {
      // 已存在的导线不重复添加，仅取消选择
      selectedTerminal = null;
      renderSvg(analyzeCircuit(state));
      return;
    }

    state.wires.push([selectedTerminal, node]);
    const first = selectedTerminal;
    selectedTerminal = null;
    emit("wire", `连接导线：${TERMINAL_LABELS[first]} ↔ ${TERMINAL_LABELS[node]}`);
  }

  function getState() {
    return cloneState(state);
  }

  /** 外部状态（如电流表位置）变化后，仅重绘视图，不改变电路状态。 */
  function refreshView() {
    renderSvg(analyzeCircuit(state));
    renderControls();
  }

  function destroy() {
    rootEl.innerHTML = "";
  }

  return { mount, destroy, getState, refreshView };
}
