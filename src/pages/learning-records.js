
const STORAGE_KEY = "ai-science-learning-records";

const DEFAULT_RECORDS = {
  completedTasks: [],
  answers: {},
  totalAttempts: 0,
  correctAttempts: 0
};

// 读取学习记录
export function getLearningRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return { ...DEFAULT_RECORDS };
    }

    const parsed = JSON.parse(saved);

    return {
      ...DEFAULT_RECORDS,
      ...parsed,
      completedTasks: Array.isArray(parsed.completedTasks)
        ? parsed.completedTasks
        : [],
      answers: parsed.answers && typeof parsed.answers === "object"
        ? parsed.answers
        : {}
    };
  } catch (error) {
    console.error("读取学习记录失败：", error);
    return {
      ...DEFAULT_RECORDS,
      completedTasks: [],
      answers: {}
    };
  }
}

// 保存学习记录
export function saveLearningRecords(records) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
    return true;
  } catch (error) {
    console.error("保存学习记录失败：", error);
    return false;
  }
}

// 更新单个任务的答题记录
export function recordTaskAnswer(taskId, selected, correctAnswer) {
  const records = getLearningRecords();

  records.totalAttempts += 1;

  const isCorrect = selected === correctAnswer;

  if (isCorrect) {
    records.correctAttempts += 1;

    if (!records.completedTasks.includes(taskId)) {
      records.completedTasks.push(taskId);
    }
  }

  records.answers[taskId] = {
    selected,
    correct: isCorrect,
    completed: records.completedTasks.includes(taskId),
    updatedAt: new Date().toISOString()
  };

  saveLearningRecords(records);

  return {
    records,
    isCorrect
  };
}

// 清空本地学习记录
export function clearLearningRecords() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("清空学习记录失败：", error);
    return false;
  }
}
