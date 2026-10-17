import { renderTasks, bindTasks } from "./tasks.js";

export const courses = [
  {
    id: "solar-system",
    title: "探索太阳系",
    category: "天文学",
    level: "入门",
    duration: "20 分钟",
    description: "通过交互式三维场景，认识太阳和八大行星，理解行星的自转、公转与基本特征。",
    objectives: [
      "认识太阳系中的太阳和八大行星",
      "理解自转与公转的区别",
      "掌握部分行星的基本科学知识"
    ],
    knowledge: [
      {
        title: "太阳系的组成",
        content: "太阳系以太阳为中心，包含八大行星、卫星、小行星、彗星等天体。"
      },
      {
        title: "自转与公转",
        content: "自转是天体绕自身的旋转；公转是天体围绕另一个天体运动。"
      },
      {
        title: "八大行星",
        content: "按照距离太阳由近到远的顺序，分别是水星、金星、地球、火星、木星、土星、天王星和海王星。"
      }
    ]
  }
];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

export function renderCourses() {
  return `
    <main class="courses-page">
      <section class="courses-hero">
        <p class="courses-eyebrow">AI SCIENCE LAB</p>
        <h1>科学课程中心</h1>
        <p class="courses-subtitle">
          从科学知识出发，通过三维交互探索身边的科学世界。
        </p>
      </section>

      <section class="courses-content">
        <div class="courses-section-heading">
          <div>
            <h2>精选课程</h2>
            <p>选择一门课程，开启你的探索之旅。</p>
          </div>
          <span class="courses-count">${courses.length} 门课程</span>
        </div>

        <div class="course-grid">
          ${courses.map(course => `
            <article class="course-card">
              <div class="course-cover">
                <span class="course-planet">🪐</span>
                <span class="course-category">
                  ${escapeHTML(course.category)}
                </span>
              </div>

              <div class="course-card-body">
                <div class="course-meta">
                  <span>${escapeHTML(course.level)}</span>
                  <span>${escapeHTML(course.duration)}</span>
                </div>

                <h3>${escapeHTML(course.title)}</h3>
                <p>${escapeHTML(course.description)}</p>

                <button
                  class="course-detail-btn"
                  data-course-id="${escapeHTML(course.id)}"
                >
                  查看课程详情 →
                </button>
              </div>
            </article>
          `).join("")}
        </div>

        <section id="course-detail" class="course-detail-panel" hidden></section>
      </section>
    </main>
  `;
}

export function bindCourses(container, onEnterLaboratory) {
  const detailPanel = container.querySelector("#course-detail");

  container.querySelectorAll(".course-detail-btn").forEach(button => {
    button.addEventListener("click", () => {
      const course = courses.find(
        item => item.id === button.dataset.courseId
      );

      if (!course || !detailPanel) return;

      detailPanel.hidden = false;
      detailPanel.innerHTML = `
        <div class="course-detail-heading">
          <div>
            <p class="courses-eyebrow">COURSE DETAILS</p>
            <h2>${escapeHTML(course.title)}</h2>
          </div>
          <button class="course-close-btn" type="button">收起</button>
        </div>

        <p>${escapeHTML(course.description)}</p>

        <h3>学习目标</h3>
        <ul>
          ${course.objectives.map(item =>
            `<li>${escapeHTML(item)}</li>`
          ).join("")}
        </ul>

        <h3>核心知识点</h3>
        <div class="knowledge-list">
          ${course.knowledge.map(item => `
            <article class="knowledge-item">
              <h4>${escapeHTML(item.title)}</h4>
              <p>${escapeHTML(item.content)}</p>
            </article>
          `).join("")}
        </div>

        ${renderTasks()}

        <button class="course-start-btn" type="button">
          进入 3D 实验室
        </button>
      `;

      detailPanel.querySelector(".course-close-btn")
        .addEventListener("click", () => {
          detailPanel.hidden = true;
        });

        bindTasks(detailPanel);

      detailPanel.querySelector(".course-start-btn")
        .addEventListener("click", () => {
          onEnterLaboratory?.(course.id);
        });

      detailPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}
