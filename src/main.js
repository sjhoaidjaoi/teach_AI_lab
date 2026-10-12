
import "./style.css";
import {
  renderLaboratory,
  mountLaboratory,
} from "./pages/laboratory.js";

const app = document.querySelector("#app");

let disposeLaboratory = null;

function renderHome() {
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#home">AI 科创实验室</a>

      <nav class="nav">
        <a href="#home">首页</a>
        <a href="#courses">科学课程</a>
        <a href="#laboratory-preview">实验室</a>
      </nav>
    </header>

    <main>
      <section class="hero" id="home">
        <p class="eyebrow">AI + 科学教育</p>
        <h1>让科学探索<br />变得看得见、摸得着</h1>

        <p class="hero-description">
          通过交互式 3D 场景、科学实验任务和智能学习引导，
          让抽象的科学知识更加直观。
        </p>

        <div class="hero-actions">
          <button class="button button-primary" id="start-button">
            进入实验室
          </button>
        </div>
      </section>

      <section class="features" id="courses">
        <div class="section-heading">
          <p class="eyebrow">EXPLORE SCIENCE</p>
          <h2>探索科学的三种方式</h2>
        </div>

        <div class="feature-grid">
          <article class="feature-card">
            <h3>3D 科学探索</h3>
            <p>旋转、缩放和观察科学模型。</p>
          </article>

          <article class="feature-card">
            <h3>交互式实验</h3>
            <p>围绕学习目标完成实验任务。</p>
          </article>

          <article class="feature-card">
            <h3>AI 学习导师</h3>
            <p>通过提问和提示理解科学原理。</p>
          </article>
        </div>
      </section>

      <section class="laboratory-preview" id="laboratory-preview">
        <div>
          <p class="eyebrow">YOUR FIRST MISSION</p>
          <h2>准备好探索科学了吗？</h2>
          <p>从太阳系探索开始，逐步构建 3D 科学实验室。</p>
        </div>

        <button class="button button-primary" id="start-button-bottom">
          开始探索
        </button>
      </section>
    </main>

    <footer class="site-footer">
      <p>AI 科创实验室 · 让科学探索触手可及</p>
    </footer>
  `;

  document.querySelector("#start-button")
    .addEventListener("click", openLaboratory);

  document.querySelector("#start-button-bottom")
    .addEventListener("click", openLaboratory);
}

function openLaboratory() {
  if (disposeLaboratory) {
    disposeLaboratory();
    disposeLaboratory = null;
  }

  app.innerHTML = renderLaboratory();

  disposeLaboratory = mountLaboratory();

  document.querySelector("#back-home")
    ?.addEventListener("click", () => {
      if (disposeLaboratory) {
        disposeLaboratory();
        disposeLaboratory = null;
      }

      renderHome();
    });
}

renderHome();
