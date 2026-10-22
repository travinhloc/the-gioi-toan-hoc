import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Dựng chuỗi có công thức $...$ vào phần tử. Phần chữ đi qua textContent (không bao giờ
 * innerHTML), phần công thức qua KaTeX với trust: false để nội dung không chèn được mã.
 */
export function renderMathText(el: HTMLElement, text: string): void {
  el.replaceChildren();
  text.split("$").forEach((part, i) => {
    if (i % 2 === 0) {
      el.append(document.createTextNode(part));
    } else {
      const span = document.createElement("span");
      katex.render(part, span, { throwOnError: false, trust: false });
      el.append(span);
    }
  });
}
