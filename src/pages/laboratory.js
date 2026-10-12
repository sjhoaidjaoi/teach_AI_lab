
import { createScienceScene } from "../three/scene.js";

export function renderLaboratory() {
  return `
    <section class="laboratory-page">
      <header class="laboratory-heading">
        <div>
          <p class="eyebrow">SOLAR SYSTEM EXPLORER</p>
          <h1>太阳系探索实验室</h1>
          <p>选择一颗天体，开始探索它的科学知识。</p>
        </div>

        <button id="back-home" class="button button-secondary">
          返回首页
        </button>
      </header>

      <div class="lab-layout">
        <div class="scene-column">
  <div class="three-container" id="three-container"></div>

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
</div>

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
      </div>
    </section>
  `;
}

export function mountLaboratory() {
  const container = document.querySelector("#three-container");

  if (!container) {
    console.error("没有找到 three-container 容器");
    return () => {};
  }

  return createScienceScene(container);
}
