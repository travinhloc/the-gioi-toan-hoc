import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "./game";
import { walkTo } from "./path";
import type { Block, World } from "./world";

/** Thế giới nhỏ vẽ bằng chữ: "." trống, "#" đá, "o" quặng. */
function world(...rows: string[]): World {
  const map: Record<string, Block> = { ".": "khong", "#": "da", o: "quang" };
  return { width: rows[0]!.length, height: rows.length, blocks: rows.flatMap((r) => [...r].map((c) => map[c]!)) };
}

function at(w: World, x: number, y: number): GameState {
  return { ...newGame(1), world: w, player: { x, y } };
}

describe("walkTo", () => {
  const w = world(
    "....#", //
    "##.##",
    "##.o#",
    "#####",
  );

  it("đi tới ô trống nối được", () => {
    expect(walkTo(at(w, 0, 0), 2, 2).player).toEqual({ x: 2, y: 2 });
  });

  it("chạm khối thì đứng cạnh khối đó, chọn ô gần nhất", () => {
    expect(walkTo(at(w, 0, 0), 3, 2).player).toEqual({ x: 2, y: 2 });
    expect(walkTo(at(w, 0, 0), 4, 0).player).toEqual({ x: 3, y: 0 });
  });

  it("không tới được thì đứng yên", () => {
    const g = at(w, 0, 0);
    expect(walkTo(g, 0, 3)).toBe(g);
    expect(walkTo(g, 99, 0)).toBe(g);
  });

  it("không đi khi đang có câu hỏi hoặc ban đêm", () => {
    const g = at(w, 0, 0);
    expect(walkTo({ ...g, phase: "dem" }, 2, 2)).toEqual({ ...g, phase: "dem" });
    const pending = { ...g, pending: { kind: "khoi" as const, x: 3, y: 2, questionId: "x" } };
    expect(walkTo(pending, 2, 2)).toBe(pending);
  });
});
