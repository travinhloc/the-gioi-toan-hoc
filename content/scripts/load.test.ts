import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashKey } from "@tgth/engine";
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

describe("mã băm cho mã kết quả", () => {
  it("hai tên bài cùng lớp trùng mã băm thì bị báo", () => {
    const seen = new Map<number, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; !pair; i++) {
      const name = `Bài ${i}`;
      const other = seen.get(hashKey(name));
      if (other) pair = [other, name];
      seen.set(hashKey(name), name);
    }
    const dir = mkdtempSync(join(tmpdir(), "tgth-"));
    writeFileSync(
      join(dir, "c1.yaml"),
      [
        "schemaVersion: 1",
        "lop: 7",
        "chuong: 1",
        "ten: Thử",
        "cauHoi:",
        `  - { id: l7-c1-0001, bai: "${pair[0]}", loai: so, de: "1+1", dapAn: "2" }`,
        `  - { id: l7-c1-0002, bai: "${pair[1]}", loai: so, de: "1+2", dapAn: "3" }`,
      ].join("\n"),
    );
    expect(loadContent(dir).errors.join("\n")).toMatch(/trùng mã băm/);
  });
});
