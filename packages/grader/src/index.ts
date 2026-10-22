import { equals, format } from "./rational";
import { parseNumber } from "./parse";

export { parseNumber } from "./parse";
export { rational, equals, format, type Rational } from "./rational";

/** Hai loại câu hỏi đầu tiên. Thêm loại mới thì thêm nhánh ở `grade`. */
export type Question =
  | { loai: "so"; dapAn: string }
  | { loai: "trac-nghiem"; luaChon: readonly string[]; dapAn: string };

export type GradeResult =
  | { ok: true }
  | { ok: false; reason: "sai" | "khong-doc-duoc"; expected: string };

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function choiceLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

/** Chấm một câu trả lời. Hàm thuần: cùng đầu vào luôn cho cùng kết quả. */
export function grade(q: Question, answer: string): GradeResult {
  if (q.loai === "trac-nghiem") {
    const expected = q.dapAn.trim().toUpperCase();
    const got = answer.trim().toUpperCase();
    if (!LETTERS.includes(got as (typeof LETTERS)[number])) {
      return { ok: false, reason: "khong-doc-duoc", expected };
    }
    return got === expected ? { ok: true } : { ok: false, reason: "sai", expected };
  }

  const expected = parseNumber(q.dapAn);
  if (!expected) throw new Error(`Đáp án trong đề không phải số hợp lệ: "${q.dapAn}"`);
  const got = parseNumber(answer);
  if (!got) return { ok: false, reason: "khong-doc-duoc", expected: format(expected) };
  return equals(got, expected) ? { ok: true } : { ok: false, reason: "sai", expected: format(expected) };
}

/** Kiểm tra chính câu hỏi (dùng trong CI nội dung và công cụ giáo viên). */
export function validateQuestion(q: Question): string[] {
  const errors: string[] = [];
  if (q.loai === "so") {
    if (!parseNumber(q.dapAn)) errors.push(`dapAn "${q.dapAn}" không đọc được thành số`);
  } else {
    if (q.luaChon.length < 2) errors.push("cần ít nhất 2 lựa chọn");
    const idx = LETTERS.indexOf(q.dapAn.trim().toUpperCase() as (typeof LETTERS)[number]);
    if (idx < 0 || idx >= q.luaChon.length) errors.push(`dapAn "${q.dapAn}" không trỏ tới lựa chọn nào`);
    if (new Set(q.luaChon).size !== q.luaChon.length) errors.push("có lựa chọn trùng nhau");
  }
  return errors;
}
