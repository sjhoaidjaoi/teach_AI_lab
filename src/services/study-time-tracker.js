import { addStudySeconds } from "./storage.js";

const TICK_SECONDS = 10;
let started = false;
let timer = null;

/**
 * 学习时长埋点：页面可见时每 10 秒累计一次，
 * 切到后台自动暂停，数据按天保存在 localStorage。
 */
export function startStudyTimeTracker() {
  if (started || typeof window === "undefined") return;
  started = true;

  const flush = () => {
    if (document.visibilityState === "visible") {
      addStudySeconds(TICK_SECONDS);
    }
  };

  timer = window.setInterval(flush, TICK_SECONDS * 1000);

  // 页面关闭前尽量补一次（同 tick 内已在可见状态累计，无需额外估算）
  window.addEventListener("beforeunload", () => {
    if (timer) window.clearInterval(timer);
  });
}
