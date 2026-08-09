import { recipeInputOptions } from "./blocks";
import { Inventory, ItemId, Recipe } from "./types";

export const RECIPE_BOOK_PAGE_SIZE = 25;

export interface CraftingGridCell {
  item: ItemId;
  available: boolean;
}

export function craftingGridSize(workbenchActive: boolean): 2 | 3 {
  return workbenchActive ? 3 : 2;
}

export function recipeFitsGrid(recipe: Recipe, size: 2 | 3): boolean {
  const ingredientsFit = recipeInputOptions(recipe).every((inputs) => (
    Object.values(inputs).reduce((total, count) => total + count, 0) <= size * size
  ));
  if (!ingredientsFit || !recipe.gridPattern) return ingredientsFit;
  return recipe.gridPattern.length === Object.values(recipe.inputs).reduce((total, count) => total + count, 0)
    && new Set(recipe.gridPattern).size === recipe.gridPattern.length
    && recipe.gridPattern.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < size * size);
}

/** Pick the valid alternative, or the closest one for a useful missing-items preview. */
export function displayedRecipeInputs(recipe: Recipe, inventory: Inventory): Inventory {
  const options = recipeInputOptions(recipe);
  const matching = options.find((option) => Object.entries(option).every(([item, count]) => (
    (inventory[item] ?? 0) >= count
  )));
  if (matching) return matching;
  return [...options].sort((left, right) => {
    const score = (inputs: Inventory) => Object.entries(inputs).reduce((total, [item, count]) => (
      total + Math.min(count, inventory[item] ?? 0)
    ), 0);
    return score(right) - score(left);
  })[0] ?? recipe.inputs;
}

export function craftingGridCells(
  recipe: Recipe,
  inventory: Inventory,
  size: 2 | 3,
): Array<CraftingGridCell | null> {
  const inputs = displayedRecipeInputs(recipe, inventory);
  const used = new Map<ItemId, number>();
  const cells: CraftingGridCell[] = [];
  for (const [rawItem, count] of Object.entries(inputs)) {
    const item = rawItem as ItemId;
    for (let unit = 0; unit < count && cells.length < size * size; unit += 1) {
      const nextUsed = (used.get(item) ?? 0) + 1;
      used.set(item, nextUsed);
      cells.push({ item, available: (inventory[item] ?? 0) >= nextUsed });
    }
  }
  const grid = Array<CraftingGridCell | null>(size * size).fill(null);
  cells.forEach((cell, index) => {
    const target = recipe.gridPattern?.[index] ?? index;
    if (target >= 0 && target < grid.length && grid[target] === null) grid[target] = cell;
  });
  return grid;
}
