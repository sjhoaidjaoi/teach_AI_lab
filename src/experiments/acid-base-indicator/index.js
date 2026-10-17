/*
 * 化学实验“酸碱指示剂与溶液性质”模块（契约 v2）。
 * B 区：选溶液 → 选指示剂 → 滴加，颜色由 rules.js 查表得出；
 * C 区：实时观察结果 + 六种溶液观察记录表。
 */

import {
  SOLUTIONS,
  INDICATORS,
  PROPERTY_LABELS,
  getSolutionById,
  getIndicatorById,
  observe,
} from "./rules.js";

export const STEPS = [
  {
    id: "first",
    title: "滴加指示剂并观察",
    detail: "选择一种模拟溶液和一种指示剂，点击“滴加指示剂”，仔细观察试管中颜色的变化。",
  },
  {
    id: "all-solutions",
    title: "完成 6 种溶液的滴加观察",
    detail: "依次对 6 种溶液滴加指示剂，每观察一种就点击“记录观察结果”，填满观察记录表。",
  },
  {
    id: "both-indicators",
    title: "对比两种指示剂",
    detail: "至少对 3 种溶液分别滴加石蕊和酚酞，比较两种指示剂变色规律的异同。",
  },
  {
    id: "conclude",
    title: "归纳变色规律，得出结论",
    detail: "根据观察记录表总结：石蕊遇酸、碱分别呈什么颜色？酚酞呢？怎样判断溶液的酸碱性？",
  },
];

function createInitialState() {
  return {
    solutionId: "vinegar",
    indicatorId: "litmus",
    dripped: false, // 当前组合是否已滴加
  };
}

function createData() {
  return {
    observations: [], // {solutionId, indicatorId, colorLabel, time}
  };
}

/* ---------------- B 区：滴加操作 ---------------- */

function mountOperation(rootEl, api, initialState) {
  let state = { ...createInitialState(), ...initialState };

  function render() {
    const analysis = analyze(state);
    rootEl.innerHTML = `
      <div class="chem-sim">
        <div class="circuit-toolbar">
          <label class="circuit-control">
            <span>模拟溶液</span>
            <select id="chem-solution">
              ${SOLUTIONS.map(
                (s) => `<option value="${s.id}" ${state.solutionId === s.id ? "selected" : ""}>${s.name}</option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>指示剂</span>
            <select id="chem-indicator">
              ${Object.values(INDICATORS)
                .map(
                  (i) => `<option value="${i.id}" ${state.indicatorId === i.id ? "selected" : ""}>${i.name}</option>`
                )
                .join("")}
            </select>
          </label>

          <button type="button" class="button button-primary" id="chem-drip-btn">
            ${state.dripped ? "再次滴加" : "滴加指示剂"}
          </button>
        </div>

        <p class="circuit-hint">
          操作：选择溶液和指示剂后点击“滴加指示剂”，观察颜色变化；
          颜色由指示剂变色规则表决定，换一种溶液再试试。
        </p>

        <div class="chem-stage">
          <svg viewBox="0 0 260 300" class="chem-svg" role="img" aria-label="滴加指示剂的试管">
            <defs>
              <linearGradient id="tube-glass" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#e2e8f0"/>
                <stop offset="0.15" stop-color="#ffffff"/>
                <stop offset="0.85" stop-color="#f1f5f9"/>
                <stop offset="1" stop-color="#cbd5e1"/>
              </linearGradient>
            </defs>

            <!-- 铁架台底座与支架 -->
            <rect x="20" y="270" width="150" height="10" rx="4" fill="#64748b"/>
            <rect x="42" y="70" width="8" height="204" rx="3" fill="#64748b"/>
            <rect x="42" y="120" width="50" height="7" rx="3" fill="#64748b"/>

            <!-- 试管夹 -->
            <rect x="86" y="118" width="52" height="11" rx="3" fill="#94a3b8"/>

            <!-- 试管 -->
            <path d="M100 40 L100 220 A32 32 0 0 0 164 220 L164 40 Z"
              fill="url(#tube-glass)" stroke="#94a3b8" stroke-width="2"/>
            <ellipse cx="132" cy="40" rx="32" ry="7" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>

            <!-- 液体 -->
            <g id="chem-liquid">
              <path id="chem-liquid-body" d="M102 150 L102 220 A30 30 0 0 0 162 220 L162 150 Z"
                fill="${liquidColor()}" style="transition: fill 0.6s ease"/>
            </g>

            <!-- 液面 -->
            <line x1="102" y1="150" x2="162" y2="150" stroke="#94a3b8" stroke-width="1.5" opacity="0.6"/>

            <!-- 滴管 -->
            <g id="chem-dropper" transform="translate(132,0)">
              <g class="chem-dropper-body">
                <rect x="-7" y="8" width="14" height="52" rx="7" fill="#dbeafe" stroke="#60a5fa" stroke-width="2"/>
                <path d="M-3 60 L0 78 L3 60 Z" fill="#60a5fa"/>
                <rect x="-9" y="-8" width="18" height="10" rx="4" fill="#93c5fd"/>
              </g>
              <g id="chem-drops" class="chem-drops"></g>
            </g>

            <text x="132" y="292" text-anchor="middle" font-size="13" fill="#475569">
              ${getSolutionById(state.solutionId)?.name || ""}（约 10 mL）
            </text>
          </svg>

          <div class="chem-current">
            ${
              state.dripped
                ? `
              <span class="vlab-badge vlab-badge-ok">已滴加</span>
              <p class="chem-result-text">
                颜色变化：<strong style="color:${observe(state.solutionId, state.indicatorId)?.colorCss === "rgba(226,232,240,0.55)" ? "#64748b" : observe(state.solutionId, state.indicatorId)?.colorCss}">
                ${observe(state.solutionId, state.indicatorId)?.colorLabel || "—"}</strong>
              </p>`
                : `<span class="vlab-badge vlab-badge-wait">未滴加</span>
              <p class="chem-result-text">试管中是纯净的模拟溶液，等待滴加指示剂……</p>`
            }
          </div>
        </div>
      </div>
    `;

    bind();
  }

  function liquidColor() {
    if (!state.dripped) return "#e0f2fe";
    return observe(state.solutionId, state.indicatorId)?.colorCss || "#e0f2fe";
  }

  function drip() {
    const result = observe(state.solutionId, state.indicatorId);
    if (!result) return;

    state.dripped = true;
    api.log("operate", `向 ${result.solutionName} 中滴加 ${result.indicatorName}`);
    render();
    api.onStateChange({ ...state }, analyze(state));

    // 液体变色后弹出水滴动画提示
    const drops = rootEl.querySelector("#chem-drops");
    if (drops) {
      drops.innerHTML = `
        <circle class="chem-drop" cx="0" cy="80" r="3" fill="#60a5fa"/>
        <circle class="chem-drop chem-drop-2" cx="0" cy="80" r="3" fill="#93c5fd"/>
      `;
      setTimeout(() => {
        if (drops) drops.innerHTML = "";
      }, 1400);
    }
  }

  function bind() {
    rootEl.querySelector("#chem-solution")?.addEventListener("change", (event) => {
      state.solutionId = event.target.value;
      state.dripped = false;
      api.log("operate", `更换模拟溶液为：${getSolutionById(state.solutionId)?.name}`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#chem-indicator")?.addEventListener("change", (event) => {
      state.indicatorId = event.target.value;
      state.dripped = false;
      api.log("operate", `选择指示剂：${getIndicatorById(state.indicatorId)?.name}`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#chem-drip-btn")?.addEventListener("click", drip);
  }

  function getState() {
    return { ...state };
  }

  function destroy() {
    rootEl.innerHTML = "";
  }

  render();
  return { mount() {}, destroy, getState };
}

/* ---------------- C 区：观察记录 ---------------- */

function mountMeasure(rootEl, api) {
  let el = rootEl;

  function refresh() {
    render(api.snapshot());
  }

  function render(snap) {
    const data = api.getData();
    const state = snap.state;
    const current = observe(state.solutionId, state.indicatorId);
    const recordable =
      state.dripped &&
      !data.observations.some(
        (item) =>
          item.solutionId === state.solutionId &&
          item.indicatorId === state.indicatorId
      );

    // 观察记录表：行=溶液，列=石蕊/酚酞/酸碱性
    const gridRows = SOLUTIONS.map((solution) => {
      const litmus = data.observations.find(
        (item) => item.solutionId === solution.id && item.indicatorId === "litmus"
      );
      const phen = data.observations.find(
        (item) => item.solutionId === solution.id && item.indicatorId === "phenolphthalein"
      );
      const tested = data.observations.some((item) => item.solutionId === solution.id);

      const cell = (obs) =>
        obs
          ? `<span class="chem-color-dot" style="background:${obs.colorCss === "rgba(226,232,240,0.55)" ? "#f1f5f9" : obs.colorCss}; border:1px solid #cbd5e1"></span>${escapeHtml(obs.colorLabel)}`
          : '<span class="vlab-empty-inline">未观察</span>';

      return `
        <tr>
          <td>${solution.name}</td>
          <td>${cell(litmus)}</td>
          <td>${cell(phen)}</td>
          <td>${tested ? `<span class="vlab-badge vlab-badge-ok">${PROPERTY_LABELS[solution.property]}</span>` : '<span class="vlab-empty-inline">？</span>'}</td>
          <td>${solution.ph}</td>
          <td><button type="button" class="button button-secondary vlab-small-btn"
              data-remove-obs="${solution.id}">清除</button></td>
        </tr>`;
    }).join("");

    el.innerHTML = `
      <div class="vlab-status-pill vlab-status-ok">
        <strong>规则引擎判定：${
          state.dripped
            ? `已观察：${current?.solutionName} + ${current?.indicatorName} → ${current?.colorLabel}`
            : "等待滴加指示剂"
        }</strong>
        <span>${snap.description.parameterSummary}</span>
      </div>

      <div class="vlab-measure-grid">
        <div>
          <h3>当前观察结果</h3>
          <table class="vlab-table">
            <tbody>
              <tr><td>模拟溶液</td><td>${current?.solutionName}</td></tr>
              <tr><td>指示剂</td><td>${current?.indicatorName}</td></tr>
              <tr><td>颜色变化</td><td>
                <span class="chem-color-dot" style="background:${
                  current?.colorCss === "rgba(226,232,240,0.55)" ? "#f1f5f9" : current?.colorCss
                }; border:1px solid #cbd5e1"></span>
                ${current?.colorLabel}
              </td></tr>
              <tr><td>pH（模拟值）</td><td class="vlab-num">${current?.ph}</td></tr>
            </tbody>
          </table>
          <div class="vlab-measure-actions">
            <button type="button" class="button button-primary" id="chem-record-btn"
              ${recordable ? "" : "disabled"}>
              记录观察结果
            </button>
            <span class="vlab-report-hint">${
              state.dripped
                ? recordable
                  ? "把这次观察写入下方记录表"
                  : "该组合已记录"
                : "请先在操作区滴加指示剂"
            }</span>
          </div>
        </div>

        <div>
          <h3>观察进度</h3>
          <p class="chem-progress-text">
            已观察 <strong>${new Set(data.observations.map((o) => o.solutionId)).size}/6</strong> 种溶液，
            双指示剂对比 <strong>${
              SOLUTIONS.filter(
                (s) =>
                  data.observations.some((o) => o.solutionId === s.id && o.indicatorId === "litmus") &&
                  data.observations.some((o) => o.solutionId === s.id && o.indicatorId === "phenolphthalein")
              ).length
            }/6</strong> 种
          </p>
          <p class="chem-progress-text">
            记录满 6 种溶液后，试着归纳：什么颜色代表酸性？什么颜色代表碱性？
          </p>
        </div>
      </div>

      <h3>观察记录表（规则引擎自动判定酸碱性）</h3>
      <div class="vlab-table-wrap">
        <table class="vlab-table">
          <thead>
            <tr><th>溶液</th><th>紫色石蕊现象</th><th>无色酚酞现象</th><th>酸碱性</th><th>pH</th><th></th></tr>
          </thead>
          <tbody>${gridRows}</tbody>
        </table>
      </div>
    `;

    bind();
  }

  function bind() {
    el.querySelector("#chem-record-btn")?.addEventListener("click", () => {
      const snap = api.snapshot();
      const data = api.getData();
      const current = observe(snap.state.solutionId, snap.state.indicatorId);

      if (!current) return;

      data.observations.push({
        solutionId: current.solutionId,
        indicatorId: current.indicatorId,
        colorCss: current.colorCss,
        colorLabel: current.colorLabel,
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });

      api.log(
        "measure",
        `记录观察：${current.solutionName} + ${current.indicatorName} → ${current.colorLabel}`
      );
      api.onChange();
      refresh();
    });

    el.querySelectorAll("[data-remove-obs]").forEach((button) => {
      button.addEventListener("click", () => {
        const data = api.getData();
        const sid = button.dataset.removeObs;
        data.observations = data.observations.filter((item) => item.solutionId !== sid);
        api.log("measure", `清除溶液 ${getSolutionById(sid)?.name} 的观察记录`);
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

/* ---------------- 描述 / 步骤 / 报告 ---------------- */

function describe(state) {
  const current = observe(state.solutionId, state.indicatorId);

  return {
    code: "ready",
    statusText: state.dripped ? "观察中" : "等待滴加",
    errors: [],
    measurements: [
      { label: "溶液 pH（模拟）", value: current?.ph ?? "—", unit: "" },
      { label: "酸碱性", value: current?.propertyLabel ?? "—", unit: "" },
    ],
    parameterSummary: current
      ? `当前溶液：${current.solutionName}，指示剂：${current.indicatorName}`
      : "",
  };
}

function analyze(state) {
  const current = observe(state.solutionId, state.indicatorId);
  return {
    code: "ready",
    statusText: state.dripped
      ? `已滴加：${current?.colorLabel}`
      : "等待滴加",
    errors: [],
  };
}

function bothTested(data, solutionId) {
  return (
    data.observations.some((o) => o.solutionId === solutionId && o.indicatorId === "litmus") &&
    data.observations.some((o) => o.solutionId === solutionId && o.indicatorId === "phenolphthalein")
  );
}

function isStepDone(stepId, ctx = {}) {
  const { data = {}, conclusion = "" } = ctx;

  switch (stepId) {
    case "first":
      return data.observations.length >= 1;
    case "all-solutions":
      return new Set(data.observations.map((o) => o.solutionId)).size >= SOLUTIONS.length;
    case "both-indicators":
      return SOLUTIONS.filter((s) => bothTested(data, s.id)).length >= 3;
    case "conclude":
      return conclusion.trim().length >= 10;
    default:
      return false;
  }
}

function buildReportData(data) {
  return {
    headers: ["溶液", "紫色石蕊现象", "无色酚酞现象", "酸碱性", "pH"],
    rows: SOLUTIONS.map((solution) => {
      const litmus = data.observations.find(
        (o) => o.solutionId === solution.id && o.indicatorId === "litmus"
      );
      const phen = data.observations.find(
        (o) => o.solutionId === solution.id && o.indicatorId === "phenolphthalein"
      );
      const tested = data.observations.some((o) => o.solutionId === solution.id);

      return [
        solution.name,
        litmus ? litmus.colorLabel : "未观察",
        phen ? phen.colorLabel : "未观察",
        tested ? PROPERTY_LABELS[solution.property] : "未判定",
        solution.ph,
      ];
    }),
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export default {
  id: "acid-base-indicator",
  steps: STEPS,
  createInitialState,
  createData,
  analyze,
  mountOperation,
  mountMeasure,
  describe,
  isStepDone,
  buildReportData,
  buildAiRecords: buildReportData,
};
