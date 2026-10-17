/*
 * 地理实验“地球公转与四季形成”模块（契约 v2）。
 * B 区：2D 公转模型，拖动地球位置/选节气/选城市，直射点与昼夜半球实时绘制；
 * C 区：三公式计算结果 + 四节气对比表 + 数据记录。
 */

import {
  CITIES,
  KEY_POSITIONS,
  AXIAL_TILT,
  solarDeclination,
  computeSunData,
  positionName,
} from "./rules.js";

export const STEPS = [
  {
    id: "visit-positions",
    title: "观察直射点的移动",
    detail: "把地球拖到春分、夏至、秋分、冬至四个位置，观察太阳直射点在南北回归线之间来回移动。",
  },
  {
    id: "one-city-four",
    title: "记录同一城市四个节气数据",
    detail: "选定一个城市，在四个节气位置分别点击“记录当前数据”，得到 4 组数据。",
  },
  {
    id: "multi-city",
    title: "对比不同城市",
    detail: "再选择另外至少 2 个城市（建议含南半球城市）记录数据，对比昼夜长短和太阳高度。",
  },
  {
    id: "conclude",
    title: "解释四季成因，得出结论",
    detail: "结合数据说明：为什么地轴倾斜且方向不变，会造成太阳直射点移动和四季更替？",
  },
];

function createInitialState() {
  return {
    position: 90, // 夏至起步，现象最明显
    cityId: "beijing",
  };
}

function createData() {
  return {
    visited: [], // 访问过的节气位置角
    trials: [], // {city, lat, position, declination, sunHeight, dayLength, time}
  };
}

/* ---------------- B 区：公转模型 ---------------- */

function mountOperation(rootEl, api, initialState) {
  let state = { ...createInitialState(), ...initialState };

  function render() {
    const data = api.getData();
    const city = CITIES.find((item) => item.id === state.cityId);
    const declination = solarDeclination(state.position);

    /* 轨道几何：太阳在中心，地球沿椭圆轨道 */
    const cx = 300;
    const cy = 160;
    const rx = 200;
    const ry = 110;
    const rad = (state.position * Math.PI) / 180;
    // 春分在右侧起，逆时针
    const ex = cx + rx * Math.cos(rad);
    const ey = cy - ry * Math.sin(rad);

    // 昼夜半球：背向太阳一侧
    const awayAngle = (state.position * 180) / Math.PI; // 地球→背向太阳方向

    const keyMarks = KEY_POSITIONS.map(
      (item) => `
      <text x="${cx + rx * Math.cos((item.angle * Math.PI) / 180)}"
        y="${cy - ry * Math.sin((item.angle * Math.PI) / 180) - 12}"
        text-anchor="middle" font-size="12" fill="#64748b">${item.name}</text>`
    ).join("");

    rootEl.innerHTML = `
      <div class="season-sim">
        <div class="circuit-toolbar">
          <label class="circuit-control">
            <span>城市</span>
            <select id="season-city">
              ${CITIES.map(
                (item) => `
                <option value="${item.id}" ${state.cityId === item.id ? "selected" : ""}>
                  ${item.name}（${item.lat}°N${item.lat < 0 ? `，南纬 ${Math.abs(item.lat)}°` : ""}）
                </option>`
              ).join("")}
            </select>
          </label>

          ${KEY_POSITIONS.map(
            (item) => `
            <button type="button" class="button button-secondary season-key-btn ${
              Math.abs(state.position - item.angle) <= 5 ? "is-on" : ""
            }" data-angle="${item.angle}">
              ${item.name}
            </button>`
          ).join("")}
        </div>

        <div class="season-slider-row">
          <label class="bio-slider">
            <span>一年中的位置（拖动地球）</span>
            <input type="range" id="season-position" min="0" max="360" value="${state.position}" step="5"/>
          </label>
          <span class="season-position-label">当前：${positionName(state.position)}</span>
        </div>

        <p class="circuit-hint">
          观察：地轴始终指向同一方向（北极星），倾角约 ${AXIAL_TILT}°；
          黄色圆点是太阳直射点，灰色半边是黑夜。
        </p>

        <div class="season-canvas-wrap">
          <svg viewBox="0 0 600 320" class="bio-svg" role="img" aria-label="地球公转示意模型">
            <!-- 轨道 -->
            <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none"
              stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 5"/>

            ${keyMarks}

            <!-- 太阳 -->
            <circle cx="${cx}" cy="${cy}" r="30" fill="#fbbf24"/>
            <circle cx="${cx}" cy="${cy}" r="42" fill="#fde68a" opacity="0.35"/>
            <text x="${cx}" y="${cy - 46}" text-anchor="middle" font-size="13" fill="#b45309">太阳</text>

            <!-- 地球 -->
            <g transform="translate(${ex} ${ey})">
              <!-- 太阳光线箭头 -->
              <line x1="${-Math.cos(rad) * 60}" y1="${Math.sin(rad) * 35}"
                x2="${-Math.cos(rad) * 30}" y2="${Math.sin(rad) * 18}"
                stroke="#f59e0b" stroke-width="3" marker-end="url(#sun-arrow)"/>

              <circle r="24" fill="#60a5fa" stroke="#2563eb" stroke-width="2"/>
              <!-- 黑夜半球 -->
              <path d="M 0 -24 A 24 24 0 0 1 0 24 Z"
                transform="rotate(${awayAngle})"
                fill="#1e293b" opacity="0.55"/>
              <!-- 地轴：固定倾角 -->
              <line x1="${-Math.sin((AXIAL_TILT * Math.PI) / 180) * 34}"
                y1="${-Math.cos((AXIAL_TILT * Math.PI) / 180) * 34}"
                x2="${Math.sin((AXIAL_TILT * Math.PI) / 180) * 34}"
                y2="${Math.cos((AXIAL_TILT * Math.PI) / 180) * 34}"
                stroke="#334155" stroke-width="2.5"/>
              <text x="${Math.sin((AXIAL_TILT * Math.PI) / 180) * 42}"
                y="${-Math.cos((AXIAL_TILT * Math.PI) / 180) * 42 + 4}"
                font-size="11" fill="#334155">N</text>
              <!-- 赤道线 -->
              <line x1="-24" y1="0" x2="24" y2="0" stroke="#0ea5e9" stroke-width="1.5" opacity="0.7"/>
              <!-- 直射点 -->
              <circle cx="0" cy="${-Math.sin((declination * Math.PI) / 180) * 22}" r="5" fill="#f59e0b"
                stroke="#fff" stroke-width="1.5"/>
            </g>

            <defs>
              <marker id="sun-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b"/>
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    `;

    bind(data);
  }

  function visitPosition() {
    const near = KEY_POSITIONS.find(
      (item) => Math.abs(state.position - item.angle) <= 5
    );
    if (!near) return;

    const data = api.getData();
    if (!data.visited.includes(near.angle)) {
      data.visited.push(near.angle);
      api.log("operate", `观察 ${near.name} 位置（直射 ${solarDeclination(near.angle)}°）`);
      api.onChange();
    }
  }

  function bind(data) {
    rootEl.querySelector("#season-city")?.addEventListener("change", (event) => {
      state.cityId = event.target.value;
      const city = CITIES.find((item) => item.id === state.cityId);
      api.log("operate", `选择城市：${city.name}`);
      render();
      api.onStateChange({ ...state }, analyze(state));
    });

    rootEl.querySelector("#season-position")?.addEventListener("input", (event) => {
      state.position = Number(event.target.value);
      render();
      api.onStateChange({ ...state }, analyze(state));
      visitPosition();
    });

    rootEl.querySelectorAll("[data-angle]").forEach((button) => {
      button.addEventListener("click", () => {
        state.position = Number(button.dataset.angle);
        render();
        api.onStateChange({ ...state }, analyze(state));
        visitPosition();
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

/* ---------------- C 区：太阳数据 ---------------- */

function mountMeasure(rootEl, api) {
  let el = rootEl;

  function refresh() {
    render(api.snapshot());
  }

  function render(snap) {
    const state = snap.state;
    const data = api.getData();
    const city = CITIES.find((item) => item.id === state.cityId);
    const sun = computeSunData(city.lat, state.position);

    // 四节气对比表（当前城市，由规则引擎实时计算）
    const compareRows = KEY_POSITIONS.map((item) => {
      const d = computeSunData(city.lat, item.angle);
      return `
        <tr>
          <td>${item.name}</td>
          <td class="vlab-num">${d.declination}°</td>
          <td class="vlab-num">${d.sunHeight}°</td>
          <td class="vlab-num">${formatDayLength(d.dayLength)}</td>
        </tr>`;
    }).join("");

    const trialRows = data.trials
      .map(
        (trial) => `
        <tr>
          <td>${trial.city}</td>
          <td>${trial.position}</td>
          <td class="vlab-num">${trial.declination}°</td>
          <td class="vlab-num">${trial.sunHeight}°</td>
          <td class="vlab-num">${formatDayLength(trial.dayLength)}</td>
          <td><button type="button" class="button button-secondary vlab-small-btn"
              data-delete-trial="${trial.id}">删除</button></td>
        </tr>`
      )
      .join("");

    const duplicate = data.trials.some(
      (trial) => trial.cityId === state.cityId && trial.position === state.position
    );

    el.innerHTML = `
      <div class="vlab-status-pill vlab-status-ok">
        <strong>规则引擎计算：当前为 ${positionName(state.position)}，直射 ${sun.declination > 0 ? "北纬" : sun.declination < 0 ? "南纬" : "赤道"} ${Math.abs(sun.declination)}°</strong>
        <span>观察城市：${city.name}（${city.lat >= 0 ? "北纬" : "南纬"} ${Math.abs(city.lat)}°）</span>
      </div>

      <div class="vlab-measure-grid">
        <div>
          <h3>当前数据（${city.name}）</h3>
          <table class="vlab-table">
            <tbody>
              <tr><td>太阳直射点纬度 δ</td><td class="vlab-num">${sun.declination}°</td></tr>
              <tr><td>正午太阳高度 H</td><td class="vlab-num">${sun.sunHeight}°</td></tr>
              <tr><td>昼长 L</td><td class="vlab-num">${formatDayLength(sun.dayLength)}</td></tr>
            </tbody>
          </table>
          <div class="vlab-measure-actions">
            <button type="button" class="button button-primary" id="season-save-btn"
              ${duplicate ? "disabled" : ""}>
              记录当前数据
            </button>
            <span class="vlab-report-hint">${
              duplicate ? "该城市此节气已记录" : "把当前城市+节气写入下方数据表"
            }</span>
          </div>
        </div>

        <div>
          <h3>四节气对比（当前城市，实时计算）</h3>
          <table class="vlab-table">
            <thead><tr><th>节气</th><th>直射点纬度</th><th>正午太阳高度</th><th>昼长</th></tr></thead>
            <tbody>${compareRows}</tbody>
          </table>
        </div>
      </div>

      <h3>我记录的数据（用于对比分析）</h3>
      <div class="vlab-table-wrap">
        <table class="vlab-table">
          <thead>
            <tr><th>城市</th><th>节气</th><th>直射点</th><th>正午太阳高度</th><th>昼长</th><th></th></tr>
          </thead>
          <tbody>
            ${
              trialRows ||
              `<tr><td colspan="6" class="vlab-empty">把地球移到节气位置后点击“记录当前数据”，至少记录 1 个城市的 4 个节气</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    bind();
  }

  function bind() {
    el.querySelector("#season-save-btn")?.addEventListener("click", () => {
      const snap = api.snapshot();
      const data = api.getData();
      const city = CITIES.find((item) => item.id === snap.state.cityId);
      const sun = computeSunData(city.lat, snap.state.position);

      if (
        data.trials.some(
          (trial) =>
            trial.cityId === snap.state.cityId && trial.position === snap.state.position
        )
      ) {
        api.showToast("该城市在此节气的数据已经记录过了。");
        return;
      }

      const entry = {
        id: Date.now(),
        cityId: city.id,
        city: city.name,
        position: positionName(snap.state.position),
        declination: sun.declination,
        sunHeight: sun.sunHeight,
        dayLength: sun.dayLength,
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      };

      data.trials.push(entry);
      api.log(
        "measure",
        `记录数据：${city.name} ${entry.position}，直射 ${entry.declination}°，正午高度 ${entry.sunHeight}°，昼长 ${entry.dayLength}h`
      );
      api.onChange();
      refresh();
    });

    el.querySelectorAll("[data-delete-trial]").forEach((button) => {
      button.addEventListener("click", () => {
        const data = api.getData();
        const id = Number(button.dataset.deleteTrial);
        data.trials = data.trials.filter((trial) => trial.id !== id);
        api.log("measure", "删除一条数据记录");
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

function formatDayLength(hours) {
  if (hours >= 24) return "24 h（极昼）";
  if (hours <= 0) return "0 h（极夜）";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${hours.toFixed(2)} h（${h} 时 ${m} 分）`;
}

/* ---------------- 描述 / 步骤 / 报告 ---------------- */

function describe(state) {
  const city = CITIES.find((item) => item.id === state.cityId);
  const sun = computeSunData(city.lat, state.position);

  return {
    code: "ready",
    statusText: `当前为${positionName(state.position)}，太阳直射${
      sun.declination > 0 ? "北纬" : sun.declination < 0 ? "南纬" : "赤道"
    } ${Math.abs(sun.declination)}°`,
    errors: [],
    measurements: [
      { label: "太阳直射点纬度 δ", value: sun.declination, unit: "°" },
      { label: `${city.name} 正午太阳高度`, value: sun.sunHeight, unit: "°" },
      { label: `${city.name} 昼长`, value: sun.dayLength, unit: "h" },
    ],
    parameterSummary: `城市：${city.name}（${city.lat >= 0 ? "北纬" : "南纬"} ${Math.abs(city.lat)}°），轨道位置 ${state.position}°`,
  };
}

function analyze(state) {
  const city = CITIES.find((item) => item.id === state.cityId);
  const sun = computeSunData(city.lat, state.position);
  return {
    code: "ready",
    statusText: `太阳直射${sun.declination > 0 ? "北纬" : sun.declination < 0 ? "南纬" : "赤道"} ${Math.abs(sun.declination)}°`,
    errors: [],
  };
}

function isStepDone(stepId, ctx = {}) {
  const { data = {}, conclusion = "" } = ctx;

  switch (stepId) {
    case "visit-positions":
      return (data.visited || []).length >= 4;
    case "one-city-four": {
      const byCity = {};
      (data.trials || []).forEach((trial) => {
        byCity[trial.cityId] = (byCity[trial.cityId] || 0) + 1;
      });
      return Object.values(byCity).some((count) => count >= 4);
    }
    case "multi-city":
      return new Set((data.trials || []).map((trial) => trial.cityId)).size >= 3;
    case "conclude":
      return conclusion.trim().length >= 10;
    default:
      return false;
  }
}

function buildReportData(data) {
  return {
    headers: ["城市", "节气", "直射点纬度", "正午太阳高度", "昼长", "记录时间"],
    rows: (data.trials || []).map((trial) => [
      trial.city,
      trial.position,
      `${trial.declination}°`,
      `${trial.sunHeight}°`,
      formatDayLength(trial.dayLength),
      trial.time,
    ]),
  };
}

export default {
  id: "seasons",
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
