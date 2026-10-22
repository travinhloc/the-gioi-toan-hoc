import { grade, type GradeResult, type Question } from "@tgth/grader";
import { addItem, craft, RECIPES, type Inventory } from "./crafting";
import { blockAt, generateWorld, setBlock, type World } from "./world";
import { createRandom } from "./random";

/** Câu hỏi như engine cần: mã cố định cộng phần máy chấm hiểu. */
export type BankQuestion = Question & { id: string; de: string };

export interface Pending {
  readonly x: number;
  readonly y: number;
  readonly questionId: string;
}

export interface GameState {
  readonly world: World;
  readonly player: { x: number; y: number };
  readonly inventory: Inventory;
  readonly tick: number;
  readonly pending: Pending | null;
  /** Mã các câu đã trả lời sai: ban đêm chúng hiện thành "quái lỗi sai" để ôn lại. */
  readonly mistakes: readonly string[];
  readonly seed: number;
}

export const DAY_LENGTH = 240;

export function newGame(seed: number): GameState {
  const world = generateWorld(seed);
  const surface = Math.floor(world.height / 4) - 1;
  return { world, player: { x: 1, y: surface }, inventory: {}, tick: 0, pending: null, mistakes: [], seed };
}

export function isNight(state: GameState): boolean {
  return state.tick % DAY_LENGTH >= DAY_LENGTH * 0.75;
}

function passable(world: World, x: number, y: number): boolean {
  const b = blockAt(world, x, y);
  return b === "khong";
}

export function move(state: GameState, dx: number, dy: number): GameState {
  if (state.pending) return state;
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  if (!passable(state.world, x, y)) return { ...state, tick: state.tick + 1 };
  return { ...state, player: { x, y }, tick: state.tick + 1 };
}

function pickQuestion(state: GameState, bank: readonly BankQuestion[], x: number, y: number): BankQuestion {
  // Ưu tiên ôn lại câu đã sai; còn lại chọn theo vị trí để tái tạo được.
  const retry = state.mistakes.find((id) => bank.some((q) => q.id === id));
  if (retry) return bank.find((q) => q.id === retry)!;
  const rand = createRandom(state.seed ^ (x * 73856093) ^ (y * 19349663));
  return bank[Math.floor(rand() * bank.length)]!;
}

/** Đào khối kề bên. Đất, đá, gỗ vào túi ngay; quặng thì phải giải một câu hỏi. */
export function mine(state: GameState, x: number, y: number, bank: readonly BankQuestion[]): GameState {
  if (state.pending) return state;
  if (Math.abs(x - state.player.x) + Math.abs(y - state.player.y) !== 1) return state;
  const block = blockAt(state.world, x, y);
  if (!block || block === "khong") return state;
  if (block === "quang") {
    if (bank.length === 0) return state;
    const q = pickQuestion(state, bank, x, y);
    return { ...state, pending: { x, y, questionId: q.id } };
  }
  return {
    ...state,
    world: setBlock(state.world, x, y, "khong"),
    inventory: addItem(state.inventory, block),
    tick: state.tick + 1,
  };
}

export function currentQuestion<Q extends BankQuestion>(state: GameState, bank: readonly Q[]): Q | undefined {
  return state.pending ? bank.find((q) => q.id === state.pending!.questionId) : undefined;
}

/** Trả lời câu hỏi đang chờ. Đúng thì được quặng; sai thì ghi vào sổ lỗi sai. */
export function answer(
  state: GameState,
  input: string,
  bank: readonly BankQuestion[],
): { state: GameState; result: GradeResult } | null {
  const q = currentQuestion(state, bank);
  if (!q || !state.pending) return null;
  const result = grade(q, input);
  if (result.ok) {
    const { x, y } = state.pending;
    return {
      result,
      state: {
        ...state,
        pending: null,
        world: setBlock(state.world, x, y, "khong"),
        inventory: addItem(state.inventory, "quang"),
        mistakes: state.mistakes.filter((id) => id !== q.id),
        tick: state.tick + 1,
      },
    };
  }
  if (result.reason === "khong-doc-duoc") return { state, result };
  const mistakes = state.mistakes.includes(q.id) ? state.mistakes : [...state.mistakes, q.id];
  return { result, state: { ...state, pending: null, mistakes, tick: state.tick + 1 } };
}

export function craftRecipe(state: GameState, recipeId: string): GameState {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const inventory = recipe && craft(state.inventory, recipe);
  return inventory ? { ...state, inventory } : state;
}
