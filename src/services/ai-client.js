import { API_ENDPOINTS } from "./api.js";

/**
 * 统一的 POST 请求封装：
 * - AbortController 控制超时
 * - 错误信息归一化（网络错误 / 超时 / 后端业务错误）
 */
async function postJSON(url, body, { timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);

    if (error.name === "AbortError") {
      throw new Error("请求超时：AI 思考时间过长，请检查网络后重试。");
    }

    throw new Error(
      "无法连接 AI 后端。请确认已运行 npm run server 启动端口 3001 的后端服务。"
    );
  }

  clearTimeout(timer);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `请求失败，状态码：${response.status}`
    );
  }

  return data;
}

/* ---------------- AI 学习导师 ---------------- */

export function askTutor({ message, history = [] }, options) {
  return postJSON(
    API_ENDPOINTS.chat,
    { message, history },
    { timeoutMs: 70000, ...options }
  );
}

/* ---------------- AI 实验指导 ---------------- */

export function generateExperimentPlan(
  { courseId, title, objectives, knowledgePoints },
  options
) {
  return postJSON(
    API_ENDPOINTS.experimentPlan,
    { courseId, title, objectives, knowledgePoints },
    { timeoutMs: 85000, ...options }
  );
}

export function analyzeObservation(
  { courseTitle, stepTitle, observation, expectedPhenomenon },
  options
) {
  return postJSON(
    API_ENDPOINTS.experimentAnalyze,
    { courseTitle, stepTitle, observation, expectedPhenomenon },
    { timeoutMs: 70000, ...options }
  );
}

/* ---------------- 智能测评 ---------------- */

export function generateQuiz(
  { title, objectives, knowledgePoints, singleCount, booleanCount, shortCount, experimentContext = [] },
  options
) {
  return postJSON(
    API_ENDPOINTS.quizGenerate,
    {
      title,
      objectives,
      knowledgePoints,
      singleCount,
      booleanCount,
      shortCount,
      experimentContext,
    },
    { timeoutMs: 85000, ...options }
  );
}

export function gradeShortAnswer(
  { question, referenceAnswer, studentAnswer, explanation },
  options
) {
  return postJSON(
    API_ENDPOINTS.quizGradeShort,
    { question, referenceAnswer, studentAnswer, explanation },
    { timeoutMs: 70000, ...options }
  );
}

/* ---------------- 虚拟实验平台：AI 实验导师 ---------------- */

export function guideExperiment({ message, history = [], context = {} }, options) {
  return postJSON(
    API_ENDPOINTS.experimentGuide,
    { message, history, context },
    { timeoutMs: 85000, ...options }
  );
}

/* ---------------- 虚拟实验平台：实验报告草稿 ---------------- */

export function draftExperimentReport(payload, options) {
  return postJSON(
    API_ENDPOINTS.experimentReport,
    payload,
    { timeoutMs: 90000, ...options }
  );
}

/* ---------------- 个性化复习建议 ---------------- */

export function getLearningRecommendation(stats, options) {
  return postJSON(
    API_ENDPOINTS.learningRecommend,
    { stats },
    { timeoutMs: 70000, ...options }
  );
}
