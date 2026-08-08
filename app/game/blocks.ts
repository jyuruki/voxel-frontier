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
  shape: "cube",
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
    solid: false,
    hardness: 0.25,
    shape: "wire",
    automation: "wire",
    emissive: 0.12,
  }),
  [BlockId.Toggle]: block(BlockId.Toggle, "Toggle Relay", "#c78b47", "A player-controlled signal source.", {
    solid: false,
    hardness: 0.5,
    shape: "plate",
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
    shape: "slab",
    collisionHeight: 0.28,
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
  [BlockId.Ram]: block(BlockId.Ram, "Linear Ram", "#6b6971", "Pushes a line of blocks when its input rises.", {
    hardness: 2,
    shape: "piston",
    automation: "machine",
  }),
  [BlockId.ProximitySensor]: block(BlockId.ProximitySensor, "Field Sensor", "#6d72a8", "Detects players, daylight, or darkness.", {
    solid: false,
    hardness: 0.8,
    shape: "plate",
    automation: "source",
    emissive: 0.15,
  }),
  [BlockId.AndGate]: block(BlockId.AndGate, "AND Matrix", "#436f80", "Outputs only with at least two live inputs.", {
    solid: false,
    hardness: 0.65,
    shape: "plate",
    automation: "logic",
  }),
  [BlockId.OrGate]: block(BlockId.OrGate, "OR Matrix", "#486e69", "Outputs when any input is live.", {
    solid: false,
    hardness: 0.65,
    shape: "plate",
    automation: "logic",
  }),
  [BlockId.NotGate]: block(BlockId.NotGate, "NOT Matrix", "#725b86", "Inverts its input state.", {
    solid: false,
    hardness: 0.65,
    shape: "plate",
    automation: "logic",
  }),
  [BlockId.DelayGate]: block(BlockId.DelayGate, "Pulse Delay", "#845e78", "Delays a signal by four simulation beats.", {
    solid: false,
    hardness: 0.65,
    shape: "plate",
    automation: "logic",
  }),
  [BlockId.Hopper]: block(BlockId.Hopper, "Collector Funnel", "#4d5859", "Collects loose items and transfers them into facing storage.", {
    hardness: 1.5,
    shape: "hopper",
    automation: "machine",
  }),
  [BlockId.Crate]: block(BlockId.Crate, "Cargo Crate", "#8d603b", "Stores resources for automation networks.", {
    hardness: 1.2,
    tool: "axe",
    automation: "storage",
  }),
  [BlockId.GlowRod]: block(BlockId.GlowRod, "Glow Rod", "#f0a94b", "A steady handmade light source.", {
    solid: false,
    hardness: 0.15,
    shape: "rod",
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
    shape: "column",
    tool: "none",
  }),
  [BlockId.StarBloom]: block(BlockId.StarBloom, "Starbloom", "#d56c97", "A luminous prairie flower.", {
    solid: false,
    opaque: false,
    hardness: 0.1,
    tool: "none",
    shape: "cross",
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
  [BlockId.MoonshardOre]: block(BlockId.MoonshardOre, "Moonshard Seam", "#596487", "Rare night-blue crystal threaded through deep rock.", {
    hardness: 3.8,
    emissive: 0.24,
  }),
  [BlockId.Mossstone]: block(BlockId.Mossstone, "Mossbound Stone", "#66735d", "Ancient masonry reclaimed by the wild.", {
    hardness: 1.9,
  }),
  [BlockId.RuinStone]: block(BlockId.RuinStone, "Wayfarer Masonry", "#6d6b68", "Weathered stone cut by an unknown frontier culture.", {
    hardness: 2.3,
  }),
  [BlockId.RelicCache]: block(BlockId.RelicCache, "Relic Cache", "#765234", "A sealed cache hidden among old ruins.", {
    hardness: 1.1,
    tool: "axe",
  }),
  [BlockId.Thornvine]: block(BlockId.Thornvine, "Thornvine", "#476143", "Dense living thorns that slow careless travelers.", {
    solid: false,
    opaque: false,
    shape: "cross",
    hardness: 0.3,
    tool: "axe",
  }),
  [BlockId.MoonshardBlock]: block(BlockId.MoonshardBlock, "Moonshard Tile", "#6475a7", "Polished crystal masonry that glows after dusk.", {
    hardness: 3.2,
    emissive: 0.42,
  }),
  [BlockId.WayfinderBrazier]: block(BlockId.WayfinderBrazier, "Wayfinder Brazier", "#d47b42", "An old beacon that still burns without fuel.", {
    solid: false,
    hardness: 1.6,
    shape: "torch",
    emissive: 0.95,
  }),
  [BlockId.AshGlass]: block(BlockId.AshGlass, "Ashglass", "#9aa7ad", "Smoky translucent glass fused in volcanic heat.", {
    opaque: false,
    hardness: 0.45,
  }),
  [BlockId.PulseRepeater]: block(BlockId.PulseRepeater, "Pulse Repeater", "#9a644d", "Carries a full-strength signal forward after a configurable delay.", {
    solid: false, hardness: 0.35, shape: "plate", automation: "logic",
  }),
  [BlockId.FluxComparator]: block(BlockId.FluxComparator, "Flux Comparator", "#8f5a51", "Compares or subtracts rear and side signal strengths.", {
    solid: false, hardness: 0.4, shape: "plate", automation: "logic",
  }),
  [BlockId.InverterTorch]: block(BlockId.InverterTorch, "Inverter Torch", "#e35d52", "Emits a signal until its rear input is powered.", {
    solid: false, hardness: 0.15, shape: "torch", automation: "logic", emissive: 0.62,
  }),
  [BlockId.Observer]: block(BlockId.Observer, "Change Observer", "#68777d", "Pulses when the block in front of its sensing face changes.", {
    hardness: 1.7, shape: "observer", automation: "logic",
  }),
  [BlockId.AdhesiveRam]: block(BlockId.AdhesiveRam, "Adhesive Ram", "#65715f", "Pushes a block line and pulls the nearest block back on retraction.", {
    hardness: 2.2, shape: "piston", automation: "machine",
  }),
  [BlockId.PulseButton]: block(BlockId.PulseButton, "Pulse Button", "#b9855c", "A compact manual source that emits a short pulse.", {
    solid: false, hardness: 0.2, shape: "plate", automation: "source",
  }),
  [BlockId.PressurePlate]: block(BlockId.PressurePlate, "Presence Plate", "#a48867", "Outputs while a player, creature, or dropped item rests on it.", {
    solid: false, hardness: 0.25, shape: "plate", automation: "source",
  }),
  [BlockId.DaylightSensor]: block(BlockId.DaylightSensor, "Sun Dial", "#bc945c", "Outputs an analog signal based on daylight.", {
    solid: false, hardness: 0.45, shape: "plate", automation: "source",
  }),
  [BlockId.TargetBlock]: block(BlockId.TargetBlock, "Pulse Target", "#d8c69a", "Emits a pulse when used or struck.", {
    hardness: 0.8, automation: "source",
  }),
  [BlockId.LatchLamp]: block(BlockId.LatchLamp, "Memory Lamp", "#d6a957", "Toggles its lit state on each rising signal edge.", {
    hardness: 0.55, automation: "sink", emissive: 0.48,
  }),
  [BlockId.NoteEmitter]: block(BlockId.NoteEmitter, "Tone Block", "#8c6248", "Plays a synthesized tone on a rising signal.", {
    hardness: 0.9, tool: "axe", automation: "sink",
  }),
  [BlockId.FrostpineLog]: block(BlockId.FrostpineLog, "Frostpine Log", "#66584e", "Pale, tight-grained alpine timber.", {
    hardness: 1.35, tool: "axe",
  }),
  [BlockId.FrostpineLeaves]: block(BlockId.FrostpineLeaves, "Frostpine Needles", "#4f7270", "Cold blue-green alpine foliage.", {
    opaque: false, hardness: 0.24, tool: "none",
  }),
  [BlockId.FrostpinePlanks]: block(BlockId.FrostpinePlanks, "Frostpine Planks", "#aaa18c", "Clean pale planks cut from frostpine.", {
    hardness: 1.05, tool: "axe",
  }),
  [BlockId.Limestone]: block(BlockId.Limestone, "Cloud Limestone", "#b9b5a5", "Soft banded cave stone.", {
    hardness: 1.45,
  }),
  [BlockId.Marble]: block(BlockId.Marble, "Veiled Marble", "#d4d0c8", "Bright stone threaded with dark mineral veins.", {
    hardness: 2.1,
  }),
  [BlockId.Slate]: block(BlockId.Slate, "Deep Slate", "#424d58", "Layered stone compressed in the lower reaches.", {
    hardness: 2.7,
  }),
  [BlockId.CaveMushroom]: block(BlockId.CaveMushroom, "Coppercap", "#b76f49", "A broad cave fungus that grows on dry ledges.", {
    solid: false, opaque: false, hardness: 0.08, tool: "none", shape: "cross",
  }),
  [BlockId.GlowMushroom]: block(BlockId.GlowMushroom, "Lumenbell", "#58c9b4", "A luminous fungus found beside deep aquifers.", {
    solid: false, opaque: false, hardness: 0.08, tool: "none", shape: "cross", emissive: 0.55,
  }),
  [BlockId.CrystalSpike]: block(BlockId.CrystalSpike, "Aether Spike", "#78ded7", "A narrow crystal growth from resonant caverns.", {
    solid: false, opaque: false, hardness: 1.6, shape: "cross", emissive: 0.32,
  }),
  [BlockId.CaveMoss]: block(BlockId.CaveMoss, "Velvet Cave Moss", "#587756", "A soft mat that marks humid cave floors.", {
    solid: false, opaque: false, hardness: 0.05, tool: "none", shape: "plate",
  }),
  [BlockId.StoneSlab]: block(BlockId.StoneSlab, "Roughstone Slab", "#777b7d", "A half-height building slab.", {
    hardness: 1.5, shape: "slab", collisionHeight: 0.5,
  }),
  [BlockId.StoneStairs]: block(BlockId.StoneStairs, "Roughstone Steps", "#7d8182", "Two-tier stone steps.", {
    hardness: 1.7, shape: "stair", collisionHeight: 0.5,
  }),
  [BlockId.RopeLadder]: block(BlockId.RopeLadder, "Ember Rope Ladder", "#9d7048", "A slim climbing lattice for shafts and towers.", {
    solid: false, opaque: false, hardness: 0.2, tool: "axe", shape: "ladder",
  }),
  [BlockId.DeepLantern]: block(BlockId.DeepLantern, "Deep Lantern", "#e4bb62", "A caged lamp built for long cave expeditions.", {
    solid: false, hardness: 0.3, shape: "rod", emissive: 0.9,
  }),
  [BlockId.IronOre]: block(BlockId.IronOre, "Iron Ore", "#8b8580", "Dense iron nodules threaded through stone.", { hardness: 2.5 }),
  [BlockId.GoldOre]: block(BlockId.GoldOre, "Gold Ore", "#9d8954", "Rare gold locked inside deep rock.", { hardness: 3.1 }),
  [BlockId.FluxstoneOre]: block(BlockId.FluxstoneOre, "Fluxstone Ore", "#76505a", "Signal-bearing red crystal dust inside slate.", { hardness: 2.8, emissive: 0.16 }),
  [BlockId.DiamondOre]: block(BlockId.DiamondOre, "Diamond Ore", "#507b82", "Exceptionally hard crystal found near the deepstone floor.", { hardness: 4.2, emissive: 0.12 }),
  [BlockId.IronBlock]: block(BlockId.IronBlock, "Iron Block", "#aeb5b3", "A heavy block of refined iron.", { hardness: 3.4 }),
  [BlockId.GoldBlock]: block(BlockId.GoldBlock, "Gold Block", "#d5ae3f", "A brilliant block of refined gold.", { hardness: 3 }),
  [BlockId.DiamondBlock]: block(BlockId.DiamondBlock, "Diamond Block", "#5fc7c7", "A compact block of cut diamond.", { hardness: 5, emissive: 0.1 }),
  [BlockId.HearthFurnace]: block(BlockId.HearthFurnace, "Hearth Furnace", "#55504a", "A coal-fired furnace for smelting raw metal ores.", {
    hardness: 2.4, automation: "machine",
  }),
  [BlockId.FrontierBed]: block(BlockId.FrontierBed, "Frontier Bed", "#a44943", "A warm bed that advances night to dawn.", {
    hardness: 0.65, tool: "axe", shape: "bed", collisionHeight: 0.48,
  }),
  [BlockId.Riftstone]: block(BlockId.Riftstone, "Riftstone", "#24202d", "Volcanic glass that hums near dimensional fractures.", { hardness: 5.2 }),
  [BlockId.RiftGate]: block(BlockId.RiftGate, "Rift Gate", "#794fb2", "A stabilized doorway into the Emberdeep.", {
    solid: false, opaque: false, hardness: 3.5, shape: "portal", emissive: 0.82,
  }),
  [BlockId.Emberrock]: block(BlockId.Emberrock, "Emberrock", "#49343a", "Heat-scarred stone native to the Emberdeep.", { hardness: 2.7 }),
  [BlockId.EmberGlow]: block(BlockId.EmberGlow, "Ember Glowstone", "#d86d3f", "A porous stone that radiates a steady furnace glow.", { hardness: 1.1, emissive: 0.92 }),
  [BlockId.AshSoil]: block(BlockId.AshSoil, "Ash Soil", "#61575a", "Soft silver ash gathered in the Emberdeep.", { hardness: 0.5, tool: "spade" }),
  [BlockId.VillageWall]: block(BlockId.VillageWall, "Wayfarer Stucco", "#c7b58f", "Warm plaster used in Wayfarer cottages.", { hardness: 1.1 }),
  [BlockId.Thatch]: block(BlockId.Thatch, "Golden Thatch", "#b58c45", "Tightly bundled prairie grass for roofs.", { hardness: 0.45, tool: "axe" }),
  [BlockId.Cobblestone]: block(BlockId.Cobblestone, "Cobblestone", "#696d6c", "Irregular stone suited to foundations and hearths.", { hardness: 1.7 }),
  [BlockId.TimberFrame]: block(BlockId.TimberFrame, "Timber Frame", "#795039", "Decorative structural beams used in village homes.", { hardness: 1.2, tool: "axe" }),
  [BlockId.MarketCanopy]: block(BlockId.MarketCanopy, "Market Canopy", "#b85b4f", "Colorful woven cloth from a Wayfarer market.", {
    hardness: 0.35, tool: "axe", shape: "slab", collisionHeight: 0.24,
  }),
  [BlockId.TradePost]: block(BlockId.TradePost, "Trade Post", "#8a643f", "A carved counter where Wayfarers display their goods.", {
    hardness: 1, tool: "axe", automation: "storage",
  }),
  [BlockId.IronBars]: block(BlockId.IronBars, "Iron Bars", "#7d8b8c", "Narrow iron bars for windows and enclosures.", {
    opaque: false, hardness: 2.6, shape: "fence",
  }),
  [BlockId.TimberDoor]: block(BlockId.TimberDoor, "Timber Door", "#8b5b38", "A slim cottage door left open to travelers.", {
    solid: false, opaque: false, hardness: 0.9, tool: "axe", shape: "door",
  }),
  [BlockId.PlankSlab]: block(BlockId.PlankSlab, "Emberwood Slab", "#ad6c3e", "A half-height wooden building piece.", {
    hardness: 0.8, tool: "axe", shape: "slab", collisionHeight: 0.5,
  }),
  [BlockId.PlankStairs]: block(BlockId.PlankStairs, "Emberwood Steps", "#b87342", "Two-tier wooden steps.", {
    hardness: 0.9, tool: "axe", shape: "stair", collisionHeight: 0.5,
  }),
  [BlockId.Bookshelf]: block(BlockId.Bookshelf, "Wayfarer Bookshelf", "#79553c", "Shelves packed with weathered travel journals.", { hardness: 0.9, tool: "axe" }),
  [BlockId.WovenWool]: block(BlockId.WovenWool, "Woven Fleece", "#ded7ca", "A soft block woven from Glowgrazer fiber.", { hardness: 0.35, tool: "none" }),
  [BlockId.FiredBrick]: block(BlockId.FiredBrick, "Fired Brick", "#995446", "Clay brick hardened in a Hearth Furnace.", { hardness: 1.9 }),
  [BlockId.RoofTile]: block(BlockId.RoofTile, "Terracotta Roof Tile", "#a64d3f", "Weatherproof tile used on village roofs.", {
    hardness: 1.2, shape: "stair", collisionHeight: 0.5,
  }),
  [BlockId.RiftwoodLog]: block(BlockId.RiftwoodLog, "Riftwood Log", "#5f3c62", "Dark timber grown under an alien sky.", { hardness: 1.5, tool: "axe" }),
  [BlockId.RiftwoodLeaves]: block(BlockId.RiftwoodLeaves, "Riftwood Crown", "#694f82", "Violet foliage flecked with warm light.", { opaque: false, hardness: 0.22, tool: "none" }),
  [BlockId.RiftwoodPlanks]: block(BlockId.RiftwoodPlanks, "Riftwood Planks", "#805484", "Purple-grained boards cut from Riftwood.", { hardness: 1.1, tool: "axe" }),
  [BlockId.Emberflow]: block(BlockId.Emberflow, "Emberflow", "#d1492f", "A dangerous molten current in the Emberdeep.", {
    solid: false, opaque: false, liquid: true, hardness: 999, collectible: false, emissive: 0.88,
  }),
  [BlockId.TimberFence]: block(BlockId.TimberFence, "Timber Fence", "#8b5a37", "A post-and-rail boundary for farms and paths.", {
    opaque: false, hardness: 0.85, tool: "axe", shape: "fence",
  }),
  [BlockId.Gravel]: block(BlockId.Gravel, "River Gravel", "#77736e", "Loose rounded stone common near water and caves.", { hardness: 0.6, tool: "spade" }),
  [BlockId.PolishedStone]: block(BlockId.PolishedStone, "Polished Roughstone", "#929796", "Smooth stone dressed for precise construction.", { hardness: 2 }),
  [BlockId.GoldTrim]: block(BlockId.GoldTrim, "Gold-Inlaid Stone", "#82765b", "Polished masonry traced with refined gold.", { hardness: 2.6 }),
  [BlockId.GlassPane]: block(BlockId.GlassPane, "Clearglass Pane", "#a8dde1", "A slim glass window that joins neatly to nearby walls.", {
    opaque: false, hardness: 0.25, shape: "pane",
  }),
  [BlockId.TimberShutter]: block(BlockId.TimberShutter, "Timber Shutter", "#825336", "A narrow wooden shutter for cottage windows and workshop vents.", {
    solid: false, opaque: false, hardness: 0.75, tool: "axe", shape: "door",
  }),
  [BlockId.FlowerPot]: block(BlockId.FlowerPot, "Terracotta Planter", "#a85e45", "A small fired-clay planter for warm, lived-in interiors.", {
    solid: false, opaque: false, hardness: 0.35, shape: "column", collisionHeight: 0.42,
  }),
  [BlockId.CarvedStone]: block(BlockId.CarvedStone, "Carved Roughstone", "#858989", "Decorative masonry cut with a simple frontier knot.", { hardness: 2.1 }),
};

const LEAF_BLOCKS = new Set<BlockId>([
  BlockId.EmberwoodLeaves,
  BlockId.FrostpineLeaves,
  BlockId.RiftwoodLeaves,
]);

export function isLeafBlock(id: BlockId): boolean {
  return LEAF_BLOCKS.has(id);
}

export const BLOCK_IDS = Object.values(BlockId).filter(
  (value): value is BlockId => typeof value === "number",
);

export const itemForBlock = (id: BlockId): ItemId => `block:${id}`;

export function blockForItem(item: ItemId | null): BlockId | null {
  if (!item?.startsWith("block:")) return null;
  const id = Number(item.slice(6));
  return Number.isInteger(id) && BLOCKS[id as BlockId]
    ? (id as BlockId)
    : null;
}

export const ITEM_NAMES: Record<string, string> = {
  "tool:wood-pick": "Emberwood Pick",
  "tool:wood-hatchet": "Emberwood Hand Axe",
  "tool:wood-spade": "Emberwood Spade",
  "tool:wood-club": "Emberwood Club",
  "tool:rough-pick": "Roughstone Pick",
  "tool:copper-pick": "Copper Pick",
  "tool:crystal-pick": "Aether Pick",
  "tool:iron-pick": "Iron Pick",
  "tool:diamond-pick": "Diamond Pick",
  "tool:hatchet": "Emberwood Hatchet",
  "tool:spade": "Field Spade",
  "tool:blade": "Frontier Blade",
  "tool:stone-spear": "Roughstone Spear",
  "tool:copper-saber": "Copper Saber",
  "tool:aether-repeater": "Aether Repeater",
  "part:copper-ingot": "Copper Ingot",
  "part:coal": "Coal",
  "part:iron-ingot": "Iron Ingot",
  "part:gold-ingot": "Gold Ingot",
  "part:flux-dust": "Fluxstone Dust",
  "part:diamond": "Diamond",
  "part:soft-fiber": "Soft Fiber",
  "part:rift-core": "Rift Core",
  "part:flux-coil": "Flux Coil",
  "part:logic-wafer": "Logic Wafer",
  "part:gear": "Drive Gear",
  "part:moonshard": "Moonshard",
  "part:carapace": "Thornback Carapace",
  "part:cinder-core": "Cinder Core",
  "part:feather": "Feather",
  "currency:frontier-mark": "Frontier Mark",
  "ammo:aether-bolt": "Aether Bolt",
  "food:starfruit": "Starfruit",
  "food:glowcut": "Raw Beef",
  "food:pork": "Raw Pork",
  "food:chicken": "Raw Chicken",
  "consumable:mender-tonic": "Mender Tonic",
};

const ITEM_DESCRIPTIONS: Partial<Record<ItemId, string>> = {
  "tool:wood-pick": "An entry-level pick that harvests stone, coal, and other soft rock.",
  "tool:wood-hatchet": "Cuts logs and wooden blocks faster than an empty hand.",
  "tool:wood-spade": "Moves soil, sand, clay, and snow efficiently.",
  "tool:wood-club": "A simple close-range weapon for the first night.",
  "tool:rough-pick": "A stone-tier pick that can harvest copper, iron, and Fluxstone.",
  "tool:copper-pick": "A copper-tier pick capable of harvesting crystal ores.",
  "tool:crystal-pick": "A fast, resonant mining tool for late-game excavation.",
  "tool:iron-pick": "A durable pick required for gold, diamond, and Riftstone.",
  "tool:diamond-pick": "The strongest conventional pick, with exceptional mining power.",
  "tool:hatchet": "A reinforced axe for logs, planks, leaves, and wooden construction.",
  "tool:spade": "A reinforced digging tool for soft terrain blocks.",
  "tool:blade": "A quick close-range weapon with moderate damage.",
  "tool:stone-spear": "An early weapon with more reach than fists or clubs.",
  "tool:copper-saber": "A balanced melee weapon with strong damage and knockback.",
  "tool:aether-repeater": "A long-range launcher that consumes Aether Bolts.",
  "part:copper-ingot": "Refined conductive metal used throughout machines and logic components.",
  "part:coal": "Fuel for Hearth Furnaces and thermal machinery.",
  "part:iron-ingot": "Refined structural metal used for tools, bars, and advanced construction.",
  "part:gold-ingot": "A rare conductor used in decorative blocks and dimensional technology.",
  "part:flux-dust": "Signal-bearing mineral dust used in advanced logic work.",
  "part:diamond": "A rare deep crystal used for top-tier tools and Rift Gates.",
  "part:soft-fiber": "Sheep fleece used to craft beds, wool, and trade goods.",
  "part:rift-core": "A stabilized dimensional component required to craft a Rift Gate.",
  "part:flux-coil": "Converts and stores energy inside powered machines.",
  "part:logic-wafer": "A crafted circuit component for sensors and logic gates.",
  "part:gear": "Transfers mechanical force in drills, belts, and fabricators.",
  "part:moonshard": "A cut deep crystal used for ranged weapons and luminous devices.",
  "part:carapace": "Armored creature shell used in medicine and rugged components.",
  "part:cinder-core": "A volatile Emberdeep organ useful in heat-oriented crafting.",
  "part:feather": "A light chicken feather valued by farmers and fletchers.",
  "currency:frontier-mark": "Village currency. Earn Marks by selling useful goods and spend them with specialists.",
  "ammo:aether-bolt": "Ammunition consumed by the Aether Repeater.",
  "food:starfruit": "Restores a small amount of nutrition and health when used.",
  "food:glowcut": "Raw beef from cattle. Restores nutrition when eaten.",
  "food:pork": "Raw pork from pigs. Restores nutrition when eaten.",
  "food:chicken": "Raw chicken from chickens. Restores a little nutrition when eaten.",
  "consumable:mender-tonic": "A single-use tonic that restores a large amount of health.",
};

export const ALL_ITEMS: ItemId[] = [
  ...BLOCK_IDS.filter((id) => id !== BlockId.Air).map(itemForBlock),
  ...(Object.keys(ITEM_NAMES) as ItemId[]),
];

export function itemName(item: ItemId): string {
  const blockId = blockForItem(item);
  return blockId === null ? ITEM_NAMES[item] ?? item : BLOCKS[blockId].name;
}

export function itemDescription(item: ItemId): string {
  const blockId = blockForItem(item);
  if (blockId !== null) return BLOCKS[blockId].description;
  return ITEM_DESCRIPTIONS[item] ?? "A useful frontier resource.";
}

export const RECIPES: Recipe[] = [
  { id: "planks", name: "Cut Planks", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodLog)]: 1 }, output: { item: itemForBlock(BlockId.EmberwoodPlanks), count: 4 }, description: "Shape one log into four building planks." },
  { id: "stone-spear", name: "Roughstone Spear", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2, [itemForBlock(BlockId.Stone)]: 1 }, output: { item: "tool:stone-spear", count: 1 }, description: "An early reach weapon for surviving the first night." },
  { id: "workbench", name: "Tinker Bench", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 4 }, output: { item: itemForBlock(BlockId.Workbench), count: 1 }, description: "Required for engineered components." },
  { id: "wood-pick", name: "Emberwood Pick", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 3 }, output: { item: "tool:wood-pick", count: 1 }, description: "The first mining tool; harvests roughstone, coal, limestone, and slate." },
  { id: "wood-hatchet", name: "Emberwood Hand Axe", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 3 }, output: { item: "tool:wood-hatchet", count: 1 }, description: "A simple timber tool for faster logging." },
  { id: "wood-spade", name: "Emberwood Spade", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:wood-spade", count: 1 }, description: "An early tool for soil, clay, snow, and sand." },
  { id: "wood-club", name: "Emberwood Club", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:wood-club", count: 1 }, description: "Basic protection while preparing for the first night." },
  { id: "rough-pick", name: "Roughstone Pick", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2, [itemForBlock(BlockId.Stone)]: 3 }, output: { item: "tool:rough-pick", count: 1 }, description: "Mines stone and basic ores efficiently." },
  { id: "hatchet", name: "Emberwood Hatchet", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2, [itemForBlock(BlockId.Stone)]: 2 }, output: { item: "tool:hatchet", count: 1 }, description: "Fells timber and clears thornvine quickly." },
  { id: "spade", name: "Field Spade", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 2, [itemForBlock(BlockId.Stone)]: 1 }, output: { item: "tool:spade", count: 1 }, description: "Moves soil, sand and snow efficiently." },
  { id: "frontier-blade", name: "Frontier Blade", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 1, [itemForBlock(BlockId.Stone)]: 2 }, output: { item: "tool:blade", count: 1 }, description: "A compact defensive blade." },
  { id: "copper-ingot", name: "Smelt Copper", station: "furnace", inputs: { [itemForBlock(BlockId.CopperOre)]: 1 }, output: { item: "part:copper-ingot", count: 1 }, description: "Refine conductive copper." },
  { id: "copper-pick", name: "Copper Pick", station: "workbench", inputs: { "part:copper-ingot": 3, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:copper-pick", count: 1 }, description: "Reaches crystal-bearing depths." },
  { id: "copper-saber", name: "Copper Saber", station: "workbench", inputs: { "part:copper-ingot": 3, [itemForBlock(BlockId.EmberwoodPlanks)]: 1 }, output: { item: "tool:copper-saber", count: 1 }, description: "A balanced weapon with reliable stopping power." },
  { id: "moonshard", name: "Cut Moonshard", station: "workbench", inputs: { [itemForBlock(BlockId.MoonshardOre)]: 1 }, output: { item: "part:moonshard", count: 2 }, description: "Cut a deep crystal seam into usable shards." },
  { id: "aether-bolts", name: "Aether Bolts", station: "workbench", inputs: { "part:moonshard": 1, "part:copper-ingot": 1 }, output: { item: "ammo:aether-bolt", count: 8 }, description: "Bright, fast ammunition for an Aether Repeater." },
  { id: "aether-repeater", name: "Aether Repeater", station: "workbench", inputs: { "part:moonshard": 3, "part:flux-coil": 2, "part:gear": 1 }, output: { item: "tool:aether-repeater", count: 1 }, description: "A long-range crystal launcher built for dangerous ruins." },
  { id: "mender-tonic", name: "Mender Tonic", station: "hand", inputs: { "food:starfruit": 2, "part:carapace": 1 }, output: { item: "consumable:mender-tonic", count: 1 }, description: "Restores health when used from the hotbar." },
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
  { id: "pulse-repeater", name: "Pulse Repeater", station: "workbench", inputs: { "part:logic-wafer": 1, "part:copper-ingot": 2, [itemForBlock(BlockId.StoneSlab)]: 1 }, output: { item: itemForBlock(BlockId.PulseRepeater), count: 1 }, description: "Restores signal strength with a directional delay." },
  { id: "flux-comparator", name: "Flux Comparator", station: "workbench", inputs: { "part:logic-wafer": 2, "part:copper-ingot": 2, [itemForBlock(BlockId.AetherCrystal)]: 1 }, output: { item: itemForBlock(BlockId.FluxComparator), count: 1 }, description: "Compares rear and side analog signals." },
  { id: "inverter-torch", name: "Inverter Torch", station: "workbench", inputs: { "part:copper-ingot": 1, [itemForBlock(BlockId.GlowRod)]: 1 }, output: { item: itemForBlock(BlockId.InverterTorch), count: 2 }, description: "A compact normally-on inverter." },
  { id: "observer", name: "Change Observer", station: "workbench", inputs: { "part:logic-wafer": 2, [itemForBlock(BlockId.Stone)]: 4, [itemForBlock(BlockId.AetherCrystal)]: 1 }, output: { item: itemForBlock(BlockId.Observer), count: 1 }, description: "Pulses when its watched block changes." },
  { id: "ram", name: "Linear Ram", station: "workbench", inputs: { "part:gear": 2, "part:copper-ingot": 3, [itemForBlock(BlockId.StoneBrick)]: 3 }, output: { item: itemForBlock(BlockId.Ram), count: 1 }, description: "Pushes up to six movable blocks." },
  { id: "adhesive-ram", name: "Adhesive Ram", station: "workbench", inputs: { "part:gear": 2, "part:copper-ingot": 3, [itemForBlock(BlockId.Thornvine)]: 2 }, output: { item: itemForBlock(BlockId.AdhesiveRam), count: 1 }, description: "Pushes on extension and pulls on retraction." },
  { id: "button", name: "Pulse Button", station: "workbench", inputs: { [itemForBlock(BlockId.Stone)]: 1, "part:copper-ingot": 1 }, output: { item: itemForBlock(BlockId.PulseButton), count: 2 }, description: "Emits a short manual pulse." },
  { id: "pressure-plate", name: "Presence Plate", station: "workbench", inputs: { [itemForBlock(BlockId.StoneSlab)]: 1, "part:copper-ingot": 1 }, output: { item: itemForBlock(BlockId.PressurePlate), count: 1 }, description: "Detects players, creatures, and loose items." },
  { id: "daylight-sensor", name: "Sun Dial", station: "workbench", inputs: { [itemForBlock(BlockId.Glass)]: 2, "part:logic-wafer": 1, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: itemForBlock(BlockId.DaylightSensor), count: 1 }, description: "Measures daylight as signal strength." },
  { id: "hopper", name: "Collector Funnel", station: "workbench", inputs: { "part:copper-ingot": 4, [itemForBlock(BlockId.Crate)]: 1 }, output: { item: itemForBlock(BlockId.Hopper), count: 1 }, description: "Collects and transfers loose resources." },
  { id: "stone-slabs", name: "Roughstone Slabs", station: "hand", inputs: { [itemForBlock(BlockId.Stone)]: 3 }, output: { item: itemForBlock(BlockId.StoneSlab), count: 6 }, description: "Half-height pieces for compact construction." },
  { id: "stone-steps", name: "Roughstone Steps", station: "workbench", inputs: { [itemForBlock(BlockId.Stone)]: 4 }, output: { item: itemForBlock(BlockId.StoneStairs), count: 4 }, description: "Smooth two-tier steps." },
  { id: "frostpine-planks", name: "Cut Frostpine Planks", station: "hand", inputs: { [itemForBlock(BlockId.FrostpineLog)]: 1 }, output: { item: itemForBlock(BlockId.FrostpinePlanks), count: 4 }, description: "Cut pale alpine timber into planks." },
  { id: "deep-lantern", name: "Deep Lantern", station: "workbench", inputs: { [itemForBlock(BlockId.GlowRod)]: 1, "part:copper-ingot": 2, [itemForBlock(BlockId.Glass)]: 1 }, output: { item: itemForBlock(BlockId.DeepLantern), count: 1 }, description: "A bright caged light for cave expeditions." },
  { id: "hearth-furnace", name: "Hearth Furnace", station: "workbench", inputs: { [itemForBlock(BlockId.Stone)]: 8 }, output: { item: itemForBlock(BlockId.HearthFurnace), count: 1 }, description: "Burns coal to smelt iron, gold, copper, clay, and other raw materials." },
  { id: "iron-ingot", name: "Smelt Iron", station: "furnace", inputs: { [itemForBlock(BlockId.IronOre)]: 1, "part:coal": 1 }, output: { item: "part:iron-ingot", count: 1 }, description: "Refine raw iron ore in a Hearth Furnace." },
  { id: "gold-ingot", name: "Smelt Gold", station: "furnace", inputs: { [itemForBlock(BlockId.GoldOre)]: 1, "part:coal": 1 }, output: { item: "part:gold-ingot", count: 1 }, description: "Refine deep gold ore in a Hearth Furnace." },
  { id: "clear-glass", name: "Smelt Clearglass", station: "furnace", inputs: { [itemForBlock(BlockId.Sand)]: 1, "part:coal": 1 }, output: { item: itemForBlock(BlockId.Glass), count: 1 }, description: "Smelt sand in a Hearth Furnace to make clear window glass." },
  { id: "fired-brick", name: "Fire Clay", station: "furnace", inputs: { [itemForBlock(BlockId.Clay)]: 1, "part:coal": 1 }, output: { item: itemForBlock(BlockId.FiredBrick), count: 2 }, description: "Fire river clay into durable brick." },
  { id: "iron-pick", name: "Iron Pick", station: "workbench", inputs: { "part:iron-ingot": 3, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:iron-pick", count: 1 }, description: "A durable pick that can harvest gold, diamond, and Riftstone." },
  { id: "diamond-pick", name: "Diamond Pick", station: "workbench", inputs: { "part:diamond": 3, [itemForBlock(BlockId.EmberwoodPlanks)]: 2 }, output: { item: "tool:diamond-pick", count: 1 }, description: "The strongest conventional mining tool." },
  { id: "frontier-bed", name: "Frontier Bed", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 3, "part:soft-fiber": 3 }, output: { item: itemForBlock(BlockId.FrontierBed), count: 1 }, description: "Sleep through the dangerous hours and wake at dawn." },
  { id: "woven-fleece", name: "Woven Fleece", station: "workbench", inputs: { "part:soft-fiber": 4 }, output: { item: itemForBlock(BlockId.WovenWool), count: 1 }, description: "Compress soft fiber into a decorative building block." },
  { id: "iron-block", name: "Iron Block", station: "workbench", inputs: { "part:iron-ingot": 9 }, output: { item: itemForBlock(BlockId.IronBlock), count: 1 }, description: "Store refined iron in compact block form." },
  { id: "gold-block", name: "Gold Block", station: "workbench", inputs: { "part:gold-ingot": 9 }, output: { item: itemForBlock(BlockId.GoldBlock), count: 1 }, description: "A brilliant architectural block." },
  { id: "diamond-block", name: "Diamond Block", station: "workbench", inputs: { "part:diamond": 9 }, output: { item: itemForBlock(BlockId.DiamondBlock), count: 1 }, description: "A compact monument of cut diamond." },
  { id: "rift-gate", name: "Rift Gate", station: "workbench", inputs: { [itemForBlock(BlockId.Riftstone)]: 4, "part:gold-ingot": 2, "part:diamond": 1, "part:rift-core": 1 }, output: { item: itemForBlock(BlockId.RiftGate), count: 1 }, description: "An original dimensional gateway powered by a Wayfarer Rift Core." },
  { id: "plank-slabs", name: "Emberwood Slabs", station: "hand", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 3 }, output: { item: itemForBlock(BlockId.PlankSlab), count: 6 }, description: "Half-height wooden building pieces." },
  { id: "plank-steps", name: "Emberwood Steps", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 4 }, output: { item: itemForBlock(BlockId.PlankStairs), count: 4 }, description: "Smooth wooden steps for cottages and workshops." },
  { id: "timber-door", name: "Timber Door", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 6 }, output: { item: itemForBlock(BlockId.TimberDoor), count: 2 }, description: "A slim wooden doorway." },
  { id: "timber-fence", name: "Timber Fence", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 4 }, output: { item: itemForBlock(BlockId.TimberFence), count: 4 }, description: "Post-and-rail fencing for farms and paths." },
  { id: "bookshelf", name: "Bookshelf", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 6, "part:soft-fiber": 2 }, output: { item: itemForBlock(BlockId.Bookshelf), count: 1 }, description: "A shelf of stitched travel journals." },
  { id: "roof-tile", name: "Roof Tiles", station: "workbench", inputs: { [itemForBlock(BlockId.FiredBrick)]: 4 }, output: { item: itemForBlock(BlockId.RoofTile), count: 4 }, description: "Angled terracotta tiles for weatherproof roofs." },
  { id: "polished-stone", name: "Polished Roughstone", station: "workbench", inputs: { [itemForBlock(BlockId.Stone)]: 4 }, output: { item: itemForBlock(BlockId.PolishedStone), count: 4 }, description: "Dress rough stone into clean architectural blocks." },
  { id: "gold-trim", name: "Gold-Inlaid Stone", station: "workbench", inputs: { [itemForBlock(BlockId.PolishedStone)]: 4, "part:gold-ingot": 1 }, output: { item: itemForBlock(BlockId.GoldTrim), count: 4 }, description: "Decorative stone traced with refined gold." },
  { id: "riftwood-planks", name: "Cut Riftwood Planks", station: "hand", inputs: { [itemForBlock(BlockId.RiftwoodLog)]: 1 }, output: { item: itemForBlock(BlockId.RiftwoodPlanks), count: 4 }, description: "Cut alien timber into purple-grained boards." },
  { id: "glass-panes", name: "Clearglass Panes", station: "workbench", inputs: { [itemForBlock(BlockId.Glass)]: 6 }, output: { item: itemForBlock(BlockId.GlassPane), count: 16 }, description: "Cut smelted glass into slim, wall-friendly windows." },
  { id: "timber-shutters", name: "Timber Shutters", station: "workbench", inputs: { [itemForBlock(BlockId.EmberwoodPlanks)]: 4 }, output: { item: itemForBlock(BlockId.TimberShutter), count: 2 }, description: "Craft decorative shutters for windows and vents." },
  { id: "flower-pot", name: "Terracotta Planter", station: "workbench", inputs: { [itemForBlock(BlockId.FiredBrick)]: 3 }, output: { item: itemForBlock(BlockId.FlowerPot), count: 1 }, description: "A compact planter for furnished homes." },
  { id: "carved-stone", name: "Carved Roughstone", station: "workbench", inputs: { [itemForBlock(BlockId.StoneBrick)]: 4 }, output: { item: itemForBlock(BlockId.CarvedStone), count: 4 }, description: "Carve fitted stone into decorative masonry." },
];

export const TOOL_POWER: Record<string, number> = {
  "tool:wood-pick": 1.45,
  "tool:wood-hatchet": 1.75,
  "tool:wood-spade": 1.65,
  "tool:wood-club": 0.9,
  "tool:rough-pick": 2.1,
  "tool:copper-pick": 3.4,
  "tool:crystal-pick": 5.2,
  "tool:iron-pick": 4.25,
  "tool:diamond-pick": 6.2,
  "tool:hatchet": 3,
  "tool:spade": 3,
  "tool:blade": 1.25,
  "tool:stone-spear": 0.8,
  "tool:copper-saber": 1.1,
  "tool:aether-repeater": 0.45,
};

const TILE_SIZE = 16;
const ATLAS_COLS = 8;

function textureDetail(blockId: BlockId, x: number, y: number): number {
  const oreSpark = hash3(x * 3, y * 5, blockId, 719) % 23 === 0;
  switch (blockId) {
    case BlockId.Turf: return y < 4 ? 0.22 : (x + y) % 7 === 0 ? 0.08 : 0;
    case BlockId.Soil: return (x * 3 + y * 5) % 17 === 0 ? 0.14 : 0;
    case BlockId.Stone: return x === (y * 3 + 4) % 16 || x === (y * 3 + 5) % 16 ? -0.12 : 0;
    case BlockId.Sand: return (x * 7 + y * 3) % 19 === 0 ? 0.18 : 0;
    case BlockId.Snow: return x === 7 || y === 7 || x === y || x + y === 15 ? 0.08 : 0;
    case BlockId.Water: return y % 5 === 1 && (x + Math.floor(y / 5) * 3) % 7 < 4 ? 0.18 : -0.03;
    case BlockId.EmberwoodLog: return x % 4 === 0 ? -0.16 : y % 7 === 0 ? 0.1 : 0;
    case BlockId.EmberwoodLeaves: return (x * 5 + y * 7) % 13 === 0 ? 0.18 : 0;
    case BlockId.CoalOre: return oreSpark ? -0.36 : 0;
    case BlockId.CopperOre: return oreSpark || (x + y * 2) % 29 === 0 ? 0.28 : -0.03;
    case BlockId.AetherCrystal: return x === 7 || x === 8 || Math.abs(x - 7) === Math.abs(y - 8) ? 0.28 : -0.04;
    case BlockId.EmberwoodPlanks: return y % 5 === 0 ? -0.13 : x % 9 === 0 ? 0.08 : 0;
    case BlockId.StoneBrick: return y === 5 || y === 11 || x === (y < 6 ? 7 : y < 12 ? 3 : 11) ? -0.16 : 0;
    case BlockId.Glass: return x === y || x === y + 1 || x + y === 8 ? 0.25 : -0.08;
    case BlockId.Workbench: return y < 4 || x === 3 || x === 12 ? 0.14 : (x + y) % 6 === 0 ? -0.1 : 0;
    case BlockId.FluxWire: return x === 7 || x === 8 || y === 7 || y === 8 ? 0.28 : -0.1;
    case BlockId.Toggle: return (x >= 7 && x <= 9 && y >= 3 && y <= 12) || (y >= 10 && x >= 4 && x <= 12) ? 0.24 : -0.07;
    case BlockId.FluxLamp: return Math.abs(x - 7.5) + Math.abs(y - 7.5) < 6 ? 0.32 : -0.09;
    case BlockId.ThermalGenerator: return y > 9 && x > 3 && x < 12 ? 0.19 : (x + y) % 6 === 0 ? -0.14 : 0;
    case BlockId.FluxCell: return x > 4 && x < 11 && y > 2 && y < 13 ? 0.18 + (y > 8 ? 0.08 : 0) : -0.1;
    case BlockId.BoreDrill: return Math.abs(x - 8) <= Math.floor(y / 4) && y > 3 ? 0.2 : -0.08;
    case BlockId.Conveyor: return y % 6 === 2 || (x + y) % 9 === 0 ? 0.18 : -0.08;
    case BlockId.ArcFurnace: return x > 4 && x < 11 && y > 6 && y < 13 ? 0.25 : (x + y) % 5 === 0 ? -0.11 : 0;
    case BlockId.Fabricator: return (x === 4 || x === 11 || y === 4 || y === 11) ? 0.2 : -0.04;
    case BlockId.Ram: return (y > 6 && y < 10) || x === 12 ? 0.18 : -0.08;
    case BlockId.ProximitySensor: return Math.abs(x - 8) + Math.abs(y - 8) === 5 || (x === 8 && y === 8) ? 0.3 : -0.07;
    case BlockId.AndGate: return (x === 4 || x === 11) && y < 9 ? 0.24 : y === 9 ? 0.18 : -0.08;
    case BlockId.OrGate: return (x + y) % 8 === 0 || (x - y + 16) % 9 === 0 ? 0.23 : -0.07;
    case BlockId.NotGate: return Math.abs(x - 8) + Math.abs(y - 8) < 4 ? 0.2 : x === 12 ? 0.24 : -0.08;
    case BlockId.DelayGate: return (x === 4 || x === 11 || y === 4 || y === 11) && (x + y) % 3 ? 0.2 : -0.07;
    case BlockId.Hopper: return y > 4 && y < 10 && Math.abs(x - 8) < (10 - y) ? 0.18 : -0.09;
    case BlockId.Crate: return x === 2 || x === 13 || y === 2 || y === 13 || x === y || x + y === 15 ? -0.16 : 0.08;
    case BlockId.GlowRod: return x > 5 && x < 10 ? 0.35 : -0.12;
    case BlockId.Basalt: return x % 5 === 0 || x % 5 === 1 ? -0.14 : y % 9 === 0 ? 0.08 : 0;
    case BlockId.Ice: return x === y || x + y === 15 || x === y + 6 ? 0.22 : -0.04;
    case BlockId.Clay: return y % 4 === 0 ? -0.11 : (x * 5 + y) % 21 === 0 ? 0.1 : 0;
    case BlockId.SunCactus: return x % 5 === 2 ? 0.17 : y % 7 === 0 ? -0.1 : 0;
    case BlockId.StarBloom: return Math.abs(x - 8) + Math.abs(y - 8) < 5 || x === 8 || y === 8 ? 0.23 : -0.12;
    case BlockId.Bedrock: return (x * 7 + y * 11) % 13 < 3 ? -0.18 : 0.05;
    case BlockId.CopperBlock: return x === 1 || x === 14 || y === 1 || y === 14 || (x + y) % 11 === 0 ? 0.18 : -0.04;
    case BlockId.Cinnabar: return oreSpark || x === (y * 2) % 15 ? 0.24 : -0.07;
    case BlockId.SulfurStone: return oreSpark || (x + y) % 13 === 0 ? 0.26 : -0.06;
    case BlockId.MoonshardOre: return oreSpark || x === 7 || x === 8 || (x + y) % 17 === 0 ? 0.32 : -0.08;
    case BlockId.Mossstone: return y < 5 && (x + y) % 3 !== 0 ? 0.17 : (x * 3 + y) % 19 === 0 ? -0.12 : 0;
    case BlockId.RuinStone: return y === 5 || y === 11 || x === (y < 6 ? 5 : y < 12 ? 11 : 3) ? -0.17 : (x + y) % 13 === 0 ? 0.09 : 0;
    case BlockId.RelicCache: return x === 2 || x === 13 || y === 3 || y === 12 || x === y || x + y === 15 ? 0.17 : -0.08;
    case BlockId.Thornvine: return x === y || x + y === 15 || (x * 5 + y * 3) % 17 === 0 ? 0.2 : -0.1;
    case BlockId.MoonshardBlock: return x === 7 || x === 8 || y === 7 || y === 8 || x === y || x + y === 15 ? 0.26 : -0.06;
    case BlockId.WayfinderBrazier: return y > 4 && Math.abs(x - 8) < Math.max(2, 8 - y / 2) ? 0.34 : -0.13;
    case BlockId.AshGlass: return x === y + 3 || x + y === 12 || (x + y) % 19 === 0 ? 0.2 : -0.09;
    case BlockId.PulseRepeater: return y === 7 || y === 8 || (x === 5 && y > 4 && y < 12) ? 0.24 : -0.08;
    case BlockId.FluxComparator: return x === 4 || x === 11 || (y === 8 && x > 4 && x < 12) ? 0.23 : -0.09;
    case BlockId.InverterTorch: return x > 6 && x < 10 && y > 2 ? 0.32 : -0.12;
    case BlockId.Observer: return Math.hypot(x - 8, y - 8) < 4 ? 0.22 : (x + y) % 8 === 0 ? -0.12 : 0;
    case BlockId.AdhesiveRam: return (x > 3 && x < 12 && y > 3 && y < 12) ? 0.13 : -0.1;
    case BlockId.PulseButton: return Math.abs(x - 8) + Math.abs(y - 8) < 5 ? 0.28 : -0.1;
    case BlockId.PressurePlate: return x === 2 || x === 13 || y === 2 || y === 13 ? 0.18 : -0.04;
    case BlockId.DaylightSensor: return (x + y) % 4 === 0 ? 0.19 : -0.08;
    case BlockId.TargetBlock: return Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 4 < 2 ? 0.2 : -0.14;
    case BlockId.LatchLamp: return Math.abs(x - 7.5) + Math.abs(y - 7.5) < 7 ? 0.28 : -0.11;
    case BlockId.NoteEmitter: return (x - 8) ** 2 + (y - 8) ** 2 < 20 ? -0.18 : (x + y) % 7 === 0 ? 0.12 : 0;
    case BlockId.FrostpineLog: return x % 3 === 0 ? -0.12 : y % 6 === 0 ? 0.09 : 0;
    case BlockId.FrostpineLeaves: return (x * 7 + y * 3) % 11 === 0 ? 0.17 : -0.02;
    case BlockId.FrostpinePlanks: return y % 4 === 0 ? -0.12 : x % 7 === 0 ? 0.08 : 0;
    case BlockId.Limestone: return y % 5 === 0 || y % 5 === 1 ? -0.08 : (x + y) % 17 === 0 ? 0.1 : 0;
    case BlockId.Marble: return Math.abs(x - ((y * 5 + 3) % 16)) < 2 ? -0.16 : 0.04;
    case BlockId.Slate: return y % 3 === 0 ? -0.1 : x % 9 === 0 ? 0.08 : 0;
    case BlockId.CaveMushroom: return y < 7 ? 0.2 : x > 6 && x < 10 ? -0.03 : -0.12;
    case BlockId.GlowMushroom: return y < 8 ? 0.29 : x > 6 && x < 10 ? 0.08 : -0.13;
    case BlockId.CrystalSpike: return Math.abs(x - 8) < Math.max(1, y / 5) ? 0.28 : -0.12;
    case BlockId.CaveMoss: return (x * 3 + y * 7) % 9 < 3 ? 0.16 : -0.07;
    case BlockId.StoneSlab: return y === 7 || (x + y) % 13 === 0 ? -0.13 : 0;
    case BlockId.StoneStairs: return y === 5 || y === 10 || x === 8 ? -0.13 : 0.03;
    case BlockId.RopeLadder: return x === 3 || x === 12 || y % 5 === 0 ? 0.17 : -0.13;
    case BlockId.DeepLantern: return (x > 4 && x < 12 && y > 3 && y < 13) ? 0.32 : -0.13;
    case BlockId.IronOre: return oreSpark || (x * 5 + y * 3) % 31 < 2 ? 0.24 : -0.05;
    case BlockId.GoldOre: return oreSpark || (x + y * 4) % 27 < 2 ? 0.35 : -0.07;
    case BlockId.FluxstoneOre: return x === (y * 3 + 2) % 16 || x === (y * 3 + 3) % 16 ? 0.34 : -0.08;
    case BlockId.DiamondOre: return oreSpark || Math.abs(x - y) === 2 || (x + y) % 23 === 0 ? 0.37 : -0.08;
    case BlockId.IronBlock: return x === 2 || x === 13 || y === 2 || y === 13 ? 0.12 : (x + y) % 10 === 0 ? -0.08 : 0;
    case BlockId.GoldBlock: return x === 1 || x === 14 || y === 1 || y === 14 ? 0.18 : (x * 3 + y) % 17 === 0 ? -0.09 : 0.04;
    case BlockId.DiamondBlock: return x === y || x + y === 15 || x === 7 || y === 8 ? 0.22 : -0.05;
    case BlockId.HearthFurnace: return x > 3 && x < 12 && y > 7 && y < 13 ? 0.24 : (x + y) % 6 === 0 ? -0.13 : 0;
    case BlockId.FrontierBed: return y % 4 === 0 ? -0.12 : (x + y) % 13 === 0 ? 0.1 : 0;
    case BlockId.Riftstone: return (x * 7 + y * 11) % 19 < 3 ? 0.16 : (x + y) % 7 === 0 ? -0.12 : 0;
    case BlockId.RiftGate: return Math.abs(x - 7.5) < 2 || Math.abs(y - 7.5) < 2 ? 0.3 : Math.sin((x + y) * 1.7) * 0.08;
    case BlockId.Emberrock: return x % 5 === 0 || (x + y * 2) % 13 === 0 ? -0.14 : y % 7 === 0 ? 0.09 : 0;
    case BlockId.EmberGlow: return Math.abs(x - 7.5) + Math.abs(y - 7.5) < 7 ? 0.28 : (x + y) % 5 === 0 ? 0.12 : -0.08;
    case BlockId.AshSoil: return (x * 3 + y * 7) % 17 === 0 ? 0.14 : (x + y) % 9 === 0 ? -0.08 : 0;
    case BlockId.VillageWall: return (x + y * 3) % 23 === 0 ? -0.1 : y < 2 ? 0.08 : 0;
    case BlockId.Thatch: return (x + y) % 4 === 0 || (x - y + 16) % 7 === 0 ? 0.13 : -0.04;
    case BlockId.Cobblestone: return (x * 5 + y * 7) % 11 < 2 ? -0.14 : (x + y) % 13 === 0 ? 0.1 : 0;
    case BlockId.TimberFrame: return x < 3 || x > 12 || y < 3 || y > 12 || x === y ? -0.14 : 0.08;
    case BlockId.MarketCanopy: return Math.floor(x / 3) % 2 === 0 ? 0.16 : -0.08;
    case BlockId.TradePost: return x === 2 || x === 13 || y === 4 || y === 11 || x + y === 15 ? 0.14 : -0.08;
    case BlockId.IronBars: return x % 5 === 2 || y % 5 === 2 ? 0.18 : -0.13;
    case BlockId.TimberDoor: return x === 2 || x === 13 || y === 2 || y === 13 || (x === 10 && y > 7) ? 0.15 : -0.07;
    case BlockId.PlankSlab:
    case BlockId.PlankStairs: return y % 5 === 0 ? -0.13 : x % 8 === 0 ? 0.08 : 0;
    case BlockId.Bookshelf: return x === 2 || x === 13 || y % 5 === 0 ? -0.15 : (x + y) % 4 === 0 ? 0.18 : -0.02;
    case BlockId.WovenWool: return (x + y) % 5 === 0 || (x - y + 16) % 6 === 0 ? 0.09 : -0.03;
    case BlockId.FiredBrick: return y === 5 || y === 11 || x === (y < 6 ? 7 : y < 12 ? 3 : 11) ? -0.18 : 0.04;
    case BlockId.RoofTile: return (x + y) % 6 < 2 ? -0.12 : y % 5 === 0 ? 0.11 : 0;
    case BlockId.RiftwoodLog: return x % 4 === 0 ? -0.15 : (x + y) % 11 === 0 ? 0.14 : 0;
    case BlockId.RiftwoodLeaves: return (x * 7 + y * 5) % 11 < 2 ? 0.2 : -0.03;
    case BlockId.RiftwoodPlanks: return y % 4 === 0 ? -0.13 : x % 7 === 0 ? 0.12 : 0;
    case BlockId.Emberflow: return y % 4 === 1 && (x + Math.floor(y / 4) * 2) % 6 < 4 ? 0.28 : -0.04;
    case BlockId.TimberFence: return x === 4 || x === 11 || y % 6 === 0 ? 0.14 : -0.1;
    case BlockId.Gravel: return (x * 11 + y * 5) % 17 < 4 ? -0.12 : (x + y) % 9 === 0 ? 0.1 : 0;
    case BlockId.PolishedStone: return x === 1 || x === 14 || y === 1 || y === 14 ? -0.08 : (x + y) % 19 === 0 ? 0.07 : 0;
    case BlockId.GoldTrim: return x === y || x + y === 15 || x === 7 || y === 7 ? 0.26 : -0.07;
    case BlockId.GlassPane: return x === y || x + y === 15 || x === 1 || x === 14 ? 0.24 : -0.09;
    case BlockId.TimberShutter: return x % 4 === 1 || y === 2 || y === 13 ? -0.14 : 0.08;
    case BlockId.FlowerPot: return y === 4 || y === 11 || x === 3 || x === 12 ? -0.15 : 0.05;
    case BlockId.CarvedStone: return Math.abs(x - 7.5) + Math.abs(y - 7.5) < 5 || x === y || x + y === 15 ? -0.14 : 0.05;
    default: return 0;
  }
}

function plantPixel(blockId: BlockId, x: number, y: number): boolean {
  if (blockId === BlockId.StarBloom) {
    const stem = x >= 7 && x <= 8 && y >= 7;
    const petals = Math.abs(x - 7.5) + Math.abs(y - 5.5) <= 4.2 || ((x === 3 || x === 12) && y >= 4 && y <= 7);
    return stem || petals;
  }
  if (blockId === BlockId.CaveMushroom || blockId === BlockId.GlowMushroom) {
    const cap = y >= 3 && y <= 7 && Math.abs(x - 7.5) <= 6 - Math.abs(y - 5);
    const stem = x >= 6 && x <= 9 && y >= 7;
    return cap || stem;
  }
  if (blockId === BlockId.CrystalSpike) {
    return y >= 1 && Math.abs(x - 7.5) <= Math.max(0.8, (y - 1) * 0.32);
  }
  if (blockId === BlockId.Thornvine) {
    return Math.abs(x - y) <= 1 || Math.abs(x + y - 15) <= 1 || (x + y * 3) % 17 === 0;
  }
  return true;
}

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
      const offset = noise + textureDetail(blockId, x, y);
      const index = (y * TILE_SIZE + x) * 4;
      image.data[index] = Math.max(0, Math.min(255, (base.r + offset) * 255));
      image.data[index + 1] = Math.max(0, Math.min(255, (base.g + offset) * 255));
      image.data[index + 2] = Math.max(0, Math.min(255, (base.b + offset) * 255));
      const cutoutLeaves = isLeafBlock(blockId) && hash3(x, y, blockId, 17) % 9 === 0;
      const cutoutPlant = BLOCKS[blockId].shape === "cross" && !plantPixel(blockId, x, y);
      image.data[index + 3] = cutoutLeaves || cutoutPlant ? 0 : 255;
    }
  }
  context.putImageData(image, column * TILE_SIZE, row * TILE_SIZE);
}

function paintAutomationItemIcon(
  context: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  blockId: BlockId,
): boolean {
  const definition = BLOCKS[blockId];
  if (!definition.automation) return false;
  const shape = definition.shape ?? "cube";
  context.save();
  context.lineCap = "square";
  context.lineJoin = "miter";

  if (shape === "wire") {
    context.strokeStyle = "#351d22";
    context.lineWidth = 9;
    context.beginPath();
    context.moveTo(5, 24); context.lineTo(43, 24);
    context.moveTo(24, 5); context.lineTo(24, 43);
    context.stroke();
    context.strokeStyle = definition.color;
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = "#ff9a7c";
    context.fillRect(20, 20, 8, 8);
    context.restore();
    return true;
  }

  if (shape === "torch") {
    context.fillStyle = "#38252a";
    context.fillRect(20, 14, 10, 31);
    context.fillStyle = definition.color;
    context.fillRect(22, 15, 6, 29);
    context.fillStyle = "#ffcf76";
    context.beginPath(); context.arc(25, 12, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#ff6a55";
    context.beginPath(); context.arc(25, 12, 5, 0, Math.PI * 2); context.fill();
    context.restore();
    return true;
  }

  const low = shape === "plate";
  context.fillStyle = "#182226";
  context.beginPath();
  context.moveTo(4, low ? 18 : 12);
  context.lineTo(24, low ? 7 : 2);
  context.lineTo(44, low ? 18 : 12);
  context.lineTo(44, low ? 33 : 39);
  context.lineTo(24, 46);
  context.lineTo(4, low ? 33 : 39);
  context.closePath();
  context.fill();
  context.save();
  context.beginPath();
  context.moveTo(7, low ? 19 : 13);
  context.lineTo(24, low ? 10 : 5);
  context.lineTo(41, low ? 19 : 13);
  context.lineTo(24, low ? 31 : 24);
  context.closePath();
  context.clip();
  context.drawImage(tile, 4, 4, 40, 36);
  context.restore();
  if (!low) {
    context.fillStyle = "rgba(4,10,13,.43)";
    context.beginPath(); context.moveTo(7,13); context.lineTo(24,24); context.lineTo(24,43); context.lineTo(7,37); context.closePath(); context.fill();
    context.fillStyle = "rgba(1,5,8,.6)";
    context.beginPath(); context.moveTo(41,13); context.lineTo(24,24); context.lineTo(24,43); context.lineTo(41,37); context.closePath(); context.fill();
  }

  const line = (color = "#d8fff5", width = 3) => {
    context.strokeStyle = color;
    context.lineWidth = width;
  };
  const node = (x: number, y: number, color = "#ff825f", radius = 3) => {
    context.fillStyle = "#172125";
    context.beginPath(); context.arc(x, y, radius + 1.5, 0, Math.PI * 2); context.fill();
    context.fillStyle = color;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  };
  context.font = "900 16px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";

  switch (blockId) {
    case BlockId.Toggle:
      line("#f4c56f", 4); context.beginPath(); context.moveTo(18,29); context.lineTo(31,15); context.stroke(); node(16,31); node(33,14, "#74eee1"); break;
    case BlockId.FluxLamp:
    case BlockId.LatchLamp:
      context.fillStyle = blockId === BlockId.LatchLamp ? "#ffe374" : "#fff0a1"; context.fillRect(15,12,18,18); line("#59471f",2); context.strokeRect(15,12,18,18); context.fillStyle = "#604b25"; context.fillText(blockId === BlockId.LatchLamp ? "L" : "✦",24,22); break;
    case BlockId.ThermalGenerator:
    case BlockId.ArcFurnace:
    case BlockId.HearthFurnace:
      context.fillStyle = "#ff8a4c"; context.beginPath(); context.moveTo(24,10); context.quadraticCurveTo(36,22,25,34); context.quadraticCurveTo(12,27,24,10); context.fill(); context.fillStyle="#ffe17e"; context.beginPath(); context.moveTo(24,19); context.quadraticCurveTo(29,25,23,31); context.quadraticCurveTo(18,26,24,19); context.fill(); break;
    case BlockId.FluxCell:
      context.fillStyle="#25383c"; context.fillRect(13,10,22,25); context.fillStyle="#78eee3"; context.fillRect(17,14,14,17); context.fillStyle="#f6cc63"; context.fillRect(20,7,8,4); context.fillStyle="#173438"; context.fillRect(22,16,4,7); context.fillRect(19,19,10,3); break;
    case BlockId.BoreDrill:
      context.fillStyle="#d9e0dc"; context.beginPath(); context.moveTo(24,39); context.lineTo(14,17); context.lineTo(34,17); context.closePath(); context.fill(); line("#56666b",2); context.beginPath(); context.moveTo(17,22); context.lineTo(31,22); context.moveTo(20,28); context.lineTo(28,28); context.stroke(); break;
    case BlockId.Conveyor:
      line("#80e9dd",3); context.beginPath(); context.moveTo(10,26); context.lineTo(31,15); context.moveTo(28,12); context.lineTo(34,14); context.lineTo(32,21); context.moveTo(16,33); context.lineTo(37,22); context.stroke(); break;
    case BlockId.Fabricator:
      node(24,22,"#f4bf67",7); context.fillStyle="#233238"; context.beginPath(); context.arc(24,22,3,0,Math.PI*2); context.fill(); for(let a=0;a<8;a+=1){const angle=a*Math.PI/4; context.save(); context.translate(24+Math.cos(angle)*9,22+Math.sin(angle)*9); context.rotate(angle); context.fillStyle="#f4bf67"; context.fillRect(-2,-4,4,8); context.restore();} break;
    case BlockId.Ram:
    case BlockId.AdhesiveRam:
      line(blockId === BlockId.AdhesiveRam ? "#9ee37a" : "#d7d9d4",5); context.beginPath(); context.moveTo(10,23); context.lineTo(33,23); context.stroke(); context.fillStyle=blockId === BlockId.AdhesiveRam ? "#75b65a" : "#b9a37d"; context.fillRect(31,14,7,18); break;
    case BlockId.Hopper:
      context.fillStyle="#b6c0bf"; context.beginPath(); context.moveTo(10,12); context.lineTo(38,12); context.lineTo(29,27); context.lineTo(29,37); context.lineTo(20,37); context.lineTo(20,27); context.closePath(); context.fill(); line("#26363a",2); context.stroke(); context.fillStyle="#75e0d5"; context.beginPath(); context.moveTo(29,32); context.lineTo(39,32); context.lineTo(35,28); context.moveTo(39,32); context.lineTo(35,36); context.stroke(); break;
    case BlockId.Observer:
      context.fillStyle="#d8e6e4"; context.beginPath(); context.ellipse(24,21,12,8,0,0,Math.PI*2); context.fill(); node(24,21,"#26363d",5); node(24,21,"#79f3e5",2); line("#ff795e",3); context.beginPath(); context.moveTo(12,34); context.lineTo(35,34); context.lineTo(30,29); context.moveTo(35,34); context.lineTo(30,39); context.stroke(); break;
    case BlockId.PulseRepeater:
    case BlockId.DelayGate:
      line("#ff8b68",3); context.beginPath(); context.moveTo(10,23); context.lineTo(38,23); context.lineTo(33,18); context.moveTo(38,23); context.lineTo(33,28); context.stroke(); node(18,18,"#ffe18a"); node(29,28,"#ffe18a"); break;
    case BlockId.FluxComparator:
      node(15,18,"#ffe18a"); node(33,18,"#ffe18a"); node(24,29,"#ff755d"); line("#8ff4e8",2); context.beginPath(); context.moveTo(15,18); context.lineTo(24,29); context.lineTo(33,18); context.stroke(); break;
    case BlockId.ProximitySensor:
      node(17,28,"#8ff4e8",2); line("#b8fff7",2); context.beginPath(); context.arc(17,28,8,-1.3,.15); context.arc(17,28,14,-1.3,.15); context.stroke(); break;
    case BlockId.AndGate: context.fillStyle="#ddfff8"; context.fillText("&",24,22); break;
    case BlockId.OrGate: context.fillStyle="#ddfff8"; context.fillText("≥",24,22); break;
    case BlockId.NotGate: context.fillStyle="#ddfff8"; context.fillText("!",24,22); node(34,22,"#ff8066",2); break;
    case BlockId.PulseButton: node(24,22,"#f1c37d",7); break;
    case BlockId.PressurePlate: line("#f2d39b",2); context.strokeRect(12,13,24,17); context.fillStyle="#f2d39b"; context.fillText("↓",24,21); break;
    case BlockId.DaylightSensor: context.fillStyle="#ffd86c"; context.beginPath(); context.arc(24,21,7,0,Math.PI*2); context.fill(); line("#ffd86c",2); for(let a=0;a<8;a+=1){const angle=a*Math.PI/4; context.beginPath(); context.moveTo(24+Math.cos(angle)*10,21+Math.sin(angle)*10); context.lineTo(24+Math.cos(angle)*14,21+Math.sin(angle)*14); context.stroke();} break;
    case BlockId.TargetBlock: line("#fff0d6",3); context.beginPath(); context.arc(24,22,12,0,Math.PI*2); context.arc(24,22,6,0,Math.PI*2); context.stroke(); node(24,22,"#ff6d56",2); break;
    case BlockId.NoteEmitter: context.fillStyle="#fff0aa"; context.font="900 22px serif"; context.fillText("♪",24,22); break;
    default:
      context.fillStyle="#d8fff5"; context.fillText("◆",24,22); break;
  }
  context.restore();
  return true;
}

export function paintBlockItemIcon(canvas: HTMLCanvasElement, blockId: BlockId): void {
  const tile = document.createElement("canvas");
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileContext = tile.getContext("2d", { alpha: true });
  const context = canvas.getContext("2d", { alpha: true });
  if (!tileContext || !context) return;
  tileContext.imageSmoothingEnabled = false;
  paintTile(tileContext, 0, BLOCKS[blockId].color, blockId);
  canvas.width = 48;
  canvas.height = 48;
  context.clearRect(0, 0, 48, 48);
  context.imageSmoothingEnabled = false;

  if (paintAutomationItemIcon(context, tile, blockId)) return;

  const shape = BLOCKS[blockId].shape ?? "cube";
  if (shape === "cross") {
    context.drawImage(tile, 4, 3, 40, 42);
    return;
  }
  if (shape === "portal") {
    context.shadowColor = BLOCKS[blockId].color;
    context.shadowBlur = 8;
    context.drawImage(tile, 11, 2, 26, 44);
    context.strokeStyle = "#2b2035";
    context.lineWidth = 4;
    context.strokeRect(9, 1, 30, 46);
    return;
  }
  if (shape === "torch" || shape === "rod" || shape === "column") {
    const width = shape === "column" ? 22 : 13;
    context.drawImage(tile, 24 - width / 2, 4, width, 41);
    context.strokeStyle = "rgba(18, 23, 25, .9)";
    context.lineWidth = 2;
    context.strokeRect(24 - width / 2, 4, width, 41);
    return;
  }
  if (shape === "door" || shape === "ladder" || shape === "pane") {
    context.drawImage(tile, 9, 3, 30, 42);
    return;
  }
  if (shape === "fence") {
    context.drawImage(tile, 20, 3, 9, 43);
    context.drawImage(tile, 5, 16, 38, 8);
    context.drawImage(tile, 5, 31, 38, 8);
    return;
  }

  const shadeTile = (alpha: number): HTMLCanvasElement => {
    const shaded = document.createElement("canvas");
    shaded.width = TILE_SIZE;
    shaded.height = TILE_SIZE;
    const shadedContext = shaded.getContext("2d", { alpha: true });
    if (!shadedContext) return tile;
    shadedContext.imageSmoothingEnabled = false;
    shadedContext.drawImage(tile, 0, 0);
    shadedContext.globalCompositeOperation = "source-atop";
    shadedContext.fillStyle = `rgba(6, 13, 16, ${alpha})`;
    shadedContext.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    return shaded;
  };
  const left = shadeTile(0.2);
  const right = shadeTile(0.38);
  const heightScale = shape === "wire" || shape === "plate" ? 0.11
    : shape === "slab" || shape === "stair" ? 0.46
      : shape === "bed" ? 0.36
        : shape === "hopper" ? 0.62
          : 1;
  const vertical = 1.35 * heightScale;
  const topY = 12 - (1 - heightScale) * 7;

  context.save();
  context.setTransform(1.375, 0.6875, 0, vertical, 2, topY + 11);
  context.drawImage(left, 0, 0);
  context.restore();
  context.save();
  context.setTransform(1.375, -0.6875, 0, vertical, 24, topY + 22);
  context.drawImage(right, 0, 0);
  context.restore();
  context.save();
  context.setTransform(1.375, 0.6875, -1.375, 0.6875, 24, topY);
  context.drawImage(tile, 0, 0);
  context.restore();
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
  BlockId.PulseRepeater,
  BlockId.FluxComparator,
  BlockId.InverterTorch,
  BlockId.Observer,
  BlockId.AdhesiveRam,
  BlockId.PulseButton,
  BlockId.PressurePlate,
  BlockId.DaylightSensor,
  BlockId.TargetBlock,
  BlockId.LatchLamp,
  BlockId.NoteEmitter,
  BlockId.HearthFurnace,
  BlockId.TradePost,
];
