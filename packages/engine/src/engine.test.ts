import { describe, expect, it } from "vitest";
import { answer, craftRecipe, generateWorld, isNight, mine, move, newGame, DAY_LENGTH, type BankQuestion } from "./index";
import { setBlock } from "./world";

const bank: BankQuestion[] = [{ id: "t-1", loai: "so", de: "1 + 1", dapAn: "2" }];

describe("world", () => {
  it("cùng seed cho cùng thế giới", () => {
    expect(generateWorld(42)).toEqual(generateWorld(42));
    expect(generateWorld(42)).not.toEqual(generateWorld(43));
  });
});

describe("game", () => {
  it("đào đất bỏ vào túi", () => {
    const g = newGame(1);
    const below = { x: g.player.x, y: g.player.y + 1 };
    const next = mine(g, below.x, below.y, bank);
    expect(next.inventory.dat).toBe(1);
  });

  it("đào quặng phải trả lời câu hỏi; sai thì vào sổ lỗi, đúng thì được quặng", () => {
    let g = newGame(1);
    g = { ...g, world: setBlock(g.world, g.player.x + 1, g.player.y, "quang") };
    g = mine(g, g.player.x + 1, g.player.y, bank);
    expect(g.pending?.questionId).toBe("t-1");

    const wrong = answer(g, "3", bank)!;
    expect(wrong.result.ok).toBe(false);
    expect(wrong.state.mistakes).toEqual(["t-1"]);

    g = mine(wrong.state, g.player.x + 1, g.player.y, bank);
    const right = answer(g, "2", bank)!;
    expect(right.result.ok).toBe(true);
    expect(right.state.inventory.quang).toBe(1);
    expect(right.state.mistakes).toEqual([]);
  });

  it("câu trả lời không đọc được thì giữ nguyên câu hỏi", () => {
    let g = newGame(1);
    g = { ...g, world: setBlock(g.world, g.player.x + 1, g.player.y, "quang") };
    g = mine(g, g.player.x + 1, g.player.y, bank);
    const r = answer(g, "hai", bank)!;
    expect(r.state.pending).not.toBeNull();
    expect(r.state.mistakes).toEqual([]);
  });

  it("chế tạo trừ nguyên liệu", () => {
    const g = { ...newGame(1), inventory: { go: 3 } };
    const next = craftRecipe(g, "cuoc-go");
    expect(next.inventory).toEqual({ go: 0, "cuoc-go": 1 });
    expect(craftRecipe(next, "cuoc-go")).toBe(next);
  });

  it("có ngày và đêm", () => {
    const g = newGame(1);
    expect(isNight(g)).toBe(false);
    expect(isNight({ ...g, tick: DAY_LENGTH - 1 })).toBe(true);
  });

  it("không đi xuyên khối", () => {
    const g = newGame(1);
    expect(move(g, 0, 1).player).toEqual(g.player);
  });
});
