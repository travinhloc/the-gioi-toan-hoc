import { parseNumber } from "@tgth/grader";

/**
 * Bàn phím toán trong tấm câu hỏi. Nhãn phím là thứ hiện trên nút, giá trị là chữ chèn vào
 * ô đáp án. Máy chấm hiện chỉ đọc số (nguyên, thập phân, phân số, hỗn số), nên lớp 7 chưa có
 * phím ^; lớp 9 thêm √ khi máy chấm hiểu căn.
 */
export const KEYS: readonly (readonly [label: string, value: string])[] = [
  ["7", "7"], ["8", "8"], ["9", "9"], ["/", "/"], ["⌫", "back"],
  ["4", "4"], ["5", "5"], ["6", "6"], [",", ","], ["−", "-"],
  ["1", "1"], ["2", "2"], ["3", "3"], ["0", "0"], ["␣", " "],
];

/**
 * Công thức xem trước cho điều em đang gõ, để thấy ngay 3/4 là phân số ba phần tư.
 * Trả về null nếu máy chấm chưa đọc được (đang gõ dở hoặc gõ nhầm).
 */
export function answerTex(input: string): string | null {
  const s = input.trim().replace(/−/g, "-").replace(/\s+/g, " ");
  if (!parseNumber(s)) return null;
  const mixed = /^([+-]?)(\d+) (\d+)\/(\d+)$/.exec(s);
  if (mixed) return `${mixed[1] === "-" ? "-" : ""}${mixed[2]}\\tfrac{${mixed[3]}}{${mixed[4]}}`;
  const frac = /^([+-]?)(\d+)\s?\/\s?([+-]?)(\d+)$/.exec(s);
  if (frac) {
    const negative = (frac[1] === "-") !== (frac[3] === "-");
    return `${negative ? "-" : ""}\\dfrac{${frac[2]}}{${frac[4]}}`;
  }
  // Số thập phân viết dấu phẩy kiểu Việt Nam; {,} để KaTeX không chèn khoảng sau dấu phẩy.
  return s.replace(/^\+/, "").replace(/[.,]/, "{,}");
}
