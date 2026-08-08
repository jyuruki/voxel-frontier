import { Inventory, InventoryLayout, ItemId } from "./types";

export const INVENTORY_COLUMNS = 9;
export const INVENTORY_ROWS = 4;
export const INVENTORY_SLOT_COUNT = INVENTORY_COLUMNS * INVENTORY_ROWS;
export const HOTBAR_START = INVENTORY_COLUMNS * (INVENTORY_ROWS - 1);
export const HOTBAR_SIZE = INVENTORY_COLUMNS;

function validItem(inventory: Inventory, item: ItemId | null): item is ItemId {
  return Boolean(item && (inventory[item] ?? 0) > 0);
}

export function reconcileInventoryLayout(
  layout: InventoryLayout,
  inventory: Inventory,
): InventoryLayout {
  const next = Array<ItemId | null>(INVENTORY_SLOT_COUNT).fill(null);
  const seen = new Set<ItemId>();
  for (let index = 0; index < Math.min(layout.length, INVENTORY_SLOT_COUNT); index += 1) {
    const item = layout[index] ?? null;
    if (!validItem(inventory, item) || seen.has(item)) continue;
    next[index] = item;
    seen.add(item);
  }
  return next;
}

export function createInventoryLayout(
  inventory: Inventory,
  saved: InventoryLayout | undefined,
  legacyHotbar: Array<ItemId | null> = [],
): InventoryLayout {
  const next = reconcileInventoryLayout(saved ?? [], inventory);
  const placed = new Set(next.filter((item): item is ItemId => item !== null));

  for (let slot = 0; slot < Math.min(HOTBAR_SIZE, legacyHotbar.length); slot += 1) {
    const item = legacyHotbar[slot];
    if (!validItem(inventory, item) || placed.has(item)) continue;
    const target = HOTBAR_START + slot;
    if (next[target] !== null) continue;
    next[target] = item;
    placed.add(item);
  }

  for (const [rawItem, count] of Object.entries(inventory)) {
    const item = rawItem as ItemId;
    if (count <= 0 || placed.has(item)) continue;
    const target = next.slice(0, HOTBAR_START).findIndex((candidate) => candidate === null);
    const fallback = target >= 0 ? target : next.findIndex((candidate) => candidate === null);
    if (fallback < 0) break;
    next[fallback] = item;
    placed.add(item);
  }
  return next;
}

export function addItemToLayout(
  layout: InventoryLayout,
  item: ItemId,
  preferHotbar = true,
): InventoryLayout {
  if (layout.includes(item)) return [...layout];
  const next = [...layout];
  while (next.length < INVENTORY_SLOT_COUNT) next.push(null);
  const ranges = preferHotbar
    ? [[HOTBAR_START, INVENTORY_SLOT_COUNT], [0, HOTBAR_START]]
    : [[0, HOTBAR_START], [HOTBAR_START, INVENTORY_SLOT_COUNT]];
  for (const [start, end] of ranges) {
    for (let index = start; index < end; index += 1) {
      if (next[index] !== null) continue;
      next[index] = item;
      return next;
    }
  }
  return next;
}

export function moveInventorySlot(
  layout: InventoryLayout,
  from: number,
  to: number,
): InventoryLayout {
  if (from < 0 || to < 0 || from >= INVENTORY_SLOT_COUNT || to >= INVENTORY_SLOT_COUNT || from === to) return [...layout];
  const next = [...layout];
  [next[from], next[to]] = [next[to] ?? null, next[from] ?? null];
  return next;
}

export function shiftInventorySlot(layout: InventoryLayout, from: number): InventoryLayout {
  if (from < 0 || from >= INVENTORY_SLOT_COUNT || !layout[from]) return [...layout];
  const next = [...layout];
  const start = from >= HOTBAR_START ? 0 : HOTBAR_START;
  const end = from >= HOTBAR_START ? HOTBAR_START : INVENTORY_SLOT_COUNT;
  for (let target = start; target < end; target += 1) {
    if (next[target] !== null) continue;
    next[target] = next[from] ?? null;
    next[from] = null;
    break;
  }
  return next;
}

export function hotbarFromLayout(layout: InventoryLayout): Array<ItemId | null> {
  return Array.from({ length: HOTBAR_SIZE }, (_, slot) => layout[HOTBAR_START + slot] ?? null);
}
