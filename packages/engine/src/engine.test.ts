import { describe, expect, it } from "vitest";
import {
  acceptMission,
  answer,
  craftRecipe,
  fight,
  generateWorld,
  isNight,
  mine,
  monsters,
  move,
  newGame,
  sleep,
  startDay,
  SUN_MAX,
  type BankQuestion,
  type GameState,
} from "./index";
import { capture, escape, recordMistake, REVIEW_DAYS } from "./notebook";
import { setBlock } from "./world";

const bank: BankQuestion[] = [
  { id: "l7-c1-0001", loai: "so", de: "1/2 + 1/3", dapAn: "5/6", loiSai: "cong-tu-mau" },
  { id: "l7-c1-0002", loai: "so", de: "2/5 + 1/4", dapAn: "13/20", loiSai: "cong-tu-mau" },
  { id: "l7-c2-0001", loai: "so", de: "căn 81", dapAn: "9" },
];

/** Đặt một khối quặng ngay bên phải người chơi rồi đào nó. */
function digOre(g: GameState, b: readonly BankQuestion[] = bank): GameState {
  const withOre = { ...g, world: setBlock(g.world, g.player.x + 1, g.player.y, "quang") };
  return mine(withOre, g.player.x + 1, g.player.y, b);
}

function wrongAnswer(g: GameState): string {
  return g.pending?.questionId === "l7-c2-0001" ? "8" : "1";
}

function rightAnswer(g: GameState): string {
  return bank.find((q) => q.id === g.pending?.questionId)!.dapAn;
}

describe("world", () => {
  it("cùng seed cho cùng thế giới", () => {
    expect(generateWorld(42)).toEqual(generateWorld(42));
    expect(generateWorld(42)).not.toEqual(generateWorld(43));
  });
});

describe("ban ngày", () => {
  it("đào đất bỏ vào túi, không tốn mặt trời", () => {
    const g = newGame(1);
    const next = mine(g, g.player.x, g.player.y + 1, bank);
    expect(next.inventory.dat).toBe(1);
    expect(next.sun).toBe(SUN_MAX);
  });

  it("câu đúng tốn 1 nấc mặt trời và cho quặng", () => {
    let g = digOre(newGame(1));
    g = answer(g, rightAnswer(g), bank)!.state;
    expect(g.inventory.quang).toBe(1);
    expect(g.sun).toBe(SUN_MAX - 1);
    expect(g.today.dung).toBe(1);
  });

  it("câu sai tốn 2 nấc và ghi lỗi vào Sổ Tay, hẹn ngay đêm nay", () => {
    let g = digOre(newGame(1));
    const qid = g.pending!.questionId;
    g = answer(g, wrongAnswer(g), bank)!.state;
    expect(g.sun).toBe(SUN_MAX - 2);
    expect(g.notebook).toHaveLength(1);
    expect(g.notebook[0]).toMatchObject({ questionId: qid, box: 0, due: 1 });
  });

  it("đồng hồ cát đỡ nấc phạt của lần sai kế tiếp", () => {
    let g = digOre({ ...newGame(1), inventory: { "dong-ho-cat": 1 } });
    g = answer(g, wrongAnswer(g), bank)!.state;
    expect(g.sun).toBe(SUN_MAX - 1);
    expect(g.inventory["dong-ho-cat"]).toBe(0);
  });

  it("câu trả lời không đọc được thì giữ nguyên câu hỏi, không tốn gì", () => {
    const g = digOre(newGame(1));
    const r = answer(g, "hai", bank)!;
    expect(r.state).toBe(g);
  });

  it("không đi xuyên khối", () => {
    const g = newGame(1);
    expect(move(g, 0, 1).player).toEqual(g.player);
  });

  it("chế tạo trừ nguyên liệu", () => {
    const g = { ...newGame(1), inventory: { go: 3 } };
    const next = craftRecipe(g, "cuoc-go");
    expect(next.inventory).toEqual({ go: 0, "cuoc-go": 1 });
    expect(craftRecipe(next, "cuoc-go")).toBe(next);
  });
});

describe("đêm và Sổ Tay", () => {
  it("hết mặt trời mà không sai câu nào thì sang luôn buổi sáng", () => {
    let g: GameState = { ...newGame(1), sun: 1 };
    g = digOre(g);
    g = answer(g, rightAnswer(g), bank)!.state;
    expect(g.phase).toBe("sang");
    expect(startDay(g)).toMatchObject({ day: 2, sun: SUN_MAX, phase: "ngay" });
  });

  it("sai thì đêm đến sớm; ban đêm không đào được", () => {
    let g: GameState = { ...newGame(1), sun: 2 };
    g = digOre(g);
    g = answer(g, wrongAnswer(g), bank)!.state;
    expect(isNight(g)).toBe(true);
    expect(monsters(g)).toHaveLength(1);
    expect(mine(g, g.player.x, g.player.y + 1, bank)).toBe(g);
  });

  it("quái hỏi một câu khác cùng lỗi; thu phục thì được Đá Sáng và trời sáng", () => {
    let g: GameState = { ...newGame(1), sun: 2 };
    g = { ...g, world: setBlock(g.world, g.player.x + 1, g.player.y, "quang") };
    g = { ...g, pending: { kind: "khoi", x: g.player.x + 1, y: g.player.y, questionId: "l7-c1-0001" } };
    g = answer(g, "2/5", bank)!.state;
    expect(g.notebook[0]!.loi).toBe("cong-tu-mau");

    g = fight(g, "cong-tu-mau", bank);
    expect(g.pending).toEqual({ kind: "quai", loi: "cong-tu-mau", questionId: "l7-c1-0002" });
    g = answer(g, "13/20", bank)!.state;
    expect(g.inventory["da-sang"]).toBe(1);
    expect(g.phase).toBe("sang");
    expect(g.notebook[0]).toMatchObject({ box: 1, due: 1 + REVIEW_DAYS[0] });
    expect(g.today).toMatchObject({ sai: 1, thuPhuc: 1 });
  });

  it("quái chạy thoát thì quay lại đêm sau; đi ngủ cũng vậy", () => {
    let g: GameState = { ...newGame(1), sun: 2 };
    g = digOre(g);
    g = answer(g, wrongAnswer(g), bank)!.state;
    const loi = g.notebook[0]!.loi;

    const fled = answer(fight(g, loi, bank), "0", bank)!.state;
    expect(fled.phase).toBe("sang");
    expect(fled.notebook[0]).toMatchObject({ box: 0, due: 2 });

    const slept = sleep(g);
    expect(slept.phase).toBe("sang");
    expect(slept.notebook[0]).toMatchObject({ due: 2 });
    expect(slept.today.chayThoat).toBe(1);
  });

  it("lịch ôn 1, 3, 7, 14 ngày rồi xóa trang", () => {
    let nb = recordMistake([], "cong-tu-mau", "l7-c1-0001", 5);
    const dues: number[] = [];
    for (let day = 5; nb.length > 0; ) {
      nb = capture(nb, "cong-tu-mau", day);
      if (nb[0]) {
        dues.push(nb[0].due - day);
        day = nb[0].due;
      }
    }
    expect(dues).toEqual([1, 3, 7, 14]);
    expect(escape(recordMistake([], "a", "q", 1), "a", 1)[0]).toMatchObject({ box: 0, due: 2 });
  });
});

describe("nhiệm vụ", () => {
  const mission = { lop: 7, chuong: [2], soCau: 1, han: null, id: 7 };

  it("chỉ hỏi trong chương được giao và đếm câu đúng", () => {
    let g = acceptMission(newGame(1), mission, "MA-1");
    for (let i = 0; i < 5; i++) {
      const dug = digOre({ ...g, seed: i });
      expect(dug.pending?.questionId).toBe("l7-c2-0001");
    }
    g = digOre(g);
    g = answer(g, "9", bank)!.state;
    expect(g.mission?.dung).toBe(1);
    expect(acceptMission(g, mission, "MA-1").mission?.dung).toBe(1);
    expect(acceptMission(g, mission, "MA-2").mission?.dung).toBe(0);
  });
});
