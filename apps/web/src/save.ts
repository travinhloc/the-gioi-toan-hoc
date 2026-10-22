import type { GameState } from "@tgth/engine";

// Tiến độ chỉ lưu trên máy này. Không gửi đi đâu.
const KEY = "tgth.save.v1";

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, pending: null }));
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn chơi được, chỉ không giữ tiến độ.
  }
}
