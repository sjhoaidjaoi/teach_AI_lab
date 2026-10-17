/*
 * 生物实验“显微镜观察细胞”模块（契约 v2）。
 * B 区：调倍率/焦距/光圈，SVG 标本成像，点击标注细胞结构（即时判分）；
 * C 区：实时成像参数 + 观察记录表。
 * 标本为程序绘制的 SVG 教学示意图，结构对应关系由 rules.js 判定。
 */

import {
  SPECIMENS,
  EYEPIECES,
  OBJECTIVES,
  totalMagnification,
  imageQuality,
  checkLabels,
} from "./rules.js";

export const STEPS = [
  {
    id: "focus",
    title: "对光并调焦至清晰",
    detail: "调节光圈控制视野亮度，再缓慢调节粗准焦螺旋，直到标本成像清晰（判定为“清晰”）。",
  },
  {
    id: "two-objectives",
    title: "用两种物镜观察",
    detail: "分别用 10× 和 40× 物镜观察标本，比较视野范围与放大倍数的变化。",
  },
  {
    id: "label-one",
    title: "标注当前标本的结构",
    detail: "选择结构标签，点击标本中对应的结构。全部标注正确后本步骤完成。",
  },
  {
    id: "both-specimens",
    title: "完成两种标本的观察",
    detail: "切换标本，重复调焦、观察和标注，各保存一份观察记录。",
  },
  {
    id: "conclude",
    title: "比较两种细胞，得出结论",
    detail: "对比洋葱表皮细胞与口腔上皮细胞，写出植物细胞与动物细胞结构的异同。",
  },
];

function createInitialState() {
  return {
    specimenId: "onion",
    eyepiece: 10,
    objective: 10,
    focus: 52,
    light: 70,
  };
}

function createData() {
  return {
    usedObjectives: [],
    placed: {}, // {structureName: {x, y}} 当前标本的标注
    correctFound: {}, // 标注正确的结构
    trials: [], // {specimen, magnification, result, time}
  };
}

/* ---------------- 标本 SVG 绘制（程序生成教学示意图） ---------------- */

function onionSvg(state, quality) {
  // 砖墙状排列的植物表皮细胞
  const cells = [];
  const w = 86;
  const h = 56;
  let row = 0;
  for (let y = 24; y <= 220; y += h) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    row += 1;
    for (let x = 20 - offset; x <= 380; x += w) {
      cells.push(`
        <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="10"
          fill="#f0fdf4" stroke="#65a30d" stroke-width="3"/>
        <rect class="bio-hit" data-structure="细胞壁"
          x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="12"
          fill="transparent" stroke="transparent" stroke-width="10"/>
      `);
    }
  }

  // 每个细胞中央的细胞核
  const nuclei = [];
  row = 0;
  for (let y = 24; y <= 220; y += h) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    row += 1;
    for (let x = 20 - offset; x <= 380; x += w) {
      const nx = x + w / 2;
      const ny = y + h / 2;
      nuclei.push(`
        <circle cx="${nx}" cy="${ny}" r="10" fill="#a78bfa" opacity="0.85"/>
        <circle class="bio-hit" data-structure="细胞核" cx="${nx}" cy="${ny}" r="16" fill="transparent"/>
      `);
    }
  }

  // 中央大液泡
  const vacuole = `
    <rect x="130" y="90" width="150" height="96" rx="18" fill="#bae6fd" opacity="0.55"/>
    <rect class="bio-hit" data-structure="液泡" x="130" y="90" width="150" height="96" rx="18" fill="transparent"/>
  `;

  return `
    <g class="bio-image" style="filter: blur(${quality.blurPx}px); opacity:${
      quality.clear ? 1 : 0.85
    }">
      ${cells.join("")}
      ${vacuole}
      ${nuclei.join("")}
    </g>
  `;
}

function cheekSvg(state, quality) {
  // 散落的鳞状上皮细胞
  const cellsData = [
    [90, 80, 52, 34, -15],
    [220, 70, 58, 36, 10],
    [330, 100, 48, 30, 5],
    [140, 170, 56, 34, 20],
    [280, 180, 60, 38, -8],
    [380, 60, 44, 28, -20],
    [40, 210, 46, 30, 8],
    [210, 250, 52, 32, -12],
  ];

  const cells = cellsData
    .map(([cx, cy, rx, ry, rot]) => {
      const nx = cx + 4;
      const ny = cy + 3;
      return `
        <g transform="rotate(${rot} ${cx} ${cy})">
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"
            fill="#fdf2f8" stroke="#c084fc" stroke-width="3"/>
          <ellipse class="bio-hit" data-structure="细胞质"
            cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="transparent"/>
          <ellipse class="bio-hit" data-structure="细胞膜"
            cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none"
            stroke="transparent" stroke-width="12"/>
          <circle cx="${nx}" cy="${ny}" r="9" fill="#7c3aed" opacity="0.85"/>
          <circle class="bio-hit" data-structure="细胞核" cx="${nx}" cy="${ny}" r="15" fill="transparent"/>
        </g>
      `;
    })
    .join("");

  return `
    <g class="bio-image" style="filter: blur(${quality.blurPx}px); opacity:${
      quality.clear ? 1 : 0.85
    }">
      ${cells}
    </g>
  `;
}

function pinsSvg(data) {
  return Object.entries(data.placed)
    .map(([name, pos]) => {
      const isCorrect = Boolean(data.correctFound[name]);
      return `
        <g class="bio-pin ${isCorrect ? "is-correct" : ""}">
          <line x1="${pos.x}" y1="${pos.y}" x2="${pos.x + 34}" y2="${pos.y - 26}"
            stroke="${isCorrect ? "#16a34a" : "#dc2626"}" stroke-width="2"/>
          <circle cx="${pos.x}" cy="${pos.y}" r="4"
            fill="${isCorrect ? "#16a34a" : "#dc2626"}"/>
          <rect x="${pos.x + 30}" y="${pos.y - 44}" width="${name.length * 14 + 14}" height="24" rx="6"
            fill="${isCorrect ? "#dcfce7" : "#fee2e2"}"
            stroke="${isCorrect ? "#16a34a" : "#dc2626"}" stroke-width="1"/>
          <text x="${pos.x + 37}" y="${pos.y - 27}" font-size="13"
            fill="${isCorrect ? "#15803d" : "#b91c1c"}">${name}</text>
        </g>
      `;
    })
    .join("");
}

/* ---------------- B 区：显微镜操作 ---------------- */

function mountOperation(rootEl, api, initialState) {
  let state = { ...createInitialState(), ...initialState };
  let pendingLabel = null;

  function render() {
    const specimen = SPECIMENS[state.specimenId];
    const quality = imageQuality(state.focus, state.light, state.specimenId);
    const data = api.getData();

    rootEl.innerHTML = `
      <div class="bio-sim">
        <div class="circuit-toolbar">
          <label class="circuit-control">
            <span>标本</span>
            <select id="bio-specimen">
              ${Object.values(SPECIMENS)
                .map(
                  (s) => `<option value="${s.id}" ${state.specimenId === s.id ? "selected" : ""}>${s.name}</option>`
                )
                .join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>目镜</span>
            <select id="bio-eyepiece">
              ${EYEPIECES.map(
                (v) => `<option value="${v}" ${state.eyepiece === v ? "selected" : ""}>${v}×</option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>物镜</span>
            <select id="bio-objective">
              ${OBJECTIVES.map(
                (v) => `<option value="${v}" ${state.objective === v ? "selected" : ""}>${v}×</option>`
              ).join("")}
            </select>
          </label>

          <button type="button" class="button button-secondary" id="bio-clear-labels">
            清除标注
          </button>
        </div>

        <div class="bio-sliders">
          <label class="bio-slider">
            <span>粗准焦螺旋</span>
            <input type="range" id="bio-focus" min="20" max="80" value="${state.focus}" step="1"/>
          </label>
          <label class="bio-slider">
            <span>光圈（视野亮度）</span>
            <input type="range" id="bio-light" min="0" max="100" value="${state.light}" step="1"/>
          </label>
        </div>

        <p class="circuit-hint">
          操作：先调焦至清晰；然后点击下方结构标签，再点击标本中对应的结构完成标注。
        </p>

        <div class="bio-label-chips">
          ${specimen.structures
            .map(
              (name) => `
              <button type="button" class="vlab-chip ${
                pendingLabel === name ? "is-pending" : ""
              } ${data.correctFound[name] ? "is-found" : ""}" data-label="${name}">
                ${name}${data.correctFound[name] ? " ✓" : ""}
              </button>`
            )
            .join("")}
        </div>

        <div class="bio-canvas-wrap">
          <svg id="bio-svg" viewBox="0 0 440 300" class="bio-svg" role="img"
            aria-label="${specimen.name}显微视野（总放大倍数 ${
              totalMagnification(state.eyepiece, state.objective)
            } 倍）">
            <rect x="0" y="0" width="440" height="300" fill="#0f172a"/>
            <circle cx="220" cy="150" r="140" fill="${
              state.light > 90 ? "#f8fafc" : state.light > 35 ? "#1e293b" : "#020617"
            }"/>
            <!-- 圆形视野裁剪 -->
            <clipPath id="bio-fov"><circle cx="220" cy="150" r="140"/></clipPath>
            <g clip-path="url(#bio-fov)" transform="translate(220 150) scale(${
              state.objective === 40 ? 1.45 : 1
            }) translate(-220 -150)">
              ${state.specimenId === "onion" ? onionSvg(state, quality) : cheekSvg(state, quality)}
            </g>
            ${pinsSvg(data)}
            <!-- 视野边缘 -->
            <circle cx="220" cy="150" r="140" fill="none" stroke="#334155" stroke-width="6"/>
          </svg>
        </div>
      </div>
    `;

    bind();
  }

  function bind() {
    rootEl.querySelector("#bio-specimen")?.addEventListener("change", (event) => {
      state.specimenId = event.target.value;
      const data = api.getData();
      data.placed = {};
      data.correctFound = {};
      pendingLabel = null;
      api.log("operate", `切换标本为：${SPECIMENS[state.specimenId].name}`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#bio-eyepiece")?.addEventListener("change", (event) => {
      state.eyepiece = Number(event.target.value);
      api.log("operate", `更换目镜 ${state.eyepiece}×，总倍率 ${totalMagnification(state.eyepiece, state.objective)}×`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#bio-objective")?.addEventListener("change", (event) => {
      state.objective = Number(event.target.value);
      const data = api.getData();
      if (!data.usedObjectives.includes(state.objective)) {
        data.usedObjectives.push(state.objective);
        api.onChange();
      }
      api.log("operate", `转动物镜转换器至 ${state.objective}×，总倍率 ${totalMagnification(state.eyepiece, state.objective)}×`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#bio-focus")?.addEventListener("input", (event) => {
      state.focus = Number(event.target.value);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#bio-light")?.addEventListener("input", (event) => {
      state.light = Number(event.target.value);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#bio-clear-labels")?.addEventListener("click", () => {
      const data = api.getData();
      data.placed = {};
      data.correctFound = {};
      pendingLabel = null;
      api.log("operate", "清除全部标注");
      api.onChange();
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelectorAll("[data-label]").forEach((chip) => {
      chip.addEventListener("click", () => {
        pendingLabel = chip.dataset.label;
        render();
      });
    });

    rootEl.querySelectorAll(".bio-hit").forEach((hit) => {
      hit.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!pendingLabel) {
          api.showToast("请先点击下方一个结构标签，再点击标本。");
          return;
        }
        if (hit.dataset.structure === pendingLabel) {
          const data = api.getData();
          const svg = rootEl.querySelector("#bio-svg");
          const pt = svg.createSVGPoint();
          pt.x = event.clientX;
          pt.y = event.clientY;
          const loc = pt.matrixTransform(svg.getScreenCTM().inverse());

          if (!data.correctFound[pendingLabel]) {
            data.correctFound[pendingLabel] = true;
            api.log("label", `标注正确：${pendingLabel}`);
          }
          data.placed[pendingLabel] = { x: Math.round(loc.x), y: Math.round(loc.y) };
          pendingLabel = null;
          api.onChange();
          render();
          api.onStateChange({ ...state }, analyze(state));
        } else {
          api.showToast("不对哦，再观察观察——注意细胞壁在细胞最外层，核在细胞内部。");
        }
      });
    });
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

/* ---------------- C 区：观察参数与记录 ---------------- */

function mountMeasure(rootEl, api) {
  let el = rootEl;

  function refresh() {
    render(api.snapshot());
  }

  function render(snap) {
    const state = snap.state;
    const data = api.getData();
    const specimen = SPECIMENS[state.specimenId];
    const quality = imageQuality(state.focus, state.light, state.specimenId);
    const mag = totalMagnification(state.eyepiece, state.objective);
    const labels = checkLabels(state.specimenId, data.placed);

    const trialRows = data.trials
      .map(
        (trial) => `
        <tr>
          <td>${trial.specimen}</td>
          <td class="vlab-num">${trial.magnification}×</td>
          <td>${trial.result}</td>
          <td>${trial.time}</td>
        </tr>`
      )
      .join("");

    el.innerHTML = `
      <div class="vlab-status-pill ${
        quality.clear ? "vlab-status-ok" : quality.tooDark || quality.tooBright ? "vlab-status-warn" : "vlab-status-warn"
      }">
        <strong>规则引擎判定：${quality.clear ? "成像清晰" : quality.hint}</strong>
        <span>标本：${specimen.name}（${specimen.note}）</span>
      </div>

      <div class="vlab-measure-grid">
        <div>
          <h3>实时成像参数（规则计算）</h3>
          <table class="vlab-table">
            <tbody>
              <tr><td>总放大倍数</td><td class="vlab-num">${mag}×</td>
                <td class="vlab-formula">目镜 ${state.eyepiece}× × 物镜 ${state.objective}×</td></tr>
              <tr><td>焦距偏差</td><td class="vlab-num">${quality.deviation}</td>
                <td class="vlab-formula">最优焦距 ${specimen.optimalFocus}</td></tr>
              <tr><td>成像状态</td><td colspan="2">${
                quality.clear
                  ? '<span class="vlab-badge vlab-badge-ok">清晰</span>'
                  : '<span class="vlab-badge vlab-badge-bad">未调准</span>'
              }</td></tr>
              <tr><td>视野亮度</td><td class="vlab-num">${state.light}</td>
                <td class="vlab-formula">${quality.tooDark ? "过暗" : quality.tooBright ? "过亮" : "合适"}</td></tr>
            </tbody>
          </table>
          <div class="vlab-measure-actions">
            <button type="button" class="button button-primary" id="bio-save-trial-btn"
              ${labels.missing.length === 0 && quality.clear ? "" : "disabled"}>
              保存观察记录
            </button>
            <span class="vlab-report-hint">${
              labels.missing.length === 0
                ? quality.clear
                  ? "结构标注完整，可以保存"
                  : "请先把成像调清晰"
                : `还有结构未正确标注：${labels.missing.join("、")}`
            }</span>
          </div>
        </div>

        <div>
          <h3>结构标注进度</h3>
          <table class="vlab-table">
            <thead><tr><th>结构</th><th>状态</th></tr></thead>
            <tbody>
              ${specimen.structures
                .map(
                  (name) => `
                  <tr>
                    <td>${name}</td>
                    <td>${
                      data.correctFound[name]
                        ? '<span class="vlab-badge vlab-badge-ok">已标注</span>'
                        : '<span class="vlab-badge vlab-badge-wait">未标注</span>'
                    }</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <h3>已保存的观察记录</h3>
      <div class="vlab-table-wrap">
        <table class="vlab-table">
          <thead><tr><th>标本</th><th>放大倍数</th><th>标注结果</th><th>时间</th></tr></thead>
          <tbody>
            ${
              trialRows ||
              `<tr><td colspan="4" class="vlab-empty">完成标注并保存，两种标本各记录一次</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    bind();
  }

  function bind() {
    el.querySelector("#bio-save-trial-btn")?.addEventListener("click", () => {
      const snap = api.snapshot();
      const data = api.getData();
      const specimen = SPECIMENS[snap.state.specimenId];
      const mag = totalMagnification(snap.state.eyepiece, snap.state.objective);
      const labels = checkLabels(snap.state.specimenId, data.placed);

      if (labels.missing.length > 0) {
        api.showToast(`还有结构未标注：${labels.missing.join("、")}`);
        return;
      }

      data.trials.push({
        specimen: specimen.name,
        specimenId: specimen.id,
        magnification: mag,
        result: `${specimen.structures.length}/${specimen.structures.length} 正确`,
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });

      api.log("measure", `保存观察记录：${specimen.name}，${mag}×，标注全部正确`);
      api.onChange();
      refresh();
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
  const specimen = SPECIMENS[state.specimenId];
  const quality = imageQuality(state.focus, state.light, state.specimenId);

  return {
    code: quality.clear ? "clear" : "unclear",
    statusText: quality.clear ? "成像清晰" : quality.hint,
    errors: [],
    measurements: [
      { label: "总放大倍数", value: totalMagnification(state.eyepiece, state.objective), unit: "×" },
      { label: "焦距偏差", value: quality.deviation, unit: "" },
      { label: "视野亮度", value: state.light, unit: "" },
    ],
    parameterSummary: `标本：${specimen.name}，目镜 ${state.eyepiece}×，物镜 ${state.objective}×`,
  };
}

function analyze(state) {
  const quality = imageQuality(state.focus, state.light, state.specimenId);
  return {
    code: quality.clear ? "clear" : "unclear",
    statusText: quality.clear ? "成像清晰" : quality.hint,
    errors: [],
  };
}

function isStepDone(stepId, ctx = {}) {
  const { state, analysis, data = {}, conclusion = "" } = ctx;

  switch (stepId) {
    case "focus":
      return analysis.code === "clear";
    case "two-objectives":
      return (data.usedObjectives || []).length >= 2;
    case "label-one":
      return (
        SPECIMENS[state.specimenId].structures.every((name) => data.correctFound?.[name])
      );
    case "both-specimens":
      return new Set(data.trials.map((t) => t.specimenId)).size >= 2;
    case "conclude":
      return conclusion.trim().length >= 10;
    default:
      return false;
  }
}

function buildReportData(data) {
  return {
    headers: ["标本", "放大倍数", "结构标注结果", "记录时间"],
    rows: data.trials.map((trial) => [
      trial.specimen,
      `${trial.magnification}×`,
      trial.result,
      trial.time,
    ]),
  };
}

export default {
  id: "microscope-cells",
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
