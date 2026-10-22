import { describe, expect, it } from "vitest";
import { format, grade, parseNumber, validateQuestion } from "./index";

describe("parseNumber", () => {
  it.each([
    ["5", "5"],
    ["-12", "-12"],
    ["+3", "3"],
    ["0,5", "1/2"],
    ["0.5", "1/2"],
    ["-1,25", "-5/4"],
    ["3/4", "3/4"],
    ["6/8", "3/4"],
    ["3/-4", "-3/4"],
    ["−2/3", "-2/3"],
    ["1 1/2", "3/2"],
    ["-1 1/2", "-3/2"],
    ["  7  ", "7"],
  ])("đọc %s thành %s", (input, expected) => {
    const r = parseNumber(input);
    expect(r && format(r)).toBe(expected);
  });

  it.each(["", "abc", "1/0", "1,2,3", "1/2/3", "2x"])("từ chối %s", (input) => {
    expect(parseNumber(input)).toBeNull();
  });
});

describe("grade", () => {
  it("chấp nhận các cách viết tương đương", () => {
    const q = { loai: "so", dapAn: "1/2" } as const;
    for (const a of ["1/2", "2/4", "0,5", "0.5"]) expect(grade(q, a)).toEqual({ ok: true });
  });

  it("báo sai kèm đáp án", () => {
    expect(grade({ loai: "so", dapAn: "5/6" }, "2/5")).toEqual({ ok: false, reason: "sai", expected: "5/6" });
  });

  it("phân biệt không đọc được với sai", () => {
    expect(grade({ loai: "so", dapAn: "1" }, "một")).toMatchObject({ reason: "khong-doc-duoc" });
  });

  it("chấm trắc nghiệm không phân biệt hoa thường", () => {
    const q = { loai: "trac-nghiem", luaChon: ["1", "2", "3"], dapAn: "B" } as const;
    expect(grade(q, "b")).toEqual({ ok: true });
    expect(grade(q, "C")).toMatchObject({ ok: false, reason: "sai" });
  });
});

describe("validateQuestion", () => {
  it("bắt đáp án trắc nghiệm trỏ ra ngoài", () => {
    expect(validateQuestion({ loai: "trac-nghiem", luaChon: ["a", "b"], dapAn: "C" })).toHaveLength(1);
  });
  it("bắt đáp án số không hợp lệ", () => {
    expect(validateQuestion({ loai: "so", dapAn: "1/0" })).toHaveLength(1);
  });
});
