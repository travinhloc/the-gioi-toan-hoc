import katex from "katex";

/** Kiểm tra từng đoạn $...$ dựng được bằng KaTeX ở chế độ an toàn (không trust, không macro lạ). */
export function checkMath(text: string): string[] {
  const errors: string[] = [];
  const parts = text.split("$");
  if (parts.length % 2 === 0) return ["số dấu $ lẻ, công thức chưa đóng"];
  for (let i = 1; i < parts.length; i += 2) {
    try {
      katex.renderToString(parts[i]!, { throwOnError: true, trust: false, strict: "error" });
    } catch (e) {
      errors.push(`công thức "${parts[i]}": ${(e as Error).message}`);
    }
  }
  return errors;
}
