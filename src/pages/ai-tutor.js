import { askTutor } from "../services/ai-client.js";
import { renderMarkdown } from "../lib/markdown.js";
import {
  getTutorConversation,
  saveTutorConversation,
  clearTutorConversation,
} from "../services/storage.js";

export function renderAiTutor() {
  return `
    <main class="ai-tutor-page">
      <section class="ai-tutor-header">
        <div>
          <p class="courses-eyebrow">AI SCIENCE MENTOR</p>
          <h1>AI 科学学习导师</h1>
          <p>
            遇到不懂的科学知识？输入你的问题，
            开启一场循序渐进的科学探索。
          </p>
        </div>

        <button
          type="button"
          class="button button-secondary"
          id="ai-clear-conversation"
        >
          清空对话
        </button>
      </section>

      <section class="ai-chat-panel">
        <div class="ai-chat-heading">
          <div>
            <h2>科学问答</h2>
            <p>当前主题：太阳系探索 · 支持连续提问</p>
          </div>
          <span class="ai-online-status">AI 大模型已接入</span>
        </div>

        <div
          class="ai-chat-messages"
          id="ai-chat-messages"
          aria-live="polite"
          aria-label="对话消息"
        >
          <article class="ai-message assistant">
            <div class="ai-message-role">AI 导师</div>
            <div class="ai-message-content markdown-body">
              你好！我是你的 AI 科学学习导师。<br />
              你可以连续追问，我会记住我们前面的讨论。
              试着问我关于太阳、八大行星、自转和公转的问题吧！
            </div>
          </article>
        </div>

        <div class="ai-quick-questions">
          <p>试着问我：</p>
          <button type="button" data-question="八大行星按照什么顺序排列？">
            八大行星的排列顺序
          </button>
          <button type="button" data-question="自转和公转有什么区别？">
            自转和公转的区别
          </button>
          <button type="button" data-question="为什么土星有光环？">
            为什么土星有光环？
          </button>
        </div>

        <form class="ai-chat-form" id="ai-chat-form">
          <label class="sr-only" for="ai-chat-input">
            输入科学问题
          </label>

          <textarea
            id="ai-chat-input"
            name="message"
            rows="2"
            maxlength="1000"
            placeholder="输入科学问题，Enter 发送，Shift + Enter 换行……"
            required
          ></textarea>

          <button type="submit" id="ai-chat-send">
            发送问题
          </button>
        </form>

        <p class="ai-chat-tip">
          提示：描述具体问题，更容易获得有针对性的解释。
          对话内容仅保存在本机浏览器中。
        </p>
      </section>
    </main>
  `;
}

export function bindAiTutor(container) {
  const form = container.querySelector("#ai-chat-form");
  const input = container.querySelector("#ai-chat-input");
  const messages = container.querySelector("#ai-chat-messages");
  const sendButton = container.querySelector("#ai-chat-send");
  const clearButton = container.querySelector("#ai-clear-conversation");

  if (!form || !input || !messages || !sendButton) return;

  // 持久化的对话上下文（仅包含成功的问答）
  let conversation = getTutorConversation().messages;
  let isSending = false;
  let pendingQuestion = null;

  /* ---------- 消息渲染 ---------- */

  function createMessageBubble(role) {
    const article = document.createElement("article");
    article.className = `ai-message ${role}`;

    const label = document.createElement("div");
    label.className = "ai-message-role";
    label.textContent = role === "user" ? "我" : "AI 导师";

    const content = document.createElement("div");
    content.className =
      role === "user"
        ? "ai-message-content"
        : "ai-message-content markdown-body";

    article.append(label, content);
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;

    return { article, content };
  }

  function showTypingIndicator() {
    const { article, content } = createMessageBubble("assistant");
    article.classList.add("is-loading");
    content.innerHTML = `
      <span class="typing-dots" aria-label="AI 正在思考">
        <span></span><span></span><span></span>
      </span>
    `;
    return article;
  }

  function showErrorMessage(bubble, question, errorText) {
    bubble.classList.remove("is-loading");
    bubble.classList.add("is-error");
    bubble.innerHTML = `
      <div class="ai-message-role">AI 导师</div>
      <div class="ai-message-content ai-error-box">
        <p><strong>暂时无法回答：</strong>${errorText}</p>
        <button type="button" class="button button-secondary ai-retry-btn">
          重新提问
        </button>
      </div>
    `;

    bubble.querySelector(".ai-retry-btn")?.addEventListener("click", () => {
      bubble.remove();
      sendQuestion(question, { mode: "retry" });
    });
  }

  function renderAssistantAnswer(bubble, answer, { canRegenerate = true } = {}) {
    bubble.classList.remove("is-loading");
    bubble.innerHTML = `
      <div class="ai-message-role">AI 导师</div>
      <div class="ai-message-content markdown-body"></div>
      <div class="ai-message-actions"></div>
    `;

    bubble.querySelector(".ai-message-content").innerHTML =
      renderMarkdown(answer);

    if (canRegenerate) {
      const actions = bubble.querySelector(".ai-message-actions");
      const regenerateBtn = document.createElement("button");
      regenerateBtn.type = "button";
      regenerateBtn.className = "ai-regenerate-btn";
      regenerateBtn.textContent = "↻ 重新生成回答";
      regenerateBtn.addEventListener("click", () => regenerateLastAnswer());
      actions.appendChild(regenerateBtn);
    }

    messages.scrollTop = messages.scrollHeight;
  }

  function renderHistory() {
    conversation.forEach((item) => {
      const { article, content } = createMessageBubble(item.role);

      if (item.role === "assistant") {
        content.innerHTML = renderMarkdown(item.content);
        const actions = document.createElement("div");
        actions.className = "ai-message-actions";
        const regenerateBtn = document.createElement("button");
        regenerateBtn.type = "button";
        regenerateBtn.className = "ai-regenerate-btn";
        regenerateBtn.textContent = "↻ 重新生成回答";
        regenerateBtn.addEventListener("click", () =>
          regenerateLastAnswer()
        );
        actions.appendChild(regenerateBtn);
        article.appendChild(actions);
      } else {
        content.textContent = item.content;
      }
    });

    messages.scrollTop = messages.scrollHeight;
  }

  /* ---------- 对话流程 ---------- */

  function setSendingState(sending) {
    isSending = sending;
    input.disabled = sending;
    sendButton.disabled = sending;
    sendButton.textContent = sending ? "AI 思考中…" : "发送问题";
    if (!sending) input.focus();
  }

  async function sendQuestion(question, { mode = "new" } = {}) {
    const text = String(question || "").trim();

    if (!text || isSending) return;

    let history;
    let pushedUser = false;

    if (mode === "regenerate") {
      // 重新生成：用户问题已在界面且是上下文最后一条
      history = conversation.slice(0, -1);
    } else {
      // new：需要新增用户气泡；retry：用户气泡已在界面但不在上下文
      if (mode === "new") {
        const userBubble = createMessageBubble("user");
        userBubble.content.textContent = text;
      }
      history = conversation.slice();
      conversation.push({ role: "user", content: text });
      pushedUser = true;
    }

    pendingQuestion = text;
    setSendingState(true);

    const loadingBubble = showTypingIndicator();

    try {
      const data = await askTutor({
        message: text,
        history: history.slice(-10),
      });

      renderAssistantAnswer(loadingBubble, data.answer);
      conversation.push({ role: "assistant", content: data.answer });
      saveTutorConversation(conversation);
    } catch (error) {
      console.error("AI 助教请求失败：", error);
      showErrorMessage(loadingBubble, text, error.message || "未知错误");
      // 失败的问题不计入有效上下文（重新生成模式下用户问题本就保留）
      if (pushedUser) {
        conversation.pop();
      }
    } finally {
      setSendingState(false);
      messages.scrollTop = messages.scrollHeight;
    }
  }

  async function regenerateLastAnswer() {
    if (isSending) return;

    // 找到最后一个用户问题
    let lastUserIndex = -1;
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const lastQuestion = conversation[lastUserIndex].content;

    // 移除界面上最后一条 AI 回答气泡
    const bubbles = messages.querySelectorAll(".ai-message");
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].classList.contains("assistant")) {
        bubbles[i].remove();
        break;
      }
    }

    // 移除上下文中最后一条 AI 回答，然后重新请求
    if (conversation[conversation.length - 1]?.role === "assistant") {
      conversation.pop();
    }

    await sendQuestion(lastQuestion, { mode: "regenerate" });
  }

  /* ---------- 事件绑定 ---------- */

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    input.value = "";
    sendQuestion(text);
  });

  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  container.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isSending) return;
      sendQuestion(button.dataset.question);
    });
  });

  clearButton?.addEventListener("click", () => {
    const hasConversation = conversation.length > 0;

    if (
      hasConversation &&
      !window.confirm("确定清空当前对话吗？此操作不可撤销。")
    ) {
      return;
    }

    conversation = [];
    pendingQuestion = null;
    clearTutorConversation();

    messages.innerHTML = `
      <article class="ai-message assistant">
        <div class="ai-message-role">AI 导师</div>
        <div class="ai-message-content markdown-body">
          对话已清空。让我们开始一个新的科学话题吧！
        </div>
      </article>
    `;
  });

  renderHistory();
}
