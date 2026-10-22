import { rational, type Rational } from "./rational";

/**
 * Đọc một số do học sinh gõ. Chấp nhận:
 *  - số nguyên: "-12", "+3"
 *  - số thập phân, dấu phẩy kiểu Việt Nam hoặc dấu chấm: "0,5", "-1.25"
 *  - phân số: "3/4", "-3/4", "3/-4"
 *  - hỗn số: "1 1/2" (nghĩa là 1 + 1/2; "-1 1/2" là -(1 + 1/2))
 * Bỏ qua khoảng trắng thừa và hiểu dấu trừ unicode (−). Không hỗ trợ dấu cách nghìn
 * ("1 000") để khỏi nhầm với hỗn số. Trả về null nếu không đọc được.
 */
export function parseNumber(input: string): Rational | null {
  const s = input.trim().replace(/−/g, "-").replace(/\s+/g, " ");
  if (s === "") return null;

  const mixed = /^([+-]?)(\d+) (\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const [, sign, whole, n, d] = mixed as unknown as [string, string, string, string, string];
    if (BigInt(d) === 0n) return null;
    const value = rational(BigInt(whole) * BigInt(d) + BigInt(n), BigInt(d));
    return sign === "-" ? rational(-value.num, value.den) : value;
  }

  const frac = /^([+-]?\d+)\s?\/\s?([+-]?\d+)$/.exec(s);
  if (frac) {
    const den = BigInt(frac[2]!);
    if (den === 0n) return null;
    return rational(BigInt(frac[1]!), den);
  }

  const dec = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(s);
  if (dec) {
    const [, sign, intPart, fracPart = ""] = dec as unknown as [string, string, string, string?];
    const den = 10n ** BigInt(fracPart.length);
    const num = BigInt(intPart + fracPart) * (sign === "-" ? -1n : 1n);
    return rational(num, den);
  }

  return null;
}
