import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr";

describe("qrMatrix", () => {
  it("sinh ma trận vuông có ba ô định vị ở góc", () => {
    const m = qrMatrix("https://travinhloc.github.io/the-gioi-toan-hoc/#nv=ABCDE-FGHJK-LMNPQ");
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === n)).toBe(true);
    // Ô định vị 7×7: viền ngoài đen, vòng trong trắng, lõi 3×3 đen.
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      expect(m[r]![c]).toBe(true);
      expect(m[r + 1]![c + 1]).toBe(false);
      expect(m[r + 3]![c + 3]).toBe(true);
    }
  });
});
