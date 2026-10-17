import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * 把 AI 返回的 Markdown 渲染为安全的 HTML：
 * 1. 先保护 $...$ / $$...$$ 公式（KaTeX 渲染）
 * 2. marked 解析 Markdown
 * 3. DOMPurify 消毒，防止 AI 内容注入脚本
 * 4. 最后回填公式 HTML（可信库输出）
 */
export function renderMarkdown(text) {
  const source = String(text || "");
  const formulas = [];

  function stashFormula(latex, displayMode) {
    const index = formulas.length;
    let html;

    try {
      html = katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        output: "html",
      });
    } catch {
      const escaped = DOMPurify.sanitize(latex);
      html = `<code class="math-fallback">${escaped}</code>`;
    }

    formulas.push(html);
    return `@@KATEX_FORMULA_${index}@@`;
  }

  // 先提取块级公式 $$...$$
  let protectedText = source.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_, latex) => stashFormula(latex.trim(), true)
  );

  // 再提取行内公式 $...$
  protectedText = protectedText.replace(
    /\$([^$\n]+?)\$/g,
    (_, latex) => stashFormula(latex.trim(), false)
  );

  const rawHtml = marked.parse(protectedText, { async: false });
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target"],
  });

  return cleanHtml.replace(/@@KATEX_FORMULA_(\d+)@@/g, (_, index) => {
    return formulas[Number(index)] ?? "";
  });
}
