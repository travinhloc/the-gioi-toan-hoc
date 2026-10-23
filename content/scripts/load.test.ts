import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashKey } from "@tgth/engine";
import { chapterYaml, importRows, questionsYaml, type Cell } from "@tgth/importer";
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

describe("YAML xuất từ trang nhập câu hỏi", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rows: Cell[][] = [
    ["Đề bài", "Đáp án", "Lựa chọn A", "Lựa chọn B", "Gợi ý", "Lỗi sai"],
    ['Tính $\\frac{1}{2} - \\frac{1}{3}$: "dễ" #1', "1/6", "", "", "Dòng 1\nDòng 2", "cong-tu-mau"],
    ["Chọn: - hay +?", "A", "$-$", "$+$", "", ""],
    ["Số nào?", "0,5", "", "", "", ""],
  ].map((r) => r.map((text) => ({ text })));

  it("dán vào cuối chương đã có thì nội dung vẫn hợp lệ", () => {
    const { chuong } = loadContent(root);
    const c1 = chuong.find((c) => c.data.lop === 7 && c.data.chuong === 1)!;
    const r = importRows(rows, { lop: 7, chuong: 1, existing: c1.data.cauHoi, loiSai: c1.data.loiSai });
    expect(r.issues).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "tgth-"));
    const original = readFileSync(join(root, c1.file), "utf8");
    writeFileSync(join(dir, "c1.yaml"), original.trimEnd() + "\n\n" + questionsYaml(r.cauHoi.map((x) => x.q)));
    const loaded = loadContent(dir);
    expect(loaded.errors).toEqual([]);
    const qs = loaded.chuong[0]!.data.cauHoi;
    expect(qs.slice(-3).map((q) => q.de)).toEqual(r.cauHoi.map((x) => x.q.de));
    expect(qs.at(-3)?.goiY).toBe("Dòng 1\nDòng 2");
  });

  it("chương mới xuất thành file hợp lệ", () => {
    const r = importRows(rows.map((row) => row.slice(0, 5)), { lop: 8, chuong: 3 });
    const dir = mkdtempSync(join(tmpdir(), "tgth-"));
    writeFileSync(join(dir, "c3.yaml"), chapterYaml({ lop: 8, chuong: 3, ten: "Thử: chương mới" }, r.cauHoi.map((x) => x.q)));
    const loaded = loadContent(dir);
    expect(loaded.errors).toEqual([]);
    expect(loaded.chuong[0]!.data.cauHoi.map((q) => q.id)).toEqual(["l8-c3-0001", "l8-c3-0002", "l8-c3-0003"]);
  });
});
