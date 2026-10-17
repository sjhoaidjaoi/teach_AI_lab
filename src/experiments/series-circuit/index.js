/*
 * “探究串联电路中的电流规律”实验模块（契约 v2）。
 *
 * 本模块自带：步骤定义、物理状态、规则引擎、B 区操作界面、C 区测量界面。
 * AI 只通过 describe()/buildAiRecords() 读取真实数据，不参与计算。
 */

import {
  TERMINAL_LABELS,
  analyzeCircuit,
} from "./rules.js";
import { createSimulator, AMMETER_POINTS } from "./simulator.js";
import { createThreeOperation } from "./three-operation.js";

export const STEPS = [
  {
    id: "connect",
    title: "连接电路",
    detail: "用导线依次连接：电源正极 → 开关 → 灯泡 L₁ → 灯泡 L₂ → 电源负极。连接时开关保持断开。",
  },
  {
    id: "check",
    title: "检查电路并闭合开关",
    detail: "检查接线无误后闭合开关，使两只灯泡发光。如果出现短路或断路，请根据诊断排查。",
  },
  {
    id: "measure",
    title: "测量 A、B、C 三处电流",
    detail: "把电流表依次接入 A 点（电源与开关之间）、B 点（L₁ 与 L₂ 之间）、C 点（L₂ 与电源之间），分别读数并保存一组数据。",
  },
  {
    id: "repeat",
    title: "改变条件再次测量",
    detail: "更换电源电压或灯泡电阻，再测量并保存至少两组数据，避免结论的偶然性。",
  },
  {
    id: "conclude",
    title: "分析数据，得出结论",
    detail: "比较每组数据中三处电流的大小关系，写出串联电路电流规律的结论。",
  },
];

function createInitialState() {
  return {
    voltage: 3,
    r1: 10,
    r2: 10,
    switchClosed: false,
    wires: [],
  };
}

function createData() {
  return {
    trials: [],
    draft: { a: null, b: null, c: null },
    ammeterPosition: "a",
  };
}

/* ---------------- B 区：接线操作（3D 实验台 / 2D 电路图双视图） ---------------- */

let preferredViewMode = "3d";

function cloneCircuitState(source) {
  return {
    ...source,
    wires: source.wires.map((wire) => [...wire]),
  };
}

function mountOperation(rootEl, api, initialState) {
  let mode = preferredViewMode;
  let active = null;
  let host = null;

  function mountActive(state) {
    if (active?.destroy) active.destroy();
    host.innerHTML = "";
    active =
      mode === "3d"
        ? createThreeOperation(host, api, state)
        : createSimulator(host, api, state);
    active.mount();
  }

  function mount() {
    rootEl.innerHTML = `
      <div class="vlab-op-view">
        <div class="vlab-op-switch">
          <span class="vlab-op-switch-label">操作视图</span>
          <div class="vlab-op-modes">
            <button type="button" class="vlab-op-mode ${
              mode === "3d" ? "is-active" : ""
            }" data-view-mode="3d">🧊 3D 实验台</button>
            <button type="button" class="vlab-op-mode ${
              mode === "2d" ? "is-active" : ""
            }" data-view-mode="2d">📐 2D 电路图</button>
          </div>
        </div>
        <div class="vlab-op-host"></div>
      </div>
    `;
    host = rootEl.querySelector(".vlab-op-host");

    rootEl.querySelectorAll("[data-view-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.dataset.viewMode;
        if (next === mode || !active) return;
        /* 切换前保存当前电路状态，保证两个视图无缝衔接 */
        const saved = active.getState();
        mode = next;
        preferredViewMode = next;
        rootEl.querySelectorAll("[data-view-mode]").forEach((item) => {
          item.classList.toggle("is-active", item.dataset.viewMode === mode);
        });
        mountActive(saved);
      });
    });

    mountActive(initialState ? cloneCircuitState(initialState) : null);
  }

  /* 与旧契约保持一致：mountOperation 返回时 B 区已完成挂载 */
  mount();

  return {
    mount,
    destroy() {
      active?.destroy?.();
      active = null;
      rootEl.innerHTML = "";
    },
    getState() {
      return active.getState();
    },
    refreshView() {
      active?.refreshView?.();
    },
  };
}

/* ---------------- C 区：电流测量 ---------------- */

function mountMeasure(rootEl, api) {
  let el = rootEl;

  function refresh() {
    const snap = api.snapshot();
    render(snap);
  }

  function render(snap) {
    const { state, analysis, description } = snap;
    const data = api.getData();
    const STATUS_CLASS = {
      valid: "vlab-status-ok",
      short: "vlab-status-danger",
      "open-switch": "vlab-status-warn",
      incomplete: "vlab-status-warn",
      "open-circuit": "vlab-status-warn",
      "non-series": "vlab-status-danger",
    };
    const statusClass = STATUS_CLASS[description.code] || "vlab-status-warn";

    const metricsRows = description.measurements
      .map(
        (item) => `
        <tr>
          <td>${item.label}</td>
          <td class="vlab-num">${item.value}</td>
          <td>${item.unit}</td>
        </tr>`
      )
      .join("");

    const draftRows = AMMETER_POINTS.map((point) => {
      const value = data.draft[point.id];
      return `
        <tr>
          <td>${point.label}（${point.detail}）</td>
          <td class="vlab-num">${value === null || value === undefined ? "—" : value}</td>
          <td>A</td>
        </tr>`;
    }).join("");

    const trialRows = data.trials
      .map(
        (trial) => `
        <tr>
          <td>${trial.index}</td>
          <td class="vlab-num">${trial.voltage}</td>
          <td class="vlab-num">${trial.r1}</td>
          <td class="vlab-num">${trial.r2}</td>
          <td class="vlab-num">${trial.a}</td>
          <td class="vlab-num">${trial.b}</td>
          <td class="vlab-num">${trial.c}</td>
          <td>${
            trial.equal
              ? '<span class="vlab-badge vlab-badge-ok">相等</span>'
              : '<span class="vlab-badge vlab-badge-bad">不等</span>'
          }</td>
          <td><button type="button" class="button button-secondary vlab-small-btn"
                data-delete-trial="${trial.index}">删除</button></td>
        </tr>`
      )
      .join("");

    const canSave = AMMETER_POINTS.every(
      (point) =>
        data.draft[point.id] !== null && data.draft[point.id] !== undefined
    );

    el.innerHTML = `
      <div class="vlab-status-pill ${statusClass}">
        <strong>系统判定：${description.statusText}</strong>
        <span>${description.parameterSummary}</span>
      </div>

      ${
        description.errors.length
          ? `<ul class="vlab-diagnostics">
               ${description.errors.map((msg) => `<li>${msg}</li>`).join("")}
             </ul>`
          : ""
      }

      <div class="vlab-measure-grid">
        <div>
          <h3>实时测量值（规则引擎计算）</h3>
          <table class="vlab-table">
            <thead><tr><th>物理量</th><th>数值</th><th>单位</th></tr></thead>
            <tbody>
              ${
                metricsRows ||
                `<tr><td colspan="3" class="vlab-empty">当前电路状态下没有可显示的测量值</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div>
          <h3>电流表读数</h3>
          <div class="vlab-pos-switch">
            ${AMMETER_POINTS.map(
              (point) => `
              <button type="button" data-pos="${point.id}"
                class="vlab-pos-btn ${
                  data.ammeterPosition === point.id ? "is-active" : ""
                }">
                ${point.label}
              </button>`
            ).join("")}
          </div>
          <p class="vlab-pos-detail">
            ${AMMETER_POINTS.find((p) => p.id === data.ammeterPosition)?.detail || ""}
          </p>

          <table class="vlab-table">
            <thead><tr><th>测量位置</th><th>示数</th><th>单位</th></tr></thead>
            <tbody>${draftRows}</tbody>
          </table>

          <div class="vlab-measure-actions">
            <button type="button" class="button button-primary" id="vlab-read-btn">
              读取电流表示数
            </button>
            <button type="button" class="button button-secondary"
              id="vlab-save-trial-btn" ${canSave ? "" : "disabled"}>
              保存本组数据
            </button>
          </div>
        </div>
      </div>

      <h3>已保存的测量数据</h3>
      <div class="vlab-table-wrap">
        <table class="vlab-table vlab-trial-table">
          <thead>
            <tr>
              <th>组次</th><th>U/V</th><th>R₁/Ω</th><th>R₂/Ω</th>
              <th>I_A/A</th><th>I_B/A</th><th>I_C/A</th><th>比较</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${
              trialRows ||
              `<tr><td colspan="9" class="vlab-empty">还没有保存数据，完成一次三处读数后点击“保存本组数据”</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    bind();
  }

  function bind() {
    el.querySelectorAll("[data-pos]").forEach((button) => {
      button.addEventListener("click", () => {
        const data = api.getData();
        data.ammeterPosition = button.dataset.pos;
        api.onChange();
        refresh();
      });
    });

    el.querySelector("#vlab-read-btn")?.addEventListener("click", () => {
      const snap = api.snapshot();
      const data = api.getData();
      const position = data.ammeterPosition;
      const value = snap.analysis.metrics?.current ?? null;

      if (value === null || !snap.analysis.ammeterReadable) {
        const reason = snap.description.errors[0] || "当前电路状态无法读数。";
        api.showToast(`电流表无示数：${reason}`);
        api.log(
          "measure",
          `在 ${position.toUpperCase()} 点尝试读数：电流表无示数（${snap.description.statusText}）`
        );
        return;
      }

      data.draft[position] = value;
      api.log(
        "measure",
        `在 ${position.toUpperCase()} 点读取电流表示数：I = ${value} A`
      );
      api.onChange();
      refresh();
    });

    el.querySelector("#vlab-save-trial-btn")?.addEventListener("click", () => {
      const snap = api.snapshot();
      const data = api.getData();
      const { a, b, c } = data.draft;

      if ([a, b, c].some((value) => value === null || value === undefined)) {
        api.showToast("请先在 A、B、C 三个位置分别读取电流表示数，再保存本组数据。");
        return;
      }

      const equal = a === b && b === c;
      const trial = {
        index: (data.trials[data.trials.length - 1]?.index || 0) + 1,
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        voltage: snap.state.voltage,
        r1: snap.state.r1,
        r2: snap.state.r2,
        a,
        b,
        c,
        equal,
      };

      data.trials.push(trial);
      data.draft = { a: null, b: null, c: null };
      api.log(
        "measure",
        `保存第 ${trial.index} 组数据：U=${trial.voltage}V，Ia=${trial.a}A，Ib=${trial.b}A，Ic=${trial.c}A（${
          equal ? "三处相等" : "三处不相等，请检查接线"
        }）`
      );
      api.onChange();
      refresh();
    });

    el.querySelectorAll("[data-delete-trial]").forEach((button) => {
      button.addEventListener("click", () => {
        const data = api.getData();
        const index = Number(button.dataset.deleteTrial);
        data.trials = data.trials.filter((trial) => trial.index !== index);
        api.log("measure", `删除第 ${index} 组数据`);
        api.onChange();
        refresh();
      });
    });
  }

  function destroy() {
    el.innerHTML = "";
  }

  refresh();
  return { refresh, destroy };
}

/* ---------------- 描述与判定 ---------------- */

function describe(state, analysis) {
  const measurements = [];

  if (analysis.metrics) {
    measurements.push(
      { label: "总电阻 R", value: analysis.metrics.totalResistance, unit: "Ω" },
      { label: "电路电流 I", value: analysis.metrics.current, unit: "A" },
      { label: "灯泡 L₁ 两端电压 U₁", value: analysis.metrics.voltage1, unit: "V" },
      { label: "灯泡 L₂ 两端电压 U₂", value: analysis.metrics.voltage2, unit: "V" }
    );
  }

  return {
    code: analysis.code,
    statusText: analysis.statusText,
    errors: analysis.errors.map((item) => item.message),
    ammeterReadable: analysis.ammeterReadable,
    measurements,
    parameterSummary:
      `电源电压 U=${state.voltage} V，灯泡电阻 R₁=${state.r1} Ω、R₂=${state.r2} Ω，` +
      `开关${state.switchClosed ? "闭合" : "断开"}，已连接导线 ${state.wires.length} 根`,
  };
}

function isStepDone(stepId, ctx = {}) {
  const { state, analysis, data = {}, conclusion = "", everValid = false } = ctx;

  switch (stepId) {
    case "connect":
      return state.wires.length >= 4;
    case "check":
      return everValid || analysis.code === "valid";
    case "measure":
      return data.trials.length >= 1;
    case "repeat":
      return data.trials.length >= 2;
    case "conclude":
      return conclusion.trim().length >= 10;
    default:
      return false;
  }
}

function buildReportData(data) {
  return {
    headers: ["组次", "时间", "U/V", "R₁/Ω", "R₂/Ω", "I_A/A", "I_B/A", "I_C/A", "三处比较"],
    rows: data.trials.map((trial) => [
      trial.index,
      trial.time,
      trial.voltage,
      trial.r1,
      trial.r2,
      trial.a,
      trial.b,
      trial.c,
      trial.equal ? "相等" : "不等",
    ]),
  };
}

export default {
  id: "series-circuit",
  steps: STEPS,
  ammeterPoints: AMMETER_POINTS,
  createInitialState,
  createData,
  analyze: analyzeCircuit,
  mountOperation,
  mountMeasure,
  describe,
  isStepDone,
  buildReportData,
  buildAiRecords: buildReportData,
  TERMINAL_LABELS,
};
