import { BlockId, ItemId, MachineState } from "./types";
import { itemForBlock } from "./blocks";

export interface SmeltingRecipe {
  input: ItemId;
  output: ItemId;
  count: number;
}

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  { input: itemForBlock(BlockId.IronOre), output: "part:iron-ingot", count: 1 },
  { input: itemForBlock(BlockId.GoldOre), output: "part:gold-ingot", count: 1 },
  { input: itemForBlock(BlockId.CopperOre), output: "part:copper-ingot", count: 1 },
  { input: itemForBlock(BlockId.Clay), output: itemForBlock(BlockId.FiredBrick), count: 2 },
  { input: itemForBlock(BlockId.Sand), output: itemForBlock(BlockId.Glass), count: 1 },
];

export const FURNACE_FUELS: ItemId[] = ["part:coal", itemForBlock(BlockId.CoalOre)];

export type FurnaceSlot = "input" | "fuel" | "output";

export function smeltingRecipeFor(item: ItemId | undefined): SmeltingRecipe | undefined {
  return item ? SMELTING_RECIPES.find((recipe) => recipe.input === item) : undefined;
}

export function isSmeltableItem(item: ItemId): boolean {
  return Boolean(smeltingRecipeFor(item));
}

export function isFurnaceFuel(item: ItemId): boolean {
  return FURNACE_FUELS.includes(item);
}

function clearMissingSlot(state: MachineState, key: "furnaceInput" | "furnaceFuel" | "furnaceOutput"): void {
  const item = state[key];
  if (item && (state.storage[item] ?? 0) <= 0) delete state[key];
}

/** Migrates Version 8's free-form furnace storage into three explicit slots. */
export function ensureFurnaceSlots(state: MachineState): void {
  clearMissingSlot(state, "furnaceInput");
  clearMissingSlot(state, "furnaceFuel");
  clearMissingSlot(state, "furnaceOutput");
  if (!state.furnaceInput) {
    state.furnaceInput = SMELTING_RECIPES.find((recipe) => (state.storage[recipe.input] ?? 0) > 0)?.input;
  }
  if (!state.furnaceFuel) {
    state.furnaceFuel = FURNACE_FUELS.find((item) => (state.storage[item] ?? 0) > 0);
  }
  if (!state.furnaceOutput) {
    state.furnaceOutput = SMELTING_RECIPES
      .map((recipe) => recipe.output)
      .find((item) => item !== state.furnaceInput && item !== state.furnaceFuel && (state.storage[item] ?? 0) > 0)
      ?? (Object.keys(state.storage) as ItemId[]).find((item) => (
        item !== state.furnaceInput && item !== state.furnaceFuel && (state.storage[item] ?? 0) > 0
      ));
  }
}

export function furnaceSlotItem(state: MachineState, slot: FurnaceSlot): ItemId | undefined {
  ensureFurnaceSlots(state);
  if (slot === "input") return state.furnaceInput;
  if (slot === "fuel") return state.furnaceFuel;
  return state.furnaceOutput;
}

export function furnaceCanDeposit(state: MachineState, slot: Exclude<FurnaceSlot, "output">, item: ItemId): boolean {
  ensureFurnaceSlots(state);
  if (slot === "input") return isSmeltableItem(item) && (!state.furnaceInput || state.furnaceInput === item);
  return isFurnaceFuel(item) && (!state.furnaceFuel || state.furnaceFuel === item);
}

export function depositFurnaceItem(
  state: MachineState,
  slot: Exclude<FurnaceSlot, "output">,
  item: ItemId,
  count: number,
): boolean {
  const amount = Math.max(0, Math.floor(count));
  if (amount <= 0 || !furnaceCanDeposit(state, slot, item)) return false;
  if (slot === "input") state.furnaceInput = item;
  else state.furnaceFuel = item;
  state.storage[item] = (state.storage[item] ?? 0) + amount;
  return true;
}

export function withdrawFurnaceItem(
  state: MachineState,
  slot: FurnaceSlot,
  requestedCount: number,
): { item: ItemId; count: number } | null {
  const item = furnaceSlotItem(state, slot);
  if (!item) return null;
  const count = Math.min(state.storage[item] ?? 0, Math.max(0, Math.floor(requestedCount)));
  if (count <= 0) return null;
  state.storage[item] -= count;
  if (state.storage[item] <= 0) delete state.storage[item];
  ensureFurnaceSlots(state);
  return { item, count };
}
