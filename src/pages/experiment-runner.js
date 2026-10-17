/*
 * 虚拟实验统一工作台（五区布局）：
 * A 实验信息区 · B 虚拟操作区 · C 数据测量区 · D AI 实验导师区 · E 实验记录区
 *
 * 【实验模块契约 v2】每个实验模块（如 src/experiments/series-circuit/index.js）提供：
 * - steps：[{id, title, detail}]
 * - createInitialState()：实验物理状态
 * - analyze(state)：规则引擎判定 → {code, statusText, errors[]}
 * - describe(state, analysis)：客观描述 + 实时测量值（供状态栏与 AI 上下文）
 * - createData()：实验私有数据（测量记录/草稿等），随记录持久化
 * - mountOperation(rootEl, api, state)：挂载 B 区，api 与 C 区一致（log/onStateChange/onChange/showToast/getData 等）
 * - mountMeasure(rootEl, api)：挂载 C 区，api={log,onChange,showToast,getData,snapshot()}
 * - isStepDone(stepId, ctx)：ctx={state, analysis, data, conclusion}
 * - buildReportData(data)：{records:{headers, rows}} 供报告接口
 * - buildAiRecords(data)：AI 导师上下文中的数据表格（可选）
 *
 * 实验现象与数值全部来自模块内规则引擎；本页面不写任何科学计算，
 * AI 只读取 describe() 的真实数据进行讲解。
 */

import { renderMarkdown } from "../lib/markdown.js";
import {
  guideExperiment,
  draftExperimentReport,
} from "../services/ai-client.js";
import {
  getVirtualLabRecord,
  saveVirtualLabRecord,
} from "../services/storage.js";
import { SUBJECTS, STAGES } from "../experiments/catalog.js";

let expModule = null;
let catalogEntry = null;
let simulator = null;
let measureHandle = null;
let record = null;
let currentState = null;
let currentAnalysis = null;
let currentDescription = null;
let persistTimer = null;
let aiLoading = false;

const GREETING =
  "你好，我是本实验的 **AI 实验导师**。\n\n" +
  "我会根据系统规则引擎**实时测量的真实数据**帮你理解现象、排查故障、分析结论；" +
  "但我**不会替你计算或修改任何数值**——所有读数以数据测量区为准。\n\n" +
  "先在左侧按步骤操作，遇到问题随时问我。";

/* ---------------- 页面骨架 ---------------- */

export function renderExperimentRunner(entry) {
  const subject = SUBJECTS[entry.subject];
  const stage = STAGES[entry.stage];

  return `
  <main class="vlab-page">
    <div class="vlab-topbar card-panel">
      <a class="button button-secondary vlab-back" href="#experiments">← 实验目录</a>
      <div class="vlab-title-wrap">
        <div class="vlab-tags">
          <span class="vlab-tag">${stage}</span>
          <span class="vlab-tag vlab-tag-${entry.subject}">
            ${subject.icon} ${subject.label}
          </span>
          <span class="vlab-tag">${entry.difficulty}</span>
          <span class="vlab-tag">⏱ ${entry.duration}</span>
          <span class="vlab-progress" id="vlab-progress">0/0</span>
        </div>
        <h1>${entry.icon} ${entry.title}</h1>
      </div>
    </div>

    <!-- A 实验信息区 -->
    <section class="card-panel vlab-section" id="zone-a">
      <details open>
        <summary><h2 class="vlab-zone-title">A · 实验信息</h2></summary>
        <div class="vlab-info-grid">
          <div>
            <h3>学习目标</h3>
            <ul>${entry.objectives.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
          <div>
            <h3>实验原理</h3>
            <p>${entry.principle}</p>
          </div>
          <div>
            <h3>所需器材</h3>
            <p>${entry.equipment.join("、")}</p>
          </div>
          <div>
            <h3>安全提示</h3>
            <ul>${entry.safety.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
        </div>
      </details>
    </section>

    <div class="vlab-grid">
      <div class="vlab-col-left">
        <!-- B 虚拟操作区 -->
        <section class="card-panel vlab-section" id="zone-b">
          <div class="vlab-zone-head">
            <h2 class="vlab-zone-title">B · 虚拟操作区</h2>
            ${
              entry.sceneHash
                ? `<a class="vlab-3d-link" href="${entry.sceneHash}">🧊 在 3D 实验室查看</a>`
                : ""
            }
          </div>
          <div id="vlab-operation"></div>
        </section>

        <!-- C 数据测量区 -->
        <section class="card-panel vlab-section" id="zone-c">
          <h2 class="vlab-zone-title">C · 数据测量区</h2>
          <div id="vlab-measure"></div>
        </section>
      </div>

      <div class="vlab-col-right">
        <!-- D AI 实验导师区 -->
        <section class="card-panel vlab-section vlab-ai-section" id="zone-d">
          <h2 class="vlab-zone-title">D · AI 实验导师</h2>
          <div class="vlab-ai-messages" id="vlab-ai-messages"></div>
          <div class="vlab-ai-chips" id="vlab-ai-chips"></div>
          <div class="vlab-ai-input-row">
            <textarea id="vlab-ai-input" rows="2"
              placeholder="向 AI 导师提问，例如：这一步该怎么做？"></textarea>
            <button type="button" class="button button-primary" id="vlab-ai-send">发送</button>
          </div>
        </section>
      </div>
    </div>

    <!-- E 实验记录区 -->
    <section class="card-panel vlab-section" id="zone-e">
      <h2 class="vlab-zone-title">E · 实验记录区</h2>
      <div class="vlab-record-grid">
        <div>
          <h3>实验步骤</h3>
          <ol class="vlab-steps" id="vlab-steps"></ol>
        </div>
        <div>
          <h3>我的实验结论</h3>
          <textarea id="vlab-conclusion" rows="4"
            placeholder="根据你记录的真实数据，写出你发现的规律或结论……"></textarea>

          <h3 style="margin-top:16px">实验报告</h3>
          <div class="vlab-report-actions">
            <button type="button" class="button button-primary" id="vlab-report-btn">
              生成实验报告草稿
            </button>
            <span class="vlab-report-hint">报告只整理你的真实数据，AI 不补造数值</span>
          </div>
          <div class="vlab-report markdown-body" id="vlab-report"></div>
        </div>
        <div>
          <div class="vlab-logs-head">
            <h3>操作记录</h3>
            <button type="button" class="button button-secondary vlab-small-btn" id="vlab-reset-btn">
              重置记录
            </button>
          </div>
          <ul class="vlab-logs" id="vlab-logs"></ul>
        </div>
      </div>
    </section>
  </main>`;
}

/* ---------------- 绑定与状态 ---------------- */

export async function bindExperimentRunner(root, entry) {
  catalogEntry = entry;
  expModule = (await entry.loadModule()).default;

  const saved = getVirtualLabRecord(entry.id);

  /* 兼容旧版串联电路记录（v1 顶层 trials/draft → v2 data 嵌套） */
  let data;
  if (saved?.data) {
    data = saved.data;
  } else if (saved && (saved.trials || saved.draft)) {
    data = {
      trials: saved.trials || [],
      draft: saved.draft || { a: null, b: null, c: null },
      ammeterPosition: saved.ammeterPosition || "a",
    };
  } else {
    data = expModule.createData();
  }

  record = {
    state: saved?.state || expModule.createInitialState(),
    data,
    conclusion: saved?.conclusion || "",
    logs: Array.isArray(saved?.logs) ? saved.logs.slice(-100) : [],
    everValid: Boolean(saved?.everValid),
    aiMessages: Array.isArray(saved?.aiMessages) ? saved.aiMessages : [],
    report: saved?.report || "",
    startedAt: saved?.startedAt || new Date().toISOString(),
  };

  simulator = expModule.mountOperation(
    root.querySelector("#vlab-operation"),
    {
      log: addLog,
      onStateChange: handleStateChange,
      onChange: handleDataChange,
      getAmmeterPosition: () => record.data.ammeterPosition,
      getData: () => record.data,
      showToast,
    },
    record.state
  );

  currentState = simulator.getState();
  currentAnalysis = expModule.analyze(currentState);
  currentDescription = expModule.describe(currentState, currentAnalysis);

  measureHandle = expModule.mountMeasure(root.querySelector("#vlab-measure"), {
    log: addLog,
    onChange: handleDataChange,
    showToast,
    getData: () => record.data,
    snapshot: () => ({
      state: currentState,
      analysis: currentAnalysis,
      description: currentDescription,
    }),
  });

  bindAiZone(root);
  bindRecordZone(root);

  root.querySelector("#vlab-conclusion").value = record.conclusion;
  renderReport(root);
  renderLogs(root);
  renderSteps(root);
  renderAiMessages(root);
  schedulePersist();
}

export function disposeExperimentRunner() {
  if (simulator) {
    simulator.destroy();
    simulator = null;
  }
  if (measureHandle?.destroy) {
    measureHandle.destroy();
    measureHandle = null;
  }
  expModule = null;
  catalogEntry = null;
  record = null;
  currentState = null;
  currentAnalysis = null;
  currentDescription = null;
  aiLoading = false;
}

/* ---------------- 状态与数据变化 ---------------- */

function handleStateChange(state, analysis) {
  currentState = state;
  currentAnalysis = analysis;
  currentDescription = expModule.describe(state, analysis);
  record.state = state;

  if (analysis.code === "valid") record.everValid = true;

  measureHandle?.refresh?.();
  renderSteps(document);
  schedulePersist();
}

function handleDataChange() {
  renderSteps(document);
  schedulePersist();
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (record) saveVirtualLabRecord(catalogEntry.id, record);
  }, 400);
}

function addLog(type, text) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  record.logs.push({ time, type, text });
  if (record.logs.length > 100) record.logs.shift();
  renderLogs(document);
  schedulePersist();
}

/* ---------------- D 区：AI 实验导师 ---------------- */

const QUICK_QUESTIONS = [
  "我现在这一步该怎么做？",
  "帮我分析已经记录的数据",
  "这个现象背后的原理是什么？",
  "我的结论对吗？",
];

function bindAiZone(root) {
  const input = root.querySelector("#vlab-ai-input");
  const chips = root.querySelector("#vlab-ai-chips");

  root.querySelector("#vlab-ai-send").addEventListener("click", () => submitAiQuestion(root));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitAiQuestion(root);
    }
  });

  chips.innerHTML = QUICK_QUESTIONS.map(
    (question) => `<button type="button" class="vlab-chip">${question}</button>`
  ).join("");

  chips.addEventListener("click", (event) => {
    const chip = event.target.closest(".vlab-chip");
    if (!chip) return;
    input.value = chip.textContent;
    submitAiQuestion(root);
  });
}

function buildAiContext() {
  const stepCtx = buildStepContext();
  const nextStep = expModule.steps.find(
    (step) => !expModule.isStepDone(step.id, stepCtx)
  );

  const records = expModule.buildAiRecords?.(record.data) || null;

  return {
    title: catalogEntry.title,
    subject: SUBJECTS[catalogEntry.subject].label,
    stage: STAGES[catalogEntry.stage],
    objectives: catalogEntry.objectives,
    principle: catalogEntry.principle,
    currentStep: nextStep
      ? `${nextStep.title}：${nextStep.detail}`
      : "全部步骤已完成",
    statusText: currentDescription.statusText,
    parameterSummary: currentDescription.parameterSummary,
    errors: currentDescription.errors,
    measurements: currentDescription.measurements,
    records,
    conclusion: record.conclusion,
  };
}

async function submitAiQuestion(root) {
  const input = root.querySelector("#vlab-ai-input");
  const message = input.value.trim();

  if (!message || aiLoading) return;

  record.aiMessages.push({ role: "user", content: message });
  input.value = "";
  renderAiMessages(root);
  schedulePersist();

  aiLoading = true;
  renderAiLoading(root);

  try {
    const history = record.aiMessages
      .filter((item) => item.content)
      .slice(-11, -1);

    const { answer } = await guideExperiment({
      message,
      history,
      context: buildAiContext(),
    });

    record.aiMessages.push({ role: "assistant", content: answer });
    if (record.aiMessages.length > 30) {
      record.aiMessages = record.aiMessages.slice(-30);
    }
  } catch (error) {
    record.aiMessages.push({
      role: "assistant",
      content: "",
      error: error.message,
      failedQuestion: message,
    });
  } finally {
    aiLoading = false;
    renderAiMessages(root);
    schedulePersist();
  }
}

function renderAiLoading(root) {
  const box = root.querySelector("#vlab-ai-messages");
  const bubble = document.createElement("div");
  bubble.className = "vlab-ai-bubble vlab-ai-loading";
  bubble.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span>`;
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

function renderAiMessages(root) {
  const box = root.querySelector("#vlab-ai-messages");
  if (!box) return;

  const messages =
    record.aiMessages.length === 0
      ? [{ role: "assistant", content: GREETING, greeting: true }]
      : record.aiMessages;

  box.innerHTML = messages
    .map((item) => {
      if (item.role === "user") {
        return `<div class="vlab-ai-bubble vlab-ai-user">${escapeHtml(item.content)}</div>`;
      }

      if (item.error) {
        return `
          <div class="vlab-ai-bubble">
            <div class="ai-error-box">
              <p>${escapeHtml(item.error)}</p>
              <button type="button" class="button button-secondary vlab-small-btn vlab-retry">
                重新提问
              </button>
            </div>
          </div>`;
      }

      return `
        <div class="vlab-ai-bubble markdown-body">
          ${renderMarkdown(item.content || "")}
        </div>`;
    })
    .join("");

  box.querySelectorAll(".vlab-retry").forEach((button) => {
    button.addEventListener("click", () => {
      const failed = record.aiMessages.find((item) => item.error);
      if (!failed) return;
      record.aiMessages = record.aiMessages.filter((item) => item !== failed);
      const question = failed.failedQuestion || "请再讲一遍";
      record.aiMessages.push({ role: "user", content: question });
      renderAiMessages(root);
      schedulePersist();
      submitAiQuestion(root);
    });
  });

  box.scrollTop = box.scrollHeight;
}

/* ---------------- E 区：步骤 / 结论 / 日志 / 报告 ---------------- */

function buildStepContext() {
  return {
    state: currentState,
    analysis: currentAnalysis,
    data: record.data,
    conclusion: record.conclusion,
    everValid: record.everValid,
  };
}

function bindRecordZone(root) {
  root.querySelector("#vlab-conclusion").addEventListener("input", (event) => {
    record.conclusion = event.target.value;
    renderSteps(root);
    schedulePersist();
  });

  root.querySelector("#vlab-report-btn").addEventListener("click", () => generateReport(root));

  root.querySelector("#vlab-reset-btn").addEventListener("click", () => {
    const confirmed = window.confirm(
      "将清空测量数据、结论、操作记录和 AI 对话（操作区状态保留）。确定重置吗？"
    );
    if (!confirmed) return;

    record.data = expModule.createData();
    record.conclusion = "";
    record.logs = [];
    record.aiMessages = [];
    record.report = "";
    record.everValid = false;

    root.querySelector("#vlab-conclusion").value = "";
    measureHandle.refresh();
    renderSteps(root);
    renderLogs(root);
    renderReport(root);
    renderAiMessages(root);
    schedulePersist();
    showToast("实验记录已重置");
  });
}

function renderSteps(root) {
  const ol = root.querySelector("#vlab-steps");
  const progress = root.querySelector("#vlab-progress");
  if (!ol) return;

  const ctx = buildStepContext();
  let doneCount = 0;
  let firstUndone = -1;

  const items = expModule.steps.map((step, index) => {
    const done = expModule.isStepDone(step.id, ctx);
    if (done) doneCount += 1;
    else if (firstUndone === -1) firstUndone = index;

    return `
      <li class="${done ? "is-done" : ""} ${
        index === firstUndone ? "is-current" : ""
      }">
        <div class="vlab-step-head">
          <span class="vlab-step-check">${done ? "✓" : index + 1}</span>
          <strong>${step.title}</strong>
        </div>
        <p>${step.detail}</p>
      </li>`;
  });

  ol.innerHTML = items.join("");

  if (progress) {
    const total = expModule.steps.length;
    progress.textContent = `${doneCount}/${total} 步`;
    progress.classList.toggle("is-done", doneCount === total);
  }
}

function renderLogs(root) {
  const ul = root.querySelector("#vlab-logs");
  if (!ul) return;

  const logs = [...record.logs].reverse();
  ul.innerHTML = logs
    .map(
      (item) => `
      <li>
        <span class="vlab-log-time">${item.time}</span>
        <span>${escapeHtml(item.text)}</span>
      </li>`
    )
    .join("");
}

async function generateReport(root) {
  const button = root.querySelector("#vlab-report-btn");
  const box = root.querySelector("#vlab-report");

  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "正在整理报告……";
  box.innerHTML = '<p class="vlab-empty">AI 正在根据你的真实记录整理报告，请稍候……</p>';

  try {
    const ctx = buildStepContext();
    const stepsStatus = expModule.steps.map((step) => ({
      title: step.title,
      done: expModule.isStepDone(step.id, ctx),
    }));

    const { report } = await draftExperimentReport({
      title: catalogEntry.title,
      subject: SUBJECTS[catalogEntry.subject].label,
      stage: STAGES[catalogEntry.stage],
      objectives: catalogEntry.objectives,
      principle: catalogEntry.principle,
      equipment: catalogEntry.equipment,
      stepsStatus,
      records: expModule.buildReportData(record.data),
      conclusion: record.conclusion,
    });

    record.report = report;
    renderReport(root);
    showToast("实验报告草稿已生成");
  } catch (error) {
    box.innerHTML = `<div class="ai-error-box"><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = oldText;
    schedulePersist();
  }
}

function renderReport(root) {
  const box = root.querySelector("#vlab-report");
  if (!box) return;

  box.innerHTML = record.report
    ? renderMarkdown(record.report)
    : '<p class="vlab-empty">完成实验后点击上方按钮，AI 会依据你的真实数据整理一份报告草稿。</p>';
}

/* ---------------- 小工具 ---------------- */

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function showToast(text) {
  let toast = document.querySelector(".vlab-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "vlab-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.classList.add("is-show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-show"), 3200);
}
