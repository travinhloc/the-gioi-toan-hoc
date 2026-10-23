/**
 * Phần chung của mã nhiệm vụ và mã kết quả: chữ Crockford base32 (bỏ I, L, O, U để khỏi đọc
 * nhầm), đóng gói bit, và mã kiểm tra 2 kí tự.
 *
 * Mã kiểm tra là tổng có trọng số theo vị trí, mod 1021 (số nguyên tố): gõ nhầm một kí tự hay
 * đảo hai kí tự cạnh nhau đều bị bắt, miễn mã dài dưới 1021 kí tự.
 */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function checksum(values: readonly number[]): number {
  return values.reduce((sum, v, i) => (sum + (i + 1) * (v + 1)) % 1021, 0);
}

/** Chữ hoa, bỏ dấu cách và gạch nối, đổi O thành 0 và I, L thành 1. */
export function normalize(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** Ghép các trường [giá trị, số bit] thành dãy kí tự 5 bit, thêm bit 0 ở cuối cho tròn. */
export function packFields(fields: readonly (readonly [number, number])[]): number[] {
  const bits = fields.flatMap(([value, width]) => Array.from({ length: width }, (_, i) => (value >>> (width - 1 - i)) & 1));
  while (bits.length % 5 !== 0) bits.push(0);
  return Array.from({ length: bits.length / 5 }, (_, i) => bits.slice(i * 5, i * 5 + 5).reduce((v, b) => v * 2 + b, 0));
}

/** Đọc lần lượt từng trường từ dãy kí tự 5 bit. */
export function bitReader(values: readonly number[]): { read: (width: number) => number; left: () => number } {
  const bits = values.flatMap((v) => [4, 3, 2, 1, 0].map((s) => (v >> s) & 1));
  let pos = 0;
  return {
    read(width) {
      const v = bits.slice(pos, pos + width).reduce((acc, b) => acc * 2 + b, 0);
      pos += width;
      return v;
    },
    left: () => bits.length - pos,
  };
}

/** Thêm 2 kí tự kiểm tra rồi đổi ra chữ. */
export function withChecksum(values: readonly number[]): string {
  const check = checksum(values);
  return [...values, check >> 5, check & 31].map((v) => ALPHABET[v]).join("");
}

/** Đổi chữ (đã chuẩn hóa) về giá trị; null nếu có kí tự lạ hoặc mã kiểm tra không khớp. */
export function verify(text: string): number[] | null {
  const values = [...text].map((ch) => ALPHABET.indexOf(ch));
  if (values.length < 3 || values.includes(-1)) return null;
  const data = values.slice(0, -2);
  return checksum(data) === values.at(-2)! * 32 + values.at(-1)! ? data : null;
}

/** Chia thành nhóm 5 kí tự cho dễ đọc. */
export function group(text: string): string {
  return text.match(/.{1,5}/g)!.join("-");
}

/**
 * Băm một tên (mã lỗi sai, tên bài) ra 15 bit = 3 kí tự. Không đảo ngược được, nên trang giáo
 * viên dò ngược bằng chính bản nội dung; kiểm định nội dung bảo đảm không có hai tên trùng mã.
 */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ (h >>> 15) ^ (h >>> 30)) & 0x7fff;
}
