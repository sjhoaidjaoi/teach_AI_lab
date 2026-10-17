import {
  experiments as vlabExperiments,
  SUBJECTS,
  STAGES,
} from "../experiments/catalog.js";
import {
  generateQuiz,
  gradeShortAnswer,
} from "../services/ai-client.js";
import {
  getQuizAttempts,
  saveQuizAttempt,
  clearQuizAttempts,
  getVirtualLabRecord,
} from "../services/storage.js";

const QUIZ_CONFIG = {
  singleCount: 3,
  booleanCount: 2,
  shortCount: 1,
};

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

/** 可进行测评的虚拟实验（带模块的可操作实验）。 */
function assessableExperiments() {
  return vlabExperiments.filter(
    (item) => item.status === "available" && typeof item.loadModule === "function"
  );
}

/** 是否已做过该实验：实验台仅在真正操作后才会落盘记录。 */
function hasLearned(entry) {
  return Boolean(getVirtualLabRecord(entry.id));
}

/**
 * 用实验元数据 + 模块步骤组装命题上下文。
 * 事实信息全部来自实验自身，AI 只负责命题与讲解。
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
    title: entry.title,
    objectives: entry.objectives,
    knowledgePoints: [
      `所属学科：${SUBJECTS[entry.subject].label}（${STAGES[entry.stage]}）`,
      `实验原理：${entry.principle}`,
      `所需器材：${entry.equipment.join("、")}`,
      ...stepLines,
    ],
    ...QUIZ_CONFIG,
  };
}

/** 取出该实验已保存的真实测量数据，作为命题素材。 */
async function buildExperimentContext(entry) {
  try {
    const record = getVirtualLabRecord(entry.id);
    if (!record?.data) return [];

    const module = (await entry.loadModule()).default;
    const records = module.buildReportData?.(record.data) || null;
    if (!records || !Array.isArray(records.rows) || records.rows.length === 0) {
      return [];
    }

    return [
      {
        title: entry.title,
        records,
        conclusion: String(record.conclusion || "").slice(0, 800),
      },
    ];
  } catch (error) {
    console.warn(`读取 ${entry.id} 实验记录失败：`, error);
    return [];
  }
}

/** 规整 AI 生成的题目。 */
function normalizeQuiz(quiz) {
  const rawQuestions = quiz?.questions;

  if (!Array.isArray(rawQuestions)) {
    throw new Error("题目格式不正确，请重新生成一次。");
  }

  const questions = rawQuestions
    .map((item, index) => {
      if (!item || typeof item.question !== "string") return null;

      if (item.type === "single") {
        const options = Array.isArray(item.options)
          ? item.options.filter((x) => typeof x === "string")
          : [];
        const answer = Number(item.answer);

        if (options.length < 3 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
          return null;
        }

        return {
          qid: `q-${Date.now()}-${index}`,
          type: "single",
          question: item.question,
          options,
          answer,
          knowledgePoint: String(item.knowledgePoint || "综合知识"),
          explanation: String(item.explanation || ""),
        };
      }

      if (item.type === "boolean") {
        let boolAnswer;

        if (typeof item.answer === "boolean") {
          boolAnswer = item.answer;
        } else if (["true", "正确", "对", "1"].includes(String(item.answer).trim().toLowerCase())) {
          boolAnswer = true;
        } else if (["false", "错误", "错", "0"].includes(String(item.answer).trim().toLowerCase())) {
          boolAnswer = false;
        } else {
          return null;
        }

        return {
          qid: `q-${Date.now()}-${index}`,
          type: "boolean",
          question: item.question,
          answer: boolAnswer,
          knowledgePoint: String(item.knowledgePoint || "综合知识"),
          explanation: String(item.explanation || ""),
        };
      }

      if (item.type === "short") {
        return {
          qid: `q-${Date.now()}-${index}`,
          type: "short",
          question: item.question,
          referenceAnswer: String(item.referenceAnswer || ""),
          knowledgePoint: String(item.knowledgePoint || "综合知识"),
          explanation: String(item.explanation || ""),
        };
      }

      return null;
    })
    .filter(Boolean);

  if (questions.length < 3) {
    throw new Error("有效题目太少，请重新生成一次。");
  }

  return questions;
}

const TYPE_LABEL = {
  single: "选择题",
  boolean: "判断题",
  short: "简答题",
};

export function renderQuiz() {
  return `
    <main class="quiz-page" id="quiz-page">
      <section class="courses-hero quiz-hero">
        <p class="courses-eyebrow">AI ASSESSMENT</p>
        <h1>AI 智能测评</h1>
        <p class="courses-subtitle">
          选定已经学过的实验，AI 依据该实验的原理、步骤和你保存的真实测量数据生成小测；
          客观题即时判分，简答题由 AI 辅助批改并给出解析。
        </p>
      </section>

      <div id="quiz-root"></div>
    </main>
  `;
}

export function bindQuiz(container) {
  const root = container.querySelector("#quiz-root");
  if (!root) return;

  let currentExperiment = null;
  let questions = [];
  const answers = new Map();

  /* ---------------- 首页：选择已学实验 + 历史记录 ---------------- */

  function renderHomeView() {
    const attempts = getQuizAttempts();
    const entries = assessableExperiments();
    const learnedCount = entries.filter(hasLearned).length;

    root.innerHTML = `
      <section class="quiz-courses">
        <div class="courses-section-heading">
          <div>
            <h2>第一步：选择已学过的实验</h2>
            <p>
              每次 ${QUIZ_CONFIG.singleCount + QUIZ_CONFIG.booleanCount + QUIZ_CONFIG.shortCount} 道题：
              ${QUIZ_CONFIG.singleCount} 选择 + ${QUIZ_CONFIG.booleanCount} 判断 + ${QUIZ_CONFIG.shortCount} 简答。
              测评会自动引用你在实验台保存的真实数据（共可测评 ${learnedCount} 个已学实验）。
            </p>
          </div>
        </div>

        <div class="pick-grid">
          ${entries
            .map((entry) => {
              const record = getVirtualLabRecord(entry.id);
              const learned = Boolean(record);
              const logCount = Array.isArray(record?.logs) ? record.logs.length : 0;
              return `
              <article class="pick-card ${learned ? "" : "is-locked"}">
                <div class="pick-card-head">
                  <span class="pick-card-icon">${entry.icon}</span>
                  <span class="pick-card-tags">
                    <span class="vlab-tag vlab-tag-${entry.subject}">
                      ${SUBJECTS[entry.subject].icon} ${SUBJECTS[entry.subject].label}
                    </span>
                    ${
                      learned
                        ? '<span class="pick-badge pick-badge-done">✓ 已学过</span>'
                        : '<span class="pick-badge pick-badge-lock">🔒 未学习</span>'
                    }
                  </span>
                </div>
                <h3>${escapeHTML(entry.title)}</h3>
                <p class="pick-card-summary">${escapeHTML(entry.summary)}</p>
                <p class="pick-card-meta">
                  ${STAGES[entry.stage]} · ${escapeHTML(entry.duration)}
                  ${learned ? ` · 操作记录 ${logCount} 条` : ""}
                </p>
                ${
                  learned
                    ? `<button
                        class="button button-primary quiz-generate"
                        data-experiment-id="${escapeHTML(entry.id)}"
                      >
                        生成该实验测评
                      </button>`
                    : `<a class="button button-secondary quiz-go-run"
                        href="#experiment-run/${escapeHTML(entry.id)}">
                        先去做这个实验 →
                      </a>
                      <p class="pick-card-note">完成实验操作后才能生成对应测评</p>`
                }
              </article>`;
            })
            .join("")}
        </div>
      </section>

      <section class="quiz-history card-panel">
        <div class="quiz-history-heading">
          <h2>我的测验记录</h2>
          ${
            attempts.length
              ? `<button class="button button-secondary" id="quiz-clear-history">
                  清空记录
                </button>`
              : ""
          }
        </div>

        ${
          attempts.length === 0
            ? `<p class="quiz-empty">还没有测验记录，完成一次小测后这里会显示成绩和错题。</p>`
            : `
          <div class="quiz-history-list">
            ${attempts
              .slice(0, 8)
              .map(
                (attempt) => `
              <article class="quiz-history-item" data-attempt-id="${attempt.id}">
                <div class="quiz-history-score ${
                  attempt.score >= 80
                    ? "is-good"
                    : attempt.score >= 60
                      ? "is-mid"
                      : "is-low"
                }">${attempt.score}</div>
                <div class="quiz-history-meta">
                  <h3>${escapeHTML(attempt.courseTitle)}</h3>
                  <p>${new Date(attempt.createdAt).toLocaleString("zh-CN")} ·
                    答对 ${attempt.correctCount}/${attempt.total} 题</p>
                </div>
                <span class="quiz-history-view">查看解析 →</span>
              </article>`
              )
              .join("")}
          </div>`
        }
      </section>
    `;

    root.querySelectorAll(".quiz-generate").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = entries.find(
          (item) => item.id === button.dataset.experimentId
        );
        if (entry && hasLearned(entry)) requestQuiz(entry);
      });
    });

    root.querySelector("#quiz-clear-history")?.addEventListener("click", () => {
      if (window.confirm("确定清空全部测验记录和错题吗？")) {
        clearQuizAttempts();
        renderHomeView();
      }
    });

    root.querySelectorAll(".quiz-history-item").forEach((item) => {
      item.addEventListener("click", () => {
        const attempt = attempts.find(
          (a) => a.id === item.dataset.attemptId
        );
        if (attempt) renderResultView(attempt, { fromHistory: true });
      });
    });
  }

  /* ---------------- 生成题目 ---------------- */

  function renderGeneratingView(experimentName) {
    root.innerHTML = `
      <section class="card-panel experiment-loading">
        <span class="typing-dots"><span></span><span></span><span></span></span>
        <h2>AI 正在为《${escapeHTML(experimentName)}》出题…</h2>
        <p>正在结合实验原理、操作步骤和你的真实测量数据生成选择题、判断题和简答题，大约需要几十秒。</p>
      </section>
    `;
  }

  async function requestQuiz(entry) {
    currentExperiment = entry;
    renderGeneratingView(entry.title);

    try {
      const [promptData, experimentContext] = await Promise.all([
        experimentPromptData(entry),
        buildExperimentContext(entry),
      ]);
      const data = await generateQuiz({
        ...promptData,
        experimentContext,
      });
      questions = normalizeQuiz(data.quiz);
      answers.clear();
      renderAnswerView(experimentContext);
    } catch (error) {
      console.error("生成测验失败：", error);
      root.innerHTML = `
        <section class="card-panel experiment-error">
          <h2>题目生成失败</h2>
          <p>${escapeHTML(error.message)}</p>
          <div class="experiment-error-actions">
            <button class="button button-primary" id="quiz-retry">重试</button>
            <button class="button button-secondary" id="quiz-back">返回</button>
          </div>
        </section>
      `;
      root.querySelector("#quiz-retry").addEventListener("click", () =>
        requestQuiz(entry)
      );
      root.querySelector("#quiz-back").addEventListener("click", renderHomeView);
    }
  }

  /* ---------------- 作答 ---------------- */

  function renderAnswerView(experimentContext = []) {
    const hasData = experimentContext.length > 0;
    root.innerHTML = `
      <section class="card-panel quiz-paper">
        <div class="experiment-plan-heading">
          <div>
            <p class="courses-eyebrow">QUIZ PAPER</p>
            <h2>${escapeHTML(currentExperiment.title)} · 实验小测</h2>
            <p>
              共 ${questions.length} 题，请完成所有题目后提交。
              ${hasData ? "其中部分题目基于你在实验台保存的真实测量数据。" : ""}
            </p>
          </div>
          <button class="button button-secondary" id="quiz-quit">
            放弃本次小测
          </button>
        </div>

        <form id="quiz-form">
          ${questions
            .map((question, index) => renderQuestion(question, index))
            .join("")}

          <div class="quiz-submit-row">
            <button type="submit" class="button button-primary" id="quiz-submit">
              提交答卷
            </button>
            <p class="quiz-validate-msg" id="quiz-validate-msg"></p>
          </div>
        </form>
      </section>
    `;

    root.querySelector("#quiz-quit").addEventListener("click", () => {
      if (window.confirm("放弃后本次已作答的内容不会保存，确定吗？")) {
        renderHomeView();
      }
    });

    // 选择 / 判断
    root.querySelectorAll("[data-option-qid]").forEach((button) => {
      button.addEventListener("click", () => {
        const qid = button.dataset.optionQid;
        const value = Number(button.dataset.optionValue);
        answers.set(qid, value);

        root
          .querySelectorAll(`[data-option-qid="${qid}"]`)
          .forEach((el) => el.classList.remove("is-selected"));
        button.classList.add("is-selected");
      });
    });

    // 简答
    root.querySelectorAll("[data-short-qid]").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        answers.set(textarea.dataset.shortQid, textarea.value);
      });
    });

    root.querySelector("#quiz-form").addEventListener("submit", (event) => {
      event.preventDefault();
      submitQuiz();
    });
  }

  function renderQuestion(question, index) {
    const number = index + 1;

    if (question.type === "single") {
      return `
        <fieldset class="quiz-question" data-qid="${question.qid}">
          <legend>
            <span class="quiz-q-index">${number}</span>
            <span class="quiz-q-type">${TYPE_LABEL.single}</span>
            <span class="quiz-q-point">${escapeHTML(question.knowledgePoint)}</span>
          </legend>
          <p class="quiz-q-title">${escapeHTML(question.question)}</p>
          <div class="quiz-options">
            ${question.options
              .map(
                (option, optionIndex) => `
              <button
                type="button"
                class="quiz-option"
                data-option-qid="${question.qid}"
                data-option-value="${optionIndex}"
              >
                <span class="quiz-option-key">${String.fromCharCode(65 + optionIndex)}</span>
                ${escapeHTML(option)}
              </button>`
              )
              .join("")}
          </div>
        </fieldset>
      `;
    }

    if (question.type === "boolean") {
      return `
        <fieldset class="quiz-question" data-qid="${question.qid}">
          <legend>
            <span class="quiz-q-index">${number}</span>
            <span class="quiz-q-type">${TYPE_LABEL.boolean}</span>
            <span class="quiz-q-point">${escapeHTML(question.knowledgePoint)}</span>
          </legend>
          <p class="quiz-q-title">${escapeHTML(question.question)}</p>
          <div class="quiz-options quiz-options-boolean">
            <button type="button" class="quiz-option"
              data-option-qid="${question.qid}" data-option-value="1">
              ✓ 正确
            </button>
            <button type="button" class="quiz-option"
              data-option-qid="${question.qid}" data-option-value="0">
              ✗ 错误
            </button>
          </div>
        </fieldset>
      `;
    }

    return `
      <fieldset class="quiz-question" data-qid="${question.qid}">
        <legend>
          <span class="quiz-q-index">${number}</span>
          <span class="quiz-q-type">${TYPE_LABEL.short}</span>
          <span class="quiz-q-point">${escapeHTML(question.knowledgePoint)}</span>
        </legend>
        <p class="quiz-q-title">${escapeHTML(question.question)}</p>
        <textarea
          class="quiz-short-input"
          data-short-qid="${question.qid}"
          rows="4"
          maxlength="1000"
          placeholder="用自己的话写出你的答案……"
        ></textarea>
      </fieldset>
    `;
  }

  /* ---------------- 提交与批改 ---------------- */

  async function submitQuiz() {
    const unanswered = questions.filter((q) => {
      const value = answers.get(q.qid);
      return value === undefined || (typeof value === "string" && !value.trim());
    });

    const msg = root.querySelector("#quiz-validate-msg");

    if (unanswered.length > 0) {
      msg.textContent = `还有 ${unanswered.length} 道题没有完成，请检查后再提交。`;
      const firstCard = root.querySelector(
        `[data-qid="${unanswered[0].qid}"]`
      );
      firstCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    msg.textContent = "";

    // 客观题即时判分
    const graded = questions.map((question) => {
      const studentAnswer = answers.get(question.qid);

      if (question.type === "single") {
        const isCorrect = Number(studentAnswer) === question.answer;
        return {
          ...question,
          studentAnswer: Number(studentAnswer),
          correctAnswer: question.answer,
          isCorrect,
          scorePer: isCorrect ? 100 : 0,
        };
      }

      if (question.type === "boolean") {
        const studentBool = Number(studentAnswer) === 1;
        const isCorrect = studentBool === question.answer;
        return {
          ...question,
          studentAnswer: studentBool,
          correctAnswer: question.answer,
          isCorrect,
          scorePer: isCorrect ? 100 : 0,
        };
      }

      return {
        ...question,
        studentAnswer: String(studentAnswer).trim(),
        correctAnswer: question.referenceAnswer,
        isCorrect: false,
        scorePer: 0,
        gradeReason: "",
        betterAnswer: "",
      };
    });

    const submitButton = root.querySelector("#quiz-submit");
    submitButton.disabled = true;

    // 简答题逐题交给 AI 批改
    const shortItems = graded.filter((q) => q.type === "short");

    for (let i = 0; i < shortItems.length; i++) {
      const item = shortItems[i];
      submitButton.textContent = `AI 批改简答题中（${i + 1}/${shortItems.length}）…`;

      try {
        const data = await gradeShortAnswer({
          question: item.question,
          referenceAnswer: item.referenceAnswer,
          studentAnswer: item.studentAnswer,
          explanation: item.explanation,
        });

        const aiScore = Math.max(
          0,
          Math.min(100, Number(data.result.score) || 0)
        );
        item.scorePer = aiScore;
        item.isCorrect = aiScore >= 60;
        item.gradeReason = String(data.result.reason || "");
        item.betterAnswer = String(data.result.betterAnswer || "");
      } catch (error) {
        // AI 批改失败时不计 0 分，标记为待人工处理，避免网络问题惩罚学生
        item.scorePer = null;
        item.isCorrect = false;
        item.gradeReason = `AI 批改失败：${error.message}。请以参考答案自行核对。`;
        item.betterAnswer = item.referenceAnswer;
      }
    }

    const scoredItems = graded.filter((q) => q.scorePer !== null);
    const averageScore = Math.round(
      scoredItems.reduce((sum, q) => sum + q.scorePer, 0) /
        Math.max(1, scoredItems.length)
    );
    const correctCount = graded.filter((q) => q.isCorrect).length;

    const attempt = {
      id: `attempt-${Date.now()}`,
      experimentId: currentExperiment.id,
      /* courseId/courseTitle 保留以兼容学习分析与历史展示 */
      courseId: currentExperiment.id,
      courseTitle: currentExperiment.title,
      createdAt: new Date().toISOString(),
      total: graded.length,
      correctCount,
      score: averageScore,
      questions: graded,
    };

    saveQuizAttempt(attempt);
    renderResultView(attempt);
  }

  /* ---------------- 结果与解析 ---------------- */

  function formatAnswer(question) {
    if (question.type === "single") {
      return `${String.fromCharCode(65 + question.correctAnswer)}. ${
        question.options[question.correctAnswer]
      }`;
    }
    if (question.type === "boolean") {
      return question.correctAnswer ? "正确" : "错误";
    }
    return question.correctAnswer;
  }

  function formatStudentAnswer(question) {
    if (question.type === "single") {
      return `${String.fromCharCode(65 + question.studentAnswer)}. ${
        question.options[question.studentAnswer]
      }`;
    }
    if (question.type === "boolean") {
      return question.studentAnswer ? "正确" : "错误";
    }
    return question.studentAnswer;
  }

  function renderResultView(attempt, { fromHistory = false } = {}) {
    const wrongCount = attempt.total - attempt.correctCount;

    root.innerHTML = `
      <section class="card-panel quiz-result">
        <div class="experiment-plan-heading">
          <div>
            <p class="courses-eyebrow">QUIZ RESULT</p>
            <h2>${escapeHTML(attempt.courseTitle)} · 测评结果</h2>
            <p>${new Date(attempt.createdAt).toLocaleString("zh-CN")}</p>
          </div>
          <button class="button button-secondary" id="result-back">
            ${fromHistory ? "返回测验首页" : "再测一次"}
          </button>
        </div>

        <div class="result-summary">
          <div class="result-score-ring ${
            attempt.score >= 80
              ? "is-good"
              : attempt.score >= 60
                ? "is-mid"
                : "is-low"
          }">
            <strong>${attempt.score}</strong>
            <span>分</span>
          </div>
          <div class="result-summary-text">
            <p>答对 <strong>${attempt.correctCount}</strong> / ${attempt.total} 题${
              wrongCount > 0 ? `，错题 <strong>${wrongCount}</strong> 道` : "，全部答对，太棒了！"
            }</p>
            <p class="result-tip">
              ${
                attempt.score >= 80
                  ? "掌握得很扎实，可以挑战新的实验内容。"
                  : attempt.score >= 60
                    ? "基本掌握，建议结合下方错题解析复习薄弱知识点。"
                    : "别灰心，回到虚拟实验台再操作一次，然后重新挑战。"
              }
            </p>
          </div>
        </div>

        <div class="result-review-list">
          ${attempt.questions
            .map(
              (question, index) => `
            <article class="review-card ${question.isCorrect ? "is-correct" : "is-wrong"}">
              <header>
                <span class="review-badge">
                  ${question.isCorrect ? "✓ 答对" : "✗ 答错"}
                </span>
                <span class="quiz-q-type">${TYPE_LABEL[question.type]}</span>
                <span class="quiz-q-point">${escapeHTML(question.knowledgePoint)}</span>
              </header>
              <p class="quiz-q-title">${index + 1}. ${escapeHTML(question.question)}</p>

              <div class="review-answers">
                <p><strong>你的答案：</strong>${escapeHTML(formatStudentAnswer(question))}</p>
                <p><strong>${question.type === "short" ? "参考答案：" : "正确答案："}</strong>${escapeHTML(formatAnswer(question))}</p>
              </div>

              ${
                question.type === "short"
                  ? `<div class="review-ai-grade markdown-body">
                       <h4>AI 批改意见</h4>
                       <p>${escapeHTML(question.gradeReason || "（无）")}</p>
                     </div>`
                  : ""
              }

              <div class="review-explanation">
                <h4>📖 解析</h4>
                <p>${escapeHTML(question.explanation || "（无）")}</p>
              </div>
            </article>`
            )
            .join("")}
        </div>

        <div class="experiment-plan-actions">
          <button class="button button-primary" id="result-dashboard">
            查看学习分析与复习建议
          </button>
          <button class="button button-secondary" id="result-home">
            返回测验首页
          </button>
        </div>
      </section>
    `;

    root.querySelector("#result-back").addEventListener("click", () => {
      if (fromHistory) {
        renderHomeView();
      } else if (currentExperiment) {
        requestQuiz(currentExperiment);
      } else {
        renderHomeView();
      }
    });

    root.querySelector("#result-home").addEventListener("click", renderHomeView);
    root.querySelector("#result-dashboard").addEventListener("click", () => {
      window.location.hash = "#dashboard";
    });
  }

  renderHomeView();
}
