import { describe, expect, it } from "vitest";
import { hashKey } from "./code";
import {
  acceptMission,
  answer,
  buildBoard,
  decodeResult,
  encodeResult,
  fight,
  findResultCodes,
  mine,
  newGame,
  resultOf,
  type BankQuestion,
  type GameState,
  type KetQua,
} from "./index";
import { setBlock } from "./world";

const bank: BankQuestion[] = [
  { id: "l7-c1-0001", loai: "so", de: "1/2 + 1/3", dapAn: "5/6", bai: "Cộng trừ", loiSai: "cong-tu-mau" },
  { id: "l7-c1-0002", loai: "so", de: "2/5 + 1/4", dapAn: "13/20", bai: "Cộng trừ", loiSai: "cong-tu-mau" },
];

const k: KetQua = {
  missionId: 0xabcdef,
  stt: 12,
  bai: [
    { key: hashKey("Cộng trừ"), dung: 7, sai: 2 },
    { key: hashKey("Lũy thừa"), dung: 31, sai: 0 },
  ],
  loi: [
    { key: hashKey("cong-tu-mau"), sai: 2, thuPhuc: true },
    { key: hashKey("quen-doi-dau"), sai: 15, thuPhuc: false },
  ],
};

describe("mã kết quả", () => {
  it("mã hóa rồi giải mã ra đúng kết quả", () => {
    const code = encodeResult(k);
    expect(code).toMatch(/^KQ(-[0-9A-Z]{1,5})+$/);
    expect(decodeResult(code)).toEqual({ ok: true, ketQua: k });
    const empty = { missionId: 0, stt: 63, bai: [], loi: [] };
    expect(decodeResult(encodeResult(empty))).toEqual({ ok: true, ketQua: empty });
  });

  it("bắt gõ nhầm một kí tự, đảo hai kí tự và mã bị cắt", () => {
    const text = encodeResult(k).replace(/-/g, "").slice(2);
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < text.length; i++) {
      for (const ch of alphabet) {
        if (ch !== text[i]) expect(decodeResult("KQ" + text.slice(0, i) + ch + text.slice(i + 1)).ok).toBe(false);
      }
      if (i + 1 < text.length && text[i] !== text[i + 1]) {
        expect(decodeResult("KQ" + text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2)).ok).toBe(false);
      }
    }
    expect(decodeResult("KQ" + text.slice(0, -5)).ok).toBe(false);
    expect(decodeResult(text).ok).toBe(false);
  });

  it("tìm mã trong đoạn chat Zalo dán vào", () => {
    const a = encodeResult(k);
    const b = encodeResult({ ...k, stt: 3 });
    const chat = `Nguyễn An 20:01\nKết quả nhiệm vụ của em (số 12): ${a}\nBình 20:05\n${b.toLowerCase()} ạ`;
    expect(findResultCodes(chat).map((c) => decodeResult(c).ok)).toEqual([true, true]);
  });

  it("game ghi đúng/sai theo bài và lỗi, thu phục quái thì đánh dấu", () => {
    const at = (g: GameState) => ({ ...g, world: setBlock(g.world, g.player.x + 1, g.player.y, "quang") });
    let g = acceptMission(newGame(1), { lop: 7, chuong: [1], soCau: 5, han: null, id: 42 }, "MA");
    g = mine(at(g), g.player.x + 1, g.player.y, bank);
    g = answer(g, "1", bank)!.state;
    g = mine(at(g), g.player.x + 1, g.player.y, bank);
    const q = bank.find((x) => x.id === g.pending!.questionId)!;
    g = answer(g, q.dapAn, bank)!.state;
    expect(g.mission?.bai).toEqual({ "Cộng trừ": { dung: 1, sai: 1 } });
    expect(g.mission?.loi).toEqual({ "cong-tu-mau": 1 });

    expect(resultOf(g, 5)).toEqual({
      missionId: 42,
      stt: 5,
      bai: [{ key: hashKey("Cộng trừ"), dung: 1, sai: 1 }],
      loi: [{ key: hashKey("cong-tu-mau"), sai: 1, thuPhuc: false }],
    });

    g = fight({ ...g, phase: "dem" }, "cong-tu-mau", bank);
    const nq = bank.find((x) => x.id === g.pending!.questionId)!;
    g = answer(g, nq.dapAn, bank)!.state;
    expect(resultOf(g, 5)?.loi[0]?.thuPhuc).toBe(true);
  });
});

describe("bảng lỗi sai", () => {
  it("gộp cả lớp, một em gửi nhiều lần thì lấy lần sau cùng", () => {
    const L1 = hashKey("cong-tu-mau");
    const L2 = hashKey("quen-doi-dau");
    const B = hashKey("Cộng trừ");
    const board = buildBoard([
      { missionId: 1, stt: 4, bai: [{ key: B, dung: 1, sai: 3 }], loi: [{ key: L1, sai: 3, thuPhuc: false }] },
      { missionId: 1, stt: 2, bai: [{ key: B, dung: 5, sai: 1 }], loi: [{ key: L1, sai: 1, thuPhuc: true }, { key: L2, sai: 1, thuPhuc: false }] },
      { missionId: 1, stt: 4, bai: [{ key: B, dung: 4, sai: 3 }], loi: [{ key: L1, sai: 3, thuPhuc: true }] },
    ]);
    expect(board.hocSinh.map((h) => h.stt)).toEqual([2, 4]);
    expect(board.loi).toEqual([
      { key: L1, mac: [2, 4], canHoTro: [], lanSai: 4 },
      { key: L2, mac: [2], canHoTro: [2], lanSai: 1 },
    ]);
    expect(board.bai).toEqual([{ key: B, dung: 9, sai: 4, soEm: 2 }]);
  });
});
