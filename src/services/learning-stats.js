import { tasks } from "../pages/tasks.js";
import { getLearningRecords } from "../pages/learning-records.js";
import {
  getQuizAttempts,
  getStudyTime,
  getVirtualLabRecord,
} from "./storage.js";
import { experiments } from "../experiments/catalog.js";

function lastNDays(n) {
  const result = [];
  const today = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const label = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    result.push({ key, label });
  }

  return result;
}

/** 汇总课程任务、测验、错题与学习时长等全部本地学习数据。 */
export function buildLearningStats() {
  const records = getLearningRecords();
  const attempts = getQuizAttempts();
  const study = getStudyTime();

  /* 课程实验任务 */
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) =>
    records.completedTasks.includes(task.id)
  ).length;
  const taskCompletionRate = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  /* 测验总体情况 */
  const quizAttemptsCount = attempts.length;
  const totalQuestions = attempts.reduce((sum, a) => sum + a.total, 0);
  const totalCorrect = attempts.reduce((sum, a) => sum + a.correctCount, 0);
  const accuracy = totalQuestions
    ? Math.round((totalCorrect / totalQuestions) * 100)
    : null;
  const averageScore = quizAttemptsCount
    ? Math.round(
        attempts.reduce((sum, a) => sum + a.score, 0) / quizAttemptsCount
      )
    : null;

  /* 分数趋势（按时间从早到晚） */
  const scoreTrend = attempts
    .slice()
    .reverse()
    .map((a) => ({
      label: new Date(a.createdAt).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      }),
      score: a.score,
      courseTitle: a.courseTitle,
    }));

  /* 错题与薄弱知识点 */
  const wrongCountMap = new Map();
  const wrongQuestions = [];

  attempts.forEach((attempt) => {
    attempt.questions
      .filter((q) => !q.isCorrect)
      .forEach((q) => {
        const knowledgePoint = q.knowledgePoint || "综合知识";
        wrongCountMap.set(
          knowledgePoint,
          (wrongCountMap.get(knowledgePoint) || 0) + 1
        );
        wrongQuestions.push({
          courseTitle: attempt.courseTitle,
          knowledgePoint,
          type: q.type,
          question: q.question,
          studentAnswer:
            q.type === "short" ? q.studentAnswer : formatObjectiveAnswer(q),
          correctAnswer:
            q.type === "short" ? q.referenceAnswer : formatObjectiveAnswer(q, true),
          explanation: q.explanation,
          createdAt: attempt.createdAt,
        });
      });
  });

  const weakPoints = [...wrongCountMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  /* 近 7 天学习时长 */
  const weekDays = lastNDays(7).map((day) => ({
    label: day.label,
    seconds: study.days[day.key] || 0,
  }));

  const totalStudySeconds = Object.values(study.days).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );

  return {
    tasks: {
      total: totalTasks,
      completed: completedTasks,
      completionRate: taskCompletionRate,
    },
    quizzes: {
      attemptsCount: quizAttemptsCount,
      totalQuestions,
      totalCorrect,
      accuracy,
      averageScore,
      scoreTrend,
    },
    weakPoints,
    wrongQuestions: wrongQuestions.slice(0, 20),
    study: {
      totalSeconds: totalStudySeconds,
      totalMinutes: Math.round(totalStudySeconds / 60),
      weekDays,
    },
  };
}

function formatObjectiveAnswer(question, isCorrect = false) {
  const value = isCorrect ? question.correctAnswer : question.studentAnswer;

  if (question.type === "single") {
    return `${String.fromCharCode(65 + value)}. ${question.options[value]}`;
  }

  return value ? "正确" : "错误";
}

/** 虚拟实验平台的本机记录概况（供 AI 复习建议参考）。 */
export function buildVirtualLabSummary() {
  return experiments
    .filter((item) => item.status === "available" && !item.externalHash)
    .map((item) => {
      const record = getVirtualLabRecord(item.id);
      if (!record) return null;

      return {
        id: item.id,
        title: item.title,
        subject: item.subject,
        hasConclusion: Boolean(record.conclusion && record.conclusion.trim()),
        hasReport: Boolean(record.report),
        logCount: Array.isArray(record.logs) ? record.logs.length : 0,
        updatedAt: record.updatedAt || null,
      };
    })
    .filter(Boolean);
}

/** 提供给 AI 复习建议接口的精简数据。 */
export function buildRecommendationPayload() {
  const stats = buildLearningStats();

  return {
    generatedAt: new Date().toISOString(),
    课程任务: {
      总任务数: stats.tasks.total,
      已完成: stats.tasks.completed,
      完成率百分比: stats.tasks.completionRate,
    },
    测验: {
      测验次数: stats.quizzes.attemptsCount,
      答题总数: stats.quizzes.totalQuestions,
      答对题数: stats.quizzes.totalCorrect,
      正确率百分比: stats.quizzes.accuracy,
      平均得分: stats.quizzes.averageScore,
      分数趋势: stats.quizzes.scoreTrend,
    },
    薄弱知识点: stats.weakPoints,
    错题示例: stats.wrongQuestions.slice(0, 5),
    虚拟实验: buildVirtualLabSummary().map((item) => ({
      实验名称: item.title,
      已写结论: item.hasConclusion,
      已生成报告: item.hasReport,
      操作记录条数: item.logCount,
    })),
    学习时长: {
      累计分钟: stats.study.totalMinutes,
      近七天: stats.study.weekDays,
    },
  };
}
