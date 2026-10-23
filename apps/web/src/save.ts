import { newGame, type GameState, type World } from "@tgth/engine";

// Tiến độ chỉ lưu trên máy này. Không gửi đi đâu.
const KEY = "tgth.save.v2";
const KEY_V1 = "tgth.save.v1";

/** Bản lưu v1 (trước khi có ngày/đêm): giữ thế giới, túi đồ và các câu đã sai. */
interface SaveV1 {
  world: World;
  player: { x: number; y: number };
  inventory: GameState["inventory"];
  mistakes: string[];
  seed: number;
}

function fromV1(old: SaveV1): GameState {
  return {
    ...newGame(old.seed),
    world: old.world,
    player: old.player,
    inventory: old.inventory,
    notebook: old.mistakes.map((id) => ({ loi: id, questionId: id, box: 0, due: 1 })),
  };
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state = JSON.parse(raw) as GameState;
      if (typeof state.sun !== "number" || !Array.isArray(state.notebook)) return null;
      // Bản lưu trước khi có mã kết quả: nhiệm vụ chưa có đúng/sai theo bài và lỗi.
      const m = state.mission;
      return m ? { ...state, mission: { ...m, bai: m.bai ?? {}, loi: m.loi ?? {} } } : state;
    }
    const v1 = localStorage.getItem(KEY_V1);
    return v1 ? fromV1(JSON.parse(v1) as SaveV1) : null;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, pending: null }));
    localStorage.removeItem(KEY_V1);
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn chơi được, chỉ không giữ tiến độ.
  }
}

const KEY_STT = "tgth.stt";

/** Số thứ tự trong lớp em đã gõ lần trước, để lần sau khỏi gõ lại. Chỉ lưu trên máy này. */
export function loadStt(): string {
  try {
    return localStorage.getItem(KEY_STT) ?? "";
  } catch {
    return "";
  }
}

export function writeStt(stt: string): void {
  try {
    localStorage.setItem(KEY_STT, stt);
  } catch {
    // Không lưu được thì lần sau gõ lại.
  }
}
