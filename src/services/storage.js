/*
 * 本地存储服务（localStorage）。
 * 核心流程稳定后可平滑迁移到后端数据库。
 */

const KEYS = {
  tutorConversation: "ai-science-tutor-conversation",
  experimentSession: "ai-science-experiment-session",
  quizAttempts: "ai-science-quiz-attempts",
  feedback: "ai-science-feedback",
  studyTime: "ai-science-study-time",
};

const VLAB_RECORD_PREFIX = "ai-science-vlab-record-";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.error(`读取本地数据失败 (${key})：`, error);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`保存本地数据失败 (${key})：`, error);
    return false;
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`删除本地数据失败 (${key})：`, error);
  }
}

/* ---------------- AI 导师对话上下文 ---------------- */

export function getTutorConversation() {
  const data = readJSON(KEYS.tutorConversation, null);

  if (!data || !Array.isArray(data.messages)) {
    return { messages: [], updatedAt: null };
  }

  return {
    messages: data.messages.slice(-30),
    updatedAt: data.updatedAt || null,
  };
}

export function saveTutorConversation(messages) {
  return writeJSON(KEYS.tutorConversation, {
    messages: messages.slice(-30),
    updatedAt: new Date().toISOString(),
  });
}

export function clearTutorConversation() {
  removeKey(KEYS.tutorConversation);
}

/* ---------------- AI 实验会话（支持续做） ---------------- */

export function getExperimentSession() {
  return readJSON(KEYS.experimentSession, null);
}

export function saveExperimentSession(session) {
  return writeJSON(KEYS.experimentSession, {
    ...session,
    updatedAt: new Date().toISOString(),
  });
}

export function clearExperimentSession() {
  removeKey(KEYS.experimentSession);
}

/* ---------------- 测验记录与错题 ---------------- */

export function getQuizAttempts() {
  const data = readJSON(KEYS.quizAttempts, []);
  return Array.isArray(data) ? data : [];
}

export function saveQuizAttempt(attempt) {
  const attempts = getQuizAttempts();
  attempts.unshift(attempt);
  writeJSON(KEYS.quizAttempts, attempts.slice(0, 50));
  return attempt;
}

export function clearQuizAttempts() {
  removeKey(KEYS.quizAttempts);
}

/* ---------------- 用户反馈 ---------------- */

export function getFeedbackList() {
  const data = readJSON(KEYS.feedback, []);
  return Array.isArray(data) ? data : [];
}

export function addFeedback(entry) {
  const list = getFeedbackList();
  list.unshift({
    ...entry,
    createdAt: new Date().toISOString(),
  });
  writeJSON(KEYS.feedback, list.slice(0, 100));
  return list;
}

export function clearFeedback() {
  removeKey(KEYS.feedback);
}

/* ---------------- 学习时长（按天累计秒数） ---------------- */

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function getStudyTime() {
  const data = readJSON(KEYS.studyTime, { days: {} });
  return {
    days:
      data.days && typeof data.days === "object" ? data.days : {},
  };
}

export function addStudySeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  if (safeSeconds <= 0) return getStudyTime();

  const data = getStudyTime();
  const key = todayKey();
  data.days[key] = (data.days[key] || 0) + safeSeconds;
  writeJSON(KEYS.studyTime, data);
  return data;
}

/* ---------------- 虚拟实验平台：按实验保存操作记录 ---------------- */

function vlabKey(experimentId) {
  return `${VLAB_RECORD_PREFIX}${String(experimentId || "").slice(0, 60)}`;
}

export function getVirtualLabRecord(experimentId) {
  return readJSON(vlabKey(experimentId), null);
}

export function saveVirtualLabRecord(experimentId, record) {
  return writeJSON(vlabKey(experimentId), {
    ...record,
    experimentId,
    updatedAt: new Date().toISOString(),
  });
}

export function clearVirtualLabRecord(experimentId) {
  removeKey(vlabKey(experimentId));
}

/* ---------------- 导出全部学习数据（用于效果评估） ---------------- */

export function exportAllLearningData() {
  const result = {};

  Object.entries(KEYS).forEach(([name, key]) => {
    result[name] = readJSON(key, null);
  });

  result.legacyLearningRecords = readJSON(
    "ai-science-learning-records",
    null
  );
  result.exportedAt = new Date().toISOString();

  return result;
}
