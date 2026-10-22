import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
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
