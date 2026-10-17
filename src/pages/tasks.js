import {
  getLearningRecords,
  recordTaskAnswer
} from "./learning-records.js";

export const tasks = [
  {
    id: "planets-order",
    title: "任务一：认识八大行星",
    objective: "掌握八大行星距离太阳由近到远的排列顺序。",
    steps: [
      "回顾课程中的太阳系组成知识。",
      "观察太阳系三维场景中的行星。",
      "选择正确的行星排列顺序。"
    ],
    question: "距离太阳最近的四颗行星，正确的顺序是什么？",
    options: [
      "水星、金星、地球、火星",
      "金星、水星、火星、地球",
      "地球、火星、水星、金星"
    ],
    answer: 0,
    explanation: "正确！距离太阳由近到远依次是水星、金星、地球、火星。"
  },
  {
    id: "rotation-revolution",
    title: "任务二：区分自转与公转",
    objective: "理解天体自转和公转的区别。",
    steps: [
      "观察地球模型。",
      "思考地球绕自身旋转的运动。",
      "判断哪一种运动是地球绕太阳运行。"
    ],
    question: "地球围绕太阳运行，这种运动称为什么？",
    options: [
      "自转",
      "公转",
      "静止"
    ],
    answer: 1,
    explanation: "正确！地球围绕太阳运行称为公转，地球绕自身旋转称为自转。"
  },
  {
    id: "planet-features",
    title: "任务三：认识行星特征",
    objective: "认识不同类型行星的基本特征。",
    steps: [
      "回顾八大行星的名称和基本特征。",
      "比较类地行星与巨行星。",
      "完成行星特征判断。"
    ],
    question: "下列哪颗行星以显著的光环而闻名？",
    options: [
      "水星",
      "地球",
      "土星"
    ],
    answer: 2,
    explanation: "正确！土星拥有非常显著的光环系统。"
  }
];

export function renderTasks() {
  return `
    <section class="experiment-tasks" id="experiment-tasks">
      <div class="task-heading">
        <p class="courses-eyebrow">YOUR MISSIONS</p>
        <h3>太阳系实验任务</h3>
        <p>按照实验步骤完成挑战，检验你的科学知识。</p>
        <p class="task-progress" id="task-progress">
          已完成 0 / ${tasks.length} 个任务
        </p>
      </div>

      <div class="task-grid">
        ${tasks.map((task) => `
          <article class="task-card" data-task-id="${task.id}">
  <p class="task-status" data-task-status>
    尚未完成
  </p>
            <h4>${task.title}</h4>

            <p class="task-objective">
              <strong>学习目标：</strong>${task.objective}
            </p>

            <h5>实验步骤</h5>
            <ol>
              ${task.steps.map(step => `<li>${step}</li>`).join("")}
            </ol>

            <div class="task-question">
              <p><strong>实验挑战：</strong>${task.question}</p>

              <div class="task-options">
                ${task.options.map((option, index) => `
                  <button
                    type="button"
                    class="task-option"
                    data-option="${index}"
                  >${option}</button>
                `).join("")}
              </div>

              <p class="task-feedback" aria-live="polite"></p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

export function bindTasks(container) {
  const records = getLearningRecords();
  const completed = new Set(records.completedTasks);

  container.querySelectorAll(".task-card").forEach((card) => {
  const taskId = card.dataset.taskId;
  const status = card.querySelector("[data-task-status]");
  const answer = records.answers[taskId];

  if (completed.has(taskId) && status) {
    status.textContent = "✓ 已完成";
    status.classList.add("is-completed");
  } else if (answer && status) {
    status.textContent = "已作答，尚未完成";
  }
});

  const progress = container.querySelector("#task-progress");

if (progress) {
  progress.textContent =
    `已完成 ${completed.size} / ${tasks.length} 个任务`;
}

  container.querySelectorAll(".task-card").forEach((card) => {
    const task = tasks.find(
      item => item.id === card.dataset.taskId
    );

    if (!task) return;

    const feedback = card.querySelector(".task-feedback");
    const options = card.querySelectorAll(".task-option");

    options.forEach((button) => {
      button.addEventListener("click", () => {
        const selected = Number(button.dataset.option);

        options.forEach((option) => {
          option.classList.remove("is-correct", "is-wrong");
          option.disabled = false;
        });

        
const result = recordTaskAnswer(
  task.id,
  selected,
  task.answer
);
if (result.isCorrect) {
  button.classList.add("is-correct");
  feedback.textContent = task.explanation;
  feedback.className = "task-feedback success";

  completed.add(task.id);

  const status = card.querySelector("[data-task-status]");

  if (status) {
    status.textContent = "✓ 已完成";
    status.classList.add("is-completed");
  }
} else {
  button.classList.add("is-wrong");
  feedback.textContent = "还不正确，再想一想，试着重新选择。";
  feedback.className = "task-feedback error";
}


        
const progress = container.querySelector("#task-progress");

if (progress) {
  progress.textContent =
    `已完成 ${completed.size} / ${tasks.length} 个任务`;
}

      });
    });
  });
}
