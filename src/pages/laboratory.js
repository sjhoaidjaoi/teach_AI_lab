import { createScienceScene } from "../three/scene.js";

/*
 * 3D 科学实验室：多场景切换（太阳系 / 串联电路 / 地球公转）。
 * - 太阳系场景沿用 src/three/scene.js；
 * - 串联电路与地球公转场景懒加载各实验模块内的 three-view.js，
 *   数值一律由对应实验的规则引擎（rules.js）按科学公式计算，
 *   3D 层只负责可视化，不做任何科学计算。
 */

export const LAB_SCENES = {
  solar: {
    label: "太阳系探索",
    icon: "🪐",
    tagline: "旋转、缩放，点击天体查看它们的科学数据。",
  },
  circuit: {
    label: "串联电路",
    icon: "🔌",
    tagline: "调节电压与电阻，观察电流和灯泡亮度按欧姆定律变化。",
  },
  seasons: {
    label: "地球公转",
    icon: "🌍",
    tagline: "观察地轴倾斜与太阳直射点移动，理解四季的成因。",
  },
};

const SOLAR_TOOLBAR = `
  <div class="scene-toolbar">
    <button class="button button-secondary" id="toggle-animation">
      暂停动画
    </button>

    <label class="speed-control" for="animation-speed">
      <span>动画速度</span>

      <input
        id="animation-speed"
        type="range"
        min="0"
        max="3"
        step="0.1"
        value="1"
      />

      <span id="speed-value">1.0×</span>
    </label>

    <button class="button button-secondary" id="focus-planet">
      聚焦选中天体
    </button>

    <button class="button button-secondary" id="reset-view">
      重置视角
    </button>
  </div>
`;

function renderCircuitPanel() {
  return `
    <aside class="planet-panel" id="lab-panel">
      <p class="eyebrow">SERIES CIRCUIT · 3D</p>
      <h2>串联电路 3D 演示</h2>
      <p class="lab-panel-tip">
        这是一个规范的串联电路：电源 → 开关 → L₁ → L₂ → 电源。
        调节参数后，电流、分压与灯泡亮度均由规则引擎按
        I = U / R 等公式实时计算。点击场景中的开关也可以控制通断。
      </p>

      <div class="lab-controls">
        <label class="lab-control">
          <span>电源电压</span>
          <select id="circuit-voltage">
            <option value="1.5">1.5 V</option>
            <option value="3" selected>3 V</option>
            <option value="4.5">4.5 V</option>
            <option value="6">6 V</option>
          </select>
        </label>

        <label class="lab-control">
          <span>灯泡 L₁ 电阻</span>
          <select id="circuit-r1">
            <option value="5">5 Ω</option>
            <option value="10" selected>10 Ω</option>
            <option value="15">15 Ω</option>
          </select>
        </label>

        <label class="lab-control">
          <span>灯泡 L₂ 电阻</span>
          <select id="circuit-r2">
            <option value="5">5 Ω</option>
            <option value="10" selected>10 Ω</option>
            <option value="15">15 Ω</option>
          </select>
        </label>

        <button type="button" class="button button-primary" id="circuit-switch-btn">
          闭合开关
        </button>
      </div>

      <div class="lab-status" id="circuit-status" data-tone="warn">
        开关断开，电路中没有电流
      </div>

      <div class="lab-metrics" id="circuit-metrics"></div>

      <p class="lab-checklist-title">观察任务</p>
      <ul class="lab-checklist" id="circuit-checklist">
        <li data-task="params"><span class="lab-check-dot">1</span>调节电源电压或任一灯泡电阻</li>
        <li data-task="switch"><span class="lab-check-dot">2</span>闭合开关，接通电路</li>
        <li data-task="observe"><span class="lab-check-dot">3</span>观察电流大小与两灯分压数据</li>
      </ul>

      <a class="button button-secondary lab-panel-link" href="#experiment-run/series-circuit">
        🔧 去虚拟实验台动手接线测量 →
      </a>
    </aside>
  `;
}

function renderSeasonsPanel() {
  return `
    <aside class="planet-panel" id="lab-panel">
      <p class="eyebrow">EARTH REVOLUTION · 3D</p>
      <h2>地球公转 3D 演示</h2>
      <p class="lab-panel-tip">
        拖动视角观察地球沿公转轨道运动：地轴始终指向同一方向，
        太阳直射点（红点）在南北回归线之间来回移动。
        直射点纬度、正午太阳高度与昼长由天文学公式实时计算。
      </p>

      <div class="lab-controls">
        <label class="lab-control lab-control-range">
          <span>轨道位置</span>
          <input type="range" id="seasons-position" min="0" max="360" step="1" value="90" />
          <strong id="seasons-position-name">夏至</strong>
        </label>

        <label class="lab-control">
          <span>观察城市</span>
          <select id="seasons-city"></select>
        </label>

        <button type="button" class="button button-primary" id="seasons-play">
          播放公转
        </button>
      </div>

      <div class="lab-status" id="seasons-status" data-tone="ok">
        太阳直射北回归线附近
      </div>

      <div class="lab-metrics" id="seasons-metrics"></div>

      <p class="lab-checklist-title">观察任务</p>
      <ul class="lab-checklist" id="seasons-checklist">
        <li data-task="orbit"><span class="lab-check-dot">1</span>拖动轨道位置，观察直射点移动</li>
        <li data-task="city"><span class="lab-check-dot">2</span>切换观察城市，对比太阳高度与昼长</li>
        <li data-task="play"><span class="lab-check-dot">3</span>播放公转动画，观察地轴方向不变</li>
      </ul>

      <a class="button button-secondary lab-panel-link" href="#experiment-run/seasons">
        📝 去虚拟实验台记录四节气数据 →
      </a>
    </aside>
  `;
}

function renderSolarPanel() {
  return `
    <aside class="planet-panel" id="planet-panel">
      <p class="eyebrow">PLANET INFORMATION</p>
      <h2 id="planet-name">欢迎探索太阳系</h2>
      <p id="planet-english-name" class="planet-english">
        SOLAR SYSTEM
      </p>

      <p id="planet-fact">
        点击三维场景中的太阳或行星，查看它们的科学知识。
      </p>

      <div class="planet-stat">
        <span>直径</span>
        <strong id="planet-diameter">—</strong>
      </div>

      <div class="planet-stat">
        <span>自转周期</span>
        <strong id="planet-day">—</strong>
      </div>

      <div class="planet-stat">
        <span>公转周期</span>
        <strong id="planet-year">—</strong>
      </div>
    </aside>
  `;
}

export function renderLaboratory(sceneId = "solar") {
  const scene = LAB_SCENES[sceneId] || LAB_SCENES.solar;

  return `
    <section class="laboratory-page">
      <header class="laboratory-heading">
        <div>
          <p class="eyebrow">3D SCIENCE LAB</p>
          <h1>3D 科学实验室</h1>
          <p>${scene.tagline}</p>
        </div>
      </header>

      <div class="lab-tabs" id="lab-tabs">
        <a class="lab-tab" href="#experiments">
          <span class="lab-tab-icon">📚</span>
          <span>全部实验</span>
        </a>
        ${Object.entries(LAB_SCENES)
          .map(
            ([id, item]) => `
          <a class="lab-tab ${id === sceneId ? "is-active" : ""}"
            href="${id === "solar" ? "#laboratory" : `#laboratory/${id}`}">
            <span class="lab-tab-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>`
          )
          .join("")}
      </div>

      <div class="lab-layout">
        <div class="scene-column">
          <div class="three-container" id="three-container"></div>
          ${sceneId === "solar" ? SOLAR_TOOLBAR : ""}
        </div>

        ${
          sceneId === "circuit"
            ? renderCircuitPanel()
            : sceneId === "seasons"
              ? renderSeasonsPanel()
              : renderSolarPanel()
        }
      </div>
    </section>
  `;
}

export async function mountLaboratory(sceneId = "solar") {
  const container = document.querySelector("#three-container");

  if (!container) {
    console.error("没有找到 three-container 容器");
    return () => {};
  }

  function createChecklistHooks(listId) {
    const list = document.getElementById(listId);
    return {
      completeTask(taskId) {
        const item = list?.querySelector(`[data-task="${taskId}"]`);
        if (!item || item.classList.contains("is-done")) return;
        item.classList.add("is-done");
        const dot = item.querySelector(".lab-check-dot");
        if (dot) dot.textContent = "✓";
      },
    };
  }

  if (sceneId === "circuit") {
    const mod = await import("../experiments/series-circuit/three-view.js");
    return mod.mountCircuitScene(container, createChecklistHooks("circuit-checklist"));
  }

  if (sceneId === "seasons") {
    const mod = await import("../experiments/seasons/three-view.js");
    return mod.mountSeasonsScene(container, createChecklistHooks("seasons-checklist"));
  }

  return createScienceScene(container);
}
