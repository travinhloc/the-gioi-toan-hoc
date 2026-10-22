export type Item = "go" | "da" | "dat" | "quang" | "cuoc-go" | "cuoc-da" | "duoc";

export type Inventory = Partial<Record<Item, number>>;

export interface Recipe {
  readonly id: string;
  readonly ten: string;
  readonly can: Inventory;
  readonly ra: Item;
}

export const RECIPES: readonly Recipe[] = [
  { id: "cuoc-go", ten: "Cuốc gỗ", can: { go: 3 }, ra: "cuoc-go" },
  { id: "cuoc-da", ten: "Cuốc đá", can: { go: 2, da: 3 }, ra: "cuoc-da" },
  { id: "duoc", ten: "Đuốc", can: { go: 1, quang: 1 }, ra: "duoc" },
];

export function canCraft(inv: Inventory, recipe: Recipe): boolean {
  return Object.entries(recipe.can).every(([item, n]) => (inv[item as Item] ?? 0) >= (n ?? 0));
}

export function craft(inv: Inventory, recipe: Recipe): Inventory | null {
  if (!canCraft(inv, recipe)) return null;
  const next: Inventory = { ...inv };
  for (const [item, n] of Object.entries(recipe.can)) next[item as Item] = (next[item as Item] ?? 0) - (n ?? 0);
  next[recipe.ra] = (next[recipe.ra] ?? 0) + 1;
  return next;
}

export function addItem(inv: Inventory, item: Item, n = 1): Inventory {
  return { ...inv, [item]: (inv[item] ?? 0) + n };
}
