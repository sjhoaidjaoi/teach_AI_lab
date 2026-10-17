import {
  experiments as vlabExperiments,
  SUBJECTS,
  STAGES,
} from "../experiments/catalog.js";
import {
  generateExperimentPlan,
  analyzeObservation,
} from "../services/ai-client.js";
import { renderMarkdown } from "../lib/markdown.js";
import {
  getExperimentSession,
  saveExperimentSession,
  clearExperimentSession,
  getVirtualLabRecord,
} from "../services/storage.js";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

/** 可生成 AI 实验指导的虚拟实验（带模块的可操作实验，不含纯观察入口）。 */
function guidableExperiments() {
  return vlabExperiments.filter(
    (item) => item.status === "available" && typeof item.loadModule === "function"
  );
}

/**
 * 用实验注册表元数据 + 模块自带步骤组装 AI 生成上下文。
 * 事实信息（目标/原理/器材/步骤）全部来自实验自身，AI 只做组织与讲解。
 */
async function experimentPromptData(entry) {
  let stepLines = [];
  try {
    const module = (await entry.loadModule()).default;
    stepLines = (module.steps || []).map(
      (step) => `${step.title}：${step.detail}`
    );
  } catch (error) {
    console.warn(`读取 ${entry.id} 实验步骤失败：`, error);
  }

  return {
    courseId: entry.id,
    title: entry.title,
    objectives: entry.objectives,
    knowledgePoints: [
      `所属学科：${SUBJECTS[entry.subject].label}（${STAGES[entry.stage]}）`,
      `实验原理：${entry.principle}`,
      `所需器材：${entry.equipment.join("、")}`,
      `安全提示：${entry.safety.join("；")}`,
      ...stepLines,
    ],
  };
}

/** 规整并校验 AI 返回的实验方案。 */
function normalizePlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("实验方案格式不正确，请重新生成。");
  }

  const steps = Array.isArray(plan.steps)
    ? plan.steps
        .filter((step) => step && typeof step.instruction === "string")
        .slice(0, 8)
        .map((step, index) => ({
          title: String(step.title || `步骤 ${index + 1}`),
          instruction: String(step.instruction),
          observationPoint: String(step.observationPoint || ""),
          expectedPhenomenon: String(step.expectedPhenomenon || ""),
        }))
    : [];

  if (steps.length < 2) {
    throw new Error("实验步骤太少，请重新生成一次方案。");
  }

  return {
    title: String(plan.title || "科学观察实验"),
    purpose: String(plan.purpose || ""),
    preparations: Array.isArray(plan.preparations)
      ? plan.preparations.filter((x) => typeof x === "string").slice(0, 6)
      : [],
    safetyTips: Array.isArray(plan.safetyTips)
      ? plan.safetyTips.filter((x) => typeof x === "string").slice(0, 5)
      : [],
    steps,
    explorationTip: String(plan.explorationTip || ""),
  };
}

export function renderExperiment() {
  return `
    <main class="experiment-page" id="experiment-page">
      <section class="courses-hero experiment-hero">
        <p class="courses-eyebrow">AI EXPERIMENT GUIDE</p>
        <h1>AI 科学实验指导</h1>
        <p class="courses-subtitle">
          选定平台中的实验，AI 依据该实验的目标、原理与操作步骤生成专属指导，
          陪你完成“实验准备 — 操作探索 — 结果观察 — 原理解释”的完整流程。
        </p>
      </section>

      <section class="experiment-direct card-panel">
        <div class="courses-section-heading">
          <div>
            <h2>🧪 虚拟实验直达</h2>
            <p>可操作、可测量，数据由科学公式实时计算，AI 导师全程引导。</p>
          </div>
          <a class="button button-secondary" href="#experiments">浏览全部实验</a>
        </div>

        <div class="experiment-direct-grid">
          ${vlabExperiments
            .filter((item) => item.status === "available")
            .map(
              (item) => `
            <a class="experiment-direct-card" href="${
              item.externalHash || `#experiment-run/${item.id}`
            }">
              <span class="experiment-direct-icon">${item.icon}</span>
              <span class="experiment-direct-body">
                <strong>${item.title}</strong>
                <em>${SUBJECTS[item.subject].icon} ${
                SUBJECTS[item.subject].label
              } · ${item.duration}${item.sceneHash ? " · 🧊 3D" : ""}</em>
              </span>
              <span class="experiment-direct-arrow">→</span>
            </a>`
            )
            .join("")}
        </div>

        <p class="experiment-direct-extra">
          需要课程知识点讲解和练习任务？<a href="#courses">进入课程任务中心</a>
        </p>
      </section>

      <div id="experiment-root"></div>
    </main>
  `;
}

export function bindExperiment(container, { onOpenLaboratory } = {}) {
  const root = container.querySelector("#experiment-root");
  if (!root) return;

  let session = getExperimentSession();
  /* 旧版基于课程任务的会话与新实验流程不兼容，直接丢弃 */
  if (session && !session.experimentId) {
    clearExperimentSession();
    session = null;
  }

  /* ---------------- 视图：选择实验 ---------------- */

  function renderSelectView() {
    const saved = getExperimentSession();
    const entries = guidableExperiments();

    root.innerHTML = `
      ${
        saved && saved.plan && saved.experimentId
          ? `
        <section class="experiment-resume card-panel">
          <div>
            <h3>你有一个未完成的实验指导</h3>
            <p>
              《${escapeHTML(saved.plan.title)}》·
              已完成 ${saved.steps.filter((s) => s.analysis).length} /
              ${saved.plan.steps.length} 步
            </p>
          </div>
          <div class="experiment-resume-actions">
            <button class="button button-primary" id="exp-resume">
              继续实验
            </button>
            <button class="button button-secondary" id="exp-discard">
              放弃并重新选择
            </button>
          </div>
        </section>`
          : ""
      }

      <section class="experiment-courses">
        <div class="courses-section-heading">
          <div>
            <h2>第一步：选择实验</h2>
            <p>从平台已有的虚拟实验中选定一个，AI 将依据该实验的目标、原理与步骤生成专属指导。</p>
          </div>
        </div>

        <div class="pick-grid">
          ${entries
            .map((entry) => {
              const record = getVirtualLabRecord(entry.id);
              const doneSteps = record?.logs?.length ? record.logs.length : 0;
              return `
              <article class="pick-card">
                <div class="pick-card-head">
                  <span class="pick-card-icon">${entry.icon}</span>
                  <span class="pick-card-tags">
                    <span class="vlab-tag vlab-tag-${entry.subject}">
                      ${SUBJECTS[entry.subject].icon} ${SUBJECTS[entry.subject].label}
                    </span>
                    ${
                      entry.sceneHash
                        ? '<span class="pick-badge pick-badge-3d">🧊 含 3D</span>'
                        : ""
                    }
                    ${
                      record
                        ? '<span class="pick-badge pick-badge-done">✓ 已学过</span>'
                        : ""
                    }
                  </span>
                </div>
                <h3>${escapeHTML(entry.title)}</h3>
                <p class="pick-card-summary">${escapeHTML(entry.summary)}</p>
                <p class="pick-card-meta">
                  ${STAGES[entry.stage]} · ${escapeHTML(entry.duration)} ·
                  ${escapeHTML(entry.difficulty)}
                  ${record ? ` · 操作记录 ${doneSteps} 条` : ""}
                </p>
                <button
                  class="button button-primary exp-generate"
                  data-experiment-id="${escapeHTML(entry.id)}"
                >
                  ${record ? "重新生成实验指导" : "生成 AI 实验指导"}
                </button>
              </article>`;
            })
            .join("")}
        </div>
      </section>
    `;

    root.querySelector("#exp-resume")?.addEventListener("click", () => {
      session = saved;
      if (session.finished) {
        renderFinishView();
      } else {
        renderStepView();
      }
    });

    root.querySelector("#exp-discard")?.addEventListener("click", () => {
      if (window.confirm("确定放弃当前实验记录吗？")) {
        clearExperimentSession();
        session = null;
        renderSelectView();
      }
    });

    root.querySelectorAll(".exp-generate").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = entries.find(
          (item) => item.id === button.dataset.experimentId
        );
        if (entry) requestPlan(entry);
      });
    });
  }

  /* ---------------- 生成方案 ---------------- */

  function renderGeneratingView(experimentName) {
    root.innerHTML = `
      <section class="card-panel experiment-loading">
        <span class="typing-dots"><span></span><span></span><span></span></span>
        <h2>AI 正在为《${escapeHTML(experimentName)}》生成实验指导…</h2>
        <p>包括实验目的、准备事项、安全提示和分步操作指引，大约需要几十秒。</p>
      </section>
    `;
  }

  async function requestPlan(entry) {
    renderGeneratingView(entry.title);

    try {
      const promptData = await experimentPromptData(entry);
      const data = await generateExperimentPlan(promptData);
      const plan = normalizePlan(data.plan);

      session = {
        experimentId: entry.id,
        experimentTitle: entry.title,
        sceneHash: entry.sceneHash || "",
        runHash: `#experiment-run/${entry.id}`,
        /* courseTitle 保留给分析接口字段，内容即实验名称 */
        courseTitle: entry.title,
        plan,
        currentStep: 0,
        steps: plan.steps.map(() => ({ observation: "", analysis: "" })),
        finished: false,
        startedAt: new Date().toISOString(),
      };

      saveExperimentSession(session);
      renderPlanView();
    } catch (error) {
      console.error("生成实验方案失败：", error);
      renderErrorView(error.message, () => requestPlan(entry));
    }
  }

  function renderErrorView(message, onRetry) {
    root.innerHTML = `
      <section class="card-panel experiment-error">
        <h2>暂时无法完成请求</h2>
        <p>${escapeHTML(message)}</p>
        <div class="experiment-error-actions">
          <button class="button button-primary" id="exp-error-retry">重试</button>
          <button class="button button-secondary" id="exp-error-back">
            返回选择实验
          </button>
        </div>
      </section>
    `;

    root.querySelector("#exp-error-retry").addEventListener("click", onRetry);
    root.querySelector("#exp-error-back").addEventListener("click", () => {
      renderSelectView();
    });
  }

  /** 方案/分步页的“动手操作”按钮：有 3D 场景进 3D，否则进虚拟实验台。 */
  function labButtonHTML(id) {
    if (session.sceneHash) {
      return `<button class="button button-secondary" id="${id}">
        🧊 打开该实验的 3D 场景
      </button>`;
    }
    return `<a class="button button-secondary" href="${session.runHash}">
      🧪 去虚拟实验台动手操作
    </a>`;
  }

  function bindLabButton(id) {
    const button = root.querySelector(`#${id}`);
    if (button && session.sceneHash) {
      button.addEventListener("click", () => {
        window.location.hash = session.sceneHash;
        onOpenLaboratory?.();
      });
    }
  }

  /* ---------------- 视图：实验方案 ---------------- */

  function renderPlanView() {
    const { plan } = session;

    root.innerHTML = `
      <section class="card-panel experiment-plan">
        <div class="experiment-plan-heading">
          <div>
            <p class="courses-eyebrow">EXPERIMENT PLAN</p>
            <h2>${escapeHTML(plan.title)}</h2>
            <p class="experiment-course">对应实验：${escapeHTML(session.experimentTitle)}</p>
          </div>
          <button class="button button-secondary" id="exp-reselect">
            重新选择
          </button>
        </div>

        <div class="experiment-section">
          <h3>🎯 实验目的</h3>
          <p>${escapeHTML(plan.purpose)}</p>
        </div>

        <div class="experiment-section">
          <h3>🧰 实验准备</h3>
          <ul class="experiment-checklist">
            ${plan.preparations
              .map((item) => `<li>${escapeHTML(item)}</li>`)
              .join("")}
          </ul>
        </div>

        <div class="experiment-section experiment-safety">
          <h3>⚠️ 安全与纪律提示</h3>
          <ul>
            ${plan.safetyTips
              .map((item) => `<li>${escapeHTML(item)}</li>`)
              .join("")}
          </ul>
        </div>

        <div class="experiment-section">
          <h3>🚶 实验步骤（共 ${plan.steps.length} 步）</h3>
          <ol class="experiment-step-overview">
            ${plan.steps
              .map(
                (step, index) => `
              <li>
                <strong>第 ${index + 1} 步 · ${escapeHTML(step.title)}</strong>
                <p>${escapeHTML(step.observationPoint)}</p>
              </li>`
              )
              .join("")}
          </ol>
        </div>

        ${
          plan.explorationTip
            ? `
        <div class="experiment-section experiment-tip">
          <h3>💡 动手探索建议</h3>
          <p>${escapeHTML(plan.explorationTip)}</p>
        </div>`
            : ""
        }

        <div class="experiment-plan-actions">
          <button class="button button-primary" id="exp-start">
            开始第一步实验
          </button>
          ${labButtonHTML("exp-open-lab")}
        </div>
      </section>
    `;

    root.querySelector("#exp-reselect").addEventListener("click", () => {
      if (window.confirm("返回后当前实验方案将被清除，确定吗？")) {
        clearExperimentSession();
        session = null;
        renderSelectView();
      }
    });

    root.querySelector("#exp-start").addEventListener("click", () => {
      session.currentStep = 0;
      saveExperimentSession(session);
      renderStepView();
    });

    bindLabButton("exp-open-lab");
  }

  /* ---------------- 视图：分步实验 ---------------- */

  function renderStepView() {
    const { plan, steps, currentStep } = session;
    const total = plan.steps.length;
    const step = plan.steps[currentStep];
    const record = steps[currentStep];
    const isLast = currentStep === total - 1;

    root.innerHTML = `
      <section class="card-panel experiment-workspace">
        <div class="experiment-plan-heading">
          <div>
            <p class="courses-eyebrow">STEP BY STEP</p>
            <h2>${escapeHTML(plan.title)}</h2>
          </div>
          <button class="button button-secondary" id="exp-back-plan">
            查看完整方案
          </button>
        </div>

        <div class="experiment-progress" role="progressbar"
             aria-valuemin="0" aria-valuemax="${total}"
             aria-valuenow="${currentStep}">
          ${plan.steps
            .map(
              (s, i) => `
            <div class="progress-dot ${
              i < currentStep
                ? "is-done"
                : i === currentStep
                  ? record.analysis
                    ? "is-done"
                    : "is-current"
                  : ""
            }" title="${escapeHTML(s.title)}">${i + 1}</div>
            ${i < total - 1 ? '<div class="progress-line"></div>' : ""}`
            )
            .join("")}
        </div>

        <article class="step-card" id="step-card">
          <p class="step-index">第 ${currentStep + 1} / ${total} 步 · ${escapeHTML(session.experimentTitle)}</p>
          <h3>${escapeHTML(step.title)}</h3>

          <div class="experiment-section">
            <h4>怎么做</h4>
            <p>${escapeHTML(step.instruction)}</p>
          </div>

          <div class="experiment-section">
            <h4>🔍 观察重点</h4>
            <p>${escapeHTML(step.observationPoint) || "认真观察实验过程中的现象。"}</p>
          </div>

          <div class="experiment-actions-inline">
            ${labButtonHTML("exp-open-lab-step")}
            <a class="button button-secondary" href="${session.runHash}">
              打开虚拟实验台
            </a>
          </div>

          <div class="experiment-section">
            <h4>📝 我的观察记录</h4>
            <textarea
              id="step-observation"
              rows="4"
              maxlength="2000"
              placeholder="把你看到的现象、数据或疑问记录下来……"
            >${escapeHTML(record.observation || "")}</textarea>

            <div class="step-submit-row">
              <button class="button button-primary" id="step-analyze"
                ${record.analysis ? "hidden" : ""}>
                提交观察，请 AI 分析
              </button>
              <span class="step-analyze-hint" ${record.analysis ? "hidden" : ""}>
                需要先提交观察记录并获得 AI 分析，才能进入下一步
              </span>
            </div>
          </div>

          <div id="step-analysis-slot"></div>

          <details class="expected-phenomenon" ${record.analysis ? "open" : ""}>
            <summary>👀 查看这一步的预期现象</summary>
            <p>${escapeHTML(step.expectedPhenomenon) || "请以你自己的观察为准。"}</p>
          </details>
        </article>
      </section>
    `;

    // 已完成的步骤显示分析结果
    if (record.analysis) {
      renderAnalysisSlot(step, record, isLast, { locked: true });
    }

    root.querySelector("#exp-back-plan").addEventListener("click", () => {
      renderPlanView();
    });

    bindLabButton("exp-open-lab-step");

    root.querySelector("#step-analyze").addEventListener("click", () => {
      submitObservation(step, record, isLast);
    });
  }

  function renderAnalysisSlot(step, record, isLast, { locked = false } = {}) {
    const slot = root.querySelector("#step-analysis-slot");
    if (!slot) return;

    slot.innerHTML = `
      <div class="experiment-section ai-analysis">
        <h4>🤖 AI 观察分析与原理讲解</h4>
        <div class="markdown-body analysis-content">
          ${renderMarkdown(record.analysis)}
        </div>
        ${
          locked
            ? `
          <div class="step-nav-row">
            ${
              isLast
                ? `<button class="button button-primary" id="step-finish">完成实验，查看总结</button>`
                : `<button class="button button-primary" id="step-next">进入第 ${session.currentStep + 2} 步 →</button>`
            }
          </div>`
            : ""
        }
      </div>
    `;

    if (locked) {
      root.querySelector("#step-next")?.addEventListener("click", () => {
        session.currentStep += 1;
        saveExperimentSession(session);
        renderStepView();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      root.querySelector("#step-finish")?.addEventListener("click", () => {
        session.finished = true;
        saveExperimentSession(session);
        renderFinishView();
      });
    }
  }

  async function submitObservation(step, record, isLast) {
    const textarea = root.querySelector("#step-observation");
    const observation = textarea.value.trim();

    if (!observation) {
      window.alert("请先填写你的观察记录。");
      return;
    }

    const button = root.querySelector("#step-analyze");
    button.disabled = true;
    button.textContent = "AI 正在分析…";

    const slot = root.querySelector("#step-analysis-slot");
    slot.innerHTML = `
      <div class="experiment-section ai-analysis">
        <span class="typing-dots"><span></span><span></span><span></span></span>
        <p>AI 正在分析你的观察并讲解原理…</p>
      </div>
    `;

    try {
      const data = await analyzeObservation({
        courseTitle: session.experimentTitle,
        stepTitle: step.title,
        observation,
        expectedPhenomenon: step.expectedPhenomenon,
      });

      record.observation = observation;
      record.analysis = data.analysis;
      record.analyzedAt = new Date().toISOString();
      saveExperimentSession(session);

      renderAnalysisSlot(step, record, isLast, { locked: true });

      const analyzeBtn = root.querySelector("#step-analyze");
      if (analyzeBtn) analyzeBtn.hidden = true;
      root.querySelector(".step-analyze-hint")?.setAttribute("hidden", "");
      root.querySelector(".expected-phenomenon")?.setAttribute("open", "");
    } catch (error) {
      console.error("观察分析失败：", error);
      slot.innerHTML = `
        <div class="experiment-section ai-analysis is-error">
          <h4>分析失败</h4>
          <p>${escapeHTML(error.message)}</p>
          <button class="button button-secondary" id="step-retry">
            重新提交
          </button>
        </div>
      `;
      slot.querySelector("#step-retry").addEventListener("click", () => {
        submitObservation(step, record, isLast);
      });

      button.disabled = false;
      button.textContent = "提交观察，请 AI 分析";
    }
  }

  /* ---------------- 视图：实验完成 ---------------- */

  function renderFinishView() {
    const { plan, steps } = session;

    root.innerHTML = `
      <section class="card-panel experiment-finish">
        <p class="courses-eyebrow">EXPERIMENT COMPLETE</p>
        <h2>🎉 恭喜完成《${escapeHTML(plan.title)}》</h2>
        <p>
          你已经完成全部 ${plan.steps.length} 个实验步骤，
          下面是你的观察记录与 AI 分析回顾。
        </p>

        <div class="experiment-summary">
          ${plan.steps
            .map(
              (step, index) => `
            <article class="summary-step">
              <h3>第 ${index + 1} 步 · ${escapeHTML(step.title)}</h3>
              <p class="summary-observation">
                <strong>我的观察：</strong>${escapeHTML(steps[index]?.observation || "（未记录）")}
              </p>
              <div class="markdown-body summary-analysis">
                ${renderMarkdown(steps[index]?.analysis || "（未分析）")}
              </div>
            </article>`
            )
            .join("")}
        </div>

        <div class="experiment-plan-actions">
          <button class="button button-primary" id="exp-to-quiz">
            去做该实验的智能测评
          </button>
          <a class="button button-secondary" href="${session.runHash}">
            回到虚拟实验台
          </a>
          <button class="button button-secondary" id="exp-new">
            选择其他实验
          </button>
        </div>
      </section>
    `;

    root.querySelector("#exp-to-quiz").addEventListener("click", () => {
      window.location.hash = "#quiz";
    });

    root.querySelector("#exp-new").addEventListener("click", () => {
      clearExperimentSession();
      session = null;
      renderSelectView();
    });
  }

  /* ---------------- 初始渲染 ---------------- */

  if (session && session.plan) {
    if (session.finished) {
      renderFinishView();
    } else {
      renderStepView();
    }
  } else {
    renderSelectView();
  }
}
