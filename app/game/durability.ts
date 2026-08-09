import { Inventory, ItemDurability, ItemId, SerializedItemDurability } from "./types";

export const TOOL_MAX_DURABILITY: Partial<Record<ItemId, number>> = {
  "tool:wood-pick": 64,
  "tool:wood-hatchet": 64,
  "tool:wood-spade": 64,
  "tool:wood-club": 64,
  "tool:rough-pick": 160,
  "tool:hatchet": 160,
  "tool:spade": 160,
  "tool:blade": 160,
  "tool:stone-spear": 160,
  "tool:copper-pick": 320,
  "tool:copper-saber": 320,
  "tool:iron-pick": 640,
  "tool:diamond-pick": 1_400,
  "tool:crystal-pick": 2_100,
  "tool:aether-repeater": 900,
};

export function maxItemDurability(item: ItemId): number | null {
  return TOOL_MAX_DURABILITY[item] ?? null;
}

function clampDurability(item: ItemId, value: number): number {
  const maximum = maxItemDurability(item) ?? 1;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

/** Remove full-durability values that are safely represented by the implicit tail. */
function compactQueue(item: ItemId, values: readonly number[]): number[] {
  const maximum = maxItemDurability(item);
  if (!maximum) return [];
  const compacted = values.map((value) => clampDurability(item, value));
  while (compacted.at(-1) === maximum) compacted.pop();
  return compacted;
}

export function cloneItemDurability(durability?: ItemDurability): ItemDurability {
  return Object.fromEntries(Object.entries(durability ?? {}).map(([item, values]) => [
    item,
    [...(values ?? [])],
  ])) as ItemDurability;
}

export function cloneSerializedItemDurability(
  durability?: SerializedItemDurability,
): SerializedItemDurability | undefined {
  if (!durability) return undefined;
  return Object.fromEntries(Object.entries(durability).map(([item, value]) => [
    item,
    Array.isArray(value) ? [...value] : value,
  ])) as SerializedItemDurability;
}

export function normalizeDurability(
  inventory: Inventory,
  saved?: SerializedItemDurability | ItemDurability,
): ItemDurability {
  const normalized: ItemDurability = {};
  for (const [rawItem, rawCount] of Object.entries(inventory)) {
    const count = Math.max(0, Math.floor(rawCount));
    if (count <= 0) continue;
    const item = rawItem as ItemId;
    if (!maxItemDurability(item)) continue;
    const stored = saved?.[item];
    const values = Array.isArray(stored)
      ? stored.slice(0, count)
      : typeof stored === "number" && Number.isFinite(stored)
        ? [stored]
        : [];
    const compacted = compactQueue(item, values);
    if (compacted.length > 0) normalized[item] = compacted;
  }
  return normalized;
}

export function currentItemDurability(durability: ItemDurability, item: ItemId): number | null {
  const maximum = maxItemDurability(item);
  if (!maximum) return null;
  return durability[item]?.[0] ?? maximum;
}

/**
 * Remove the first `count` instances from a durability queue. An omitted
 * return value means every moved copy is at full durability.
 */
export function takeItemDurability(
  durability: ItemDurability,
  item: ItemId,
  count: number,
): number[] | undefined {
  if (!maxItemDurability(item) || count <= 0) return undefined;
  const queue = durability[item] ?? [];
  const moved = compactQueue(item, queue.slice(0, count));
  const remaining = compactQueue(item, queue.slice(count));
  if (remaining.length > 0) durability[item] = remaining;
  else delete durability[item];
  return moved.length > 0 ? moved : undefined;
}

/**
 * Add transferred copies ahead of existing damaged copies. Trailing copies
 * omitted from `transferred` are full durability and remain implicit.
 */
export function addItemDurability(
  durability: ItemDurability,
  item: ItemId,
  count: number,
  transferred?: readonly number[],
): void {
  const maximum = maxItemDurability(item);
  const incomingCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!maximum || incomingCount <= 0 || !transferred?.length) return;
  // Full values are only safely implicit at the end of the complete queue. Pad
  // this batch before prepending it so a full incoming copy cannot disappear
  // between an incoming damaged copy and an existing damaged copy.
  const incoming = Array.from(
    { length: incomingCount },
    (_, index) => transferred?.[index] ?? maximum,
  );
  const combined = compactQueue(item, [...incoming, ...(durability[item] ?? [])]);
  if (combined.length > 0) durability[item] = combined;
  else delete durability[item];
}

export function damageItemDurability(
  durability: ItemDurability,
  item: ItemId,
  amount = 1,
): { broke: boolean; remaining: number } | null {
  const maximum = maxItemDurability(item);
  if (!maximum || amount <= 0) return null;
  const queue = [...(durability[item] ?? [])];
  const current = queue[0] ?? maximum;
  const remaining = Math.max(0, current - amount);
  if (remaining > 0) {
    if (queue.length > 0) queue[0] = remaining;
    else queue.push(remaining);
  } else if (queue.length > 0) queue.shift();
  const compacted = compactQueue(item, queue);
  if (compacted.length > 0) durability[item] = compacted;
  else delete durability[item];
  return { broke: remaining <= 0, remaining };
}

export function durabilityPercent(
  item: ItemId,
  current: number | readonly number[] | undefined,
): number | null {
  const maximum = maxItemDurability(item);
  if (!maximum) return null;
  const value = Array.isArray(current) ? current[0] : current;
  return Math.max(0, Math.min(1, (value ?? maximum) / maximum));
}
