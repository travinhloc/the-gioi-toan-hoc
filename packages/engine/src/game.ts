import { grade, type GradeResult, type Question } from "@tgth/grader";
import { addItem, craft, RECIPES, type Inventory } from "./crafting";
import { inMission, type Mission } from "./mission";
import { capture, dueEntries, escape, recordMistake, type Notebook } from "./notebook";
import { blockAt, generateWorld, setBlock, type World } from "./world";
import { createRandom } from "./random";

/** Câu hỏi như engine cần: mã cố định cộng phần máy chấm hiểu, và mã lỗi sai nếu có. */
export type BankQuestion = Question & { id: string; de: string; bai?: string; loiSai?: string };

/** Câu đang chờ trả lời: ban ngày là khối quặng, ban đêm là một con quái lỗi sai. */
export type Pending =
  | { readonly kind: "khoi"; readonly x: number; readonly y: number; readonly questionId: string }
  | { readonly kind: "quai"; readonly loi: string; readonly questionId: string };

/**
 * Một ngày: "ngay" đào đến khi hết mặt trời, "dem" đánh các quái đến hạn trong Sổ Tay,
 * "sang" xem nhật ký rồi bắt đầu ngày mới.
 */
export type Phase = "ngay" | "dem" | "sang";

export interface DayLog {
  readonly dung: number;
  readonly sai: number;
  readonly thuPhuc: number;
  readonly chayThoat: number;
}

export interface ActiveMission extends Mission {
  readonly code: string;
  /** Số câu đúng ban ngày đã làm trong các chương được giao. */
  readonly dung: number;
  /** Đúng/sai theo bài (tên bài trong nội dung), để gửi lại trong mã kết quả. */
  readonly bai: Readonly<Record<string, { readonly dung: number; readonly sai: number }>>;
  /** Số lần sai theo mã lỗi (mã quái). */
  readonly loi: Readonly<Record<string, number>>;
}

export interface GameState {
  readonly world: World;
  readonly player: { x: number; y: number };
  readonly inventory: Inventory;
  readonly day: number;
  /** Số nấc mặt trời còn lại trong ngày. */
  readonly sun: number;
  readonly phase: Phase;
  readonly pending: Pending | null;
  readonly notebook: Notebook;
  readonly today: DayLog;
  readonly mission: ActiveMission | null;
  readonly seed: number;
}

/** Mỗi câu tốn 1 nấc, câu sai tốn thêm 1 nấc: một ngày khoảng 8–10 phút. */
export const SUN_MAX = 12;
const EMPTY_LOG: DayLog = { dung: 0, sai: 0, thuPhuc: 0, chayThoat: 0 };

export function newGame(seed: number): GameState {
  const world = generateWorld(seed);
  const surface = Math.floor(world.height / 4) - 1;
  return {
    world,
    player: { x: 1, y: surface },
    inventory: {},
    day: 1,
    sun: SUN_MAX,
    phase: "ngay",
    pending: null,
    notebook: [],
    today: EMPTY_LOG,
    mission: null,
    seed,
  };
}

export function isNight(state: GameState): boolean {
  return state.phase === "dem";
}

/** Mã quái của một câu: lỗi sai điển hình nếu câu có gắn, không thì chính mã câu. */
export function monsterOf(q: BankQuestion): string {
  return q.loiSai ?? q.id;
}

/** Các quái đêm nay còn phải đánh. */
export function monsters(state: GameState) {
  return state.phase === "dem" ? dueEntries(state.notebook, state.day) : [];
}

function passable(world: World, x: number, y: number): boolean {
  const b = blockAt(world, x, y);
  return b === "khong";
}

export function move(state: GameState, dx: number, dy: number): GameState {
  if (state.pending || state.phase !== "ngay") return state;
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  if (!passable(state.world, x, y)) return state;
  return { ...state, player: { x, y } };
}

function pickQuestion(state: GameState, bank: readonly BankQuestion[], x: number, y: number): BankQuestion {
  // Có nhiệm vụ đang làm thì chỉ hỏi trong các chương được giao.
  const m = state.mission;
  const assigned = m && m.dung < m.soCau ? bank.filter((q) => inMission(m, q.id)) : [];
  const pool = assigned.length > 0 ? assigned : bank;
  const rand = createRandom(state.seed ^ (x * 73856093) ^ (y * 19349663) ^ (state.day * 83492791));
  return pool[Math.floor(rand() * pool.length)]!;
}

/** Đào khối kề bên. Đất, đá, gỗ vào túi ngay; quặng thì phải giải một câu hỏi. */
export function mine(state: GameState, x: number, y: number, bank: readonly BankQuestion[]): GameState {
  if (state.pending || state.phase !== "ngay") return state;
  if (Math.abs(x - state.player.x) + Math.abs(y - state.player.y) !== 1) return state;
  const block = blockAt(state.world, x, y);
  if (!block || block === "khong") return state;
  if (block === "quang") {
    if (bank.length === 0) return state;
    const q = pickQuestion(state, bank, x, y);
    return { ...state, pending: { kind: "khoi", x, y, questionId: q.id } };
  }
  return { ...state, world: setBlock(state.world, x, y, "khong"), inventory: addItem(state.inventory, block) };
}

/**
 * Câu cho quái đêm nay: ưu tiên một câu khác cùng lỗi sai (số mới), không có thì hỏi lại
 * chính câu đã sai. Trả về undefined nếu câu đã bị gỡ khỏi ngân hàng.
 */
function nightQuestion(state: GameState, loi: string, lastId: string, bank: readonly BankQuestion[]) {
  const same = bank.filter((q) => q.loiSai === loi);
  const fresh = same.filter((q) => q.id !== lastId);
  const pool = fresh.length > 0 ? fresh : same.length > 0 ? same : bank.filter((q) => q.id === lastId);
  if (pool.length === 0) return undefined;
  const rand = createRandom(state.seed ^ (state.day * 2654435761));
  return pool[Math.floor(rand() * pool.length)];
}

/** Bắt đầu đấu một con quái đến hạn. */
export function fight(state: GameState, loi: string, bank: readonly BankQuestion[]): GameState {
  if (state.pending || state.phase !== "dem") return state;
  const entry = dueEntries(state.notebook, state.day).find((e) => e.loi === loi);
  if (!entry) return state;
  const q = nightQuestion(state, loi, entry.questionId, bank);
  if (!q) {
    // Câu đã bị gỡ khỏi nội dung: bỏ trang này khỏi Sổ Tay thay vì kẹt cả đêm.
    return endNightIfClear({ ...state, notebook: state.notebook.filter((e) => e.loi !== loi) });
  }
  return { ...state, pending: { kind: "quai", loi, questionId: q.id } };
}

function endNightIfClear(state: GameState): GameState {
  return state.phase === "dem" && dueEntries(state.notebook, state.day).length === 0 ? { ...state, phase: "sang" } : state;
}

/** Hết mặt trời thì vào đêm; đêm không có quái nào đến hạn thì sang luôn buổi sáng. */
function spendSun(state: GameState, cost: number): GameState {
  const sun = Math.max(0, state.sun - cost);
  if (sun > 0) return { ...state, sun };
  return endNightIfClear({ ...state, sun, phase: "dem" });
}

export function currentQuestion<Q extends BankQuestion>(state: GameState, bank: readonly Q[]): Q | undefined {
  return state.pending ? bank.find((q) => q.id === state.pending!.questionId) : undefined;
}

/** Ghi một câu trả lời ban ngày vào nhiệm vụ, nếu câu thuộc các chương được giao. */
function tallyMission(m: ActiveMission | null, q: BankQuestion, ok: boolean): ActiveMission | null {
  if (!m || !inMission(m, q.id)) return m;
  const ten = q.bai ?? "";
  const bai = m.bai[ten] ?? { dung: 0, sai: 0 };
  if (ok) return { ...m, dung: m.dung + 1, bai: { ...m.bai, [ten]: { ...bai, dung: bai.dung + 1 } } };
  const loi = monsterOf(q);
  return { ...m, bai: { ...m.bai, [ten]: { ...bai, sai: bai.sai + 1 } }, loi: { ...m.loi, [loi]: (m.loi[loi] ?? 0) + 1 } };
}

/**
 * Trả lời câu đang chờ.
 * Ban ngày: đúng được quặng; sai thì ghi lỗi vào Sổ Tay và mặt trời tụt thêm một nấc.
 * Ban đêm: đúng thì thu phục quái và được Đá Sáng; sai thì quái chạy thoát, đêm sau quay lại.
 * Câu trả lời không đọc được thì giữ nguyên câu hỏi, không tính gì.
 */
export function answer(
  state: GameState,
  input: string,
  bank: readonly BankQuestion[],
): { state: GameState; result: GradeResult } | null {
  const q = currentQuestion(state, bank);
  const pending = state.pending;
  if (!q || !pending) return null;
  const result = grade(q, input);
  if (!result.ok && result.reason === "khong-doc-duoc") return { state, result };

  if (pending.kind === "quai") {
    const next: GameState = result.ok
      ? {
          ...state,
          pending: null,
          notebook: capture(state.notebook, pending.loi, state.day),
          inventory: addItem(state.inventory, "da-sang"),
          today: { ...state.today, thuPhuc: state.today.thuPhuc + 1 },
        }
      : {
          ...state,
          pending: null,
          notebook: escape(state.notebook, pending.loi, state.day),
          today: { ...state.today, chayThoat: state.today.chayThoat + 1 },
        };
    return { result, state: endNightIfClear(next) };
  }

  const mission = tallyMission(state.mission, q, result.ok);
  if (result.ok) {
    const next: GameState = {
      ...state,
      pending: null,
      world: setBlock(state.world, pending.x, pending.y, "khong"),
      inventory: addItem(state.inventory, "quang"),
      today: { ...state.today, dung: state.today.dung + 1 },
      mission,
    };
    return { result, state: spendSun(next, 1) };
  }

  const shielded = (state.inventory["dong-ho-cat"] ?? 0) > 0;
  const next: GameState = {
    ...state,
    pending: null,
    notebook: recordMistake(state.notebook, monsterOf(q), q.id, state.day),
    inventory: shielded ? addItem(state.inventory, "dong-ho-cat", -1) : state.inventory,
    today: { ...state.today, sai: state.today.sai + 1 },
    mission,
  };
  return { result, state: spendSun(next, shielded ? 1 : 2) };
}

/** Bỏ qua câu đang chờ (nút "Để sau"): không tốn mặt trời, không ghi lỗi. */
export function cancelPending(state: GameState): GameState {
  return state.pending ? { ...state, pending: null } : state;
}

/** Đi ngủ khi còn quái: chúng chạy thoát và quay lại đêm sau, không ai bị thua. */
export function sleep(state: GameState): GameState {
  if (state.phase !== "dem") return state;
  const notebook = dueEntries(state.notebook, state.day).reduce((nb, e) => escape(nb, e.loi, state.day), state.notebook);
  const left = dueEntries(state.notebook, state.day).length;
  return { ...state, pending: null, notebook, phase: "sang", today: { ...state.today, chayThoat: state.today.chayThoat + left } };
}

export function startDay(state: GameState): GameState {
  if (state.phase !== "sang") return state;
  return { ...state, day: state.day + 1, sun: SUN_MAX, phase: "ngay", today: EMPTY_LOG };
}

/** Nhận nhiệm vụ mới từ giáo viên (thay nhiệm vụ cũ nếu có). Cùng mã thì giữ tiến độ. */
export function acceptMission(state: GameState, mission: Mission, code: string): GameState {
  if (state.mission?.code === code) return state;
  return { ...state, mission: { ...mission, code, dung: 0, bai: {}, loi: {} } };
}

export function craftRecipe(state: GameState, recipeId: string): GameState {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const inventory = recipe && craft(state.inventory, recipe);
  return inventory ? { ...state, inventory } : state;
}
