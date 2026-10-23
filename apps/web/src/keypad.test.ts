import { describe, expect, it } from "vitest";
import { answerTex } from "./keypad";

describe("answerTex", () => {
  it("dựng phân số, hỗn số và số thập phân", () => {
    expect(answerTex("3/4")).toBe("\\dfrac{3}{4}");
    expect(answerTex("-3/4")).toBe("-\\dfrac{3}{4}");
    expect(answerTex("3/-4")).toBe("-\\dfrac{3}{4}");
    expect(answerTex("-1 1/2")).toBe("-1\\tfrac{1}{2}");
    expect(answerTex("0,5")).toBe("0{,}5");
    expect(answerTex("-1.25")).toBe("-1{,}25");
    expect(answerTex("+7")).toBe("7");
  });

  it("chưa đọc được thì không xem trước", () => {
    expect(answerTex("")).toBeNull();
    expect(answerTex("3/")).toBeNull();
    expect(answerTex("3/0")).toBeNull();
    expect(answerTex("abc")).toBeNull();
  });
});
