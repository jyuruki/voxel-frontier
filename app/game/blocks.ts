import * as THREE from "three";
import { BlockDefinition, BlockId, ItemId, Recipe } from "./types";
import { hash3 } from "./prng";

const block = (
  id: BlockId,
  name: string,
  color: string,
  description: string,
  overrides: Partial<BlockDefinition> = {},
): BlockDefinition => ({
  id,
  name,
  color,
  description,
  solid: true,
  opaque: true,
  hardness: 1,
  tool: "pick",
  collectible: true,
  ...overrides,
});

export const BLOCKS: Record<BlockId, BlockDefinition> = {
  [BlockId.Air]: block(BlockId.Air, "Air", "#000000", "Empty space.", {
    solid: false,
    opaque: false,
    hardness: 0,
    tool: "none",
    collectible: false,
  }),
  [BlockId.Turf]: block(BlockId.Turf, "Prairie Turf", "#6d984a", "Living topsoil.", {
    topColor: "#78ad55",
    sideColor: "#7b5d3d",
    bottomColor: "#6b4e35",
    hardness: 0.7,
    tool: "spade",
  }),
  [BlockId.Soil]: block(BlockId.Soil, "Loam", "#75543a", "Rich, workable earth.", {
    hardness: 0.55,
    tool: "spade",
  }),
  [BlockId.Stone]: block(BlockId.Stone, "Roughstone", "#777b7d", "Common structural stone.", {
    hardness: 1.8,
  }),
  [BlockId.Sand]: block(BlockId.Sand, "Sun Sand", "#d8bd74", "Fine desert sediment.", {
    hardness: 0.45,
    tool: "spade",
  }),
  [BlockId.Snow]: block(BlockId.Snow, "Frostpack", "#dcecf1", "Compressed alpine snow.", {
    hardness: 0.35,
    tool: "spade",
  }),
  [BlockId.Water]: block(BlockId.Water, "Water", "#438ac5", "A cool, flowing liquid.", {
    solid: false,
    opaque: false,
    liquid: true,
    hardness: 999,
    collectible: false,
  }),
  [BlockId.EmberwoodLog]: block(BlockId.EmberwoodLog, "Emberwood Log", "#7c472a", "A warm-grained timber.", {
    hardness: 1.2,
    tool: "axe",
  }),
  [BlockId.EmberwoodLeaves]: block(BlockId.EmberwoodLeaves, "Emberwood Canopy", "#477d49", "Dense copper-tipped leaves.", {
    solid: true,
    opaque: false,
    hardness: 0.25,
    tool: "none",
  }),
  [BlockId.CoalOre]: block(BlockId.CoalOre, "Carbon Shale", "#4b4d4d", "Fuel trapped inside roughstone.", { hardness: 2.1 }),
  [BlockId.CopperOre]: block(BlockId.CopperOre, "Copper Vein", "#9e6545", "Conductive copper ore.", { hardness: 2.4 }),
  [BlockId.AetherCrystal]: block(BlockId.AetherCrystal, "Aether Crystal", "#62d8d4", "A resonant mineral used in logic components.", {
    hardness: 3.4,
    emissive: 0.35,
  }),
  [BlockId.EmberwoodPlanks]: block(BlockId.EmberwoodPlanks, "Emberwood Planks", "#b46f3e", "Cut building timber.", {
    hardness: 1,
    tool: "axe",
  }),
  [BlockId.StoneBrick]: block(BlockId.StoneBrick, "Roughstone Brick", "#858a8a", "Fitted masonry.", { hardness: 2 }),
  [BlockId.Glass]: block(BlockId.Glass, "Clearglass", "#a8dde1", "Heat-fused transparent panels.", {
    opaque: false,
    hardness: 0.3,
  }),
  [BlockId.Workbench]: block(BlockId.Workbench, "Tinker Bench", "#9d6438", "Unlocks advanced handcrafting.", {
    hardness: 1.2,
    tool: "axe",
  }),
  [BlockId.FluxWire]: block(BlockId.FluxWire, "Flux Conduit", "#ca5a3f", "Carries logic signals and machine power.", {
    hardness: 0.25,
    automation: "wire",
    emissive: 0.12,
  }),
  [BlockId.Toggle]: block(BlockId.Toggle, "Toggle Relay", "#c78b47", "A player-controlled signal source.", {
    hardness: 0.5,
    automation: "source",
  }),
  [BlockId.FluxLamp]: block(BlockId.FluxLamp, "Flux Lamp", "#f4c95d", "Lights when it receives a signal.", {
    hardness: 0.55,
    automation: "sink",
    emissive: 0.55,
  }),
  [BlockId.ThermalGenerator]: block(BlockId.ThermalGenerator, "Thermal Dynamo", "#7b4a38", "Burns carbon shale to energize a conduit network.", {
    hardness: 2.5,
    automation: "machine",
  }),
  [BlockId.FluxCell]: block(BlockId.FluxCell, "Flux Cell", "#4c75a3", "Stores surplus energy for machinery.", {
    hardness: 2,
    automation: "machine",
    emissive: 0.12,
  }),
  [BlockId.BoreDrill]: block(BlockId.BoreDrill, "Bore Drill", "#58616a", "Mines the block directly beneath it when powered.", {
    hardness: 3,
    automation: "machine",
  }),
  [BlockId.Conveyor]: block(BlockId.Conveyor, "Vector Belt", "#36434b", "Moves loose resources in its facing direction.", {
    hardness: 1.4,
    automation: "machine",
  }),
  [BlockId.ArcFurnace]: block(BlockId.ArcFurnace, "Arc Furnace", "#4b555e", "Processes ores using network energy.", {
    hardness: 2.8,
    automation: "machine",
  }),
  [BlockId.Fabricator]: block(BlockId.Fabricator, "Fabricator", "#4f6b70", "Automatically assembles configured recipes.", {
    hardness: 2.8,
    automation: "machine",
  }),
  [BlockId.Ram]: block(BlockId.Ram, "Linear Ram", "#6b6971", "Pushes one block when its input rises.", {
    hardness: 2,
    automation: "machine",
  }),
  [BlockId.ProximitySensor]: block(BlockId.ProximitySensor, "Field Sensor", "#6d72a8", "Detects players, daylight, or darkness.", {
    hardness: 0.8,
    automation: "source",
    emissive: 0.15,
  }),
  [BlockId.AndGate]: block(BlockId.AndGate, "AND Matrix", "#436f80", "Outputs only with at least two live inputs.", {
    hardness: 0.65,
    automation: "logic",
  }),
  [BlockId.OrGate]: block(BlockId.OrGate, "OR Matrix", "#486e69", "Outputs when any input is live.", {
    hardness: 0.65,
    automation: "logic",
  }),
  [BlockId.NotGate]: block(BlockId.NotGate, "NOT Matrix", "#725b86", "Inverts its input state.", {
    hardness: 0.65,
    automation: "logic",
  }),
  [BlockId.DelayGate]: block(BlockId.DelayGate, "Pulse Delay", "#845e78", "Delays a signal by four simulation beats.", {
    hardness: 0.65,
    automation: "logic",
  }),
  [BlockId.Hopper]: block(BlockId.Hopper, "Collector Funnel", "#4d5859", "Collects loose items into adjacent storage.", {
    hardness: 1.5,
    automation: "machine",
  }),
  [BlockId.Crate]: block(BlockId.Crate, "Cargo Crate", "#8d603b", "Stores resources for automation networks.", {
    hardness: 1.2,
    tool: "axe",
    automation: "storage",
  }),
  [BlockId.GlowRod]: block(BlockId.GlowRod, "Glow Rod", "#f0a94b", "A steady handmade light source.", {
    hardness: 0.15,
    emissive: 0.8,
  }),
  [BlockId.Basalt]: block(BlockId.Basalt, "Night Basalt", "#393b44", "Dense volcanic rock.", { hardness: 2.6 }),
  [BlockId.Ice]: block(BlockId.Ice, "Glacier Ice", "#82c5da", "Slippery ancient ice.", {
    opaque: false,
    hardness: 0.7,
  }),
  [BlockId.Clay]: block(BlockId.Clay, "River Clay", "#82929b", "Fine mineral clay.", {
    hardness: 0.7,
    tool: "spade",
  }),
  [BlockId.SunCactus]: block(BlockId.SunCactus, "Sun Cactus", "#578a4e", "A hardy desert plant.", {
    hardness: 0.35,
    tool: "none",
  }),
  [BlockId.StarBloom]: block(BlockId.StarBloom, "Starbloom", "#d56c97", "A luminous prairie flower.", {
    solid: false,
    opaque: false,
    hardness: 0.1,
    tool: "none",
    emissive: 0.2,
  }),
  [BlockId.Bedrock]: block(BlockId.Bedrock, "Deepstone", "#20252a", "The unbreakable floor of the frontier.", {
    hardness: 999,
    collectible: false,
  }),
  [BlockId.CopperBlock]: block(BlockId.CopperBlock, "Copper Plate", "#bd744c", "A refined conductive building block.", { hardness: 2.2 }),
  [BlockId.Cinnabar]: block(BlockId.Cinnabar, "Cinnabar", "#a94d43", "A vivid volcanic mineral.", { hardness: 2.3 }),
  [BlockId.SulfurStone]: block(BlockId.SulfurStone, "Brimstone", "#d2bd4c", "Brittle sulfur-rich cave stone.", {
    hardness: 1.6,
    emissive: 0.08,
  }),
};

export const BLOCK_IDS = Object.values(BlockId).filter(
  (value): value is BlockId => typeof value === "number",
);

export const itemForBlock = (id: BlockId): ItemId => `block:${id}`;

export function blockForItem(item: ItemId): BlockId | null {
  if (!item.startsWith("block:")) return null;
  const id = Number(item.slice(6));
  return Number.isInteger(id) && BLOCKS[id as BlockId]
    ? (id as BlockId)
    : null;
}

export const ITEM_NAMES: Record<string, string> = {
  "tool:rough-pick": "Roughstone Pick",
  "tool:copper-pick": "Copper Pick",
  "tool:crystal-pick": "Aether Pick",
  "tool:hatchet": "Emberwood Hatchet",
  "tool:spade": "Field Spade",
  "tool:blade": "Frontier Blade",
  "part:copper-ingot": "Copper Ingot",
  "part:flux-coil": "Flux Coil",
  "part:logic-wafer": "Logic Wafer",
  "part:gear": "Drive Gear",
  "food:starfruit": "Starfruit",
};

export function itemName(item: ItemId): string {
  const blockId = blockForItem(item);
  return blockId === null ? ITEM_NAMES[item] ?? item : BLOCKS[blockId].name;
}

export const RECIPES: Recipe[] = [
  { id: "planks", name: "Cut Planks", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodLog)]: 1 }, output: { item: itemForBlock(BlockId.EmberwoodPlanks), count: 4 }, description: "Shape one log into four building planks." },
  { id: "workbench", name: "Tinker Bench", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 4 }, output: { item: itemForBlock(BlockId.Workbench), count: 1 }, description: "Required for engineered components." },
  { id: "rough-pick", name: "Roughstone Pick", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2, [itemForBlock(BlockId.Stone)]: 3 }, output: { item: "tool:rough-pick", count: 1 }, description: "Mines stone and basic ores efficiently." },
  { id: "copper-ingot", name: "Smelt Copper", station: "furnace", inputs: { [itemForBlock(BlockId.CopperOre)]: 1 }, output: { item: "part:copper-ingot", count: 1 }, description: "Refine conductive copper." },
  { id: "copper-pick", name: "Copper Pick", station: "workbench", inputs: { "part:copper-ingot": 3, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:copper-pick", count: 1 }, description: "Reaches crystal-bearing depths." },
  { id: "flux-coil", name: "Flux Coil", station: "workbench", inputs: { "part:copper-ingot": 2, [itemForBlock(BlockId.AetherCrystal)]: 1 }, output: { item: "part:flux-coil", count: 2 }, description: "The heart of powered devices." },
  { id: "logic-wafer", name: "Logic Wafer", station: "workbench", inputs: { "part:copper-ingot": 1, [itemForBlock(BlockId.AetherCrystal)]: 2 }, output: { item: "part:logic-wafer", count: 2 }, description: "Carries conditional logic." },
  { id: "gear", name: "Drive Gear", station: "workbench", inputs: { "part:copper-ingot": 2, [itemForBlock(BlockId.Stone)]: 1 }, output: { item: "part:gear", count: 1 }, description: "Transfers mechanical force." },
  { id: "wire", name: "Flux Conduit", station: "workbench", inputs: { "part:copper-ingot": 1 }, output: { item: itemForBlock(BlockId.FluxWire), count: 8 }, description: "Carries signal strength and machine energy." },
  { id: "toggle", name: "Toggle Relay", station: "workbench", inputs: { "part:copper-ingot": 1, [itemForBlock(BlockId.Stone)]: 1 }, output: { item: itemForBlock(BlockId.Toggle), count: 1 }, description: "Manual on/off input." },
  { id: "lamp", name: "Flux Lamp", station: "workbench", inputs: { "part:flux-coil": 1, [itemForBlock(BlockId.Glass)]: 2 }, output: { item: itemForBlock(BlockId.FluxLamp), count: 1 }, description: "Signal-controlled illumination." },
  { id: "generator", name: "Thermal Dynamo", station: "workbench", inputs: { "part:flux-coil": 2, "part:gear": 2, [itemForBlock(BlockId.StoneBrick)]: 4 }, output: { item: itemForBlock(BlockId.ThermalGenerator), count: 1 }, description: "Burns carbon shale for 24 flux per beat." },
  { id: "cell", name: "Flux Cell", station: "workbench", inputs: { "part:flux-coil": 2, "part:copper-ingot": 3 }, output: { item: itemForBlock(BlockId.FluxCell), count: 1 }, description: "Buffers up to 1,000 flux." },
  { id: "drill", name: "Bore Drill", station: "workbench", inputs: { "part:flux-coil": 2, "part:gear": 3, "part:copper-ingot": 4 }, output: { item: itemForBlock(BlockId.BoreDrill), count: 1 }, description: "Automatically mines downward." },
  { id: "belt", name: "Vector Belt", station: "workbench", inputs: { "part:gear": 1, "part:copper-ingot": 1, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: itemForBlock(BlockId.Conveyor), count: 4 }, description: "Moves loose items one block per beat." },
  { id: "furnace", name: "Arc Furnace", station: "workbench", inputs: { "part:flux-coil": 2, [itemForBlock(BlockId.StoneBrick)]: 6 }, output: { item: itemForBlock(BlockId.ArcFurnace), count: 1 }, description: "Automates ore processing." },
  { id: "fabricator", name: "Fabricator", station: "workbench", inputs: { "part:logic-wafer": 3, "part:flux-coil": 2, "part:gear": 2 }, output: { item: itemForBlock(BlockId.Fabricator), count: 1 }, description: "Crafts configured parts from adjacent storage." },
  { id: "and", name: "AND Matrix", station: "workbench", inputs: { "part:logic-wafer": 1, "part:copper-ingot": 1 }, output: { item: itemForBlock(BlockId.AndGate), count: 1 }, description: "Requires two active neighbors." },
  { id: "or", name: "OR Matrix", station: "workbench", inputs: { "part:logic-wafer": 1 }, output: { item: itemForBlock(BlockId.OrGate), count: 1 }, description: "Accepts any active neighbor." },
  { id: "not", name: "NOT Matrix", station: "workbench", inputs: { "part:logic-wafer": 1, [itemForBlock(BlockId.AetherCrystal)]: 1 }, output: { item: itemForBlock(BlockId.NotGate), count: 1 }, description: "Inverts its input." },
  { id: "delay", name: "Pulse Delay", station: "workbench", inputs: { "part:logic-wafer": 1, "part:flux-coil": 1 }, output: { item: itemForBlock(BlockId.DelayGate), count: 1 }, description: "Adds four beats of delay." },
];

export const TOOL_POWER: Record<string, number> = {
  "tool:rough-pick": 2.1,
  "tool:copper-pick": 3.4,
  "tool:crystal-pick": 5.2,
  "tool:hatchet": 3,
  "tool:spade": 3,
  "tool:blade": 1.25,
};

const TILE_SIZE = 16;
const ATLAS_COLS = 8;

function paintTile(
  context: CanvasRenderingContext2D,
  tile: number,
  hex: string,
  blockId: BlockId,
): void {
  const column = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const base = new THREE.Color(hex);
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const noise = ((hash3(x, y, blockId, 3919) % 21) - 10) / 100;
      let stripe = 0;
      if ([BlockId.EmberwoodLog, BlockId.EmberwoodPlanks, BlockId.Crate].includes(blockId)) stripe = x % 5 === 0 ? -0.1 : 0;
      if ([BlockId.StoneBrick, BlockId.CopperBlock].includes(blockId)) stripe = (y === 7 || x === (y < 8 ? 0 : 8)) ? -0.13 : 0;
      if (blockId === BlockId.FluxWire) stripe = x === 7 || y === 7 ? 0.22 : -0.08;
      if ([BlockId.AndGate, BlockId.OrGate, BlockId.NotGate, BlockId.DelayGate].includes(blockId)) stripe = x > 5 && x < 10 ? 0.18 : -0.05;
      const offset = noise + stripe;
      const index = (y * TILE_SIZE + x) * 4;
      image.data[index] = Math.max(0, Math.min(255, (base.r + offset) * 255));
      image.data[index + 1] = Math.max(0, Math.min(255, (base.g + offset) * 255));
      image.data[index + 2] = Math.max(0, Math.min(255, (base.b + offset) * 255));
      image.data[index + 3] = blockId === BlockId.EmberwoodLeaves && hash3(x, y, blockId, 17) % 9 === 0 ? 0 : 255;
    }
  }
  context.putImageData(image, column * TILE_SIZE, row * TILE_SIZE);
}

export function createOriginalTextureAtlas(): THREE.CanvasTexture {
  const rows = Math.ceil((BLOCK_IDS.length + 1) / ATLAS_COLS);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas textures are unavailable in this browser.");
  context.imageSmoothingEnabled = false;
  for (const id of BLOCK_IDS) paintTile(context, id, BLOCKS[id].color, id);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  return texture;
}

export function tileUv(id: BlockId): { u0: number; v0: number; u1: number; v1: number } {
  const rows = Math.ceil((BLOCK_IDS.length + 1) / ATLAS_COLS);
  const column = id % ATLAS_COLS;
  const row = Math.floor(id / ATLAS_COLS);
  const insetU = 0.5 / (ATLAS_COLS * TILE_SIZE);
  const insetV = 0.5 / (rows * TILE_SIZE);
  return {
    u0: column / ATLAS_COLS + insetU,
    u1: (column + 1) / ATLAS_COLS - insetU,
    v0: 1 - (row + 1) / rows + insetV,
    v1: 1 - row / rows - insetV,
  };
}

export const AUTOMATION_BLOCKS = [
  BlockId.FluxWire,
  BlockId.Toggle,
  BlockId.FluxLamp,
  BlockId.ThermalGenerator,
  BlockId.FluxCell,
  BlockId.BoreDrill,
  BlockId.Conveyor,
  BlockId.ArcFurnace,
  BlockId.Fabricator,
  BlockId.Ram,
  BlockId.ProximitySensor,
  BlockId.AndGate,
  BlockId.OrGate,
  BlockId.NotGate,
  BlockId.DelayGate,
  BlockId.Hopper,
  BlockId.Crate,
];

