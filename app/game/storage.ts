import { Inventory, InventoryLayout, ItemId } from "./types";

export const SINGLE_CHEST_SLOTS = 27;
export const DOUBLE_CHEST_SLOTS = 54;

export function reconcileStorageSlots(
  slots: InventoryLayout | undefined,
  storage: Inventory,
  size = SINGLE_CHEST_SLOTS,
): InventoryLayout {
  const next = Array<ItemId | null>(size).fill(null);
  const present = new Set<ItemId>();
  for (let index = 0; index < Math.min(size, slots?.length ?? 0); index += 1) {
    const item = slots?.[index] ?? null;
    if (!item || (storage[item] ?? 0) <= 0 || present.has(item)) continue;
    next[index] = item;
    present.add(item);
  }
  for (const [rawItem, count] of Object.entries(storage)) {
    const item = rawItem as ItemId;
    if (count <= 0 || present.has(item)) continue;
    const open = next.indexOf(null);
    if (open < 0) break;
    next[open] = item;
    present.add(item);
  }
  return next;
}

export function storageCanAccept(slots: InventoryLayout, item: ItemId): boolean {
  return slots.includes(item) || slots.includes(null);
}

export function placeStorageItem(slots: InventoryLayout, item: ItemId): InventoryLayout {
  if (slots.includes(item)) return [...slots];
  const open = slots.indexOf(null);
  if (open < 0) return [...slots];
  const next = [...slots];
  next[open] = item;
  return next;
}

export function clearStorageItem(slots: InventoryLayout, item: ItemId): InventoryLayout {
  return slots.map((candidate) => candidate === item ? null : candidate);
}
