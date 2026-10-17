/*
 * 虚拟实验目录页：学段 × 学科筛选，卡片由实验注册表（catalog.js）驱动。
 */

import {
  experiments,
  SUBJECTS,
  STAGES,
  EXPERIMENT_STATUS,
} from "../experiments/catalog.js";

const FILTERS = {
  stage: "all",
  subject: "all",
};

export function renderExperiments() {
  return `
  <main class="vlab-catalog-page">
    <section class="courses-hero">
      <p class="courses-eyebrow">VIRTUAL LABORATORY</p>
      <h1>AI 引导的虚拟实验平台</h1>
      <p class="hero-description">
        实验现象和测量数据由经过验证的科学公式与实验规则实时计算，
        AI 导师只负责讲解、引导、分析与反馈，不编造实验结果。
      </p>
      <div class="vlab-catalog-stats">
        <span class="vlab-stat-chip">⚡ 物理 <strong>1</strong> 个</span>
        <span class="vlab-stat-chip">🧪 化学 <strong>1</strong> 个</span>
        <span class="vlab-stat-chip">🔬 生物 <strong>1</strong> 个</span>
        <span class="vlab-stat-chip">🌍 地理 <strong>2</strong> 个</span>
        <span class="vlab-stat-chip">✅ 四大学科全部可操作</span>
      </div>
      <div class="vlab-hero-actions">
        <a class="button button-primary" href="#laboratory">
          🧊 进入 3D 实验室
        </a>
        <span class="vlab-hero-hint">适合 3D 的实验可在三维场景中动手操作</span>
      </div>
    </section>

    <section class="card-panel">
      <div class="vlab-filter-bar">
        <div class="vlab-filter-group">
          <span class="vlab-filter-label">学段</span>
          <button type="button" class="vlab-filter-btn is-active" data-filter="stage" data-value="all">
            全部
          </button>
          ${Object.entries(STAGES)
            .map(
              ([key, label]) => `
            <button type="button" class="vlab-filter-btn" data-filter="stage" data-value="${key}">
              ${label}
            </button>`
            )
            .join("")}
        </div>

        <div class="vlab-filter-group">
          <span class="vlab-filter-label">学科</span>
          <button type="button" class="vlab-filter-btn is-active" data-filter="subject" data-value="all">
            全部
          </button>
          ${Object.entries(SUBJECTS)
            .map(
              ([key, meta]) => `
            <button type="button" class="vlab-filter-btn" data-filter="subject" data-value="${key}">
              ${meta.icon} ${meta.label}
            </button>`
            )
            .join("")}
        </div>
      </div>

      <p class="vlab-filter-result" id="vlab-filter-result"></p>
      <div class="course-grid vlab-catalog-grid" id="vlab-catalog-grid"></div>
    </section>

    <section class="card-panel vlab-principle-panel">
      <h2>平台怎么保证实验结果可信？</h2>
      <div class="vlab-principle-grid">
        <div>
          <h3>① 规则引擎计算</h3>
          <p>电流、电压、颜色变化等结果由代码中的科学公式与验证过的规则表计算，改参数结果就按规律真实变化，不是预设动画。</p>
        </div>
        <div>
          <h3>② AI 只做引导</h3>
          <p>AI 导师只能读取系统测量到的真实数据进行讲解和诊断，接口层明确禁止它计算、修改或编造任何数值。</p>
        </div>
        <div>
          <h3>③ 全过程留痕</h3>
          <p>接线操作、原始数据、实验结论都保存在实验记录区，可一键生成只基于真实数据的实验报告草稿。</p>
        </div>
      </div>
    </section>
  </main>`;
}

export function bindExperiments(root) {
  const grid = root.querySelector("#vlab-catalog-grid");
  const result = root.querySelector("#vlab-filter-result");

  function renderGrid() {
    const list = experiments.filter((item) => {
      const stageOk = FILTERS.stage === "all" || item.stage === FILTERS.stage;
      const subjectOk =
        FILTERS.subject === "all" || item.subject === FILTERS.subject;
      return stageOk && subjectOk;
    });

    result.textContent = `共 ${list.length} 个实验`;

    grid.innerHTML = list
      .map((item) => {
        const subject = SUBJECTS[item.subject];
        const isSoon = item.status === "soon";
        const href = item.externalHash || `#experiment-run/${item.id}`;
        const actionText = item.externalHash
          ? "进入 3D 场景"
          : isSoon
            ? "敬请期待"
            : "开始实验";

        return `
          <article class="course-card vlab-card ${
            isSoon ? "vlab-card-soon" : ""
          }">
            <div class="vlab-card-head">
              <span class="vlab-card-icon">${item.icon}</span>
              <span class="vlab-badge ${
                isSoon ? "vlab-badge-wait" : "vlab-badge-ok"
              }">${EXPERIMENT_STATUS[item.status]}</span>
            </div>

            <h3>${item.title}</h3>

            <div class="vlab-card-tags">
              <span class="vlab-tag">${STAGES[item.stage]}</span>
              <span class="vlab-tag vlab-tag-${item.subject}">
                ${subject.icon} ${subject.label}
              </span>
              <span class="vlab-tag">⏱ ${item.duration}</span>
              ${item.sceneHash ? `<span class="vlab-tag vlab-tag-3d">🧊 3D 演示</span>` : ""}
            </div>

            <p>${item.summary}</p>

            <ul class="vlab-card-objectives">
              ${item.objectives
                .slice(0, 2)
                .map((obj) => `<li>${obj}</li>`)
                .join("")}
            </ul>

            ${
              isSoon
                ? `<span class="button button-secondary vlab-card-action is-disabled">${actionText}</span>`
                : `<div class="vlab-card-actions">
                    <a class="button ${
                      item.externalHash ? "button-secondary" : "button-primary"
                    } vlab-card-action" href="${href}">${actionText}</a>
                    ${
                      item.sceneHash
                        ? `<a class="button button-secondary vlab-card-action vlab-card-action-3d" href="${item.sceneHash}">🧊 先看 3D</a>`
                        : ""
                    }
                  </div>`
            }
          </article>`;
      })
      .join("");
  }

  root.querySelector(".vlab-filter-bar").addEventListener("click", (event) => {
    const button = event.target.closest(".vlab-filter-btn");
    if (!button) return;

    const { filter, value } = button.dataset;
    FILTERS[filter] = value;

    root
      .querySelectorAll(`.vlab-filter-btn[data-filter="${filter}"]`)
      .forEach((item) => item.classList.toggle("is-active", item === button));

    renderGrid();
  });

  renderGrid();
}
