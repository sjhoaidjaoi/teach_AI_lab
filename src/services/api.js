const API_BASE_URL = "/api";

const API_ENDPOINTS = {
  health: `${API_BASE_URL}/health`,
  chat: `${API_BASE_URL}/chat`,
  experimentPlan: `${API_BASE_URL}/experiment/plan`,
  experimentAnalyze: `${API_BASE_URL}/experiment/analyze`,
  experimentGuide: `${API_BASE_URL}/experiment/guide`,
  experimentReport: `${API_BASE_URL}/experiment/report`,
  quizGenerate: `${API_BASE_URL}/quiz/generate`,
  quizGradeShort: `${API_BASE_URL}/quiz/grade-short`,
  learningRecommend: `${API_BASE_URL}/learning/recommend`,
};

export { API_BASE_URL, API_ENDPOINTS };
