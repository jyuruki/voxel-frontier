import { BLOCKS, blockForItem } from "./blocks";
import { BlockId, ItemId } from "./types";

const SPECIAL_SALE_POINTS: Partial<Record<ItemId, number>> = {
  "currency:frontier-mark": 20,
  "part:coal": 7,
  "part:copper-ingot": 20,
  "part:iron-ingot": 30,
  "part:gold-ingot": 46,
  "part:diamond": 110,
  "part:flux-dust": 18,
  "part:moonshard": 72,
  "part:rift-core": 260,
  "part:logic-wafer": 42,
  "part:flux-coil": 48,
  "part:gear": 24,
  "part:soft-fiber": 8,
  "part:feather": 5,
  "part:carapace": 18,
  "part:cinder-core": 32,
  "food:starfruit": 7,
  "food:glowcut": 12,
  "food:pork": 10,
  "food:chicken": 8,
  "ammo:aether-bolt": 6,
  "consumable:mender-tonic": 70,
  "tool:wood-pick": 35,
  "tool:wood-hatchet": 35,
  "tool:wood-spade": 28,
  "tool:wood-club": 30,
  "tool:rough-pick": 58,
  "tool:copper-pick": 105,
  "tool:iron-pick": 165,
  "tool:diamond-pick": 360,
  "tool:crystal-pick": 240,
  "tool:hatchet": 90,
  "tool:spade": 75,
  "tool:blade": 135,
  "tool:stone-spear": 85,
  "tool:copper-saber": 155,
  "tool:aether-repeater": 280,
};

const ORE_SALE_POINTS: Partial<Record<BlockId, number>> = {
  [BlockId.CoalOre]: 6,
  [BlockId.CopperOre]: 12,
  [BlockId.IronOre]: 17,
  [BlockId.GoldOre]: 30,
  [BlockId.FluxstoneOre]: 15,
  [BlockId.DiamondOre]: 90,
  [BlockId.MoonshardOre]: 54,
  [BlockId.AetherCrystal]: 38,
};

/** One Frontier Mark is twenty value points; every carried item has a deterministic price. */
export function itemSalePoints(item: ItemId): number {
  const special = SPECIAL_SALE_POINTS[item];
  if (special !== undefined) return special;
  const blockId = blockForItem(item);
  if (blockId === null) return 4;
  const ore = ORE_SALE_POINTS[blockId];
  if (ore !== undefined) return ore;
  const definition = BLOCKS[blockId];
  if (!definition.collectible || definition.hardness >= 999) return 1;
  const automationPremium = definition.automation ? 22 : 0;
  const craftedPremium = [
    BlockId.Glass, BlockId.GlassPane, BlockId.TimberDoor, BlockId.FrontierBed,
    BlockId.HearthFurnace, BlockId.RiftGate, BlockId.DiamondBlock, BlockId.GoldBlock,
  ].includes(blockId) ? 18 : 0;
  return Math.max(1, Math.round(definition.hardness * 4 + automationPremium + craftedPremium));
}
