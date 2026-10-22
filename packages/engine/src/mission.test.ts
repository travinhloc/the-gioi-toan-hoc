import { describe, expect, it } from "vitest";
import { decodeMission, encodeMission, inMission, missionFromHash, type Mission } from "./mission";

const m: Mission = { lop: 7, chuong: [1, 2, 4], soCau: 20, han: "2026-11-05", id: 0xabcdef };

describe("mã nhiệm vụ", () => {
  it("mã hóa rồi giải mã ra đúng nhiệm vụ", () => {
    const code = encodeMission(m);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(decodeMission(code)).toEqual({ ok: true, mission: m });
  });

  it("không hạn, lớp và chương ở biên", () => {
    for (const x of [
      { lop: 6, chuong: [1], soCau: 1, han: null, id: 0 },
      { lop: 9, chuong: [16], soCau: 63, han: "2070-01-01", id: 0xffffff },
    ]) {
      expect(decodeMission(encodeMission(x))).toEqual({ ok: true, mission: x });
    }
  });

  it("gõ chữ thường, bỏ gạch nối, nhầm O với 0 vẫn đọc được", () => {
    const code = encodeMission(m);
    const sloppy = code.replace(/-/g, " ").toLowerCase().replace(/0/g, "o");
    expect(decodeMission(sloppy)).toEqual({ ok: true, mission: m });
  });

  it("bắt mọi lỗi gõ nhầm một kí tự và đảo hai kí tự cạnh nhau", () => {
    const text = encodeMission(m).replace(/-/g, "");
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < text.length; i++) {
      for (const ch of alphabet) {
        if (ch === text[i]) continue;
        expect(decodeMission(text.slice(0, i) + ch + text.slice(i + 1)).ok).toBe(false);
      }
      if (i + 1 < text.length && text[i] !== text[i + 1]) {
        expect(decodeMission(text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2)).ok).toBe(false);
      }
    }
  });

  it("từ chối nhiệm vụ không hợp lệ", () => {
    expect(() => encodeMission({ ...m, chuong: [] })).toThrow();
    expect(() => encodeMission({ ...m, soCau: 64 })).toThrow();
    expect(() => encodeMission({ ...m, han: "05/11/2026" })).toThrow();
    expect(decodeMission("ABC").ok).toBe(false);
  });

  it("đọc mã từ link và lọc câu theo chương", () => {
    expect(missionFromHash("#nv=ABCDE-FGHJK-MNPQR")).toBe("ABCDE-FGHJK-MNPQR");
    expect(missionFromHash("#x=1&nv=ABCDE")).toBe("ABCDE");
    expect(missionFromHash("")).toBeNull();
    expect(inMission(m, "l7-c4-0003")).toBe(true);
    expect(inMission(m, "l7-c3-0003")).toBe(false);
    expect(inMission(m, "l8-c1-0003")).toBe(false);
  });
});
