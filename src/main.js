import "./style.css";
import {
  renderLaboratory,
  mountLaboratory,
} from "./pages/laboratory.js";
import { renderCourses, bindCourses } from "./pages/courses.js";
import { renderAiTutor, bindAiTutor } from "./pages/ai-tutor.js";
import { renderExperiment, bindExperiment } from "./pages/experiment.js";
import { renderQuiz, bindQuiz } from "./pages/quiz.js";
import {
  renderDashboard,
  bindDashboard,
  disposeDashboard,
} from "./pages/dashboard.js";
import {
  renderExperiments,
  bindExperiments,
} from "./pages/experiments.js";
import {
  renderExperimentRunner,
  bindExperimentRunner,
  disposeExperimentRunner,
} from "./pages/experiment-runner.js";
import {
  getExperimentById,
  experiments as catalogExperiments,
  SUBJECTS,
} from "./experiments/catalog.js";
import { startStudyTimeTracker } from "./services/study-time-tracker.js";

const app = document.querySelector("#app");

let disposeLaboratory = null;
let labSceneToken = 0;

const NAV_ITEMS = [
  { hash: "#home", label: "首页" },
  { hash: "#experiments", label: "虚拟实验" },
  { hash: "#experiment", label: "实验指导" },
  { hash: "#ai-tutor", label: "AI 导师" },
  { hash: "#quiz", label: "智能测评" },
  { hash: "#dashboard", label: "学习分析" },
];

// 首页数据一览（由实验注册表真实统计，不虚构数字）
const AVAILABLE_EXPERIMENTS = catalogExperiments.filter(
  (item) => item.status === "available"
).length;
const HOME_STATS = [
  { value: String(Object.keys(SUBJECTS).length), label: "大学科虚拟实验" },
  { value: String(AVAILABLE_EXPERIMENTS), label: "个可动手操作实验" },
  { value: "3", label: "个 3D 沉浸场景" },
  { value: "4", label: "大 AI 学习工具" },
];

function renderShell(activeHash, mainHTML) {
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#home">AI 科创实验室</a>
      <nav class="nav">
        ${NAV_ITEMS.map(
          (item) => `
          <a href="${item.hash}"
            class="${item.hash === activeHash ? "is-active" : ""}">
            ${item.label}
          </a>`
        ).join("")}
      </nav>
    </header>

    ${mainHTML}

    <footer class="site-footer">
      <p>AI 科创实验室 · 让科学探索触手可及</p>
    </footer>
  `;
}

/* ---------------- 首页 ---------------- */

function renderHome() {
  renderShell(
    "#home",
    `
    <main>
      <section class="hero" id="home">
        <p class="eyebrow">AI + 科学教育</p>
        <h1>在 3D 空间里<br />动手做科学实验</h1>

        <p class="hero-description">
          覆盖物理、化学、生物、地理的可操作虚拟实验与 3D 沉浸场景，
          测量结果全部由科学公式计算，AI 全程引导——
          让抽象的科学知识看得见、摸得着。
        </p>

        <div class="hero-actions">
          <a class="button button-primary" href="#experiments">
            开始虚拟实验
          </a>
          <a class="button button-secondary" href="#laboratory">
            进入 3D 实验室
          </a>
        </div>
      </section>

      <section class="home-stats" aria-label="平台数据一览">
        ${HOME_STATS.map(
          (item) => `
          <div class="home-stat">
            <strong>${item.value}</strong>
            <span>${item.label}</span>
          </div>`
        ).join("")}
      </section>

      <section class="features" id="courses">
        <div class="section-heading">
          <p class="eyebrow">EXPLORE SCIENCE</p>
          <h2>探索科学的多种方式</h2>
        </div>

        <div class="feature-grid feature-grid-six">
          <a class="feature-card" href="#experiments">
            <h3>🧲 AI 引导虚拟实验</h3>
            <p>物理、化学、生物、地理实验可操作、可测量，结果由科学公式计算，AI 全程引导。</p>
          </a>

          <a class="feature-card" href="#laboratory">
            <h3>🪐 3D 科学实验室</h3>
            <p>太阳系探索、串联电路、地球公转三大 3D 场景自由旋转观察。</p>
          </a>

          <a class="feature-card" href="#experiment">
            <h3>🧪 AI 实验指导</h3>
            <p>从实验方案到观察分析，AI 分步带你做实验。</p>
          </a>

          <a class="feature-card" href="#ai-tutor">
            <h3>🤖 AI 学习导师</h3>
            <p>连续追问，循序渐进地理解科学原理。</p>
          </a>

          <a class="feature-card" href="#quiz">
            <h3>📝 智能测评</h3>
            <p>AI 自动出题批改，可结合你的虚拟实验记录出数据分析题。</p>
          </a>

          <a class="feature-card" href="#dashboard">
            <h3>📊 学习分析</h3>
            <p>可视化学习数据与实验进展，获得个性化复习建议。</p>
          </a>
        </div>
      </section>

      <section class="laboratory-preview" id="laboratory-preview">
        <div>
          <p class="eyebrow">YOUR FIRST MISSION</p>
          <h2>准备好探索科学了吗？</h2>
          <p>从一次动手测量开始，在 AI 引导下像科学家一样思考。</p>
        </div>

        <a class="button button-primary" href="#experiments">
          开始 AI 引导实验
        </a>
      </section>
    </main>
  `);
}

/* ---------------- 路由页面 ---------------- */

function cleanupActiveScene() {
  labSceneToken += 1;
  if (disposeLaboratory) {
    disposeLaboratory();
    disposeLaboratory = null;
  }
  disposeDashboard();
  disposeExperimentRunner();
}

/* ---------------- 虚拟实验平台 ---------------- */

function openExperimentsCatalog() {
  cleanupActiveScene();
  renderShell("#experiments", renderExperiments());
  bindExperiments(app);
}

async function openExperimentRunner(experimentId) {
  const catalogEntry = getExperimentById(experimentId);

  if (!catalogEntry || !catalogEntry.loadModule) {
    window.location.hash = "#experiments";
    return;
  }

  cleanupActiveScene();
  // 目录入口保持导航高亮
  renderShell("#experiments", renderExperimentRunner(catalogEntry));

  try {
    await bindExperimentRunner(app, catalogEntry);
  } catch (error) {
    console.error("加载实验模块失败：", error);
    window.location.hash = "#experiments";
  }
}

function openLaboratory(sceneId = "solar") {
  cleanupActiveScene();
  const token = labSceneToken;
  // 3D 实验室已并入虚拟实验导航，这里高亮"虚拟实验"
  renderShell("#experiments", renderLaboratory(sceneId));

  mountLaboratory(sceneId)
    .then((dispose) => {
      if (token !== labSceneToken) {
        // 等待挂载期间用户已切换场景/页面，立即销毁避免泄漏
        dispose();
        return;
      }
      disposeLaboratory = dispose;
    })
    .catch((error) => {
      console.error("加载 3D 场景失败：", error);
    });
}

function openCourses() {
  cleanupActiveScene();
  renderShell("#experiment", renderCourses());
  bindCourses(app, () => {
    window.location.hash = "#laboratory";
  });
}

function openAiTutor() {
  cleanupActiveScene();
  renderShell("#ai-tutor", renderAiTutor());
  bindAiTutor(app);
}

function openExperiment() {
  cleanupActiveScene();
  renderShell("#experiment", renderExperiment());
  bindExperiment(app, {
    onOpenLaboratory: () => {
      window.location.hash = "#laboratory";
    },
  });
}

function openQuiz() {
  cleanupActiveScene();
  renderShell("#quiz", renderQuiz());
  bindQuiz(app);
}

function openDashboard() {
  cleanupActiveScene();
  renderShell("#dashboard", renderDashboard());
  bindDashboard(app);
}

/* ---------------- hash 路由 ---------------- */

const ROUTES = {
  "#courses": openCourses,
  "#ai-tutor": openAiTutor,
  "#experiment": openExperiment,
  "#experiments": openExperimentsCatalog,
  "#quiz": openQuiz,
  "#dashboard": openDashboard,
};

function handleRoute() {
  const route = window.location.hash || "#home";

  if (route.startsWith("#experiment-run/")) {
    const experimentId = decodeURIComponent(
      route.slice("#experiment-run/".length)
    );
    openExperimentRunner(experimentId);
  } else if (route.startsWith("#laboratory")) {
    // 支持 #laboratory、#laboratory/circuit、#laboratory/seasons
    const sceneId = route.includes("/") ? route.slice("#laboratory/".length) : "solar";
    openLaboratory(["solar", "circuit", "seasons"].includes(sceneId) ? sceneId : "solar");
  } else if (route === "#records") {
    // 旧学习记录页已并入学习分析
    window.location.hash = "#dashboard";
  } else {
    const renderer = ROUTES[route];

    if (renderer) {
      renderer();
    } else {
      renderHome();
    }
  }

  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", handleRoute);
handleRoute();

// 学习时长埋点（页面可见时累计）
startStudyTimeTracker();
