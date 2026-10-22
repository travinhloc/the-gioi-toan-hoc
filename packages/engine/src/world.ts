import { createRandom } from "./random";

export type Block = "khong" | "dat" | "da" | "go" | "quang";

export interface World {
  readonly width: number;
  readonly height: number;
  readonly blocks: Block[];
}

export function blockAt(world: World, x: number, y: number): Block | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined;
  return world.blocks[y * world.width + x];
}

export function setBlock(world: World, x: number, y: number, block: Block): World {
  const blocks = world.blocks.slice();
  blocks[y * world.width + x] = block;
  return { ...world, blocks };
}

/**
 * Sinh một vùng mỏ đơn giản: trời ở trên, cây trên mặt đất, đất rồi đá, quặng rải trong đá.
 * Cùng seed luôn cho cùng thế giới.
 */
export function generateWorld(seed: number, width = 32, height = 16): World {
  const rand = createRandom(seed);
  const surface = Math.floor(height / 4);
  const blocks: Block[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < surface - 1) blocks.push("khong");
      else if (y === surface - 1) blocks.push(rand() < 0.15 ? "go" : "khong");
      else if (y < surface + 2) blocks.push("dat");
      else blocks.push(rand() < 0.12 ? "quang" : "da");
    }
  }
  return { width, height, blocks };
}
