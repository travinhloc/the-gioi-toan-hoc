import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMath, loadContent } from "./load";

describe("nội dung mẫu", () => {
  it("hợp lệ", () => {
    const { errors, chuong } = loadContent(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    expect(errors).toEqual([]);
    expect(chuong.length).toBeGreaterThan(0);
  });
});

describe("checkMath", () => {
  it("bắt công thức hỏng và dấu $ lẻ", () => {
    expect(checkMath("$\\frac{1}{2}$")).toEqual([]);
    expect(checkMath("$\\frac{1}{2$")).toHaveLength(1);
    expect(checkMath("giá $5")).toHaveLength(1);
  });
});

describe("lỗi sai", () => {
  it("câu gắn lỗi sai chưa khai báo, hoặc hai chương đặt hai tên quái cho cùng một lỗi, đều bị báo", () => {
    const dir = mkdtempSync(join(tmpdir(), "tgth-"));
    const chuong = (n: number, ten: string, loi: string) =>
      [
        "schemaVersion: 1",
        "lop: 7",
        `chuong: ${n}`,
        "ten: Thử",
        "loiSai:",
        "  cong-tu-mau:",
        `    ten: ${ten}`,
        "    moTa: Cộng tử với tử.",
        "cauHoi:",
        `  - { id: l7-c${n}-0001, loai: so, de: "1+1", dapAn: "2", loiSai: ${loi} }`,
      ].join("\n");
    writeFileSync(join(dir, "c1.yaml"), chuong(1, "Nhện Cộng Mẫu", "cong-tu-mau"));
    writeFileSync(join(dir, "c2.yaml"), chuong(2, "Tên Khác", "khong-co"));
    const { errors } = loadContent(dir);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("khác với");
    expect(errors[1]).toContain("chưa khai báo");
  });
});
