import * as echarts from "echarts";
import {
  buildLearningStats,
  buildRecommendationPayload,
} from "../services/learning-stats.js";
import { getLearningRecommendation } from "../services/ai-client.js";
import { renderMarkdown } from "../lib/markdown.js";
import { experiments, SUBJECTS, STAGES } from "../experiments/catalog.js";
import {
  getFeedbackList,
  addFeedback,
  exportAllLearningData,
  getVirtualLabRecord,
  getQuizAttempts,
} from "../services/storage.js";

let chartInstances = [];
let resizeBound = false;

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

const BLUE = "#2563eb";
const LIGHT_BLUE = "#93c5fd";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const GRAY = "#cbd5e1";

export function renderDashboard() {
  return `
    <main class="dashboard-page" id="dashboard-page">
      <section class="courses-hero dashboard-hero">
        <p class="courses-eyebrow">LEARNING ANALYTICS</p>
        <h1>学习情况分析</h1>
        <p class="courses-subtitle">
          先看整体学习概览，再点击任一实验查看该实验的步骤完成、测量数据、结论报告与测评情况。
        </p>
      </section>

      <div class="dashboard-container" id="dashboard-container"></div>
    </main>
  `;
}

export function disposeDashboard() {
  chartInstances.forEach((chart) => chart.dispose());
  chartInstances = [];
}

export function bindDashboard(container) {
  const host = container.querySelector("#dashboard-container");
  if (!host) return;
  renderOverview(host);
}

/* ================================================================ */
/* 总览视图                                                          */
/* ================================================================ */

function overviewTemplate() {
  return `
    <section class="stat-cards" id="stat-cards"></section>

    <section class="dashboard-grid">
      <article class="card-panel chart-card">
        <h3>课程任务完成率</h3>
        <div class="chart-box" id="chart-tasks"></div>
      </article>

      <article class="card-panel chart-card">
        <h3>测验成绩趋势</h3>
        <div class="chart-box" id="chart-score"></div>
      </article>

      <article class="card-panel chart-card">
        <h3>薄弱知识点（错题次数）</h3>
        <div class="chart-box" id="chart-weak"></div>
      </article>

      <article class="card-panel chart-card">
        <h3>近 7 天学习时长（分钟）</h3>
        <div class="chart-box" id="chart-study"></div>
      </article>
    </section>

    <section class="card-panel vlab-progress-panel">
      <div class="recommend-heading">
        <div>
          <h2>🧪 各实验学习分析</h2>
          <p>点击任一实验卡片，查看该实验的步骤完成清单、测量数据、结论报告与对应测评。</p>
        </div>
      </div>
      <div class="vlab-progress-list" id="vlab-progress-list"></div>
      <div class="chart-box chart-box-vlab" id="chart-vlab"></div>
    </section>

    <section class="card-panel recommend-panel">
      <div class="recommend-heading">
        <div>
          <h2>🎯 AI 个性化复习建议</h2>
          <p>基于你的真实任务完成情况、测验错题和学习时长生成。</p>
        </div>
        <button class="button button-primary" id="recommend-btn">
          获取复习建议
        </button>
      </div>
      <div class="markdown-body recommend-content" id="recommend-content">
        <p class="dashboard-placeholder">
          点击上方按钮，AI 教练会根据数据为你制定未来 3 天的复习计划。
        </p>
      </div>
    </section>

    <section class="card-panel wrong-panel">
      <h2>📕 错题本</h2>
      <div id="wrong-list"></div>
    </section>

    <section class="card-panel feedback-panel">
      <h2>💬 学习反馈</h2>
      <p>你的反馈将用于改进课程内容和 AI 引导方式（仅保存在本机，可导出）。</p>

      <form id="feedback-form">
        <div class="feedback-rating">
          <span>整体体验评分：</span>
          <div class="rating-stars" id="rating-stars">
            ${[5, 4, 3, 2, 1]
              .map(
                (star) => `
              <button type="button" class="star-btn" data-rating="${star}"
                aria-label="${star} 星">★</button>`
              )
              .join("")}
            <strong id="rating-text">未评分</strong>
          </div>
        </div>

        <label for="feedback-easy">
          你觉得哪些内容最容易理解、最有帮助？
        </label>
        <textarea id="feedback-easy" rows="2" maxlength="500"
          placeholder="例如：3D 场景观察行星、AI 分步讲解……"></textarea>

        <label for="feedback-hard">
          哪些地方让你困惑或觉得不好用？
        </label>
        <textarea id="feedback-hard" rows="2" maxlength="500"
          placeholder="例如：有些术语太难、等待 AI 回答时间较长……"></textarea>

        <label for="feedback-suggestion">
          其他建议（想新增的实验、功能等）
        </label>
        <textarea id="feedback-suggestion" rows="2" maxlength="500"
          placeholder="欢迎畅所欲言……"></textarea>

        <button type="submit" class="button button-primary">
          提交反馈
        </button>
      </form>

      <div class="feedback-list" id="feedback-list"></div>
    </section>

    <section class="card-panel export-panel">
      <h2>📊 评估数据导出</h2>
      <p>
        导出本机全部学习数据（课程任务、测验与错题、实验记录、AI 对话、学习时长、反馈），
        供项目试用评估与统计分析使用。数据为 JSON 格式，不包含姓名等个人身份信息。
      </p>
      <button class="button button-secondary" id="export-data-btn">
        导出学习数据（JSON）
      </button>
      <p class="export-note">
        说明：当前统计来自本机浏览器，尚未接入多用户数据库；
        正式试用阶段将在后端汇总使用人数等整体指标。
      </p>
    </section>
  `;
}

function renderOverview(host) {
  disposeDashboard();
  host.innerHTML = overviewTemplate();

  const stats = buildLearningStats();
  renderStatCards(stats);
  renderCharts(stats);
  renderWrongList(stats.wrongQuestions);
  renderVlabProgress(host);
  bindRecommendation();
  bindFeedback(host);
  bindExport();

  if (!resizeBound) {
    window.addEventListener("resize", handleResize);
    resizeBound = true;
  }
}

/* ================================================================ */
/* 单实验详情视图                                                    */
/* ================================================================ */

async function renderExperimentDetail(host, entryId) {
  disposeDashboard();

  const entry = experiments.find((item) => item.id === entryId);
  if (!entry) {
    renderOverview(host);
    return;
  }

  host.innerHTML = `
    <section class="card-panel exp-detail-loading">
      <span class="typing-dots"><span></span><span></span><span></span></span>
      <h2>正在汇总《${escapeHTML(entry.title)}》的学习数据…</h2>
    </section>
  `;

  const record = getVirtualLabRecord(entry.id);
  const subject = SUBJECTS[entry.subject];

  let module = null;
  let stepsState = [];
  let reportData = null;

  if (record) {
    try {
      module = (await entry.loadModule()).default;
      const state = record.state ?? module.createInitialState();
      const analysis = module.analyze(state);
      const ctx = {
        state,
        analysis,
        data: record.data,
        conclusion: record.conclusion || "",
        everValid: Boolean(record.everValid),
      };

      stepsState = module.steps.map((step) => ({
        title: step.title,
        detail: step.detail,
        done: Boolean(module.isStepDone(step.id, ctx)),
      }));

      reportData = module.buildReportData?.(record.data) || null;
    } catch (error) {
      console.warn(`读取 ${entry.id} 实验详情失败：`, error);
    }
  }

  /* 该实验对应的测评记录（兼容旧版无 experimentId 的记录） */
  const attempts = getQuizAttempts().filter(
    (a) => a.experimentId === entry.id || a.courseId === entry.id
  );
  const stepsDone = stepsState.filter((s) => s.done).length;
  const avgScore = attempts.length
    ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length)
    : null;
  const logs = Array.isArray(record?.logs) ? record.logs : [];

  host.innerHTML = `
    <div class="exp-detail-nav">
      <button class="button button-secondary" id="exp-detail-back">
        ← 返回学习分析总览
      </button>
    </div>

    <section class="card-panel exp-detail-hero">
      <span class="exp-detail-icon">${entry.icon}</span>
      <div class="exp-detail-heading">
        <p class="courses-eyebrow">EXPERIMENT ANALYTICS</p>
        <h2>${escapeHTML(entry.title)}</h2>
        <p class="exp-detail-meta">
          <span class="vlab-tag vlab-tag-${entry.subject}">
            ${subject.icon} ${subject.label}
          </span>
          <span class="exp-detail-meta-item">${STAGES[entry.stage]}</span>
          <span class="exp-detail-meta-item">${escapeHTML(entry.duration)}</span>
          <span class="exp-detail-meta-item">难度：${escapeHTML(entry.difficulty)}</span>
        </p>
        <p class="exp-detail-principle"><strong>实验原理：</strong>${escapeHTML(entry.principle)}</p>
      </div>
    </section>

    <section class="exp-detail-cards">
      <article class="card-panel exp-detail-stat">
        <p class="stat-label">步骤完成</p>
        <p class="stat-value">${record ? `${stepsDone}/${stepsState.length}` : "—"}</p>
        <p class="stat-sub">${record ? "按实验台规则判定" : "尚未开始实验"}</p>
      </article>
      <article class="card-panel exp-detail-stat">
        <p class="stat-label">有效测量配置</p>
        <p class="stat-value">${record?.everValid ? "✓ 达成" : "—"}</p>
        <p class="stat-sub">测量区出现过有效状态</p>
      </article>
      <article class="card-panel exp-detail-stat">
        <p class="stat-label">实验测评</p>
        <p class="stat-value">${attempts.length ? `${avgScore}` : "—"}</p>
        <p class="stat-sub">${attempts.length ? `共 ${attempts.length} 次，平均 ${avgScore} 分` : "还没有测评记录"}</p>
      </article>
      <article class="card-panel exp-detail-stat">
        <p class="stat-label">操作记录</p>
        <p class="stat-value">${logs.length}</p>
        <p class="stat-sub">实验台自动留存的操作日志（条）</p>
      </article>
    </section>

    <section class="dashboard-grid exp-detail-grid">
      <article class="card-panel exp-detail-block">
        <h3>✅ 实验步骤完成清单</h3>
        ${
          record
            ? `<ul class="exp-step-list">
                ${stepsState
                  .map(
                    (step, index) => `
                  <li class="${step.done ? "is-done" : ""}">
                    <span class="exp-step-check">${step.done ? "✓" : index + 1}</span>
                    <div>
                      <strong>${escapeHTML(step.title)}</strong>
                      <p>${escapeHTML(step.detail)}</p>
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="dashboard-placeholder">还没有开始这个实验。完成操作后，这里会逐项显示步骤完成情况。</p>`
        }
      </article>

      <article class="card-panel exp-detail-block">
        <h3>📋 测量数据</h3>
        ${
          reportData && reportData.rows.length
            ? `<div class="exp-data-table-wrap">
                <table class="exp-data-table">
                  <thead><tr>${reportData.headers
                    .map((h) => `<th>${escapeHTML(h)}</th>`)
                    .join("")}</tr></thead>
                  <tbody>
                    ${reportData.rows
                      .map(
                        (row) => `<tr>${row
                          .map((cell) => `<td>${escapeHTML(String(cell))}</td>`)
                          .join("")}</tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
              <p class="exp-data-note">数据为你在实验台操作时由规则引擎实时测得，AI 不参与计算。</p>`
            : `<p class="dashboard-placeholder">还没有保存测量数据。在实验台完成有效操作后会自动记录。</p>`
        }
      </article>
    </section>

    <section class="dashboard-grid exp-detail-grid">
      <article class="card-panel exp-detail-block">
        <h3>📝 我的实验结论</h3>
        ${
          record?.conclusion && record.conclusion.trim()
            ? `<p class="exp-conclusion-text">${escapeHTML(record.conclusion)}</p>`
            : `<p class="dashboard-placeholder">还没有填写实验结论。</p>`
        }
      </article>

      <article class="card-panel exp-detail-block">
        <h3>📑 AI 实验报告</h3>
        ${
          record?.report
            ? `<details class="exp-report-details">
                <summary>查看 AI 生成的实验报告</summary>
                <div class="markdown-body">${renderMarkdown(record.report)}</div>
              </details>`
            : `<p class="dashboard-placeholder">还没有生成实验报告，可在实验台点击“生成 AI 实验报告”。</p>`
        }
      </article>
    </section>

    <section class="dashboard-grid exp-detail-grid">
      <article class="card-panel exp-detail-block">
        <h3>🧾 近期操作日志</h3>
        ${
          logs.length
            ? `<ul class="exp-log-list">
                ${logs
                  .slice(-12)
                  .reverse()
                  .map(
                    (log) => `
                  <li>
                    <time>${escapeHTML(log.time || "")}</time>
                    <span class="exp-log-type exp-log-type-${escapeHTML(log.type || "action")}">
                      ${escapeHTML(log.type === "measure" ? "测量" : log.type === "ai" ? "AI" : "操作")}
                    </span>
                    <p>${escapeHTML(log.text || "")}</p>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="dashboard-placeholder">暂无操作日志。</p>`
        }
      </article>

      <article class="card-panel exp-detail-block">
        <h3>📝 该实验的测评记录</h3>
        ${
          attempts.length
            ? `<ul class="exp-quiz-list">
                ${attempts
                  .slice(0, 6)
                  .map(
                    (a) => `
                  <li>
                    <span class="quiz-history-score ${
                      a.score >= 80 ? "is-good" : a.score >= 60 ? "is-mid" : "is-low"
                    }">${a.score}</span>
                    <div>
                      <p>${new Date(a.createdAt).toLocaleString("zh-CN")}</p>
                      <em>答对 ${a.correctCount}/${a.total} 题</em>
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>
              <a class="button button-secondary exp-detail-action" href="#quiz">
                去测评页查看完整解析
              </a>`
            : `<p class="dashboard-placeholder">还没有该实验的测评记录。</p>`
        }
      </article>
    </section>

    <section class="card-panel exp-detail-actions">
      <h3>继续学习</h3>
      <div class="experiment-plan-actions">
        <a class="button button-primary" href="#experiment-run/${escapeHTML(entry.id)}">
          ${record ? "继续这个实验" : "开始这个实验"}
        </a>
        ${
          entry.sceneHash
            ? `<a class="button button-secondary" href="${entry.sceneHash}">
                🧊 打开 3D 场景
              </a>`
            : ""
        }
        <a class="button button-secondary" href="#quiz">
          ${record ? "生成 / 再做该实验测评" : "去智能测评"}
        </a>
      </div>
    </section>
  `;

  host.querySelector("#exp-detail-back").addEventListener("click", () => {
    renderOverview(host);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ---------------- 各实验学习分析（总览卡片） ---------------- */

async function renderVlabProgress(host) {
  const listHost = host.querySelector("#vlab-progress-list");
  if (!listHost) return;

  const candidates = experiments.filter(
    (item) => item.status === "available" && !item.externalHash
  );
  const attemptsAll = getQuizAttempts();
  const items = [];

  for (const entry of candidates) {
    const record = getVirtualLabRecord(entry.id);

    const relatedAttempts = attemptsAll.filter(
      (a) => a.experimentId === entry.id || a.courseId === entry.id
    );

    if (!record) {
      items.push({ entry, started: false, quizCount: relatedAttempts.length, quizAvg: null });
      continue;
    }

    let stepsDone = 0;
    let stepsTotal = 0;

    /* 复用实验模块的规则引擎判定步骤完成度（与实验台判定口径一致） */
    try {
      const module = (await entry.loadModule()).default;
      const state = record.state ?? module.createInitialState();
      const analysis = module.analyze(state);
      const ctx = {
        state,
        analysis,
        data: record.data,
        conclusion: record.conclusion || "",
        everValid: Boolean(record.everValid),
      };
      stepsTotal = module.steps.length;
      stepsDone = module.steps.filter((step) =>
        module.isStepDone(step.id, ctx)
      ).length;
    } catch (error) {
      console.warn(`统计 ${entry.id} 实验进度失败：`, error);
    }

    items.push({
      entry,
      started: true,
      stepsDone,
      stepsTotal,
      hasConclusion: Boolean(record.conclusion && record.conclusion.trim()),
      hasReport: Boolean(record.report),
      logCount: Array.isArray(record.logs) ? record.logs.length : 0,
      updatedAt: record.updatedAt,
      quizCount: relatedAttempts.length,
      quizAvg: relatedAttempts.length
        ? Math.round(
            relatedAttempts.reduce((sum, a) => sum + a.score, 0) /
              relatedAttempts.length
          )
        : null,
    });
  }

  listHost.innerHTML = items
    .map((item) => {
      const percent =
        item.started && item.stepsTotal
          ? Math.round((item.stepsDone / item.stepsTotal) * 100)
          : 0;

      return `
      <article class="vlab-progress-item is-clickable"
        data-experiment-id="${item.entry.id}"
        role="button" tabindex="0"
        aria-label="查看 ${escapeHTML(item.entry.title)} 的学习分析">
        <span class="vlab-progress-icon">${item.entry.icon}</span>
        <div class="vlab-progress-main">
          <header>
            <strong>${item.entry.title}</strong>
            <span class="vlab-progress-percent">${
              item.started ? `${item.stepsDone}/${item.stepsTotal} 步` : "未开始"
            }</span>
          </header>
          <div class="vlab-progress-bar">
            <span style="width:${percent}%"></span>
          </div>
          <div class="vlab-progress-chips">
            ${
              item.started
                ? `
              <span class="vlab-chip ${item.hasConclusion ? "is-ok" : ""}">
                结论 ${item.hasConclusion ? "✓" : "待填写"}
              </span>
              <span class="vlab-chip ${item.hasReport ? "is-ok" : ""}">
                报告 ${item.hasReport ? "✓" : "未生成"}
              </span>
              <span class="vlab-chip">操作记录 ${item.logCount} 条</span>
              <span class="vlab-chip ${item.quizCount ? "is-ok" : ""}">
                测评 ${item.quizCount ? `${item.quizCount} 次 · 均 ${item.quizAvg} 分` : "未测评"}
              </span>
              ${
                item.updatedAt
                  ? `<span class="vlab-chip">更新于 ${new Date(
                      item.updatedAt
                    ).toLocaleDateString("zh-CN")}</span>`
                  : ""
              }`
                : `<span class="vlab-chip">点击卡片查看详情，或直接开始第一次探索</span>`
            }
          </div>
        </div>
        <a class="button button-secondary vlab-progress-link"
          href="${item.started ? `#experiment-run/${item.entry.id}` : "#experiments"}"
          data-no-detail="1">
          ${item.started ? "继续实验" : "开始实验"}
        </a>
        <span class="vlab-progress-detail-arrow">查看分析 →</span>
      </article>`;
    })
    .join("");

  /* 整卡点击 → 单实验详情；卡片内链接不触发 */
  const openDetail = (id) => renderExperimentDetail(host, id);

  listHost.querySelectorAll(".vlab-progress-item").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-no-detail]")) return;
      openDetail(card.dataset.experimentId);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        if (event.target.closest("[data-no-detail]")) return;
        event.preventDefault();
        openDetail(card.dataset.experimentId);
      }
    });
  });

  renderVlabChart(items);
}

function renderVlabChart(items) {
  const el = document.querySelector("#chart-vlab");
  if (!el) return;

  const started = items.filter((item) => item.started && item.stepsTotal > 0);

  if (started.length === 0) {
    el.innerHTML =
      '<p class="dashboard-placeholder">还没有虚拟实验记录。完成一次虚拟实验后，这里会显示各实验的步骤完成度对比。</p>';
    return;
  }

  initChart("#chart-vlab", {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `${value}%`,
    },
    grid: { left: 140, right: 40, top: 16, bottom: 24 },
    xAxis: { type: "value", max: 100 },
    yAxis: {
      type: "category",
      data: started.map((item) => item.entry.title).reverse(),
    },
    series: [
      {
        type: "bar",
        barWidth: 20,
        itemStyle: { color: BLUE, borderRadius: [0, 8, 8, 0] },
        label: { show: true, position: "right", formatter: "{c}%" },
        data: started
          .map((item) =>
            Math.round((item.stepsDone / item.stepsTotal) * 100)
          )
          .reverse(),
      },
    ],
  });
}

/* ---------------- 统计卡片 ---------------- */

function renderStatCards(stats) {
  const host = document.querySelector("#stat-cards");
  if (!host) return;

  const cards = [
    {
      label: "课程任务完成",
      value: `${stats.tasks.completed}/${stats.tasks.total}`,
      sub: `完成率 ${stats.tasks.completionRate}%`,
    },
    {
      label: "测验平均得分",
      value:
        stats.quizzes.averageScore === null
          ? "—"
          : `${stats.quizzes.averageScore}`,
      sub:
        stats.quizzes.accuracy === null
          ? "还没有测验记录"
          : `总正确率 ${stats.quizzes.accuracy}% · 共 ${stats.quizzes.attemptsCount} 次`,
    },
    {
      label: "累计学习时长",
      value: formatDuration(stats.study.totalSeconds),
      sub: "页面处于活动状态时自动计时",
    },
    {
      label: "薄弱知识点",
      value: stats.weakPoints.length ? `${stats.weakPoints.length}` : "—",
      sub: stats.weakPoints.length
        ? `最需复习：${stats.weakPoints[0].name}`
        : "完成测验后自动分析",
    },
  ];

  host.innerHTML = cards
    .map(
      (card) => `
    <article class="stat-card card-panel">
      <p class="stat-label">${card.label}</p>
      <p class="stat-value">${card.value}</p>
      <p class="stat-sub">${card.sub}</p>
    </article>`
    )
    .join("");
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

/* ---------------- 图表 ---------------- */

function initChart(id, option) {
  const el = document.querySelector(id);
  if (!el) return;

  const chart = echarts.init(el);
  chart.setOption(option);
  chartInstances.push(chart);
}

function renderCharts(stats) {
  // 1. 任务完成率
  initChart("#chart-tasks", {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        avoidLabelOverlap: true,
        label: {
          formatter: `${stats.tasks.completed}/${stats.tasks.total}`,
          fontSize: 16,
          fontWeight: "bold",
        },
        data: [
          {
            value: stats.tasks.completed,
            name: "已完成",
            itemStyle: { color: BLUE },
          },
          {
            value: Math.max(0, stats.tasks.total - stats.tasks.completed),
            name: "未完成",
            itemStyle: { color: GRAY },
          },
        ],
      },
    ],
  });

  // 2. 成绩趋势
  const trend = stats.quizzes.scoreTrend;
  initChart("#chart-score", {
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: "category",
      data: trend.length ? trend.map((t) => t.label) : [""],
    },
    yAxis: { type: "value", min: 0, max: 100 },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: BLUE },
        itemStyle: { color: BLUE },
        areaStyle: { color: LIGHT_BLUE, opacity: 0.25 },
        data: trend.length ? trend.map((t) => t.score) : [],
        markLine: {
          silent: true,
          data: [{ yAxis: 60 }],
          lineStyle: { color: AMBER, type: "dashed" },
        },
      },
    ],
    graphic: trend.length
      ? null
      : [
          {
            type: "text",
            left: "center",
            top: "middle",
            style: {
              text: "完成一次测验后显示趋势",
              fill: "#94a3b8",
              fontSize: 13,
            },
          },
        ],
  });

  // 3. 薄弱知识点
  const weak = stats.weakPoints;
  initChart("#chart-weak", {
    tooltip: { trigger: "axis" },
    grid: { left: 90, right: 30, top: 16, bottom: 24 },
    xAxis: { type: "value", minInterval: 1 },
    yAxis: {
      type: "category",
      data: weak.length
        ? weak.map((w) => w.name).reverse()
        : ["暂无错题"],
    },
    series: [
      {
        type: "bar",
        barWidth: 18,
        itemStyle: { color: RED, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right" },
        data: weak.length
          ? weak.map((w) => w.count).reverse()
          : [0],
      },
    ],
  });

  // 4. 近 7 天学习时长
  const days = stats.study.weekDays;
  initChart("#chart-study", {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `${value} 分钟`,
    },
    grid: { left: 40, right: 16, top: 20, bottom: 28 },
    xAxis: { type: "category", data: days.map((d) => d.label) },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        type: "bar",
        barWidth: 22,
        itemStyle: { color: GREEN, borderRadius: [6, 6, 0, 0] },
        data: days.map((d) => Math.round(d.seconds / 60)),
      },
    ],
  });
}

function handleResize() {
  chartInstances.forEach((chart) => chart.resize());
}

/* ---------------- 错题本 ---------------- */

function renderWrongList(wrongQuestions) {
  const host = document.querySelector("#wrong-list");
  if (!host) return;

  if (wrongQuestions.length === 0) {
    host.innerHTML = `
      <p class="dashboard-placeholder">
        还没有错题记录。完成 AI 智能小测后，答错的题目会自动收录到这里。
      </p>`;
    return;
  }

  host.innerHTML = wrongQuestions
    .slice(0, 8)
    .map(
      (item) => `
    <article class="wrong-item">
      <header>
        <span class="wrong-point">${escapeHTML(item.knowledgePoint)}</span>
        <span class="wrong-course">${escapeHTML(item.courseTitle)}</span>
      </header>
      <p class="wrong-question">${escapeHTML(item.question)}</p>
      <p class="wrong-answer"><strong>我的答案：</strong>${escapeHTML(
        String(item.studentAnswer ?? "（未作答）")
      )}</p>
      <p class="wrong-answer is-correct-text"><strong>正确答案：</strong>${escapeHTML(
        String(item.correctAnswer ?? "—")
      )}</p>
      ${
        item.explanation
          ? `<p class="wrong-explain">${escapeHTML(item.explanation)}</p>`
          : ""
      }
    </article>`
    )
    .join("");
}

/* ---------------- AI 复习建议 ---------------- */

function bindRecommendation() {
  const button = document.querySelector("#recommend-btn");
  const host = document.querySelector("#recommend-content");

  button?.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "AI 正在分析学习数据…";
    host.innerHTML = `
      <span class="typing-dots"><span></span><span></span><span></span></span>
    `;

    try {
      const data = await getLearningRecommendation(
        buildRecommendationPayload()
      );
      host.innerHTML = renderMarkdown(data.recommendation);
    } catch (error) {
      console.error("生成复习建议失败：", error);
      host.innerHTML = `
        <div class="ai-error-box">
          <p><strong>暂时无法生成建议：</strong>${escapeHTML(error.message)}</p>
          <button class="button button-secondary" id="recommend-retry">
            重试
          </button>
        </div>
      `;
      host.querySelector("#recommend-retry")?.addEventListener("click", () => {
        button.disabled = false;
        button.click();
      });
    } finally {
      button.disabled = false;
      button.textContent = "重新生成建议";
    }
  });
}

/* ---------------- 反馈 ---------------- */

function bindFeedback(container) {
  const form = container.querySelector("#feedback-form");
  let rating = 0;

  function renderRating() {
    container.querySelectorAll(".star-btn").forEach((btn) => {
      const value = Number(btn.dataset.rating);
      btn.classList.toggle("is-active", value <= rating);
    });

    const text = container.querySelector("#rating-text");
    if (text) {
      text.textContent = rating ? `${rating} 星` : "未评分";
    }
  }

  container.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      rating = Number(btn.dataset.rating);
      renderRating();
    });
  });

  renderRating();
  renderFeedbackList();

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const easy = container.querySelector("#feedback-easy").value.trim();
    const hard = container.querySelector("#feedback-hard").value.trim();
    const suggestion = container
      .querySelector("#feedback-suggestion")
      .value.trim();

    if (!rating && !easy && !hard && !suggestion) {
      window.alert("请先评分或填写至少一条反馈内容。");
      return;
    }

    addFeedback({ rating, easy, hard, suggestion });
    form.reset();
    rating = 0;
    renderRating();
    renderFeedbackList();

    window.alert("感谢你的反馈，已保存在本机！");
  });
}

function renderFeedbackList() {
  const host = document.querySelector("#feedback-list");
  if (!host) return;

  const list = getFeedbackList().slice(0, 5);

  if (list.length === 0) {
    host.innerHTML = `<p class="dashboard-placeholder">还没有提交过反馈。</p>`;
    return;
  }

  host.innerHTML = list
    .map(
      (item) => `
    <article class="feedback-item">
      <header>
        <span class="feedback-stars">${"★".repeat(item.rating)}${"☆".repeat(
          5 - item.rating
        )}</span>
        <time>${new Date(item.createdAt).toLocaleString("zh-CN")}</time>
      </header>
      ${
        item.easy
          ? `<p><strong>有帮助：</strong>${escapeHTML(item.easy)}</p>`
          : ""
      }
      ${
        item.hard
          ? `<p><strong>待改进：</strong>${escapeHTML(item.hard)}</p>`
          : ""
      }
      ${
        item.suggestion
          ? `<p><strong>建议：</strong>${escapeHTML(item.suggestion)}</p>`
          : ""
      }
    </article>`
    )
    .join("");
}

/* ---------------- 数据导出 ---------------- */

function bindExport() {
  const button = document.querySelector("#export-data-btn");

  button?.addEventListener("click", () => {
    const data = exportAllLearningData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-science-lab-data-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}
