import type { GameState } from "./game";
import { blockAt, type World } from "./world";

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Khoảng cách đi bộ từ (fx, fy) tới mọi ô trống nối được với nó qua đường hầm.
 * Trả về mảng cùng cỡ thế giới, -1 là chưa tới được.
 */
function distances(world: World, fx: number, fy: number): Int32Array {
  const dist = new Int32Array(world.width * world.height).fill(-1);
  dist[fy * world.width + fx] = 0;
  const queue = [fy * world.width + fx];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % world.width;
    const y = (i - x) / world.width;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (blockAt(world, nx, ny) !== "khong") continue;
      const j = ny * world.width + nx;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i]! + 1;
      queue.push(j);
    }
  }
  return dist;
}

/**
 * Chạm một ô trên lưới (luật "chạm khối để đào"): @ tự đi tới.
 * Ô trống thì đi đến chính ô đó; ô có khối thì đi đến ô trống gần nhất kề khối ấy,
 * để lượt sau đào được ngay. Không tới được thì giữ nguyên trạng thái.
 */
export function walkTo(state: GameState, x: number, y: number): GameState {
  if (state.pending || state.phase !== "ngay") return state;
  const { world, player } = state;
  const target = blockAt(world, x, y);
  if (!target) return state;
  const dist = distances(world, player.x, player.y);
  const reach = (cx: number, cy: number) =>
    blockAt(world, cx, cy) === undefined ? -1 : dist[cy * world.width + cx]!;

  let best: { x: number; y: number } | null = null;
  if (target === "khong") {
    if (reach(x, y) >= 0) best = { x, y };
  } else {
    let bestDist = Infinity;
    for (const [dx, dy] of STEPS) {
      const d = reach(x + dx, y + dy);
      if (d >= 0 && d < bestDist) {
        bestDist = d;
        best = { x: x + dx, y: y + dy };
      }
    }
  }
  if (!best || (best.x === player.x && best.y === player.y)) return state;
  return { ...state, player: best };
}
