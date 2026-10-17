const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = 3001;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ],
  })
);

app.use(express.json({ limit: "20kb" }));

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-flash";

const TUTOR_SYSTEM_PROMPT = `
你是“AI 科创实验室”的科学学习导师，面向中小学生（科学初学者）。

回答要求：
1. 全程使用准确、自然、易懂的中文，语气亲切、鼓励，像一位有耐心的老师。
2. 循序渐进地讲解：先用一句话给出明确结论；再用 3—5 个要点分步解释原因，每个要点都要讲完整；然后举一个生活中的例子或打一个比方；最后提出 1—2 个小问题检查学生是否真正理解。
3. 排版必须使用 Markdown：用 ## 小标题分段，关键概念用 **加粗**，并列内容用 - 列表，数学公式行内用 $...$、独立成行用 $$...$$，代码使用代码块。
4. 数字与事实要准确；不确定的内容要明确说明，绝不编造实验结果或数据。
5. 涉及动手实验时，提醒学生必须在教师或家长指导下进行，注意安全。
6. 如果学生提出与科学学习无关的问题，友好回应后把话题引回科学探索。
7. 结合对话历史回答；学生针对上一轮的检查问题作答时，先给予反馈，再继续讲解。
`.trim();

/**
 * 统一调用 DeepSeek 接口。
 * - 通过 AbortController 实现服务端超时
 * - 统一归一化错误信息
 * - jsonMode 时要求模型返回 JSON 对象，并做容错解析
 */
async function callDeepSeek({
  messages,
  jsonMode = false,
  timeoutMs = 75000,
  maxTokens = 3000,
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "尚未配置 API 密钥，请检查项目根目录的 .env 文件（DEEPSEEK_API_KEY）。"
    );
    error.statusCode = 500;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;

  try {
    response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);

    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "AI 响应超时，请稍后重试，或把问题拆得更小一些。"
      );
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    const networkError = new Error(
      "无法连接 AI 服务，请检查网络后重试。"
    );
    networkError.statusCode = 502;
    throw networkError;
  }

  clearTimeout(timer);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = data?.error?.message || "";
    let message = "AI 服务暂时不可用，请稍后再试。";
    let statusCode = 502;

    if (response.status === 401) {
      message = "API 密钥无效，请检查 .env 中的 DEEPSEEK_API_KEY。";
      statusCode = 500;
    } else if (response.status === 402) {
      message = "AI 服务余额不足，请联系老师或管理员。";
      statusCode = 502;
    } else if (response.status === 429) {
      message = "提问太频繁了，请稍等十几秒再试。";
      statusCode = 429;
    } else if (apiMessage) {
      message = apiMessage;
    }

    console.error("DeepSeek API error:", response.status, apiMessage);
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("AI 没有返回有效内容，请稍后重试。");
    error.statusCode = 502;
    throw error;
  }

  if (!jsonMode) {
    return content.trim();
  }

  return parseJsonContent(content);
}

/** 容错解析模型返回的 JSON（兼容代码块包裹、尾随逗号等常见小问题）。 */
function parseJsonContent(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidates = [];

  if (start !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  candidates.push(cleaned);

  for (const candidate of candidates) {
    const repaired = candidate
      // 去掉对象/数组中多余的尾随逗号
      .replace(/,(\s*[}\]])/g, "$1")
      // 去掉字面量之间的多余逗号
      .replace(/,(\s*,)+/g, ",");

    try {
      return JSON.parse(repaired);
    } catch {
      try {
        return JSON.parse(candidate);
      } catch {
        // 继续尝试下一种候选
      }
    }
  }

  const error = new Error("AI 返回的数据格式不正确，请重试一次。");
  error.statusCode = 502;
  throw error;
}

function isValidHistory(history) {
  return Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string"
        )
        .slice(-10)
        .map((item) => ({
          role: item.role,
          content: item.content.slice(0, 4000),
        }))
    : [];
}

function fail(res, statusCode, error) {
  res.status(statusCode).json({ error });
}

/* ------------------------------------------------------------------ */
/* 基础接口                                                            */
/* ------------------------------------------------------------------ */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AI 科创实验室后端运行正常",
  });
});

/* ------------------------------------------------------------------ */
/* 1. AI 学习导师：连续对话                                             */
/* ------------------------------------------------------------------ */

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return fail(res, 400, "请输入你的问题。");
    }

    if (message.length > 4000) {
      return fail(res, 400, "单次问题不能超过 4000 个字符。");
    }

    const answer = await callDeepSeek({
      messages: [
        { role: "system", content: TUTOR_SYSTEM_PROMPT },
        ...isValidHistory(history),
        { role: "user", content: message.trim() },
      ],
      timeoutMs: 75000,
      maxTokens: 3000,
    });

    res.json({ success: true, answer });
  } catch (error) {
    console.error("Chat request failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

/* ------------------------------------------------------------------ */
/* 2. AI 科学实验指导                                                   */
/* ------------------------------------------------------------------ */

app.post("/api/experiment/plan", async (req, res) => {
  try {
    const { courseId, title, objectives = [], knowledgePoints = [] } =
      req.body || {};

    if (typeof title !== "string" || !title.trim()) {
      return fail(res, 400, "缺少课程信息，无法生成实验方案。");
    }

    const safeTitle = title.slice(0, 100);
    const safeObjectives = Array.isArray(objectives)
      ? objectives.filter((x) => typeof x === "string").slice(0, 8)
      : [];
    const safeKnowledge = Array.isArray(knowledgePoints)
      ? knowledgePoints.filter((x) => typeof x === "string").slice(0, 10)
      : [];

    const plan = await callDeepSeek({
      jsonMode: true,
      timeoutMs: 90000,
      maxTokens: 3500,
      messages: [
        {
          role: "system",
          content: `
你是面向中小学生的科学实验课程设计师。根据给定的实验主题（含学习目标、实验原理与器材），设计一个学生可以在虚拟实验台（2D 或 3D）中动手完成、或结合资料观察完成的科学实验。
输出必须是 JSON 对象，不要输出 JSON 以外的任何文字，字段如下：
{
  "title": "实验名称（不超过 20 字）",
  "purpose": "实验目的，用 2-4 句通俗的话说明",
  "preparations": ["实验前需要准备或回顾的事项，3-5 条"],
  "safetyTips": ["安全与纪律提示，2-3 条；纯虚拟观察类实验也要提醒遵守课堂纪律和教师指导"],
  "steps": [
    {
      "title": "步骤名称",
      "instruction": "这一步具体怎么做、在虚拟实验台中如何操作或观察什么，2-4 句",
      "observationPoint": "本步骤需要重点观察和记录的内容",
      "expectedPhenomenon": "预期能观察到的现象"
    }
  ],
  "explorationTip": "针对该实验给出的一条动手探索建议（如适用可提示使用 3D 场景观察）"
}
要求：设计 4-6 个步骤；内容科学准确，适合中小学生；步骤应能在平台提供的虚拟实验台或 3D 场景中完成，不设计需要危险器材或离开教室的操作；涉及数值与现象时以给定的实验原理为准，不要编造公式结论。`.trim(),
        },
        {
          role: "user",
          content: `实验主题：${safeTitle}
主题编号：${String(courseId || "").slice(0, 50)}
学习目标：${safeObjectives.join("；") || "（无）"}
实验原理 / 核心知识点 / 操作步骤：${safeKnowledge.join("；") || "（无）"}`,
        },
      ],
    });

    res.json({ success: true, plan });
  } catch (error) {
    console.error("Experiment plan failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

app.post("/api/experiment/analyze", async (req, res) => {
  try {
    const { courseTitle, stepTitle, observation, expectedPhenomenon = "" } =
      req.body || {};

    if (typeof observation !== "string" || !observation.trim()) {
      return fail(res, 400, "请先填写你的实验观察。");
    }

    if (observation.length > 4000) {
      return fail(res, 400, "观察记录不能超过 4000 个字符。");
    }

    const analysis = await callDeepSeek({
      timeoutMs: 75000,
      maxTokens: 2500,
      messages: [
        {
          role: "system",
          content: `
你是正在带领中小学生做科学实验的老师。学生刚刚完成了一个实验步骤并提交了观察记录，请你：
1. 先用 Markdown 给出简短鼓励（## 观察反馈）。
2. 分析学生的观察：哪些与预期一致、哪些可能遗漏或误解（## 现象分析）。
3. 用通俗的语言解释这一现象背后的科学原理（## 原理讲解），必要时使用 **加粗**、列表和公式。
4. 如果观察有明显错误，温和指出并说明可能的原因，不要直接批评。
5. 最后用“## 想一想”提出 1 个引导学生进入下一步思考的小问题。
内容要科学准确，不能编造现象；全程中文。`.trim(),
        },
        {
          role: "user",
          content: `课程：${String(courseTitle || "").slice(0, 100)}
当前步骤：${String(stepTitle || "").slice(0, 100)}
预期现象：${String(expectedPhenomenon).slice(0, 500) || "（无）"}
学生的观察记录：${observation.trim()}`,
        },
      ],
    });

    res.json({ success: true, analysis });
  } catch (error) {
    console.error("Experiment analyze failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

/* ------------------------------------------------------------------ */
/* 3. 个性化学习与测评                                                  */
/* ------------------------------------------------------------------ */

app.post("/api/quiz/generate", async (req, res) => {
  try {
    const {
      title,
      objectives = [],
      knowledgePoints = [],
      singleCount = 3,
      booleanCount = 2,
      shortCount = 1,
      experimentContext = [],
    } = req.body || {};

    if (typeof title !== "string" || !title.trim()) {
      return fail(res, 400, "缺少课程信息，无法生成测验。");
    }

    /* 学生虚拟实验的真实记录（表格），原样传给出题模型 */
    const safeExperimentContext = Array.isArray(experimentContext)
      ? experimentContext
          .slice(0, 4)
          .map((item) => ({
            title: String(item?.title || "").slice(0, 100),
            records: sanitizeRecords(item?.records),
            conclusion: String(item?.conclusion || "").slice(0, 800),
          }))
          .filter((item) => item.records && item.records.rows.length > 0)
      : [];

    const experimentBlock = safeExperimentContext.length
      ? `\n学生的虚拟实验真实记录（可据此出 1-2 道数据分析题；记录中的数值必须原样引用，严禁修改或补充记录中没有的数据）：\n${safeExperimentContext
          .map(
            (item) =>
              `【${item.title}】\n${item.records.headers.join(" | ")}\n${item.records.rows
                .map((row) => row.join(" | "))
                .join("\n")}${
                item.conclusion ? `\n学生自己的结论：${item.conclusion}` : ""
              }`
          )
          .join("\n\n")}`
      : "";

    const quiz = await callDeepSeek({
      jsonMode: true,
      timeoutMs: 90000,
      maxTokens: 3500,
      messages: [
        {
          role: "system",
          content: `
你是面向中小学生的科学课命题老师。请围绕给定的实验主题（学习目标、实验原理与操作步骤）出题，题目必须科学准确、表述清晰、难度适合初学者。
如果提供了学生的虚拟实验记录，优先结合这些真实数据出数据分析类题目，让学生基于自己测得的数据作答。
输出必须是 JSON 对象，不能有 JSON 以外的文字：
{
  "questions": [
    {
      "type": "single",
      "question": "题干",
      "options": ["4 个选项，只有 1 个正确"],
      "answer": 0,
      "knowledgePoint": "该题考查的知识点（不超过 15 字）",
      "explanation": "答案解析，说明为什么对、其他选项为什么错"
    },
    {
      "type": "boolean",
      "question": "判断题题干",
      "answer": true,
      "knowledgePoint": "...",
      "explanation": "解析"
    },
    {
      "type": "short",
      "question": "简答题题干",
      "referenceAnswer": "参考答案要点，3-5 个要点",
      "knowledgePoint": "...",
      "explanation": "评分时应关注的关键点"
    }
  ]
}
要求：
- 选择题 answer 是正确选项的下标（从 0 开始），4 个选项长度相近、避免互相包含。
- 判断题 answer 为 true（正确）或 false（错误）。
- 知识点覆盖要均匀，题目之间不要重复，答案不要有争议。
- 正确/错误判断题的数量尽量均衡，选择题正确选项位置随机。`.trim(),
        },
        {
          role: "user",
          content: `实验主题：${String(title).slice(0, 100)}
学习目标：${Array.isArray(objectives) ? objectives.slice(0, 8).join("；") : ""}
实验原理 / 核心知识点 / 操作步骤：${Array.isArray(knowledgePoints) ? knowledgePoints.slice(0, 10).join("；") : ""}
题量要求：选择题 ${Number(singleCount) || 3} 道，判断题 ${Number(booleanCount) || 2} 道，简答题 ${Number(shortCount) || 1} 道。
${experimentBlock}`,
        },
      ],
    });

    res.json({ success: true, quiz });
  } catch (error) {
    console.error("Quiz generate failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

app.post("/api/quiz/grade-short", async (req, res) => {
  try {
    const { question, referenceAnswer, studentAnswer, explanation = "" } =
      req.body || {};

    if (typeof question !== "string" || !question.trim()) {
      return fail(res, 400, "缺少题目信息。");
    }

    if (typeof studentAnswer !== "string" || !studentAnswer.trim()) {
      return fail(res, 400, "学生答案为空。");
    }

    const result = await callDeepSeek({
      jsonMode: true,
      timeoutMs: 75000,
      maxTokens: 1800,
      messages: [
        {
          role: "system",
          content: `
你是一位批改中小学科学简答题的老师。请根据参考答案要点，宽容地评价学生答案：意思表达正确即给分，不要求与参考答案字面一致；鼓励用自己的话表达。
只输出 JSON 对象：
{
  "score": 0 到 100 的整数,
  "isCorrect": true 表示基本正确（60 分及以上），false 表示不正确,
  "reason": "用鼓励的语气说明评分理由，指出答到了哪些要点、漏掉了什么",
  "betterAnswer": "一版更完整、适合学生学习的参考答案"
}`.trim(),
        },
        {
          role: "user",
          content: `题目：${question.slice(0, 500)}
参考答案要点：${String(referenceAnswer || "").slice(0, 1000)}
评分关注点：${String(explanation).slice(0, 500) || "（无）"}
学生答案：${studentAnswer.trim().slice(0, 4000)}`,
        },
      ],
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error("Grade short failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

/* ------------------------------------------------------------------ */
/* 4. 个性化复习建议                                                    */
/* ------------------------------------------------------------------ */

app.post("/api/learning/recommend", async (req, res) => {
  try {
    const stats = req.body?.stats;

    if (!stats || typeof stats !== "object") {
      return fail(res, 400, "缺少学习数据。");
    }

    const recommendation = await callDeepSeek({
      timeoutMs: 75000,
      maxTokens: 2500,
      messages: [
        {
          role: "system",
          content: `
你是学生的个性化学习教练。根据系统提供的学习统计 JSON（包含课程任务完成情况、测验正确率、薄弱知识点、错题示例、学习时长等），用 Markdown 输出一份中文复习建议：
## 学习情况小结：先用 2-3 句话肯定进步、说明现状。
## 薄弱知识点：挑出最需要复习的 2-3 个知识点，分别说明为什么重要。
## 复习计划：给出未来 3 天、每天 15-20 分钟的具体复习安排（结合 3D 实验室和课程任务）。
## 巩固练习：出 2 道可以自己思考的小练习题（不需要学生在线作答）。
## 鼓励的话：最后写一句鼓励。
要求：建议必须基于提供的真实数据，数据不足时明确说明，不允许编造学生的成绩或完成情况。`.trim(),
        },
        {
          role: "user",
          content: `学习统计如下：\n${JSON.stringify(stats).slice(0, 6000)}`,
        },
      ],
    });

    res.json({ success: true, recommendation });
  } catch (error) {
    console.error("Recommend failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

/* ------------------------------------------------------------------ */
/* 5. 虚拟实验平台：AI 实验导师（只讲解，不参与计算）                    */
/* ------------------------------------------------------------------ */

function sanitizeMeasurements(list) {
  return Array.isArray(list)
    ? list
        .filter(
          (item) =>
            item &&
            typeof item.label === "string" &&
            (typeof item.value === "number" || typeof item.value === "string")
        )
        .slice(0, 20)
        .map((item) => ({
          label: String(item.label).slice(0, 60),
          value: item.value,
          unit: String(item.unit || "").slice(0, 20),
        }))
    : [];
}

function sanitizeRecords(records) {
  if (
    !records ||
    !Array.isArray(records.headers) ||
    !Array.isArray(records.rows)
  ) {
    return null;
  }

  return {
    headers: records.headers
      .slice(0, 12)
      .map((header) => String(header || "").slice(0, 30)),
    rows: records.rows
      .slice(0, 30)
      .map((row) =>
        Array.isArray(row)
          ? row.slice(0, 12).map((cell) => String(cell ?? "").slice(0, 60))
          : []
      ),
  };
}

app.post("/api/experiment/guide", async (req, res) => {
  try {
    const { message, history = [], context = {} } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return fail(res, 400, "请输入你想问的问题。");
    }

    if (message.length > 4000) {
      return fail(res, 400, "单次问题不能超过 4000 个字符。");
    }

    const measurements = sanitizeMeasurements(context.measurements);
    const records = sanitizeRecords(context.records);
    const objectives = Array.isArray(context.objectives)
      ? context.objectives.filter((x) => typeof x === "string").slice(0, 8)
      : [];
    const errors = Array.isArray(context.errors)
      ? context.errors.filter((x) => typeof x === "string").slice(0, 5)
      : [];

    const stateBlock = [
      `实验名称：${String(context.title || "").slice(0, 100)}`,
      `学段学科：${String(context.stage || "").slice(0, 20)} ${String(
        context.subject || ""
      ).slice(0, 20)}`,
      `实验原理：${String(context.principle || "").slice(0, 800)}`,
      `当前步骤：${String(context.currentStep || "—").slice(0, 200)}`,
      `器材参数与连接：${String(context.parameterSummary || "—").slice(0, 400)}`,
      `系统判定的电路/实验状态：${String(context.statusText || "未知").slice(0, 100)}`,
      errors.length ? `系统诊断信息：\n${errors.map((x) => `- ${x}`).join("\n")}` : "",
      measurements.length
        ? `规则引擎实时测量值：\n${measurements
            .map((m) => `- ${m.label} = ${m.value} ${m.unit}`)
            .join("\n")}`
        : "规则引擎实时测量值：当前状态没有可显示的测量值",
      records
        ? `学生已保存的数据记录（表格）：\n${records.headers.join(" | ")}\n${records.rows
            .map((row) => row.join(" | "))
            .join("\n")}`
        : "学生已保存的数据记录：暂无",
      context.conclusion
        ? `学生当前结论：${String(context.conclusion).slice(0, 1000)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const answer = await callDeepSeek({
      timeoutMs: 80000,
      maxTokens: 2500,
      messages: [
        {
          role: "system",
          content: `
你是“AI 科创实验室”的虚拟实验导师，正在指导一名中学生做虚拟实验。

【最重要的原则】
1. 下面“实验状态快照”中的所有数值与状态判定，都是由系统的科学规则引擎按物理/化学等公式实时计算的，是唯一可信的事实来源。
2. 你只能讲解、引导、分析、鼓励：解释原理、给分步提示、诊断错误原因、引导学生比较数据、帮助组织结论。
3. 严禁你自己计算、猜测、修改或“纠正”任何测量数值；学生问“电流是多少”时，必须让他看规则引擎给出的测量值，或引导他改变电路状态后重新读数，绝不可以凭空给数。
4. 当实验状态为短路、断路、未接完整等异常时，依据系统诊断信息指导排查，不要描述与状态不符的实验现象。
5. 分步提示要循序渐进，学生没做出来时给启发，不直接替学生完成全部操作；涉及安全（尤其短路）必须明确警告。
6. 用 Markdown 排版：## 小标题、**加粗**、列表、行内公式 $...$；语言亲切准确，全程中文。

【学习目标】
${objectives.join("；") || "（无）"}`.trim(),
        },
        { role: "system", content: `实验状态快照（规则引擎提供，真实可靠）：\n${stateBlock}` },
        ...isValidHistory(history),
        { role: "user", content: message.trim() },
      ],
    });

    res.json({ success: true, answer });
  } catch (error) {
    console.error("Experiment guide failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

/* ------------------------------------------------------------------ */
/* 6. 虚拟实验平台：实验报告草稿（只整理，不虚构数据）                   */
/* ------------------------------------------------------------------ */

app.post("/api/experiment/report", async (req, res) => {
  try {
    const {
      title,
      subject,
      stage,
      objectives = [],
      principle = "",
      equipment = [],
      stepsStatus = [],
      records = null,
      conclusion = "",
    } = req.body || {};

    if (typeof title !== "string" || !title.trim()) {
      return fail(res, 400, "缺少实验信息，无法生成报告。");
    }

    const safeSteps = Array.isArray(stepsStatus)
      ? stepsStatus
          .filter((item) => item && typeof item.title === "string")
          .slice(0, 20)
          .map((item) => ({
            步骤: String(item.title).slice(0, 100),
            完成情况: item.done ? "已完成" : "未完成",
          }))
      : [];

    const report = await callDeepSeek({
      timeoutMs: 85000,
      maxTokens: 3000,
      messages: [
        {
          role: "system",
          content: `
你是中学科学实验课老师，要根据学生在虚拟实验平台上产生的真实记录，帮学生整理一份规范的实验报告草稿（Markdown）。

严格要求：
1. 报告中的所有数据只能来自下面提供的“学生真实记录”，严禁编造、补全或推算任何未测量的数据；数据缺失时，在对应位置明确写“（未测量/未完成）”。
2. 测量数据按原样列入“原始数据记录”表格，不做任何修改。
3. “实验结论”部分先引用学生自己写的结论；若学生未写或不完整，用提问和要点提示引导他补充，不要替学生下结论。
4. 结构固定为：## 一、实验名称；## 二、实验目的；## 三、实验器材；## 四、实验步骤与完成情况；## 五、原始数据记录（表格）；## 六、数据分析（仅基于已有数据做客观比较，如各处电流是否相等）；## 七、我的实验结论（学生原文 + 引导）；## 八、教师点评与改进建议。
5. 语言适合中学生阅读，科学准确；公式用 $...$；全程中文。`.trim(),
        },
        {
          role: "user",
          content: `实验名称：${String(title).slice(0, 100)}
学段学科：${String(stage || "").slice(0, 20)} ${String(subject || "").slice(0, 20)}
实验目的：${Array.isArray(objectives) ? objectives.slice(0, 8).join("；") : ""}
实验原理：${String(principle).slice(0, 800)}
实验器材：${Array.isArray(equipment) ? equipment.slice(0, 20).join("、") : ""}

步骤完成情况：
${JSON.stringify(safeSteps, null, 2) || "（无）"}

学生真实数据记录（表格，逐行原样呈现）：
${
  records
    ? `${records.headers.join(" | ")}\n${records.rows
        .map((row) => row.join(" | "))
        .join("\n")}`
    : "（无）"
}

学生自己写的结论：
${String(conclusion || "").slice(0, 2000) || "（未填写）"}`,
        },
      ],
    });

    res.json({ success: true, report });
  } catch (error) {
    console.error("Experiment report failed:", error.message);
    fail(res, error.statusCode || 500, error.message);
  }
});

app.listen(PORT, () => {
  console.log(`AI 后端已启动：http://localhost:${PORT}`);
});
