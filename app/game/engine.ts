import * as THREE from "three";
import {
  ALL_ITEMS,
  BLOCKS,
  RECIPES,
  TOOL_POWER,
  blockForItem,
  createOriginalTextureAtlas,
  itemForBlock,
  itemName,
  isLeafBlock,
  tileUv,
  matchingRecipeInputs,
} from "./blocks";
import { AutomationSystem } from "./automation";
import { FrontierAudio } from "./audio";
import {
  HOTBAR_SIZE,
  HOTBAR_START,
  INVENTORY_SLOT_COUNT,
  addItemToLayout,
  createInventoryLayout,
  hotbarFromLayout,
  moveInventorySlot as moveSlotInLayout,
  reconcileInventoryLayout,
  shiftInventorySlot as shiftSlotInLayout,
} from "./inventory";
import { CRITICAL_DAMAGE_MULTIPLIER, WeaponStats, isCriticalHit, weaponStats } from "./combat";
import { itemSalePoints } from "./economy";
import { buildChunkGeometries } from "./mesher";
import { NetworkMessage, NetworkSession } from "./network";
import { MOB_DEFINITIONS, mobIntersectsSolid, moveMobWithCollision, resolveMobPenetration } from "./mobs";
import { PlayerPhysics } from "./physics";
import { hashString, parseWorldKey, seededRandom, worldKey } from "./prng";
import { voxelRaycast } from "./raycast";
import { encodeWorldKey, saveLocally } from "./save";
import { FirstPersonViewModel } from "./viewmodel";
import { createDungeonPlan, DungeonPlan, isDungeonCoordinate } from "./dungeons";
import { buildLocatorMarkers, compassHeading } from "./locator";
import {
  NATURAL_DESPAWN_DISTANCE,
  chooseNaturalMobKind,
  findNaturalSpawnSite,
  naturalMobCap,
  naturalMobCount,
  nearestPlayerDistance,
} from "./spawning";
import {
  type FurnaceSlot,
  depositFurnaceItem,
  ensureFurnaceSlots,
  furnaceCanDeposit,
  furnaceSlotItem,
  withdrawFurnaceItem,
} from "./smelting";
import {
  clearStorageItem,
  moveStorageSlot,
  placeStorageItem,
  reconcileStorageSlots,
  SINGLE_CHEST_SLOTS,
  storageCanAccept,
  storageCanAcceptAt,
} from "./storage";
import {
  BlockId,
  ChatEntry,
  CHUNK_SIZE,
  GameMode,
  GameSettings,
  HudState,
  InputFrame,
  Inventory,
  InventoryLayout,
  ItemId,
  MachineState,
  MobState,
  PlayerSnapshot,
  Recipe,
  SAVE_VERSION,
  Vec3Data,
  VillagerProfession,
  WorldSave,
  WORLD_GENERATION_VERSION,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
} from "./types";
import { chunkKey, EMBERDEEP_OFFSET, floorDiv, isEmberdeepCoordinate, VoxelWorld } from "./world";

export interface MachinePanelData {
  key: string;
  id: BlockId;
  state: MachineState;
  inputs: number;
}

export interface ChestPanelData {
  keys: string[];
  title: string;
  rows: 3 | 6;
  slots: InventoryLayout;
  storage: Inventory;
}

export interface TradeOffer {
  id: string;
  name: string;
  cost: { item: ItemId; count: number };
  reward: { item: ItemId; count: number };
  note: string;
  stock: number;
  maxStock: number;
}

export interface TradePanelData {
  mobId: string;
  name: string;
  profession: string;
  offers: TradeOffer[];
  marks: number;
  credit: number;
}

export interface GameEngineCallbacks {
  onHud: (state: HudState) => void;
  onInventory: (station?: "hand" | "workbench") => void;
  onPause: () => void;
  onGuide: () => void;
  onMachine: (data: MachinePanelData) => void;
  onChest: (data: ChestPanelData) => void;
  onTrade: (data: TradePanelData) => void;
  onChatOpen: () => void;
  onChat: (entry: ChatEntry) => void;
  onToast: (message: string) => void;
}

export interface GameEngineOptions {
  canvas: HTMLCanvasElement;
  seed: string;
  save?: WorldSave | null;
  settings: GameSettings;
  playerName: string;
  mode: GameMode;
  network: NetworkSession;
  callbacks: GameEngineCallbacks;
}

interface ChunkMeshSet {
  group: THREE.Group;
  revision: number;
}

const AUTOSAVE_SECONDS = 18;
const NETWORK_CHECKPOINT_SECONDS = 12;

function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

function cloneMachineState(state: MachineState): MachineState {
  return {
    ...state,
    storage: cloneInventory(state.storage),
    storageSlots: state.storageSlots ? [...state.storageSlots] : undefined,
    link: state.link ? { ...state.link } : undefined,
  };
}

function creativeInventory(): Inventory {
  return Object.fromEntries(ALL_ITEMS.map((item) => [item, 999]));
}

function defaultHotbar(mode: GameMode): Array<ItemId | null> {
  if (mode === "survival") return Array<ItemId | null>(HOTBAR_SIZE).fill(null);
  return [
    "tool:crystal-pick",
    itemForBlock(BlockId.Stone),
    itemForBlock(BlockId.FluxWire),
    itemForBlock(BlockId.Toggle),
    itemForBlock(BlockId.PulseRepeater),
    itemForBlock(BlockId.FluxComparator),
    itemForBlock(BlockId.InverterTorch),
    itemForBlock(BlockId.Observer),
    itemForBlock(BlockId.Ram),
  ];
}

function createCrackMaterials(): THREE.MeshBasicMaterial[] {
  return Array.from({ length: 7 }, (_, stage) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas textures are unavailable in this browser.");
    context.clearRect(0, 0, 64, 64);
    context.strokeStyle = "rgba(18, 15, 17, .88)";
    context.lineCap = "square";
    context.lineJoin = "miter";
    context.lineWidth = 2.5 + stage * 0.34;
    const branches = 2 + stage * 2;
    for (let branch = 0; branch < branches; branch += 1) {
      const angle = (branch / branches) * Math.PI * 2 + stage * 0.19;
      let x = 32;
      let y = 32;
      context.beginPath();
      context.moveTo(x, y);
      const segments = 2 + Math.floor(stage / 2);
      for (let segment = 0; segment < segments; segment += 1) {
        const distance = 7 + segment * 4 + stage * 1.2;
        x = 32 + Math.cos(angle + Math.sin(branch * 9 + segment) * 0.22) * distance;
        y = 32 + Math.sin(angle + Math.cos(branch * 5 + segment) * 0.22) * distance;
        context.lineTo(x, y);
      }
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  });
}

function createStarField(seed: number): THREE.Points {
  const random = seededRandom(seed ^ 0x7f4a7c15);
  const positions: number[] = [];
  for (let index = 0; index < 420; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(0.12 + random() * 0.88);
    const radius = 155;
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius,
      Math.sin(phi) * Math.sin(theta) * radius,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd9edff, size: 0.85, transparent: true, opacity: 0 }));
}

function disposeObject(object: THREE.Object3D, disposeMaterials = false): void {
  const disposeMaterial = (material: THREE.Material) => {
    if (material.userData.ownedMap && "map" in material) {
      const map = (material as THREE.MeshLambertMaterial).map;
      map?.dispose();
    }
    material.dispose();
  };
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (disposeMaterials) {
        const material = child.material;
        if (Array.isArray(material)) material.forEach(disposeMaterial);
        else disposeMaterial(material);
      }
    }
  });
}

function itemAvailable(inventory: Inventory, item: ItemId, count = 1): boolean {
  return (inventory[item] ?? 0) >= count;
}

function changeItem(inventory: Inventory, item: ItemId, amount: number): void {
  inventory[item] = Math.max(0, (inventory[item] ?? 0) + amount);
  if (inventory[item] === 0) delete inventory[item];
}

function formatFrontierTime(timeOfDay: number): string {
  const totalMinutes = Math.floor(((timeOfDay % 1) + 1) % 1 * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const phase = hours < 5
    ? "Deep night"
    : hours < 8
      ? "Dawn"
      : hours < 17
        ? "Daylight"
        : hours < 20
          ? "Dusk"
          : "Night";
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} · ${phase}`;
}

type TradeProfession = VillagerProfession | "market";
type TradeTemplate = Omit<TradeOffer, "stock">;

const PROFESSION_NAMES: Record<TradeProfession, string> = {
  farmer: "Farmer",
  blacksmith: "Blacksmith",
  builder: "Builder",
  riftwright: "Riftwright",
  market: "Market Clerk",
};

const TRADE_CATALOG: Record<TradeProfession, TradeTemplate[]> = {
  farmer: [
    { id: "farmer-sells-fiber", name: "Fleece Bale", cost: { item: "currency:frontier-mark", count: 5 }, reward: { item: "part:soft-fiber", count: 4 }, note: "Buy prepared fiber for a bed or woven block.", maxStock: 4 },
    { id: "farmer-sells-food", name: "Travel Rations", cost: { item: "currency:frontier-mark", count: 3 }, reward: { item: "food:starfruit", count: 5 }, note: "A small ration for long cave trips.", maxStock: 4 },
    { id: "farmer-sells-feathers", name: "Fletcher Bundle", cost: { item: "currency:frontier-mark", count: 4 }, reward: { item: "part:feather", count: 6 }, note: "Clean feathers for arrows and decorations.", maxStock: 4 },
    { id: "farmer-sells-wool", name: "Woven Wool", cost: { item: "currency:frontier-mark", count: 7 }, reward: { item: itemForBlock(BlockId.WovenWool), count: 3 }, note: "Finished fabric for warm interiors and colorful builds.", maxStock: 3 },
    { id: "farmer-sells-pork", name: "Butcher's Parcel", cost: { item: "currency:frontier-mark", count: 4 }, reward: { item: "food:pork", count: 4 }, note: "A compact provision bundle for a hungry expedition.", maxStock: 3 },
  ],
  blacksmith: [
    { id: "smith-sells-iron", name: "Iron Pair", cost: { item: "currency:frontier-mark", count: 7 }, reward: { item: "part:iron-ingot", count: 2 }, note: "Buy two furnace-ready iron ingots.", maxStock: 4 },
    { id: "smith-sells-pick", name: "Iron Pick", cost: { item: "currency:frontier-mark", count: 18 }, reward: { item: "tool:iron-pick", count: 1 }, note: "A finished deep-mining tool, limited to one per restock.", maxStock: 1 },
    { id: "smith-sells-coal", name: "Forge Fuel", cost: { item: "currency:frontier-mark", count: 3 }, reward: { item: "part:coal", count: 6 }, note: "A compact reserve of furnace fuel.", maxStock: 4 },
    { id: "smith-sells-copper", name: "Copper Stock", cost: { item: "currency:frontier-mark", count: 6 }, reward: { item: "part:copper-ingot", count: 3 }, note: "Conductive metal for early tools and machinery.", maxStock: 4 },
    { id: "smith-sells-bars", name: "Forged Bars", cost: { item: "currency:frontier-mark", count: 7 }, reward: { item: itemForBlock(BlockId.IronBars), count: 6 }, note: "Strong fitted bars for windows, gates, and workshops.", maxStock: 3 },
  ],
  builder: [
    { id: "builder-sells-panes", name: "Window Crate", cost: { item: "currency:frontier-mark", count: 5 }, reward: { item: "block:112", count: 8 }, note: "Slim Clearglass Panes for a finished home.", maxStock: 5 },
    { id: "builder-sells-door", name: "Door & Shutter Set", cost: { item: "currency:frontier-mark", count: 6 }, reward: { item: "block:97", count: 1 }, note: "A fitted timber door for a cottage or workshop.", maxStock: 4 },
    { id: "builder-sells-roof", name: "Roofing Lot", cost: { item: "currency:frontier-mark", count: 7 }, reward: { item: "block:103", count: 6 }, note: "Weatherproof fired-clay roof tiles.", maxStock: 4 },
    { id: "builder-sells-carving", name: "Carved Masonry", cost: { item: "currency:frontier-mark", count: 8 }, reward: { item: itemForBlock(BlockId.CarvedStone), count: 6 }, note: "Symmetrical dressed stone for foundations and halls.", maxStock: 4 },
    { id: "builder-sells-chest", name: "Frontier Chest", cost: { item: "currency:frontier-mark", count: 9 }, reward: { item: itemForBlock(BlockId.Crate), count: 1 }, note: "A ready-built 27-slot container for a new outpost.", maxStock: 2 },
  ],
  riftwright: [
    { id: "rift-sells-flux", name: "Fluxstone Packet", cost: { item: "currency:frontier-mark", count: 6 }, reward: { item: "part:flux-dust", count: 4 }, note: "Signal dust for advanced logic circuits.", maxStock: 4 },
    { id: "rift-sells-diamond", name: "Cut Diamond", cost: { item: "currency:frontier-mark", count: 20 }, reward: { item: "part:diamond", count: 1 }, note: "A scarce cut crystal from a distant mine.", maxStock: 2 },
    { id: "rift-sells-core", name: "Rift Core", cost: { item: "currency:frontier-mark", count: 40 }, reward: { item: "part:rift-core", count: 1 }, note: "The stabilizer required for a Rift Gate.", maxStock: 1 },
    { id: "rift-sells-shards", name: "Moonshard Pair", cost: { item: "currency:frontier-mark", count: 9 }, reward: { item: "part:moonshard", count: 2 }, note: "Cut crystals for Aether equipment and luminous work.", maxStock: 3 },
    { id: "rift-sells-lantern", name: "Deep Lantern", cost: { item: "currency:frontier-mark", count: 12 }, reward: { item: itemForBlock(BlockId.DeepLantern), count: 1 }, note: "A caged expedition light for the deepest routes.", maxStock: 2 },
  ],
  market: [
    { id: "market-sells-coal", name: "Emergency Fuel", cost: { item: "currency:frontier-mark", count: 3 }, reward: { item: "part:coal", count: 6 }, note: "A small fuel reserve for stranded travelers.", maxStock: 3 },
    { id: "market-sells-tonic", name: "Mender Tonic", cost: { item: "currency:frontier-mark", count: 8 }, reward: { item: "consumable:mender-tonic", count: 1 }, note: "A restorative tonic for dangerous expeditions.", maxStock: 3 },
    { id: "market-sells-bolts", name: "Aether Bolts", cost: { item: "currency:frontier-mark", count: 5 }, reward: { item: "ammo:aether-bolt", count: 8 }, note: "A bundle of ammunition for an Aether Repeater.", maxStock: 4 },
    { id: "market-sells-bed", name: "Traveler Bed", cost: { item: "currency:frontier-mark", count: 10 }, reward: { item: itemForBlock(BlockId.FrontierBed), count: 1 }, note: "A portable bed for skipping dangerous nights.", maxStock: 2 },
    { id: "market-sells-torches", name: "Torch Bundle", cost: { item: "currency:frontier-mark", count: 4 }, reward: { item: itemForBlock(BlockId.GlowRod), count: 8 }, note: "Warm Trail Torches for a cave or roadside camp.", maxStock: 5 },
  ],
};

function blockVisualBounds(id: BlockId): { x: number; y: number; z: number } {
  const definition = BLOCKS[id];
  const shape = definition.shape ?? "cube";
  if (shape === "wire") return { x: 0.94, y: 0.08, z: 0.94 };
  if (shape === "plate") return { x: 0.88, y: 0.2, z: 0.88 };
  if (shape === "cross") return { x: 0.92, y: 0.96, z: 0.92 };
  if (shape === "torch" || shape === "rod") return { x: 0.4, y: 0.96, z: 0.4 };
  if (shape === "slab") return { x: 1, y: definition.collisionHeight ?? 0.5, z: 1 };
  if (shape === "bed") return { x: 1, y: 0.58, z: 1 };
  if (shape === "portal" || shape === "door") return { x: 0.94, y: 1, z: 0.2 };
  if (shape === "pane") return { x: 0.94, y: 1, z: 0.1 };
  if (shape === "fence") return { x: 0.76, y: 1, z: 0.76 };
  if (shape === "column") return { x: 0.64, y: 1, z: 0.64 };
  if (shape === "ladder") return { x: 0.72, y: 1, z: 0.16 };
  return { x: 1, y: 1, z: 1 };
}

function paintBlockUv(geometry: THREE.BufferGeometry, id: BlockId): void {
  const uv = tileUv(id);
  const attribute = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) {
    const x = attribute.getX(index);
    const y = attribute.getY(index);
    attribute.setXY(index, uv.u0 + x * (uv.u1 - uv.u0), uv.v0 + y * (uv.v1 - uv.v0));
  }
  attribute.needsUpdate = true;
}

const CREATURE_PALETTES: Record<MobState["kind"], { base: string; accent: string; mark: string; eye: number }> = {
  sheep: { base: "#dedbd1", accent: "#b8b2a7", mark: "#6a615a", eye: 0x211d1b },
  cow: { base: "#8c684f", accent: "#eee7d7", mark: "#3a2a24", eye: 0x191512 },
  pig: { base: "#d78f91", accent: "#efb4ad", mark: "#8f555b", eye: 0x24191b },
  chicken: { base: "#ece8d9", accent: "#cf473d", mark: "#e0a53e", eye: 0x171412 },
  glowgrazer: { base: "#426c70", accent: "#8ce6d4", mark: "#315056", eye: 0xffe59a },
  mireling: { base: "#405e55", accent: "#86bd91", mark: "#263f3b", eye: 0xffca5c },
  cinderling: { base: "#713c38", accent: "#f48a45", mark: "#2b2428", eye: 0xffe073 },
  thornback: { base: "#3e5038", accent: "#9db45c", mark: "#293628", eye: 0xffc85e },
  nightwisp: { base: "#343e5c", accent: "#829dff", mark: "#202943", eye: 0xd5eeff },
  wayfarer: { base: "#69526c", accent: "#c99177", mark: "#3c344c", eye: 0xf2d39f },
};

function createCreatureTexture(kind: MobState["kind"], accent = false): THREE.CanvasTexture {
  const palette = CREATURE_PALETTES[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures are unavailable in this browser.");
  context.imageSmoothingEnabled = false;
  context.fillStyle = accent ? palette.accent : palette.base;
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = accent ? palette.base : palette.mark;

  if (kind === "cow") {
    for (const [x, y, w, h] of [[1, 1, 5, 4], [10, 0, 5, 6], [4, 9, 6, 4], [12, 12, 4, 4]]) context.fillRect(x, y, w, h);
  } else if (kind === "sheep") {
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < 16; x += 5) context.fillRect(x, y, 3, 2);
  } else if (kind === "pig") {
    for (const [x, y] of [[2, 3], [11, 2], [6, 8], [13, 12], [2, 13]]) context.fillRect(x, y, 2, 1);
  } else if (kind === "chicken") {
    for (const [x, y, w] of [[1, 2, 4], [9, 1, 5], [4, 8, 3], [11, 12, 4]]) context.fillRect(x, y, w, 2);
  } else if (kind === "glowgrazer") {
    for (const [x, y, w] of [[1, 2, 4], [10, 1, 3], [6, 7, 4], [0, 12, 3], [12, 11, 4]]) context.fillRect(x, y, w, 2);
  } else if (kind === "mireling") {
    for (let y = 1; y < 16; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < 16; x += 5) context.fillRect(x, y, 3, 2);
  } else if (kind === "cinderling") {
    for (const [x, y] of [[2, 2], [11, 1], [6, 5], [13, 8], [3, 11], [9, 13]]) {
      context.fillRect(x, y, 2, 1);
      context.fillRect(x + 1, y + 1, 1, 2);
    }
    context.fillStyle = "#ffbd59";
    for (const [x, y] of [[1, 7], [8, 2], [12, 13], [5, 14]]) context.fillRect(x, y, 1, 1);
  } else if (kind === "thornback") {
    for (let x = 1; x < 16; x += 5) context.fillRect(x, 0, 2, 16);
    context.fillStyle = palette.accent;
    for (const [x, y] of [[3, 3], [11, 6], [6, 12]]) context.fillRect(x, y, 2, 2);
  } else if (kind === "nightwisp") {
    for (const [x, y, w] of [[2, 2, 3], [8, 1, 5], [0, 8, 4], [6, 11, 3], [12, 13, 3]]) context.fillRect(x, y, w, 1);
    context.fillStyle = "#b8c8ff";
    for (const [x, y] of [[5, 4], [11, 7], [3, 13]]) context.fillRect(x, y, 1, 1);
  } else {
    for (let y = 2; y < 16; y += 4) {
      context.fillRect(0, y, 16, 1);
      for (let x = y % 3; x < 16; x += 5) context.fillRect(x, y + 1, 1, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export class GameEngine {
  readonly input: InputFrame = {
    forward: 0,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: false,
    crouch: false,
    mine: false,
    place: false,
    interact: false,
  };

  world: VoxelWorld;
  readonly network: NetworkSession;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly chunkRoot = new THREE.Group();
  private readonly entityRoot = new THREE.Group();
  private readonly indicatorRoot = new THREE.Group();
  private readonly remotePlayerRoot = new THREE.Group();
  private readonly chunks = new Map<string, ChunkMeshSet>();
  private readonly chunkQueue: string[] = [];
  private readonly queuedChunks = new Set<string>();
  private readonly mobMeshes = new Map<string, THREE.Group>();
  private readonly dropMeshes = new Map<string, THREE.Mesh>();
  private readonly remotePlayers = new Map<string, PlayerSnapshot>();
  private readonly remotePeerPlayers = new Map<string, PlayerSnapshot>();
  private readonly remotePlayerMeshes = new Map<string, THREE.Group>();
  private readonly indicatorMeshes = new Map<string, THREE.Mesh>();
  private readonly automation = new AutomationSystem();
  private readonly callbacks: GameEngineCallbacks;
  private readonly playerName: string;
  private readonly audio: FrontierAudio;
  private mode: GameMode;
  private physics: PlayerPhysics;
  private settings: GameSettings;
  private inventory: Inventory;
  private inventorySlots: InventoryLayout;
  private hotbar: Array<ItemId | null>;
  private selectedSlot = 0;
  private health = 100;
  private hunger = 100;
  private stamina = 100;
  private tradeCredit = 0;
  private timeOfDay = 0.29;
  private paused = false;
  private destroyed = false;
  private frameRequest = 0;
  private previousFrame = performance.now();
  private frameCounter = 0;
  private frameTimer = 0;
  private fps = 60;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private automationTimer = 0;
  private networkTimer = 0;
  private mobNetworkTimer = 0;
  private worldNetworkTimer = 0;
  private checkpointTimer = 0;
  private localLightTimer = 0;
  private chunkTimer = 0;
  private mobTimer = 0;
  private mobSpawnTimer = 4;
  private placeCooldown = 0;
  private attackCooldown = 0;
  private riftCooldown = 0;
  private portalReleaseRequired = false;
  private hazardCooldown = 0;
  private interactLatch = false;
  private jumpNutritionLatch = false;
  private creativeMineLatch = false;
  private creativeFlying = false;
  private lastCreativeJumpTap = 0;
  private criticalFlash = 0;
  private miningKey = "";
  private miningProgress = 0;
  private mineSoundTimer = 0;
  private stepSoundTimer = 0;
  private inventoryFullToastTimer = 0;
  private activeWorkbenchKey: string | null = null;
  private activeChestKey: string | null = null;
  private objective = "Gather Emberwood by hand and prepare for nightfall.";
  private dayCount = 1;
  private nightAnnouncementDay = 0;
  private dropSerial = 0;
  private wildlifeRandom: () => number;
  private targetedMob: MobState | null = null;
  private currentHit: ReturnType<typeof voxelRaycast> = null;
  private placementHit: ReturnType<typeof voxelRaycast> = null;
  private readonly selection: THREE.LineSegments;
  private readonly breakOverlay: THREE.Mesh;
  private readonly breakMaterials: THREE.MeshBasicMaterial[];
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly localLights: THREE.PointLight[] = [];
  private readonly starField: THREE.Points;
  private readonly moonDisc: THREE.Mesh;
  private readonly sunDisc: THREE.Mesh;
  private readonly atlas: THREE.CanvasTexture;
  private readonly viewModel: FirstPersonViewModel;
  private readonly solidMaterial: THREE.MeshLambertMaterial;
  private readonly translucentMaterial: THREE.MeshLambertMaterial;
  private readonly liquidMaterial: THREE.MeshLambertMaterial;
  private readonly signalOnMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b46 });
  private readonly powerMaterial = new THREE.MeshBasicMaterial({ color: 0x54d7e5 });

  private readonly onResize = () => this.resize();
  private readonly onPointerMove = (event: PointerEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.addLook(event.movementX, event.movementY);
  };
  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 2) event.preventDefault();
    // Pointer capture can be lost whenever a browser-native menu is open.
    // The recapture gesture must never leak through as a mining/placement
    // action, especially in Creative where that action is instantaneous.
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock().catch(() => undefined);
      void this.audio.unlock();
      return;
    }
    if (event.button === 0) {
      this.input.mine = true;
      this.viewModel.swing("attack");
    }
    if (event.button === 2) this.input.place = true;
    if (event.button === 1 && this.mode === "creative" && this.currentHit) {
      event.preventDefault();
      this.assignInventorySlot(HOTBAR_START + this.selectedSlot, itemForBlock(this.currentHit.id));
    }
    void this.audio.unlock();
  };
  private readonly onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) this.input.mine = false;
    if (event.button === 2) this.input.place = false;
  };
  private readonly onContextMenu = (event: Event) => event.preventDefault();
  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.setSelectedSlot(this.selectedSlot + (event.deltaY > 0 ? 1 : -1));
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (event.repeat && ["KeyE", "KeyF", "KeyG", "KeyQ", "KeyR", "KeyT", "KeyV", "KeyX", "Enter", "Escape"].includes(event.code)) return;
    if (event.code === "KeyW") this.input.forward = 1;
    if (event.code === "KeyS") this.input.forward = -1;
    if (event.code === "KeyA") this.input.strafe = -1;
    if (event.code === "KeyD") this.input.strafe = 1;
    if (event.code === "Space") {
      if (this.mode === "creative" && !event.repeat) {
        const now = performance.now();
        if (now - this.lastCreativeJumpTap < 320) this.toggleCreativeFlight();
        this.lastCreativeJumpTap = now;
      }
      this.input.jump = true;
    }
    if (event.code === "KeyR") this.input.sprint = this.settings.toggleSprint ? !this.input.sprint : true;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "ControlLeft" || event.code === "KeyC") this.input.crouch = true;
    if (event.code === "KeyF") this.tapInteract();
    if (event.code === "KeyE") {
      event.preventDefault();
      this.activeWorkbenchKey = null;
      this.callbacks.onInventory();
    }
    if (event.code === "KeyQ") {
      event.preventDefault();
      this.dropSelectedItem(event.shiftKey);
    }
    if (event.code === "KeyG") this.callbacks.onGuide();
    if (event.code === "KeyT" || event.code === "Enter") {
      event.preventDefault();
      this.openChat();
    }
    if (event.code === "KeyX") this.rotateTargetedMachine();
    if (event.code === "KeyV") this.toggleCreativeFlight();
    if (event.code === "Escape") this.callbacks.onPause();
    if (/^Digit[1-9]$/.test(event.code)) this.setSelectedSlot(Number(event.code.slice(5)) - 1);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "KeyW" && this.input.forward > 0) this.input.forward = 0;
    if (event.code === "KeyS" && this.input.forward < 0) this.input.forward = 0;
    if (event.code === "KeyA" && this.input.strafe < 0) this.input.strafe = 0;
    if (event.code === "KeyD" && this.input.strafe > 0) this.input.strafe = 0;
    if (event.code === "Space") this.input.jump = false;
    if (event.code === "KeyR" && !this.settings.toggleSprint) this.input.sprint = false;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "ControlLeft" || event.code === "KeyC") this.input.crouch = false;
  };
  private readonly onVisibility = () => {
    if (document.hidden && this.network.role !== "guest") this.saveNow();
  };

  constructor(options: GameEngineOptions) {
    this.canvas = options.canvas;
    this.callbacks = options.callbacks;
    this.settings = { ...options.settings };
    this.playerName = options.playerName || "Traveler";
    this.network = options.network;
    const loaded = options.save ?? null;
    this.mode = loaded?.mode ?? options.mode;
    this.world = new VoxelWorld(loaded?.seed ?? options.seed, loaded?.generation ?? WORLD_GENERATION_VERSION);
    this.wildlifeRandom = seededRandom(hashString(`wildlife:${this.world.seedText}`));
    if (loaded) {
      this.world.loadMutations(loaded.mutations);
      this.world.loadWaterLevels(loaded.waterLevels);
      for (const [key, state] of loaded.machines) {
        this.world.machines.set(key, cloneMachineState(state));
      }
      this.world.drops.push(...loaded.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
      this.world.mobs.push(...loaded.mobs.map((mob) => ({
        ...mob,
        natural: mob.natural ?? (!mob.boss && mob.kind !== "wayfarer"),
        spawnedAt: mob.spawnedAt ?? Date.now(),
        position: { ...mob.position },
        velocity: { ...mob.velocity },
      })));
      this.inventory = cloneInventory(loaded.player.inventory);
      this.inventorySlots = createInventoryLayout(this.inventory, loaded.player.inventorySlots, loaded.player.hotbar);
      this.hotbar = hotbarFromLayout(this.inventorySlots);
      this.selectedSlot = Math.max(0, Math.min(HOTBAR_SIZE - 1, loaded.player.selectedSlot));
      this.health = loaded.player.health;
      this.hunger = loaded.player.hunger;
      this.stamina = loaded.player.stamina;
      this.tradeCredit = loaded.player.tradeCredit ?? 0;
      this.timeOfDay = loaded.timeOfDay;
      this.dayCount = loaded.dayCount ?? 1;
      this.physics = new PlayerPhysics(loaded.player.position);
      this.physics.yaw = loaded.player.yaw;
      this.physics.pitch = loaded.player.pitch;
    } else {
      this.inventory = this.mode === "creative" ? creativeInventory() : {};
      this.hotbar = defaultHotbar(this.mode);
      this.inventorySlots = createInventoryLayout(this.inventory, undefined, this.hotbar);
      this.hotbar = hotbarFromLayout(this.inventorySlots);
      this.physics = new PlayerPhysics(this.world.findSpawn());
      this.spawnInitialMobs();
    }
    this.objective = this.mode === "creative"
      ? "Creative systems online — prototype a directional circuit or map the deep."
      : "Gather Emberwood, build a bench, and craft your first wooden tools.";

    this.audio = new FrontierAudio(this.settings, this.world.seedText);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.settings.graphics !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = this.settings.graphics === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 420);
    this.camera.rotation.order = "YXZ";
    this.scene.background = new THREE.Color(0x8fc8d8);
    this.scene.fog = new THREE.Fog(0x8fc8d8, 28, this.settings.renderDistance * CHUNK_SIZE + 32);
    this.scene.add(this.chunkRoot, this.entityRoot, this.indicatorRoot, this.remotePlayerRoot, this.camera);

    this.hemisphere = new THREE.HemisphereLight(0xbce9ff, 0x5a4a36, 1.35);
    this.ambient = new THREE.AmbientLight(0x91a9c9, 0.28);
    this.sun = new THREE.DirectionalLight(0xfff1c2, 1.75);
    this.sun.position.set(40, 64, 25);
    this.sun.castShadow = this.settings.graphics === "high";
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.scene.add(this.hemisphere, this.ambient, this.sun, this.sun.target);
    for (let index = 0; index < 10; index += 1) {
      const light = new THREE.PointLight(0xffbd73, 0, 19, 1.25);
      light.visible = false;
      this.localLights.push(light);
      this.scene.add(light);
    }

    this.starField = createStarField(this.world.seed);
    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xb8cdf8, fog: false }),
    );
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.4, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe3a0, fog: false }),
    );
    this.scene.add(this.starField, this.moonDisc, this.sunDisc);

    this.atlas = createOriginalTextureAtlas();
    this.solidMaterial = new THREE.MeshLambertMaterial({ map: this.atlas, alphaTest: 0.1, vertexColors: true });
    this.translucentMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      alphaTest: 0.08,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexColors: true,
    });
    this.liquidMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    this.viewModel = new FirstPersonViewModel(this.camera, this.atlas);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);

    const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.018, 1.018, 1.018));
    this.selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selection.visible = false;
    this.scene.add(this.selection);
    this.breakMaterials = createCrackMaterials();
    const breakGeometry = new THREE.BoxGeometry(1.028, 1.028, 1.028);
    this.breakOverlay = new THREE.Mesh(breakGeometry, this.breakMaterials[0]);
    this.breakOverlay.visible = false;
    this.scene.add(this.breakOverlay);

    this.bindEvents();
    this.configureNetwork();
    this.resize();
    this.queueNearbyChunks(true);
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  private bindEvents(): void {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private configureNetwork(): void {
    this.network.onStatus = (status) => {
      this.callbacks.onToast(status);
      this.emitHud(status);
    };
    this.network.onMessage = (message, peerId) => this.handleNetworkMessage(message, peerId);
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.graphics === "high" ? 2 : 1.45));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.previousFrame) / 1000);
    this.previousFrame = now;
    if (!this.paused) this.update(dt);
    this.processChunkQueue();
    this.renderer.render(this.scene, this.camera);
    this.frameCounter += 1;
    this.frameTimer += dt;
    if (this.frameTimer >= 0.5) {
      this.fps = Math.round(this.frameCounter / this.frameTimer);
      this.frameCounter = 0;
      this.frameTimer = 0;
    }
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const lookScale = 0.00205 * this.settings.sensitivity;
    this.physics.yaw -= this.input.lookX * lookScale;
    this.physics.pitch -= this.input.lookY * lookScale * (this.settings.invertY ? -1 : 1);
    this.physics.pitch = THREE.MathUtils.clamp(this.physics.pitch, -Math.PI * 0.495, Math.PI * 0.495);
    this.input.lookX = 0;
    this.input.lookY = 0;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.criticalFlash = Math.max(0, this.criticalFlash - dt);
    this.inventoryFullToastTimer = Math.max(0, this.inventoryFullToastTimer - dt);
    this.riftCooldown = Math.max(0, this.riftCooldown - dt);
    this.hazardCooldown = Math.max(0, this.hazardCooldown - dt);

    const jumpStarted = this.mode === "survival"
      && this.input.jump
      && !this.jumpNutritionLatch
      && this.physics.grounded
      && !this.physics.swimming;
    this.jumpNutritionLatch = this.input.jump;
    const sprinting = this.input.sprint && (this.mode === "creative" || this.hunger > 10);
    const physicsInput = { ...this.input, sprint: sprinting };
    this.physics.update(dt, physicsInput, this.world, (fallDistance) => {
      const damage = Math.max(0, (fallDistance - 3.2) * 6.5);
      if (damage > 0) this.damage(damage, "Hard landing");
    }, this.settings.autoJump, this.mode === "creative" && this.creativeFlying);
    if (
      this.mode === "survival" &&
      this.world.getBlock(this.physics.position.x, this.physics.position.y + 0.12, this.physics.position.z) === BlockId.Emberflow &&
      this.hazardCooldown <= 0
    ) {
      this.hazardCooldown = 0.9;
      this.damage(8, "Emberflow burn");
    }
    if (this.mode === "creative") {
      this.health = 100;
      this.hunger = 100;
      this.stamina = 100;
    } else {
      if (sprinting && Math.abs(this.input.forward) + Math.abs(this.input.strafe) > 0.2) {
        this.hunger = Math.max(0, this.hunger - dt * 0.03);
      }
      if (jumpStarted) this.hunger = Math.max(0, this.hunger - 0.12);
      this.stamina = 100;
      this.hunger = Math.max(0, this.hunger - dt * 0.006);
      if (this.hunger <= 0) this.health = Math.max(1, this.health - dt * 1.4);
      else if (this.hunger > 75 && this.health < 100) {
        this.health = Math.min(100, this.health + dt * 0.55);
        this.hunger = Math.max(0, this.hunger - dt * 0.07);
      }
    }

    this.camera.position.set(
      this.physics.position.x,
      this.physics.position.y + this.physics.eyeHeight,
      this.physics.position.z,
    );
    this.camera.rotation.set(this.physics.pitch, this.physics.yaw, 0);
    this.updateTargeting(dt);
    this.updateActions(dt);
    if (this.network.role !== "guest") this.updateDrops(dt);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.viewModel.update(dt, Math.hypot(this.physics.velocity.x, this.physics.velocity.z));
    this.stepSoundTimer = Math.max(0, this.stepSoundTimer - dt);
    if (
      this.physics.grounded &&
      Math.hypot(this.physics.velocity.x, this.physics.velocity.z) > 1.4 &&
      this.stepSoundTimer <= 0
    ) {
      this.stepSoundTimer = sprinting ? 0.27 : 0.39;
      this.audio.play("step");
    }

    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) {
      this.chunkTimer = 0.4;
      this.queueNearbyChunks();
    }
    this.automationTimer += dt;
    if (this.automationTimer >= 0.2) {
      this.automationTimer %= 0.2;
      if (this.network.role !== "guest") {
        const players = [
          { x: this.physics.position.x, y: this.physics.position.y, z: this.physics.position.z },
          ...Array.from(this.remotePlayers.values(), (player) => player.position),
        ];
        const events = this.automation.tick(this.world, players, this.timeOfDay);
        if (events.length > 0) this.audio.play("machine");
      }
      this.updateIndicators();
    }
    this.localLightTimer -= dt;
    if (this.localLightTimer <= 0) {
      this.localLightTimer = 0.36;
      this.updateLocalLights();
    }

    this.mobTimer += dt;
    if (this.mobTimer >= 0.08) {
      if (this.network.role !== "guest") this.updateMobs(this.mobTimer);
      this.mobTimer = 0;
    }
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) {
      this.mobSpawnTimer = 2.8;
      if (this.network.role !== "guest") this.spawnNaturalMob();
    }
    this.syncEntityMeshes(dt);
    this.updateRemotePlayerMeshes();
    this.updateDayNight(dt);

    this.networkTimer += dt;
    if (this.networkTimer >= 0.1 && this.network.role !== "offline") {
      this.networkTimer = 0;
      this.network.send({ type: "player", player: this.playerSnapshot() });
    }
    this.mobNetworkTimer += dt;
    if (this.mobNetworkTimer >= 0.2 && this.network.role === "host") {
      this.mobNetworkTimer = 0;
      this.network.send({
        type: "mob-state",
        mobs: this.world.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })),
        drops: this.world.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })),
        timeOfDay: this.timeOfDay,
        dayCount: this.dayCount,
      });
    }
    this.worldNetworkTimer += dt;
    if (this.worldNetworkTimer >= 0.5 && this.network.role === "host" && this.network.connectedPeers > 0) {
      this.worldNetworkTimer = 0;
      const mutations = this.world.drainNetworkMutations();
      this.network.send({
        type: "world-state",
        mutations,
        machines: Array.from(this.world.machines, ([key, state]) => [
          key,
          cloneMachineState(state),
        ]),
        ...(mutations.length > 0 ? { waterLevels: this.world.serializeWaterLevels() } : {}),
      });
    }
    this.checkpointTimer += dt;
    if (this.checkpointTimer >= NETWORK_CHECKPOINT_SECONDS && this.network.role === "host") {
      this.checkpointTimer = 0;
      this.network.checkpoint(this.makeSave());
    }
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS && this.network.role !== "guest") {
      this.autosaveTimer = 0;
      this.saveNow(false);
    }
    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private updateTargeting(dt: number): void {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const selected = this.hotbar[this.selectedSlot];
    const reach = weaponStats(selected).reach;
    this.currentHit = voxelRaycast(this.world, this.camera.position, direction, Math.max(6.2, reach));
    this.placementHit = voxelRaycast(this.world, this.camera.position, direction, 6.2, true);
    this.targetedMob = this.findTargetedMob(direction, reach);
    if (this.currentHit && !this.targetedMob) {
      const { x, y, z } = this.currentHit.block;
      const bounds = blockVisualBounds(this.currentHit.id);
      this.selection.position.set(x + 0.5, y + bounds.y / 2, z + 0.5);
      this.selection.scale.set(bounds.x, bounds.y, bounds.z);
      this.selection.visible = true;
    } else {
      this.selection.visible = false;
      this.breakOverlay.visible = false;
    }
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.mineSoundTimer = Math.max(0, this.mineSoundTimer - dt);
  }

  private findTargetedMob(direction: THREE.Vector3, maxRange: number): MobState | null {
    let nearest: MobState | null = null;
    let nearestDistance = Math.min(maxRange, this.currentHit?.distance ?? maxRange);
    for (const mob of this.world.mobs) {
      const definition = MOB_DEFINITIONS[mob.kind];
      const center = new THREE.Vector3(
        mob.position.x,
        mob.position.y + definition.height * 0.55,
        mob.position.z,
      );
      const offset = center.sub(this.camera.position);
      const alongRay = offset.dot(direction);
      if (alongRay <= 0 || alongRay > nearestDistance) continue;
      const perpendicularSq = Math.max(0, offset.lengthSq() - alongRay * alongRay);
      const hitRadius = definition.radius + 0.28;
      if (perpendicularSq <= hitRadius * hitRadius) {
        nearest = mob;
        nearestDistance = alongRay;
      }
    }
    return nearest;
  }

  private updateActions(dt: number): void {
    const minePressed = this.input.mine && !this.creativeMineLatch;
    if (this.mode === "creative") this.creativeMineLatch = this.input.mine;
    else this.creativeMineLatch = false;
    const shouldMine = this.mode === "creative" ? minePressed : this.input.mine;
    if (shouldMine && this.targetedMob) {
      this.breakOverlay.visible = false;
      this.miningKey = "";
      this.miningProgress = 0;
      if (this.attackCooldown <= 0) this.attackTargetedMob();
    } else if (shouldMine && this.currentHit) this.mineTarget(dt);
    else {
      this.miningKey = "";
      this.miningProgress = 0;
      this.breakOverlay.visible = false;
    }
    if (this.portalReleaseRequired && !this.input.place && !this.input.interact) {
      this.portalReleaseRequired = false;
      this.interactLatch = false;
    }
    if (!this.portalReleaseRequired && this.input.place && this.placeCooldown <= 0) {
      this.placeCooldown = 0.19;
      this.placeSelected();
    }
    if (!this.portalReleaseRequired && this.input.interact && !this.interactLatch) {
      this.interactLatch = true;
      this.interactTarget();
    }
    if (!this.input.interact) this.interactLatch = false;
    if (!this.input.mine) this.creativeMineLatch = false;
  }

  private toolPower(id: BlockId): number {
    const selected = this.hotbar[this.selectedSlot];
    const block = BLOCKS[id];
    if (this.mode === "creative") return 100;
    const power = selected ? TOOL_POWER[selected] ?? 0.62 : 0.62;
    if (block.tool === "none") return Math.max(1, power);
    if (block.tool === "pick" && selected?.includes("pick")) return power;
    if (block.tool === "axe" && ["tool:wood-hatchet", "tool:hatchet"].includes(selected ?? "")) return power;
    if (block.tool === "spade" && ["tool:wood-spade", "tool:spade"].includes(selected ?? "")) return power;
    return 0.48;
  }

  private canHarvest(id: BlockId, selected: ItemId | null): boolean {
    const definition = BLOCKS[id];
    if (!definition.collectible) return false;
    if (definition.tool !== "pick") return true;
    const woodenTier = ["tool:wood-pick", "tool:rough-pick", "tool:copper-pick", "tool:iron-pick", "tool:diamond-pick", "tool:crystal-pick"];
    const stoneTier = ["tool:rough-pick", "tool:copper-pick", "tool:iron-pick", "tool:diamond-pick", "tool:crystal-pick"];
    const copperTier = ["tool:copper-pick", "tool:iron-pick", "tool:diamond-pick", "tool:crystal-pick"];
    const ironTier = ["tool:iron-pick", "tool:diamond-pick", "tool:crystal-pick"];
    if ([BlockId.GoldOre, BlockId.DiamondOre, BlockId.Riftstone].includes(id)) return ironTier.includes(selected ?? "");
    if ([BlockId.AetherCrystal, BlockId.MoonshardOre].includes(id)) return copperTier.includes(selected ?? "");
    if ([BlockId.CopperOre, BlockId.IronOre, BlockId.FluxstoneOre, BlockId.Cinnabar, BlockId.SulfurStone].includes(id)) return stoneTier.includes(selected ?? "");
    return woodenTier.includes(selected ?? "");
  }

  private blockDrop(id: BlockId): ItemId {
    if (id === BlockId.StarBloom) return "food:starfruit";
    if (id === BlockId.CoalOre) return "part:coal";
    if (id === BlockId.DiamondOre) return "part:diamond";
    if (id === BlockId.FluxstoneOre) return "part:flux-dust";
    return itemForBlock(id);
  }

  private mineTarget(dt: number): void {
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const id = this.currentHit.id;
    if (id === BlockId.RelicCache) {
      this.interactTarget();
      this.miningProgress = 0;
      this.miningKey = "";
      this.breakOverlay.visible = false;
      return;
    }
    if (id === BlockId.Bedrock || BLOCKS[id].hardness >= 999) {
      this.miningProgress = 0;
      this.callbacks.onToast("Deepstone cannot be broken.");
      return;
    }
    const key = worldKey(x, y, z);
    if (key !== this.miningKey) {
      this.miningKey = key;
      this.miningProgress = 0;
    }
    this.miningProgress = this.mode === "creative"
      ? 1
      : this.miningProgress + (dt * this.toolPower(id)) / Math.max(0.15, BLOCKS[id].hardness);
    const bounds = blockVisualBounds(id);
    this.breakOverlay.position.set(x + 0.5, y + bounds.y / 2, z + 0.5);
    this.breakOverlay.scale.set(bounds.x, bounds.y, bounds.z);
    this.breakOverlay.material = this.breakMaterials[Math.min(6, Math.floor(Math.max(0, this.miningProgress) * 7))];
    this.breakOverlay.visible = true;
    if (this.mineSoundTimer <= 0) {
      this.mineSoundTimer = 0.22;
      this.audio.play("mine");
      this.viewModel.swing("mine");
    }
    if (this.miningProgress < 1) return;
    const selected = this.hotbar[this.selectedSlot];
    const canHarvest = this.canHarvest(id, selected);
    this.applyBlockChange(x, y, z, BlockId.Air);
    if (this.mode === "survival" && canHarvest && this.network.role !== "guest") {
      this.spawnDrop(this.blockDrop(id), 1, { x: x + 0.5, y: y - 0.05, z: z + 0.5 });
    } else if (this.mode === "survival" && !canHarvest) {
      const requirement = [BlockId.GoldOre, BlockId.DiamondOre, BlockId.Riftstone].includes(id)
        ? "An Iron Pick or better is required to harvest that deep material."
        : id === BlockId.AetherCrystal || id === BlockId.MoonshardOre
        ? "A Copper Pick or better is required to harvest that crystal."
        : [BlockId.CopperOre, BlockId.IronOre, BlockId.FluxstoneOre, BlockId.Cinnabar, BlockId.SulfurStone].includes(id)
          ? "A Roughstone Pick or better is required to harvest that ore."
          : "A Wooden Pickaxe or better is required to collect that block.";
      this.callbacks.onToast(requirement);
    }
    this.audio.play("break");
    if (this.mode === "survival" && id === BlockId.EmberwoodLog) {
      this.objective = "Cut planks, build a Tinker Bench, then craft a Wooden Pickaxe.";
    }
    this.miningProgress = 0;
    this.miningKey = "";
    this.breakOverlay.visible = false;
  }

  private placeSelected(): void {
    const item = this.hotbar[this.selectedSlot];
    if (!item) {
      this.interactTarget();
      return;
    }
    const id = blockForItem(item);
    if (id === null) {
      if (!this.useSelectedItem(item)) this.interactTarget();
      return;
    }
    if (!this.currentHit || (this.mode === "survival" && !itemAvailable(this.inventory, item))) return;
    const target = this.placementHit?.id === BlockId.Water
      ? this.placementHit.block
      : this.currentHit.adjacent;
    const { x, y, z } = target;
    const replaced = this.world.getBlock(x, y, z);
    if ((replaced !== BlockId.Air && replaced !== BlockId.Water) || this.physics.occupiesBlock(x, y, z)) return;
    this.applyBlockChange(x, y, z, id);
    const machine = this.world.machines.get(worldKey(x, y, z));
    if (machine) {
      machine.orientation = ((Math.round(-this.physics.yaw / (Math.PI / 2)) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
      if (id === BlockId.ThermalGenerator) machine.storage[itemForBlock(BlockId.CoalOre)] = 4;
      this.broadcastMachine(worldKey(x, y, z), machine);
    }
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -1);
      this.clearDepletedHotbar();
    }
    this.audio.play("place");
    this.viewModel.swing("place");
  }

  private useSelectedItem(item: ItemId): boolean {
    let used = false;
    if (item === "food:starfruit" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 18);
      this.health = Math.min(100, this.health + 3);
      used = true;
    } else if (item === "food:glowcut" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 32);
      this.health = Math.min(100, this.health + 6);
      used = true;
    } else if (item === "food:pork" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 24);
      this.health = Math.min(100, this.health + 3);
      used = true;
    } else if (item === "food:chicken" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 16);
      this.health = Math.min(100, this.health + 2);
      used = true;
    } else if (item === "consumable:mender-tonic" && this.health < 100) {
      this.health = Math.min(100, this.health + 46);
      used = true;
    }
    if (!used) return false;
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -1);
      this.clearDepletedHotbar();
    }
    this.viewModel.swing("use");
    this.audio.play("craft");
    this.callbacks.onToast(`${itemName(item)} used.`);
    return true;
  }

  private clearDepletedHotbar(): void {
    if (this.mode === "creative") return;
    const selected = this.hotbar[this.selectedSlot];
    this.inventorySlots = reconcileInventoryLayout(this.inventorySlots, this.inventory);
    this.hotbar = hotbarFromLayout(this.inventorySlots);
    if (selected && !itemAvailable(this.inventory, selected)) this.viewModel.setItem(null);
  }

  private canStoreItem(item: ItemId): boolean {
    return itemAvailable(this.inventory, item) || this.inventorySlots.some((slot) => slot === null);
  }

  private collectItem(item: ItemId, count: number): boolean {
    if (this.mode !== "creative" && !this.canStoreItem(item)) return false;
    changeItem(this.inventory, item, count);
    this.inventorySlots = addItemToLayout(this.inventorySlots, item, true);
    this.hotbar = hotbarFromLayout(this.inventorySlots);
    return true;
  }

  private spawnDrop(
    item: ItemId,
    count: number,
    position: MobState["position"],
    velocity?: Vec3Data,
    pickupDelay = 0.32,
  ): void {
    this.dropSerial += 1;
    const angle = this.wildlifeRandom() * Math.PI * 2;
    this.world.drops.push({
      id: `loot-${Date.now().toString(36)}-${this.dropSerial.toString(36)}`,
      item,
      count,
      position: { x: position.x, y: position.y + 0.65, z: position.z },
      velocity: velocity ?? {
        x: Math.cos(angle) * (0.5 + this.wildlifeRandom()),
        y: 2.2 + this.wildlifeRandom(),
        z: Math.sin(angle) * (0.5 + this.wildlifeRandom()),
      },
      pickupDelay,
    });
  }

  dropSelectedItem(fullStack = false): boolean {
    const item = this.hotbar[this.selectedSlot];
    if (!item) {
      this.callbacks.onToast("The selected hotbar slot is empty.");
      return false;
    }
    const available = this.mode === "creative" ? 1 : this.inventory[item] ?? 0;
    const count = this.mode === "creative" ? 1 : fullStack ? available : Math.min(1, available);
    if (count <= 0) return false;
    const direction = {
      x: -Math.sin(this.physics.yaw) * 4.4,
      y: 1.25 + Math.sin(this.physics.pitch) * 1.1,
      z: -Math.cos(this.physics.yaw) * 4.4,
    };
    const position = {
      x: this.physics.position.x - Math.sin(this.physics.yaw) * 0.75,
      y: this.physics.position.y + 0.72,
      z: this.physics.position.z - Math.cos(this.physics.yaw) * 0.75,
    };
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -count);
      this.clearDepletedHotbar();
    }
    if (this.network.role === "guest") {
      this.network.send({ type: "request-drop", item, count });
    } else this.spawnDrop(item, count, position, direction, 1.15);
    this.audio.play("click");
    this.callbacks.onToast(`Dropped ${count} × ${itemName(item)}${fullStack ? " stack" : ""}.`);
    this.emitHud();
    return true;
  }

  private attackTargetedMob(): void {
    const mob = this.targetedMob;
    if (!mob) return;
    const selected = this.hotbar[this.selectedSlot];
    const stats = weaponStats(selected);
    if (stats.ammo && this.mode === "survival" && !itemAvailable(this.inventory, stats.ammo)) {
      this.attackCooldown = 0.25;
      this.callbacks.onToast(`${itemName(selected ?? stats.ammo)} needs ${itemName(stats.ammo)} ammunition.`);
      return;
    }
    if (stats.ammo && this.mode === "survival") {
      changeItem(this.inventory, stats.ammo, -1);
      this.clearDepletedHotbar();
    }
    this.attackCooldown = stats.cooldown;
    this.viewModel.swing("attack");
    this.audio.play(selected === "tool:aether-repeater" ? "shoot" : "attack");
    if (this.network.role === "guest") {
      this.network.send({ type: "request-mob-hit", mobId: mob.id, item: selected });
      return;
    }
    const critical = isCriticalHit({
      grounded: this.physics.grounded,
      velocityY: this.physics.velocity.y,
      swimming: this.physics.swimming,
      flying: this.creativeFlying,
    }, stats);
    this.strikeMob(mob, stats, this.physics.position, undefined, critical);
  }

  private strikeMob(
    mob: MobState,
    stats: WeaponStats,
    origin: { x: number; y: number; z: number },
    attackerPeerId?: string,
    critical = false,
  ): void {
    mob.health -= stats.damage * (critical ? CRITICAL_DAMAGE_MULTIPLIER : 1);
    mob.hurtTimer = 0.24;
    const dx = mob.position.x - origin.x;
    const dz = mob.position.z - origin.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    const knockback = stats.knockback * (critical ? 1.22 : 1);
    mob.velocity.x += (dx / distance) * knockback;
    mob.velocity.z += (dz / distance) * knockback;
    mob.velocity.y = Math.max(mob.velocity.y, knockback * (critical ? 0.48 : 0.34));
    mob.yaw = Math.atan2(dx, dz);
    this.audio.playCreature(mob.kind, "hurt", distance);
    if (critical) {
      if (attackerPeerId) this.network.send({ type: "critical-hit", mobId: mob.id }, attackerPeerId);
      else this.showCriticalHit();
    }
    if (mob.health > 0) return;

    const definition = MOB_DEFINITIONS[mob.kind];
    for (const loot of definition.loot) {
      const amount = loot.min + Math.floor(this.wildlifeRandom() * (loot.max - loot.min + 1));
      if (amount > 0) this.spawnDrop(loot.item, amount, mob.position);
    }
    if (mob.boss) {
      this.spawnDrop("currency:frontier-mark", 10 + Math.floor(this.wildlifeRandom() * 7), mob.position);
      this.spawnDrop("part:gold-ingot", 2 + Math.floor(this.wildlifeRandom() * 3), mob.position);
      this.spawnDrop("part:diamond", 1 + Math.floor(this.wildlifeRandom() * 2), mob.position);
      this.spawnDrop("consumable:mender-tonic", 2, mob.position);
      if (mob.lootPosition) this.applyBlockChange(mob.lootPosition.x, mob.lootPosition.y, mob.lootPosition.z, BlockId.RelicCache);
    }
    const index = this.world.mobs.findIndex((candidate) => candidate.id === mob.id);
    if (index >= 0) this.world.mobs.splice(index, 1);
    if (this.targetedMob?.id === mob.id) this.targetedMob = null;
    this.objective = mob.boss
      ? "Guardian defeated. Collect the shared drops and open the unsealed expedition cache."
      : definition.passive
      ? "Explore farther—the old Wayfarer ruins hide advanced materials."
      : "Night threat cleared. Search ruins for a Relic Cache and Moonshard seams.";
    const message = `${mob.bossName ?? definition.name} defeated · shared loot dropped${mob.boss ? " and cache unsealed" : ""}.`;
    if (attackerPeerId) this.network.send({ type: "toast", text: message }, attackerPeerId);
    else this.callbacks.onToast(message);
  }

  private applyBlockChange(x: number, y: number, z: number, id: BlockId, fromNetwork = false): void {
    this.world.setBlock(x, y, z, id);
    if (fromNetwork) return;
    const message: NetworkMessage = this.network.role === "guest"
      ? { type: "request-block", x, y, z, id, item: this.hotbar[this.selectedSlot] }
      : { type: "block", x, y, z, id };
    this.network.send(message);
  }

  private professionForMob(mob: MobState): VillagerProfession {
    if (mob.profession) return mob.profession;
    const professions: VillagerProfession[] = ["farmer", "blacksmith", "builder", "riftwright"];
    mob.profession = professions[hashString(mob.id) % professions.length];
    return mob.profession;
  }

  private buildTradePanel(mobId: string): TradePanelData | null {
    let profession: TradeProfession;
    let name: string;
    let stock: Record<string, number>;
    if (mobId.startsWith("post:")) {
      const key = mobId.slice(5);
      const [x, y, z] = parseWorldKey(key);
      if (this.world.getBlock(x, y, z) !== BlockId.TradePost) return null;
      const state = this.world.machines.get(key);
      if (!state) return null;
      profession = "market";
      name = "Village Market";
      if (state.tradeRestockDay !== this.dayCount) {
        state.tradeStock = {};
        state.tradeRestockDay = this.dayCount;
      }
      state.tradeStock ??= {};
      stock = state.tradeStock;
    } else {
      const mob = this.world.mobs.find((candidate) => candidate.id === mobId && candidate.kind === "wayfarer");
      if (!mob) return null;
      profession = this.professionForMob(mob);
      name = `Village ${PROFESSION_NAMES[profession]}`;
      if (mob.tradeRestockDay !== this.dayCount) {
        mob.tradeStock = {};
        mob.tradeRestockDay = this.dayCount;
      }
      mob.tradeStock ??= {};
      stock = mob.tradeStock;
    }
    const offers = TRADE_CATALOG[profession].map((offer) => {
      if (stock[offer.id] === undefined) stock[offer.id] = offer.maxStock;
      return {
        ...offer,
        cost: { ...offer.cost },
        reward: { ...offer.reward },
        stock: stock[offer.id],
      };
    });
    return {
      mobId,
      name,
      profession: PROFESSION_NAMES[profession],
      offers,
      marks: this.inventory["currency:frontier-mark"] ?? 0,
      credit: this.tradeCredit,
    };
  }

  getTradePanel(mobId: string): TradePanelData | null {
    return this.buildTradePanel(mobId);
  }

  private interactTarget(): void {
    if (this.targetedMob?.kind === "wayfarer") {
      this.audio.playCreature("wayfarer", "idle", Math.hypot(
        this.targetedMob.position.x - this.physics.position.x,
        this.targetedMob.position.z - this.physics.position.z,
      ));
      const panel = this.buildTradePanel(this.targetedMob.id);
      if (panel) this.callbacks.onTrade(panel);
      return;
    }
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const key = worldKey(x, y, z);
    const id = this.world.getBlock(x, y, z);
    const state = this.world.machines.get(key);
    if (id === BlockId.Toggle && state) {
      state.enabled = !state.enabled;
      this.broadcastMachine(key, state);
      this.audio.play("click");
      this.callbacks.onToast(state.enabled ? "Toggle relay: ON" : "Toggle relay: OFF");
      return;
    }
    if ((id === BlockId.PulseButton || id === BlockId.TargetBlock) && state) {
      state.pulseTicks = 8;
      state.enabled = true;
      this.broadcastMachine(key, state);
      this.audio.play("click");
      this.callbacks.onToast(id === BlockId.PulseButton ? "Pulse button fired." : "Target pulse fired.");
      return;
    }
    if (id === BlockId.PulseRepeater && state) {
      state.delayTicks = ((state.delayTicks ?? 2) % 4) + 1;
      this.world.setBlock(x, y, z, id);
      this.broadcastMachine(key, state);
      this.callbacks.onToast(`Pulse repeater: ${state.delayTicks} beat delay`);
      return;
    }
    if (id === BlockId.FluxComparator && state) {
      state.mode = state.mode === "subtract" ? "compare" : "subtract";
      this.broadcastMachine(key, state);
      this.callbacks.onToast(`Flux comparator: ${state.mode}`);
      return;
    }
    if (id === BlockId.ProximitySensor && state) {
      const modes: Array<"near" | "day" | "night"> = ["near", "day", "night"];
      const currentMode = state.mode === "day" || state.mode === "night" ? state.mode : "near";
      state.mode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
      this.broadcastMachine(key, state);
      this.callbacks.onToast(`Field sensor: ${state.mode}`);
      return;
    }
    if (id === BlockId.Workbench) {
      this.activeWorkbenchKey = key;
      this.callbacks.onInventory("workbench");
      return;
    }
    if (id === BlockId.Crate) {
      const chest = this.getChest(key);
      if (chest) {
        this.activeChestKey = key;
        this.callbacks.onChest(chest);
        this.audio.play("click");
      }
      return;
    }
    if (id === BlockId.FrontierBed) {
      this.sleepThroughNight();
      return;
    }
    if (id === BlockId.RiftGate) {
      this.travelThroughRift({ x, y, z });
      return;
    }
    if (id === BlockId.DungeonGate || id === BlockId.DungeonReturn) {
      this.useDungeonPortal({ x, y, z });
      return;
    }
    if (id === BlockId.TradePost) {
      const panel = this.buildTradePanel(`post:${key}`);
      if (panel) this.callbacks.onTrade(panel);
      return;
    }
    if (id === BlockId.RelicCache) {
      if (this.network.role === "guest") {
        this.network.send({ type: "request-cache", origin: { x, y, z } });
        this.callbacks.onToast("The host is opening the shared cache…");
      } else this.openRelicCache({ x, y, z });
      return;
    }
    const consoleBlocks = [
      BlockId.HearthFurnace,
      BlockId.ThermalGenerator,
      BlockId.ArcFurnace,
      BlockId.Fabricator,
    ];
    const inspection = consoleBlocks.includes(id) ? this.automation.inspect(this.world, key) : null;
    if (inspection) {
      this.callbacks.onMachine({ key, ...inspection, state: cloneMachineState(inspection.state) });
    }
  }

  private sleepThroughNight(): void {
    const night = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    if (!night) {
      this.callbacks.onToast("The Frontier Bed can be used after nightfall.");
      return;
    }
    if (this.network.role === "guest") {
      this.network.send({ type: "request-sleep" });
      this.callbacks.onToast("Sleep request sent to the host.");
      return;
    }
    this.timeOfDay = 0.255;
    this.dayCount += 1;
    this.nightAnnouncementDay = 0;
    this.health = Math.min(100, this.health + 12);
    this.objective = `Day ${this.dayCount}: morning has returned. Explore, trade, and build.`;
    this.audio.play("craft");
    this.callbacks.onToast(`You slept through the night. Dawn begins Day ${this.dayCount}.`);
  }

  private buildRiftArrival(x: number, z: number): Vec3Data {
    const surface = this.world.getHeight(x, z);
    const floorY = Math.max(WORLD_MIN_Y + 2, Math.min(WORLD_MAX_Y - 5, surface));
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        this.applyBlockChange(x + dx, floorY, z + dz, BlockId.Riftstone);
        for (let dy = 1; dy <= 3; dy += 1) this.applyBlockChange(x + dx, floorY + dy, z + dz, BlockId.Air);
      }
    }
    this.applyBlockChange(x, floorY + 1, z, BlockId.RiftGate);
    return { x: x + 1.5, y: floorY + 1.01, z: z + 0.5 };
  }

  private riftDestination(origin: Vec3Data): Vec3Data {
    const fromEmberdeep = isEmberdeepCoordinate(origin.x);
    const x = Math.floor(fromEmberdeep
      ? origin.x > 0 ? origin.x - EMBERDEEP_OFFSET : origin.x + EMBERDEEP_OFFSET
      : origin.x + EMBERDEEP_OFFSET);
    const z = Math.floor(origin.z);
    return this.buildRiftArrival(x, z);
  }

  private travelThroughRift(origin: Vec3Data): void {
    if (this.riftCooldown > 0) return;
    this.riftCooldown = 2;
    if (this.network.role === "guest") {
      this.network.send({ type: "request-rift", origin });
      this.callbacks.onToast("The host is stabilizing your rift route…");
      return;
    }
    const destination = this.riftDestination(origin);
    this.physics.position.set(destination.x, destination.y, destination.z);
    this.physics.velocity.set(0, 0, 0);
    this.portalReleaseRequired = true;
    this.queueNearbyChunks(true);
    const entering = isEmberdeepCoordinate(destination.x);
    this.audio.play("rift");
    this.objective = entering
      ? "The Emberdeep: gather Riftwood, rare ores, and Ember Glowstone—avoid the molten currents."
      : `Day ${this.dayCount}: returned from the Emberdeep.`;
    this.callbacks.onToast(entering ? "The Rift Gate opens into the Emberdeep." : "You return to the living frontier.");
  }

  private openRelicCache(origin: Vec3Data, requesterPeerId?: string): void {
    const { x, y, z } = origin;
    if (this.world.getBlock(x, y, z) !== BlockId.RelicCache) return;
    this.applyBlockChange(x, y, z, BlockId.Air);
    const moonshards = 2 + Math.floor(this.wildlifeRandom() * 3);
    const bolts = 4 + Math.floor(this.wildlifeRandom() * 5);
    const copper = 1 + Math.floor(this.wildlifeRandom() * 2);
    this.spawnDrop("part:moonshard", moonshards, { x: x + 0.5, y, z: z + 0.5 });
    this.spawnDrop("ammo:aether-bolt", bolts, { x: x + 0.5, y, z: z + 0.5 });
    this.spawnDrop("part:copper-ingot", copper, { x: x + 0.5, y, z: z + 0.5 });
    if (this.wildlifeRandom() > 0.55) this.spawnDrop("consumable:mender-tonic", 1, { x: x + 0.5, y, z: z + 0.5 });
    if (isDungeonCoordinate(z)) {
      this.spawnDrop("currency:frontier-mark", 4 + Math.floor(this.wildlifeRandom() * 5), { x: x + 0.5, y, z: z + 0.5 });
      if (this.wildlifeRandom() > 0.45) this.spawnDrop("part:diamond", 1, { x: x + 0.5, y, z: z + 0.5 });
    }
    this.viewModel.swing("use");
    this.audio.play("craft");
    this.objective = "Relic recovered. Divide the physical loot—or carry it home together.";
    const message = `Shared cache opened · ${moonshards} Moonshards · ${bolts} Aether Bolts dropped.`;
    if (requesterPeerId) this.network.send({ type: "toast", text: message }, requesterPeerId);
    this.callbacks.onToast(message);
  }

  private buildDungeon(plan: DungeonPlan): void {
    const sealKey = worldKey(plan.sealPosition.x, plan.sealPosition.y, plan.sealPosition.z);
    const preservedSeal = this.world.mutations.get(sealKey);
    const place = (x: number, y: number, z: number, id: BlockId) => this.world.setStructureBlock(x, y, z, id);
    const buildCell = (x: number, z: number, radius: number, room: boolean) => {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          const edge = Math.abs(dx) === radius || Math.abs(dz) === radius;
          place(x + dx, plan.baseY, z + dz, edge && room ? BlockId.DungeonBrick : plan.floor);
          for (let dy = 1; dy <= 4; dy += 1) place(x + dx, plan.baseY + dy, z + dz, edge ? BlockId.DungeonBrick : BlockId.Air);
          place(x + dx, plan.baseY + 5, z + dz, (dx + dz) % 5 === 0 ? plan.accent : BlockId.DungeonBrick);
        }
      }
    };
    for (const [index, room] of plan.rooms.entries()) {
      buildCell(room.x, room.z, room.radius, true);
      for (const [dx, dz] of [[-room.radius + 1, -room.radius + 1], [room.radius - 1, -room.radius + 1], [-room.radius + 1, room.radius - 1], [room.radius - 1, room.radius - 1]]) {
        for (let dy = 1; dy <= 3; dy += 1) place(room.x + dx, plan.baseY + dy, room.z + dz, plan.accent);
        place(room.x + dx, plan.baseY + 4, room.z + dz, index === plan.rooms.length - 1 ? BlockId.DeepLantern : BlockId.GlowRod);
      }
      if (index > 0) {
        const previous = plan.rooms[index - 1];
        let cursorX = previous.x;
        let cursorZ = previous.z;
        while (cursorX !== room.x) {
          cursorX += Math.sign(room.x - cursorX);
          buildCell(cursorX, cursorZ, 2, false);
        }
        while (cursorZ !== room.z) {
          cursorZ += Math.sign(room.z - cursorZ);
          buildCell(cursorX, cursorZ, 2, false);
        }
      }
    }
    place(plan.returnPosition.x, plan.returnPosition.y, plan.returnPosition.z, BlockId.DungeonReturn);
    const returnState = this.world.machines.get(worldKey(plan.returnPosition.x, plan.returnPosition.y, plan.returnPosition.z));
    if (returnState) returnState.link = { x: plan.origin.x + 0.5, y: plan.origin.y + 0.05, z: plan.origin.z + 2.5 };
    place(
      plan.sealPosition.x,
      plan.sealPosition.y,
      plan.sealPosition.z,
      preservedSeal === undefined ? BlockId.DungeonSeal : preservedSeal,
    );

    const seal = this.world.getBlock(plan.sealPosition.x, plan.sealPosition.y, plan.sealPosition.z);
    const bossId = `${plan.id}-guardian`;
    if (seal === BlockId.DungeonSeal && !this.world.mobs.some((mob) => mob.id === bossId)) {
      const bossNames: Record<DungeonPlan["theme"], string> = {
        "moss crypt": "The Rootbound Warden",
        "ember foundry": "The Cinder Forgemaster",
        "moon vault": "The Moonvault Sentinel",
      };
      this.world.mobs.push({
        id: bossId,
        kind: plan.theme === "ember foundry" ? "cinderling" : plan.theme === "moon vault" ? "nightwisp" : "thornback",
        position: { ...plan.bossPosition },
        velocity: { x: 0, y: 0, z: 0 },
        health: 145,
        maxHealth: 145,
        yaw: 0,
        targetTimer: 0.5,
        attackTimer: 1.4,
        hurtTimer: 0,
        boss: true,
        bossName: bossNames[plan.theme],
        dungeonId: plan.id,
        lootPosition: { ...plan.sealPosition },
      });
    }
  }

  private flushWorldState(): void {
    if (this.network.role !== "host" || this.network.connectedPeers <= 0) return;
    const mutations = this.world.drainNetworkMutations();
    this.network.send({
      type: "world-state",
      mutations,
      machines: Array.from(this.world.machines, ([key, state]) => [key, cloneMachineState(state)]),
      waterLevels: this.world.serializeWaterLevels(),
    });
  }

  private activateDungeon(origin: Vec3Data): void {
    const plan = createDungeonPlan(origin, this.world.seed);
    this.buildDungeon(plan);
    this.flushWorldState();
    const inStagingArea = (position: Vec3Data) => Math.hypot(position.x - (origin.x + 0.5), position.z - (origin.z + 0.5)) <= 7
      && Math.abs(position.y - origin.y) <= 6;
    let travelers = 0;
    if (inStagingArea(this.physics.position)) {
      this.physics.position.set(plan.destination.x, plan.destination.y, plan.destination.z);
      this.physics.velocity.set(0, 0, 0);
      this.portalReleaseRequired = true;
      this.queueNearbyChunks(true);
      travelers += 1;
    }
    for (const [peerId, player] of this.remotePeerPlayers) {
      if (!inStagingArea(player.position)) continue;
      this.network.send({
        type: "teleport",
        position: plan.destination,
        text: `${plan.theme} expedition started · stay together and defeat the guardian.`,
      }, peerId);
      travelers += 1;
    }
    this.audio.play("rift");
    this.objective = `${plan.theme}: clear the generated chambers, defeat the guardian, and share the cache.`;
    this.callbacks.onToast(`${travelers} traveler${travelers === 1 ? "" : "s"} entered the ${plan.theme}.`);
  }

  private returnFromDungeon(origin: Vec3Data, requesterPeerId?: string): void {
    const state = this.world.machines.get(worldKey(origin.x, origin.y, origin.z));
    if (!state?.link) return;
    const text = "Returned safely to the expedition staging ring.";
    if (requesterPeerId) this.network.send({ type: "teleport", position: state.link, text }, requesterPeerId);
    else {
      this.physics.position.set(state.link.x, state.link.y, state.link.z);
      this.physics.velocity.set(0, 0, 0);
      this.portalReleaseRequired = true;
      this.queueNearbyChunks(true);
      this.audio.play("rift");
      this.objective = `Day ${this.dayCount}: returned from a frontier delve.`;
      this.callbacks.onToast(text);
    }
  }

  private useDungeonPortal(origin: Vec3Data): void {
    if (this.riftCooldown > 0) return;
    this.riftCooldown = 2;
    if (this.network.role === "guest") {
      this.network.send({ type: "request-dungeon", origin });
      this.callbacks.onToast("The host is assembling the expedition…");
      return;
    }
    if (this.world.getBlock(origin.x, origin.y, origin.z) === BlockId.DungeonReturn) this.returnFromDungeon(origin);
    else this.activateDungeon(origin);
  }

  private rotateTargetedMachine(): void {
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const key = worldKey(x, y, z);
    const blockId = this.world.getBlock(x, y, z);
    const state = this.world.machines.get(key);
    if (!state) return;
    if (BLOCKS[blockId].automation === "storage") {
      this.callbacks.onToast("Storage blocks keep a fixed facing so shared contents stay authoritative.");
      return;
    }
    state.orientation = ((state.orientation + 1) % 4) as 0 | 1 | 2 | 3;
    this.world.setBlock(x, y, z, blockId);
    this.broadcastMachine(key, state);
    this.callbacks.onToast("Machine rotated clockwise.");
  }

  private broadcastMachine(key: string, state: MachineState): void {
    const message = {
      type: this.network.role === "guest" ? "request-machine" : "machine",
      key,
      state: cloneMachineState(state),
    } as NetworkMessage;
    this.network.send(message);
  }

  private queueChunk(key: string): void {
    if (this.queuedChunks.has(key)) return;
    this.queuedChunks.add(key);
    this.chunkQueue.push(key);
  }

  private queueNearbyChunks(force = false): void {
    const centerX = floorDiv(Math.floor(this.physics.position.x), CHUNK_SIZE);
    const centerZ = floorDiv(Math.floor(this.physics.position.z), CHUNK_SIZE);
    const radius = this.settings.renderDistance;
    const desired = new Set<string>();
    const candidates: Array<{ key: string; distance: number }> = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const key = chunkKey(centerX + dx, centerZ + dz);
        desired.add(key);
        if (force || !this.chunks.has(key)) candidates.push({ key, distance: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) this.queueChunk(candidate.key);
    for (const key of this.world.clearDirty()) {
      if (desired.has(key) && this.chunks.has(key)) this.queueChunk(key);
    }

    for (const [key, meshSet] of this.chunks) {
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx - centerX) > radius + 1 || Math.abs(cz - centerZ) > radius + 1) {
        this.chunkRoot.remove(meshSet.group);
        disposeObject(meshSet.group);
        this.chunks.delete(key);
      }
    }
  }

  private processChunkQueue(): void {
    const key = this.chunkQueue.shift();
    if (!key) return;
    this.queuedChunks.delete(key);
    const [cx, cz] = key.split(",").map(Number);
    const centerX = floorDiv(Math.floor(this.physics.position.x), CHUNK_SIZE);
    const centerZ = floorDiv(Math.floor(this.physics.position.z), CHUNK_SIZE);
    if (
      Math.abs(cx - centerX) > this.settings.renderDistance + 1 ||
      Math.abs(cz - centerZ) > this.settings.renderDistance + 1
    ) return;
    this.rebuildChunk(cx, cz);
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const old = this.chunks.get(key);
    if (old) {
      this.chunkRoot.remove(old.group);
      disposeObject(old.group);
    }
    const chunk = this.world.getChunk(cx, cz);
    const geometries = buildChunkGeometries(this.world, cx, cz);
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    const solid = new THREE.Mesh(geometries.solid, this.solidMaterial);
    solid.receiveShadow = this.settings.graphics === "high";
    solid.castShadow = this.settings.graphics === "high";
    const translucent = new THREE.Mesh(geometries.translucent, this.translucentMaterial);
    translucent.renderOrder = 1;
    const liquid = new THREE.Mesh(geometries.liquid, this.liquidMaterial);
    liquid.renderOrder = 2;
    group.add(solid, translucent, liquid);
    this.chunkRoot.add(group);
    this.chunks.set(key, { group, revision: chunk.revision });
    this.world.dirtyChunks.delete(key);
  }

  private updateIndicators(): void {
    const nearby = new Set<string>();
    const radius = this.settings.renderDistance * CHUNK_SIZE + 10;
    for (const [key, state] of this.world.machines) {
      const [x, y, z] = parseWorldKey(key);
      if (Math.hypot(x - this.physics.position.x, z - this.physics.position.z) > radius) continue;
      const id = this.world.getBlock(x, y, z);
      const powered = state.energy > 0 && [BlockId.BoreDrill, BlockId.Conveyor, BlockId.ArcFurnace, BlockId.Fabricator, BlockId.Hopper, BlockId.Ram, BlockId.FluxCell].includes(id);
      const signaled = state.signal > 0;
      if (!powered && !signaled) continue;
      nearby.add(key);
      let mesh = this.indicatorMeshes.get(key);
      if (!mesh) {
        const lowProfile = ["wire", "plate", "torch"].includes(BLOCKS[id].shape ?? "cube");
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(lowProfile ? 0.16 : 0.18, lowProfile ? 0.025 : 0.045, lowProfile ? 0.16 : 0.18),
          signaled ? this.signalOnMaterial : this.powerMaterial,
        );
        this.indicatorMeshes.set(key, mesh);
        this.indicatorRoot.add(mesh);
      }
      const lowProfile = ["wire", "plate", "torch"].includes(BLOCKS[id].shape ?? "cube");
      mesh.position.set(x + 0.5, y + (lowProfile ? 0.105 : 0.91), z + 0.5);
      mesh.material = signaled ? this.signalOnMaterial : this.powerMaterial;
      mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.08);
    }
    for (const [key, mesh] of this.indicatorMeshes) {
      if (!nearby.has(key)) {
        this.indicatorRoot.remove(mesh);
        mesh.geometry.dispose();
        this.indicatorMeshes.delete(key);
      }
    }
  }

  private updateLocalLights(): void {
    const originX = Math.floor(this.physics.position.x);
    const originY = Math.floor(this.physics.position.y + 1);
    const originZ = Math.floor(this.physics.position.z);
    const candidates: Array<{ x: number; y: number; z: number; id: BlockId; distance: number }> = [];
    for (let x = originX - 18; x <= originX + 18; x += 1) {
      for (let y = originY - 10; y <= originY + 11; y += 1) {
        for (let z = originZ - 18; z <= originZ + 18; z += 1) {
          const id = this.world.peekBlock(x, y, z);
          const emissive = BLOCKS[id].emissive ?? 0;
          if (emissive < 0.48) continue;
          if ([BlockId.FluxLamp, BlockId.LatchLamp].includes(id)) {
            const state = this.world.machines.get(worldKey(x, y, z));
            if (!state || state.signal <= 0) continue;
          }
          const distance = Math.hypot(x + 0.5 - this.physics.position.x, y + 0.5 - originY, z + 0.5 - this.physics.position.z);
          if (distance <= 22) candidates.push({ x, y, z, id, distance });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (let index = 0; index < this.localLights.length; index += 1) {
      const light = this.localLights[index];
      const candidate = candidates[index];
      if (!candidate) {
        light.visible = false;
        light.intensity = 0;
        continue;
      }
      const definition = BLOCKS[candidate.id];
      const warmth = new THREE.Color(definition.color).lerp(new THREE.Color(0xffc277), 0.45);
      light.color.copy(warmth);
      light.position.set(candidate.x + 0.5, candidate.y + 0.65, candidate.z + 0.5);
      light.intensity = 1.05 + (definition.emissive ?? 0.5) * 2.15;
      light.distance = candidate.id === BlockId.DeepLantern ? 23 : 18.5;
      light.decay = candidate.id === BlockId.DeepLantern ? 1.18 : 1.28;
      light.visible = true;
    }
  }

  private updateDrops(dt: number): void {
    for (let index = this.world.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.world.drops[index];
      drop.pickupDelay = Math.max(0, (drop.pickupDelay ?? 0) - dt);
      drop.velocity.y -= 13 * dt;
      drop.velocity.x *= Math.exp(-1.8 * dt);
      drop.velocity.z *= Math.exp(-1.8 * dt);
      const next = {
        x: drop.position.x + drop.velocity.x * dt,
        y: drop.position.y + drop.velocity.y * dt,
        z: drop.position.z + drop.velocity.z * dt,
      };
      const supportY = Math.floor(next.y - 0.12);
      const collisionHeight = this.world.getCollisionHeight(next.x, supportY, next.z);
      const supportTop = supportY + collisionHeight;
      if (collisionHeight > 0 && next.y <= supportTop + 0.14 && drop.velocity.y <= 0) {
        next.y = supportTop + 0.14;
        drop.velocity.y = drop.velocity.y < -2.1 ? -drop.velocity.y * 0.1 : 0;
      }
      drop.position = next;
      const localDistance = Math.hypot(
        drop.position.x - this.physics.position.x,
        drop.position.y - (this.physics.position.y + 0.8),
        drop.position.z - this.physics.position.z,
      );
      if (localDistance < 2.25 && (drop.pickupDelay ?? 0) <= 0) {
        if (!this.collectItem(drop.item, drop.count)) {
          drop.pickupDelay = 0.7;
          if (this.inventoryFullToastTimer <= 0) {
            this.inventoryFullToastTimer = 2.5;
            this.callbacks.onToast("Inventory full · move or use an item before collecting another type.");
          }
          continue;
        }
        this.world.drops.splice(index, 1);
        this.audio.play("click");
        continue;
      }
      for (const [peerId, player] of this.remotePeerPlayers) {
        const distance = Math.hypot(
          drop.position.x - player.position.x,
          drop.position.y - (player.position.y + 0.8),
          drop.position.z - player.position.z,
        );
        if (distance >= 2.25 || (drop.pickupDelay ?? 0) > 0) continue;
        this.network.send({ type: "give-item", item: drop.item, count: drop.count }, peerId);
        this.world.drops.splice(index, 1);
        break;
      }
    }
  }

  private spawnInitialMobs(): void {
    const spawn = this.physics.position;
    for (let index = 0; index < 6; index += 1) {
      const position = findNaturalSpawnSite(
        this.world,
        "passive",
        spawn,
        [spawn],
        this.timeOfDay,
        this.wildlifeRandom,
        20,
      );
      if (!position) break;
      this.addNaturalMob("passive", position, `initial-${index}`);
    }
  }

  private addNaturalMob(category: "passive" | "hostile", position: Vec3Data, prefix = "natural"): void {
    const kind = chooseNaturalMobKind(this.world, category, position, this.wildlifeRandom);
    const mob: MobState = {
      id: `${prefix}-${this.dayCount}-${Date.now().toString(36)}-${Math.floor(this.wildlifeRandom() * 1e6).toString(36)}`,
      kind,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      health: MOB_DEFINITIONS[kind].maxHealth,
      yaw: this.wildlifeRandom() * Math.PI * 2,
      targetTimer: 1 + this.wildlifeRandom() * 3,
      attackTimer: 1.2,
      hurtTimer: 0,
      natural: true,
      spawnedAt: Date.now(),
    };
    if (mobIntersectsSolid(this.world, mob)) return;
    resolveMobPenetration(this.world, mob);
    this.world.mobs.push(mob);
  }

  private spawnNaturalMob(): void {
    const players = [
      { x: this.physics.position.x, y: this.physics.position.y, z: this.physics.position.z },
      ...Array.from(this.remotePeerPlayers.values(), (player) => player.position),
    ];
    const now = Date.now();
    for (let index = this.world.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.world.mobs[index];
      if (!mob.natural || mob.boss || now - (mob.spawnedAt ?? now) < 25_000) continue;
      if (nearestPlayerDistance(mob.position, players) > NATURAL_DESPAWN_DISTANCE) this.world.mobs.splice(index, 1);
    }

    const passiveCount = naturalMobCount(this.world.mobs, "passive");
    const hostileCount = naturalMobCount(this.world.mobs, "hostile");
    const passiveRoom = passiveCount < naturalMobCap("passive", players.length);
    const hostileRoom = hostileCount < naturalMobCap("hostile", players.length);
    if (!passiveRoom && !hostileRoom) return;
    const preferred: "passive" | "hostile" = passiveRoom && (!hostileRoom || this.wildlifeRandom() < 0.38)
      ? "passive"
      : "hostile";
    const categories: Array<"passive" | "hostile"> = preferred === "passive"
      ? ["passive", "hostile"]
      : ["hostile", "passive"];
    const anchor = players[Math.floor(this.wildlifeRandom() * players.length)];
    for (const category of categories) {
      if (category === "passive" ? !passiveRoom : !hostileRoom) continue;
      const position = findNaturalSpawnSite(
        this.world,
        category,
        anchor,
        players,
        this.timeOfDay,
        this.wildlifeRandom,
      );
      if (!position) continue;
      const firstHostile = category === "hostile" && hostileCount === 0;
      this.addNaturalMob(category, position);
      if (firstHostile && this.mode === "survival") {
        this.callbacks.onToast("Dark, unlit ground can now attract hostile creatures. Torches suppress nearby spawns.");
      }
      return;
    }
  }

  private createMobMesh(mob: MobState): THREE.Group {
    const root = new THREE.Group();
    root.position.set(mob.position.x, mob.position.y, mob.position.z);
    root.userData.gait = this.wildlifeRandom() * Math.PI * 2;
    root.userData.voiceTimer = 2 + this.wildlifeRandom() * 7;
    root.userData.stepTimer = 0;
    root.userData.baseScale = mob.boss ? 1.48 : 1;
    root.scale.setScalar(root.userData.baseScale);
    const visual = new THREE.Group();
    visual.name = "visual";
    root.add(visual);

    const palette = CREATURE_PALETTES[mob.kind];
    const rememberColor = (material: THREE.MeshLambertMaterial, ownsMap = false) => {
      material.userData.baseColor = material.color.getHex();
      material.userData.ownedMap = ownsMap;
      return material;
    };
    const bodyMaterial = rememberColor(new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: createCreatureTexture(mob.kind),
      emissive: mob.kind === "nightwisp" ? 0x263b75 : 0x000000,
      emissiveIntensity: mob.kind === "nightwisp" ? 0.68 : 0,
    }), true);
    const accentMaterial = rememberColor(new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: createCreatureTexture(mob.kind, true),
      emissive: mob.kind === "cinderling" ? 0x7b2e18 : mob.kind === "nightwisp" ? 0x5269d4 : 0x000000,
      emissiveIntensity: mob.kind === "nightwisp" ? 0.8 : mob.kind === "cinderling" ? 0.38 : 0,
    }), true);
    const darkMaterial = rememberColor(new THREE.MeshLambertMaterial({ color: palette.mark }));
    const eyeMaterial = rememberColor(new THREE.MeshLambertMaterial({
      color: palette.eye,
      emissive: palette.eye,
      emissiveIntensity: mob.kind === "nightwisp" || mob.kind === "cinderling" ? 0.95 : 0.26,
    }));
    const addPart = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
      name = "",
    ): THREE.Mesh => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      part.position.set(...position);
      part.name = name;
      part.castShadow = this.settings.graphics === "high";
      parent.add(part);
      return part;
    };
    const addPivotPart = (
      name: string,
      pivotPosition: [number, number, number],
      size: [number, number, number],
      material: THREE.Material,
    ): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(...pivotPosition);
      addPart(pivot, size, [0, -size[1] / 2, 0], material);
      visual.add(pivot);
      return pivot;
    };

    if (mob.kind === "nightwisp") {
      addPart(visual, [0.62, 0.64, 0.5], [0, 0.68, 0], bodyMaterial, "body").rotation.set(0.06, 0.12, 0.04);
      addPart(visual, [0.44, 0.22, 0.12], [0, 0.72, -0.29], accentMaterial, "face");
      for (const x of [-0.13, 0.13]) addPart(visual, [0.08, 0.1, 0.04], [x, 0.75, -0.37], eyeMaterial);
      for (const [index, x] of [-0.24, -0.08, 0.08, 0.24].entries()) {
        addPivotPart(`leg-${index}`, [x, 0.42, 0.06 + Math.abs(x) * 0.2], [0.08, 0.4 + (index % 2) * 0.12, 0.08], index % 2 ? accentMaterial : bodyMaterial);
      }
      addPart(visual, [0.09, 0.09, 0.09], [-0.42, 0.84, 0.02], eyeMaterial);
      addPart(visual, [0.06, 0.06, 0.06], [0.38, 0.48, 0.08], eyeMaterial);
      return root;
    }

    if (mob.kind === "wayfarer") {
      const professionColor: Record<VillagerProfession, number> = {
        farmer: 0x789a57,
        blacksmith: 0x596873,
        builder: 0xb87949,
        riftwright: 0x7862a8,
      };
      const profession = mob.profession ?? "farmer";
      const professionMaterial = rememberColor(new THREE.MeshLambertMaterial({ color: professionColor[profession] }));
      addPart(visual, [0.56, 0.82, 0.34], [0, 1.02, 0], bodyMaterial, "body");
      addPart(visual, [0.48, 0.46, 0.05], [0, 1.08, -0.2], professionMaterial, "apron");
      addPart(visual, [0.48, 0.44, 0.46], [0, 1.62, -0.02], accentMaterial, "head");
      addPart(visual, [0.16, 0.14, 0.12], [0, 1.56, -0.29], accentMaterial, "nose");
      for (const x of [-0.13, 0.13]) addPart(visual, [0.07, 0.07, 0.035], [x, 1.68, -0.26], eyeMaterial);
      addPart(visual, [0.64, 0.1, 0.58], [0, 1.9, -0.01], darkMaterial);
      addPart(visual, [0.66, 0.055, 0.6], [0, 1.94, -0.01], professionMaterial, "hat-band");
      addPart(visual, [0.45, 0.2, 0.42], [0, 2.01, 0], bodyMaterial);
      addPart(visual, [0.46, 0.52, 0.18], [0, 1.08, 0.25], darkMaterial, "pack");
      for (const [index, x] of [-0.18, 0.18].entries()) addPivotPart(`leg-${index}`, [x, 0.62, 0], [0.2, 0.62, 0.22], darkMaterial);
      for (const [index, x] of [-0.37, 0.37].entries()) addPivotPart(`arm-${index}`, [x, 1.35, 0], [0.15, 0.67, 0.17], accentMaterial);
      return root;
    }

    if (mob.kind === "chicken") {
      addPart(visual, [0.5, 0.46, 0.62], [0, 0.47, 0.04], bodyMaterial, "body");
      addPart(visual, [0.36, 0.36, 0.38], [0, 0.78, -0.33], bodyMaterial, "head");
      addPart(visual, [0.24, 0.12, 0.25], [0, 0.72, -0.62], darkMaterial, "beak");
      addPart(visual, [0.13, 0.22, 0.1], [0, 1.03, -0.34], accentMaterial, "comb");
      addPart(visual, [0.1, 0.13, 0.08], [0, 0.57, -0.58], accentMaterial, "wattle");
      for (const x of [-0.12, 0.12]) addPart(visual, [0.055, 0.065, 0.035], [x, 0.84, -0.535], eyeMaterial);
      for (const [index, x] of [-0.3, 0.3].entries()) {
        const wing = addPivotPart(`arm-${index}`, [x, 0.64, 0.02], [0.14, 0.38, 0.44], bodyMaterial);
        wing.rotation.z = x < 0 ? -0.2 : 0.2;
      }
      for (const [index, x] of [-0.13, 0.13].entries()) addPivotPart(`leg-${index}`, [x, 0.27, 0.05], [0.07, 0.27, 0.07], darkMaterial);
      const tail = addPart(visual, [0.34, 0.42, 0.12], [0, 0.65, 0.39], bodyMaterial, "tail");
      tail.rotation.x = -0.35;
      return root;
    }

    const thornback = mob.kind === "thornback";
    const bodyWidth = thornback ? 1.02 : mob.kind === "cow" ? 1 : mob.kind === "sheep" ? 0.9 : mob.kind === "mireling" ? 0.86 : mob.kind === "pig" ? 0.76 : 0.78;
    const bodyLength = thornback ? 1.2 : mob.kind === "cow" ? 1.28 : mob.kind === "sheep" ? 1.08 : mob.kind === "mireling" ? 0.92 : mob.kind === "pig" ? 0.94 : 1.02;
    addPart(visual, [bodyWidth, 0.58, bodyLength], [0, 0.68, 0.04], bodyMaterial, "body");
    if (mob.kind === "sheep") addPart(visual, [bodyWidth + 0.12, 0.64, bodyLength + 0.12], [0, 0.71, 0.04], bodyMaterial, "fleece");
    if (mob.kind === "mireling") addPart(visual, [0.72, 0.24, 0.72], [0, 1.02, 0.13], darkMaterial, "shell");
    const headMaterial = mob.kind === "sheep" ? darkMaterial : accentMaterial;
    const head = addPart(visual, [0.56, 0.5, 0.54], [0, 0.84, -bodyLength / 2 - 0.18], headMaterial, "head");
    head.rotation.x = mob.kind === "mireling" ? -0.08 : 0;
    addPart(visual, [0.38, 0.22, 0.28], [0, 0.73, -bodyLength / 2 - 0.52], darkMaterial, "muzzle");
    for (const x of [-0.17, 0.17]) addPart(visual, [0.07, 0.08, 0.04], [x, 0.93, -bodyLength / 2 - 0.465], eyeMaterial);

    if (thornback) {
      for (const [index, z] of [-0.38, -0.02, 0.34].entries()) {
        const spike = addPart(visual, [0.13, 0.45 - index * 0.04, 0.13], [0, 1.18, z], accentMaterial);
        spike.rotation.z = index % 2 ? -0.3 : 0.3;
      }
      for (const x of [-0.3, 0.3]) {
        const cheek = addPart(visual, [0.22, 0.12, 0.18], [x, 0.79, -0.78], accentMaterial);
        cheek.rotation.z = x < 0 ? -0.38 : 0.38;
      }
    } else if (mob.kind === "cow") {
      for (const x of [-0.22, 0.22]) {
        const horn = addPart(visual, [0.08, 0.27, 0.08], [x, 1.18, -bodyLength / 2 - 0.2], darkMaterial);
        horn.rotation.z = x < 0 ? -0.48 : 0.48;
        const ear = addPart(visual, [0.23, 0.09, 0.15], [x * 1.42, 1.04, -bodyLength / 2 - 0.18], bodyMaterial);
        ear.rotation.z = x < 0 ? -0.28 : 0.28;
      }
      addPart(visual, [0.34, 0.14, 0.3], [0, 0.38, 0.18], accentMaterial, "udder");
    } else if (mob.kind === "sheep") {
      for (const x of [-0.29, 0.29]) {
        const ear = addPart(visual, [0.22, 0.09, 0.15], [x, 0.98, -bodyLength / 2 - 0.22], darkMaterial);
        ear.rotation.z = x < 0 ? -0.3 : 0.3;
      }
    } else if (mob.kind === "pig") {
      for (const x of [-0.22, 0.22]) {
        const ear = addPart(visual, [0.2, 0.2, 0.08], [x, 1.1, -bodyLength / 2 - 0.2], accentMaterial);
        ear.rotation.z = x < 0 ? -0.42 : 0.42;
      }
      addPart(visual, [0.34, 0.22, 0.25], [0, 0.75, -bodyLength / 2 - 0.54], accentMaterial, "snout");
    } else if (mob.kind === "glowgrazer") {
      for (const x of [-0.22, 0.22]) {
        const horn = addPart(visual, [0.09, 0.3, 0.09], [x, 1.22, -0.6], accentMaterial);
        horn.rotation.z = x < 0 ? -0.5 : 0.5;
        const ear = addPart(visual, [0.22, 0.08, 0.16], [x * 1.42, 1.04, -0.6], bodyMaterial);
        ear.rotation.z = x < 0 ? -0.26 : 0.26;
      }
    } else if (mob.kind === "cinderling") {
      for (const x of [-0.2, 0, 0.2]) {
        const crest = addPart(visual, [0.09, 0.28 + (x === 0 ? 0.12 : 0), 0.09], [x, 1.22, -0.48], accentMaterial);
        crest.rotation.z = x * 0.8;
      }
      for (const z of [-0.18, 0.28]) addPart(visual, [0.22, 0.12, 0.22], [0, 1.02, z], accentMaterial);
    } else if (mob.kind === "mireling") {
      for (const x of [-0.3, 0.3]) {
        const fin = addPart(visual, [0.28, 0.08, 0.2], [x, 0.78, -0.46], accentMaterial);
        fin.rotation.z = x < 0 ? -0.5 : 0.5;
      }
    }

    let legIndex = 0;
    for (const x of [-bodyWidth * 0.3, bodyWidth * 0.3]) {
      for (const z of [-bodyLength * 0.3, bodyLength * 0.3]) {
        addPivotPart(`leg-${legIndex}`, [x, 0.53, z], [0.18, 0.52, 0.18], legIndex % 2 ? accentMaterial : bodyMaterial);
        legIndex += 1;
      }
    }
    const tail = new THREE.Group();
    tail.name = "tail";
    tail.position.set(0, 0.76, bodyLength / 2 + 0.02);
    const tailLength = thornback ? 0.58 : 0.42;
    const tailPart = addPart(tail, [0.13, 0.13, tailLength], [0, 0, tailLength / 2], thornback ? accentMaterial : bodyMaterial);
    tailPart.rotation.x = mob.kind === "glowgrazer" ? -0.25 : 0.08;
    visual.add(tail);
    return root;
  }

  private updateMobs(dt: number): void {
    for (const mob of this.world.mobs) {
      const definition = MOB_DEFINITIONS[mob.kind];
      resolveMobPenetration(this.world, mob);
      let targetPosition = this.physics.position as { x: number; y: number; z: number };
      let targetPeerId: string | undefined;
      let distance = Math.hypot(targetPosition.x - mob.position.x, targetPosition.z - mob.position.z);
      for (const [peerId, player] of this.remotePeerPlayers) {
        const candidateDistance = Math.hypot(player.position.x - mob.position.x, player.position.z - mob.position.z);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          targetPosition = player.position;
          targetPeerId = peerId;
        }
      }
      const dx = targetPosition.x - mob.position.x;
      const dz = targetPosition.z - mob.position.z;
      const hostile = !definition.passive;
      mob.targetTimer -= dt;
      mob.attackTimer = Math.max(0, (mob.attackTimer ?? 0) - dt);
      mob.hurtTimer = Math.max(0, (mob.hurtTimer ?? 0) - dt);
      const fleeing = definition.passive && (mob.hurtTimer ?? 0) > 0;
      if (hostile && distance < 15) mob.yaw = Math.atan2(-dx, -dz);
      else if (fleeing && distance < 9) mob.yaw = Math.atan2(dx, dz);
      else if (mob.targetTimer <= 0) {
        const activityRoll = this.wildlifeRandom();
        mob.activity = activityRoll < 0.32 ? "idle" : activityRoll < 0.53 ? "curious" : "wander";
        mob.targetTimer = mob.activity === "idle" ? 1.4 + this.wildlifeRandom() * 3.2 : 2.4 + this.wildlifeRandom() * 5;
        mob.yaw += (this.wildlifeRandom() - 0.5) * Math.PI * 1.45;
      }
      if (!mob.activity) mob.activity = "wander";
      if (!hostile && !fleeing && mob.activity === "curious" && distance < 7) mob.yaw = Math.atan2(-dx, -dz);

      let returningHome = false;
      if (mob.kind === "wayfarer" && mob.home) {
        const homeDx = mob.home.x - mob.position.x;
        const homeDz = mob.home.z - mob.position.z;
        if (Math.hypot(homeDx, homeDz) > 7) {
          mob.yaw = Math.atan2(-homeDx, -homeDz);
          returningHome = true;
          mob.activity = "wander";
        }
      }
      const speed = fleeing
        ? definition.speed * 1.45
        : hostile && distance < 15
          ? definition.speed
          : returningHome
            ? definition.speed * 0.78
            : mob.activity === "idle"
              ? 0
              : mob.activity === "curious"
                ? distance > 3.2 ? Math.min(0.54, definition.speed * 0.34) : 0
                : Math.min(0.78, definition.speed * 0.44);
      let desiredX = -Math.sin(mob.yaw) * speed;
      let desiredZ = -Math.cos(mob.yaw) * speed;
      for (const other of this.world.mobs) {
        if (other === mob) continue;
        const separationX = mob.position.x - other.position.x;
        const separationZ = mob.position.z - other.position.z;
        const separation = Math.hypot(separationX, separationZ);
        const desiredGap = definition.radius + MOB_DEFINITIONS[other.kind].radius + 0.08;
        if (separation > 0.001 && separation < desiredGap) {
          const force = (desiredGap - separation) * 4;
          desiredX += (separationX / separation) * force;
          desiredZ += (separationZ / separation) * force;
        }
      }
      if (distance > 0.001 && distance < definition.radius + 0.42) {
        desiredX -= (dx / distance) * 2.5;
        desiredZ -= (dz / distance) * 2.5;
      }
      const desiredY = Math.max(-1.4, Math.min(1.4, (targetPosition.y - mob.position.y) * 0.65));
      const movement = moveMobWithCollision(this.world, mob, dt, desiredX, desiredZ, desiredY);
      if (movement.blocked && mob.velocity.y <= 0.1) {
        mob.yaw += Math.PI * (0.45 + this.wildlifeRandom() * 0.45);
        mob.targetTimer = 0.6;
      }
      resolveMobPenetration(this.world, mob);
      if (hostile && distance < definition.reach && (mob.attackTimer ?? 0) <= 0) {
        mob.attackTimer = 1.45 + this.wildlifeRandom() * 0.55;
        const source = `${definition.name} attack`;
        if (!targetPeerId) this.audio.playCreature(mob.kind, "attack", distance);
        const damage = definition.damage * (mob.boss ? 1.38 : 1);
        if (targetPeerId) this.network.send({ type: "damage", amount: damage, source }, targetPeerId);
        else this.damage(damage, source);
      }
    }
  }

  private syncEntityMeshes(dt: number): void {
    const mobIds = new Set(this.world.mobs.map((mob) => mob.id));
    for (const mob of this.world.mobs) {
      let mesh = this.mobMeshes.get(mob.id);
      if (!mesh) {
        mesh = this.createMobMesh(mob);
        this.mobMeshes.set(mob.id, mesh);
        this.entityRoot.add(mesh);
      }
      const motion = Math.hypot(mob.velocity.x, mob.velocity.z);
      const now = performance.now() / 1000;
      const hover = mob.kind === "nightwisp" ? 0.16 + Math.sin(now * 3.4 + mob.id.length) * 0.12 : 0;
      const targetPosition = new THREE.Vector3(mob.position.x, mob.position.y, mob.position.z);
      mesh.position.lerp(targetPosition, 1 - Math.exp(-15 * dt));
      const yawDelta = Math.atan2(Math.sin(mob.yaw - mesh.rotation.y), Math.cos(mob.yaw - mesh.rotation.y));
      mesh.rotation.y += yawDelta * (1 - Math.exp(-11 * dt));
      const baseScale = Number(mesh.userData.baseScale ?? 1);
      const targetScale = baseScale * ((mob.hurtTimer ?? 0) > 0 ? 1.06 : 1);
      mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.exp(-18 * dt));
      mesh.userData.gait = Number(mesh.userData.gait ?? 0) + dt * (2.7 + Math.min(3.8, motion * 2.7));
      mesh.userData.voiceTimer = Number(mesh.userData.voiceTimer ?? 4) - dt;
      mesh.userData.stepTimer = Number(mesh.userData.stepTimer ?? 0) - dt;
      const gait = Number(mesh.userData.gait);
      const movementBlend = THREE.MathUtils.clamp(motion / 1.25, 0, 1);
      const airborne = Math.abs(mob.velocity.y) > 0.18;
      const localDistance = Math.hypot(
        mob.position.x - this.physics.position.x,
        mob.position.y - this.physics.position.y,
        mob.position.z - this.physics.position.z,
      );
      if (mesh.userData.voiceTimer <= 0) {
        if (localDistance < 22) this.audio.playCreature(mob.kind, "idle", localDistance);
        mesh.userData.voiceTimer = (mob.kind === "wayfarer" ? 5 : 7) + this.wildlifeRandom() * 10;
      }
      if (
        mob.kind !== "nightwisp" &&
        motion > 0.58 &&
        !airborne &&
        localDistance < 12 &&
        mesh.userData.stepTimer <= 0
      ) {
        this.audio.playCreature(mob.kind, "step", localDistance);
        mesh.userData.stepTimer = mob.kind === "thornback" ? 0.52 : 0.4;
      }
      let legIndex = 0;
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material;
          const materials = Array.isArray(material) ? material : [material];
          for (const entry of materials) {
            if (entry instanceof THREE.MeshLambertMaterial && typeof entry.userData.baseColor === "number") {
              entry.color.setHex(entry.userData.baseColor);
              if ((mob.hurtTimer ?? 0) > 0) entry.color.lerp(new THREE.Color(0xffe2da), 0.72);
            }
          }
        }
        if (child.name.startsWith("leg-")) {
          const phase = gait + legIndex * Math.PI;
          const targetSwing = airborne
            ? (legIndex % 2 === 0 ? -0.38 : 0.38)
            : Math.sin(phase) * movementBlend * 0.62;
          child.rotation.x += (targetSwing - child.rotation.x) * (1 - Math.exp(-16 * dt));
          legIndex += 1;
        } else if (child.name.startsWith("arm-")) {
          const armIndex = Number(child.name.slice(4)) || 0;
          const targetSwing = Math.sin(gait + (armIndex + 1) * Math.PI) * movementBlend * 0.48;
          child.rotation.x += (targetSwing - child.rotation.x) * (1 - Math.exp(-14 * dt));
        } else if (child.name === "tail") {
          const targetSwing = Math.sin(now * 2.4 + mob.id.length) * (0.16 + movementBlend * 0.22);
          child.rotation.y += (targetSwing - child.rotation.y) * (1 - Math.exp(-9 * dt));
        } else if (child.name === "head") {
          const curious = mob.activity === "curious" || mob.kind === "wayfarer";
          const targetTurn = curious ? Math.sin(now * 0.8 + mob.id.length) * 0.14 : 0;
          child.rotation.y += (targetTurn - child.rotation.y) * (1 - Math.exp(-5 * dt));
        } else if (child.name === "visual") {
          const groundedBob = airborne ? 0.035 : Math.abs(Math.sin(gait * 2)) * 0.035 * movementBlend;
          child.position.y = hover + groundedBob;
          child.rotation.z = Math.sin(gait) * movementBlend * 0.018;
        }
      });
    }
    for (const [id, mesh] of this.mobMeshes) {
      if (!mobIds.has(id)) {
        this.entityRoot.remove(mesh);
        disposeObject(mesh, true);
        this.mobMeshes.delete(id);
      }
    }

    const dropIds = new Set(this.world.drops.map((drop) => drop.id));
    for (const drop of this.world.drops) {
      let mesh = this.dropMeshes.get(drop.id);
      if (!mesh) {
        mesh = this.createDropMesh(drop.item);
        this.dropMeshes.set(drop.id, mesh);
        this.entityRoot.add(mesh);
      }
      const hover = Math.sin(performance.now() / 720 + drop.id.length) * 0.012;
      mesh.position.set(drop.position.x, drop.position.y + hover, drop.position.z);
      mesh.rotation.y += dt * 1.35;
    }
    for (const [id, mesh] of this.dropMeshes) {
      if (!dropIds.has(id)) {
        this.entityRoot.remove(mesh);
        disposeObject(mesh, true);
        this.dropMeshes.delete(id);
      }
    }
  }

  private createDropMesh(item: ItemId): THREE.Mesh {
    const blockId = blockForItem(item);
    if (blockId !== null) {
      const shape = BLOCKS[blockId].shape ?? "cube";
      const geometry: THREE.BufferGeometry = shape === "cross"
        ? new THREE.PlaneGeometry(0.34, 0.42)
        : shape === "wire" || shape === "plate"
          ? new THREE.BoxGeometry(0.34, 0.055, 0.34)
            : shape === "torch" || shape === "rod" || shape === "ladder"
            ? new THREE.BoxGeometry(0.09, 0.38, 0.09)
            : shape === "slab"
              ? new THREE.BoxGeometry(0.32, 0.16, 0.32)
              : shape === "pane"
                ? new THREE.BoxGeometry(0.34, 0.36, 0.045)
              : shape === "hopper"
                ? new THREE.CylinderGeometry(0.11, 0.21, 0.28, 4)
                : new THREE.BoxGeometry(0.26, 0.26, 0.26);
      paintBlockUv(geometry, blockId);
      return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
        map: this.atlas,
        transparent: !BLOCKS[blockId].opaque && !isLeafBlock(blockId),
        alphaTest: 0.08,
        side: THREE.DoubleSide,
      }));
    }
    const geometry: THREE.BufferGeometry = item.startsWith("tool:")
      ? new THREE.BoxGeometry(0.09, 0.46, 0.09)
      : item.startsWith("ammo:")
        ? new THREE.BoxGeometry(0.08, 0.08, 0.5)
        : item.startsWith("food:")
          ? new THREE.DodecahedronGeometry(0.19, 0)
          : item.startsWith("consumable:")
            ? new THREE.CylinderGeometry(0.11, 0.14, 0.31, 6)
            : new THREE.OctahedronGeometry(0.2, 0);
    const hue = (hashString(item) % 360) / 360;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(hue, 0.62, 0.61),
      emissive: item.startsWith("ammo:") || item.includes("moonshard") ? 0x294d5d : 0x000000,
      emissiveIntensity: 0.38,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (item.startsWith("tool:")) mesh.rotation.z = 0.65;
    return mesh;
  }

  private createRemotePlayerMesh(player: PlayerSnapshot): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: player.color });
    const dark = material.clone();
    dark.color.multiplyScalar(0.68);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), material);
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), material);
    head.position.y = 1.68;
    group.add(body, head);
    for (const x of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
      leg.position.set(x, 0.4, 0);
      group.add(leg);
    }
    return group;
  }

  private updateRemotePlayerMeshes(): void {
    for (const [id, player] of this.remotePlayers) {
      if (id === this.network.playerId) continue;
      let mesh = this.remotePlayerMeshes.get(id);
      if (!mesh) {
        mesh = this.createRemotePlayerMesh(player);
        this.remotePlayerMeshes.set(id, mesh);
        this.remotePlayerRoot.add(mesh);
      }
      mesh.position.set(player.position.x, player.position.y, player.position.z);
      mesh.rotation.y = player.yaw;
    }
    for (const [id, mesh] of this.remotePlayerMeshes) {
      if (!this.remotePlayers.has(id)) {
        this.remotePlayerRoot.remove(mesh);
        disposeObject(mesh, true);
        this.remotePlayerMeshes.delete(id);
      }
    }
  }

  private updateDayNight(dt: number): void {
    const previousTime = this.timeOfDay;
    this.timeOfDay = (this.timeOfDay + dt / 480) % 1;
    if (previousTime < 0.25 && this.timeOfDay >= 0.25) {
      this.dayCount += 1;
      if (this.mode === "survival") this.objective = `Day ${this.dayCount}: explore farther, improve your gear, and prepare your defenses.`;
    }
    const isNight = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    if (isNight && this.nightAnnouncementDay !== this.dayCount) {
      this.nightAnnouncementDay = this.dayCount;
      if (this.mode === "survival") {
        this.objective = "Nightfall: seek shelter, light the area, or defend yourself until dawn.";
        this.callbacks.onToast(`Night ${this.dayCount} has fallen. Hostile creatures are active.`);
      }
    }
    const inEmberdeep = isEmberdeepCoordinate(this.physics.position.x);
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const solarHeight = Math.sin(angle);
    const daylight = THREE.MathUtils.smoothstep(solarHeight, -0.2, 0.16);
    const dayColor = new THREE.Color(0x8fc8d8);
    const nightColor = new THREE.Color(0x354d6c);
    const twilightColor = new THREE.Color(0xc17774);
    const sky = nightColor.clone().lerp(dayColor, daylight);
    const twilight = Math.max(0, 1 - Math.abs(solarHeight) / 0.34) * 0.46;
    sky.lerp(twilightColor, twilight);
    if (inEmberdeep) sky.setHex(0x4a2838);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    this.hemisphere.color.setHex(inEmberdeep ? 0xffa06c : daylight > 0.28 ? 0xbce9ff : 0x8299c9);
    this.hemisphere.groundColor.setHex(inEmberdeep ? 0x351a23 : daylight > 0.28 ? 0x5a4a36 : 0x343b52);
    this.hemisphere.intensity = inEmberdeep ? 1.02 : 0.72 + daylight * 0.78;
    this.ambient.color.setHex(inEmberdeep ? 0xff8a62 : 0x91a9c9);
    this.ambient.intensity = inEmberdeep ? 0.46 : 0.34 + daylight * 0.17;
    this.sun.intensity = inEmberdeep ? 0.28 : 0.16 + daylight * 1.62;
    const orbitRadius = 145;
    const orbitX = Math.cos(angle) * orbitRadius;
    const orbitY = solarHeight * orbitRadius;
    this.sun.position.set(
      this.physics.position.x + orbitX,
      this.physics.position.y + orbitY,
      this.physics.position.z + 44,
    );
    this.sun.target.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    this.sunDisc.position.copy(this.sun.position);
    this.sunDisc.visible = !inEmberdeep && solarHeight > -0.12;
    this.moonDisc.position.set(
      this.physics.position.x - orbitX,
      this.physics.position.y - orbitY,
      this.physics.position.z - 44,
    );
    this.moonDisc.visible = !inEmberdeep && solarHeight < 0.18;
    this.starField.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    const starMaterial = this.starField.material as THREE.PointsMaterial;
    starMaterial.opacity = inEmberdeep ? 0 : Math.max(0, 1 - daylight * 1.35);
  }

  private damage(amount: number, source: string): void {
    if (this.mode === "creative") return;
    this.health = Math.max(0, this.health - amount);
    this.audio.play("hurt");
    this.callbacks.onToast(`${source} · −${Math.round(amount)} health`);
    if (this.health <= 0) {
      this.publishDeath(source);
      const spawn = this.world.findSpawn();
      this.physics.position.set(spawn.x, spawn.y, spawn.z);
      this.physics.velocity.set(0, 0, 0);
      this.health = 100;
      this.hunger = 76;
      this.callbacks.onToast("You reformed at the frontier beacon.");
    }
  }

  private playerSnapshot(): PlayerSnapshot {
    const hue = hashString(this.network.playerId) % 360;
    return {
      id: this.network.playerId,
      name: this.playerName,
      position: {
        x: this.physics.position.x,
        y: this.physics.position.y,
        z: this.physics.position.z,
      },
      yaw: this.physics.yaw,
      pitch: this.physics.pitch,
      color: `hsl(${hue} 62% 58%)`,
      velocityY: this.physics.velocity.y,
      grounded: this.physics.grounded,
      swimming: this.physics.swimming,
      flying: this.creativeFlying,
      crouching: this.input.crouch,
    };
  }

  private handleNetworkMessage(message: NetworkMessage, peerId: string): void {
    if (message.type === "request-snapshot" && this.network.role === "host") {
      this.network.send({ type: "snapshot", save: this.makeSave() }, peerId);
    } else if (message.type === "snapshot" && this.network.role === "guest") {
      this.applyRemoteSnapshot(message.save);
      this.callbacks.onToast(`Joined world “${message.save.seed}”`);
    } else if (message.type === "resync" && this.network.role === "guest") {
      this.applyRemoteSnapshot(message.save, true);
      this.callbacks.onToast("Room reconnected · local inventory preserved");
    } else if (message.type === "host-transfer" && this.network.role === "host") {
      this.applyRemoteSnapshot(message.save, true);
      this.callbacks.onToast("The previous host left. You now own the synchronized world.");
    } else if (message.type === "request-block" && this.network.role === "host") {
      const coordinatesValid = Number.isInteger(message.x)
        && Number.isInteger(message.y)
        && Number.isInteger(message.z)
        && message.y > WORLD_MIN_Y
        && message.y < WORLD_MAX_Y;
      const blockValid = Number.isInteger(message.id) && Boolean(BLOCKS[message.id]);
      const player = this.remotePeerPlayers.get(peerId);
      const withinReach = coordinatesValid && player && Math.hypot(
        player.position.x - (message.x + 0.5),
        player.position.y + 1 - (message.y + 0.5),
        player.position.z - (message.z + 0.5),
      ) <= 7;
      if (withinReach && blockValid) {
        const removed = this.world.getBlock(message.x, message.y, message.z);
        this.applyBlockChange(message.x, message.y, message.z, message.id, true);
        if (message.id === BlockId.Air && this.canHarvest(removed, message.item ?? null)) {
          this.spawnDrop(this.blockDrop(removed), 1, { x: message.x + 0.5, y: message.y - 0.05, z: message.z + 0.5 });
        }
        this.network.send({ ...message, type: "block" });
      } else if (coordinatesValid) this.network.send({
        type: "block",
        x: message.x,
        y: message.y,
        z: message.z,
        id: this.world.getBlock(message.x, message.y, message.z),
      }, peerId);
    } else if (message.type === "block") {
      this.applyBlockChange(message.x, message.y, message.z, message.id, true);
    } else if (message.type === "request-machine" && this.network.role === "host") {
      if (!message.state || typeof message.state !== "object" || !message.state.storage || typeof message.state.storage !== "object") return;
      const [x, y, z] = parseWorldKey(message.key);
      if (![x, y, z].every(Number.isInteger) || y <= WORLD_MIN_Y || y >= WORLD_MAX_Y) return;
      const player = this.remotePeerPlayers.get(peerId);
      const blockId = this.world.getBlock(x, y, z);
      const existing = this.world.machines.get(message.key);
      const withinReach = player && Math.hypot(
        player.position.x - (x + 0.5),
        player.position.y + 1 - (y + 0.5),
        player.position.z - (z + 0.5),
      ) <= 9;
      const hostManagedStorage = [BlockId.Crate, BlockId.TradePost, BlockId.RelicCache, BlockId.DungeonReturn].includes(blockId);
      if (!existing || !withinReach || !BLOCKS[blockId].automation || hostManagedStorage) return;
      const state = cloneMachineState(message.state);
      state.orientation = Math.max(0, Math.min(3, Math.floor(state.orientation))) as 0 | 1 | 2 | 3;
      state.signal = Math.max(0, Math.min(15, Number.isFinite(state.signal) ? state.signal : 0));
      state.energy = Math.max(0, Math.min(100_000, Number.isFinite(state.energy) ? state.energy : 0));
      this.world.machines.set(message.key, state);
      this.world.setBlock(x, y, z, this.world.getBlock(x, y, z), false);
      this.network.send({ type: "machine", key: message.key, state });
    } else if (message.type === "machine") {
      this.world.machines.set(message.key, cloneMachineState(message.state));
      const [x, y, z] = parseWorldKey(message.key);
      if ([x, y, z].every(Number.isInteger)) this.world.setBlock(x, y, z, this.world.getBlock(x, y, z), false);
      if (this.activeChestKey) {
        const chest = this.getChest(this.activeChestKey);
        if (chest) this.callbacks.onChest(chest);
      }
    } else if (message.type === "world-state" && this.network.role === "guest") {
      this.world.applyAuthoritativeMutations(message.mutations);
      if (message.waterLevels) this.world.loadWaterLevels(message.waterLevels);
      for (const [key, state] of message.machines) {
        this.world.machines.set(key, cloneMachineState(state));
      }
      if (this.activeChestKey) {
        const chest = this.getChest(this.activeChestKey);
        if (chest) this.callbacks.onChest(chest);
      }
    } else if (message.type === "request-mob-hit" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const mob = this.world.mobs.find((candidate) => candidate.id === message.mobId);
      if (!player || !mob) return;
      const stats = weaponStats(message.item);
      const origin = new THREE.Vector3(player.position.x, player.position.y + 1.62, player.position.z);
      const center = new THREE.Vector3(
        mob.position.x,
        mob.position.y + MOB_DEFINITIONS[mob.kind].height * 0.55,
        mob.position.z,
      );
      const toMob = center.sub(origin);
      const distance = toMob.length();
      const look = new THREE.Vector3(
        -Math.sin(player.yaw) * Math.cos(player.pitch),
        Math.sin(player.pitch),
        -Math.cos(player.yaw) * Math.cos(player.pitch),
      ).normalize();
      const aim = toMob.clone().normalize();
      const obstruction = voxelRaycast(this.world, origin, aim, stats.reach + 0.9);
      if (
        distance <= stats.reach + 0.9 &&
        look.dot(aim) > 0.55 &&
        (!obstruction || obstruction.distance + 0.3 >= distance)
      ) this.strikeMob(mob, stats, player.position, peerId, isCriticalHit({
        grounded: player.grounded ?? true,
        velocityY: player.velocityY ?? 0,
        swimming: player.swimming,
        flying: player.flying,
      }, stats));
    } else if (message.type === "mob-state" && this.network.role === "guest") {
      this.world.mobs.splice(0, this.world.mobs.length, ...message.mobs.map((mob) => ({
        ...mob,
        position: { ...mob.position },
        velocity: { ...mob.velocity },
      })));
      this.world.drops.splice(0, this.world.drops.length, ...message.drops.map((drop) => ({
        ...drop,
        position: { ...drop.position },
        velocity: { ...drop.velocity },
      })));
      this.timeOfDay = message.timeOfDay;
      this.dayCount = message.dayCount;
    } else if (message.type === "damage" && this.network.role === "guest") {
      this.damage(message.amount, message.source);
    } else if (message.type === "critical-hit") {
      this.showCriticalHit();
    } else if (message.type === "give-item" && this.network.role === "guest") {
      if (this.collectItem(message.item, message.count)) {
        if (
          message.targetSlot !== undefined
          && message.targetSlot >= 0
          && message.targetSlot < INVENTORY_SLOT_COUNT
          && (this.inventorySlots[message.targetSlot] === null || this.inventorySlots[message.targetSlot] === message.item)
        ) this.assignInventorySlot(message.targetSlot, message.item);
        this.audio.play("click");
        this.callbacks.onToast(`Collected ${message.count} × ${itemName(message.item)}.`);
      } else {
        this.network.send({ type: "request-drop", item: message.item, count: message.count });
        this.callbacks.onToast(`Inventory full · ${itemName(message.item)} was returned to the ground.`);
      }
    } else if (message.type === "request-drop" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      if (!player || !ALL_ITEMS.includes(message.item) || message.count < 1 || message.count > 999) return;
      const position = {
        x: player.position.x - Math.sin(player.yaw) * 0.75,
        y: player.position.y + 0.72,
        z: player.position.z - Math.cos(player.yaw) * 0.75,
      };
      this.spawnDrop(message.item, message.count, position, {
        x: -Math.sin(player.yaw) * 4.4,
        y: 1.25 + Math.sin(player.pitch) * 1.1,
        z: -Math.cos(player.yaw) * 4.4,
      }, 1.15);
    } else if (message.type === "request-chest" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      if (!player || !this.chestInRange(message.key, player)) return;
      if (message.direction === "move") {
        this.moveChestSlotAuthoritative(message.key, message.sourceSlot, message.targetSlot);
        return;
      }
      if (!ALL_ITEMS.includes(message.item)) return;
      if (message.direction === "deposit") {
        if (!this.addToChest(message.key, message.item, Math.min(999, message.count), message.targetSlot)) {
          this.network.send({ type: "toast", text: "That chest has no open slots; the deposit was rejected." }, peerId);
          this.network.send({ type: "give-item", item: message.item, count: Math.min(999, message.count), targetSlot: message.sourceSlot }, peerId);
        }
      } else {
        const taken = message.sourceSlot === undefined
          ? (() => {
            const count = this.takeFromChest(message.key, message.item, Math.min(999, message.count));
            return count > 0 ? { item: message.item, count } : null;
          })()
          : this.takeFromChestSlot(message.key, message.sourceSlot, Math.min(999, message.count));
        if (taken) this.network.send({ type: "give-item", item: taken.item, count: taken.count, targetSlot: message.targetSlot }, peerId);
      }
    } else if (message.type === "request-furnace" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const state = this.world.machines.get(message.key);
      const [x, y, z] = parseWorldKey(message.key);
      const inRange = player && this.world.getBlock(x, y, z) === BlockId.HearthFurnace && Math.hypot(
        player.position.x - (x + 0.5),
        player.position.y + 0.8 - (y + 0.5),
        player.position.z - (z + 0.5),
      ) <= 7.5;
      if (!state || !inRange) return;
      if (message.direction === "deposit") {
        const count = Math.min(999, message.count);
        if (!ALL_ITEMS.includes(message.item) || !depositFurnaceItem(state, message.slot, message.item, count)) {
          this.network.send({ type: "toast", text: "That item does not belong in the selected furnace slot." }, peerId);
          this.network.send({ type: "give-item", item: message.item, count, targetSlot: message.sourceSlot }, peerId);
          return;
        }
      } else {
        const taken = withdrawFurnaceItem(state, message.slot, Math.min(999, message.count));
        if (taken) this.network.send({ type: "give-item", item: taken.item, count: taken.count, targetSlot: message.targetSlot }, peerId);
      }
      this.broadcastMachine(message.key, state);
    } else if (message.type === "request-cache" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const closeEnough = player && Math.hypot(
        player.position.x - (message.origin.x + 0.5),
        player.position.y + 0.8 - (message.origin.y + 0.5),
        player.position.z - (message.origin.z + 0.5),
      ) <= 7;
      if (closeEnough) this.openRelicCache(message.origin, peerId);
    } else if (message.type === "request-dungeon" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const id = this.world.getBlock(message.origin.x, message.origin.y, message.origin.z);
      const closeEnough = player && Math.hypot(
        player.position.x - (message.origin.x + 0.5),
        player.position.y + 0.8 - (message.origin.y + 0.5),
        player.position.z - (message.origin.z + 0.5),
      ) <= 7;
      if (!closeEnough || (id !== BlockId.DungeonGate && id !== BlockId.DungeonReturn)) return;
      if (id === BlockId.DungeonReturn) this.returnFromDungeon(message.origin, peerId);
      else this.activateDungeon(message.origin);
    } else if (message.type === "request-sleep" && this.network.role === "host") {
      const night = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
      if (!night) {
        this.network.send({ type: "toast", text: "The Frontier Bed can only be used after nightfall." }, peerId);
        return;
      }
      this.timeOfDay = 0.255;
      this.dayCount += 1;
      this.nightAnnouncementDay = 0;
      this.objective = `Day ${this.dayCount}: morning has returned. Explore, trade, and build.`;
      this.network.send({ type: "toast", text: `You slept through the night. Dawn begins Day ${this.dayCount}.` }, peerId);
      this.callbacks.onToast(`${peerId.slice(-6)} slept through the night.`);
    } else if (message.type === "request-rift" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const originBlock = this.world.getBlock(message.origin.x, message.origin.y, message.origin.z);
      const closeEnough = player && Math.hypot(
        player.position.x - message.origin.x,
        player.position.y - message.origin.y,
        player.position.z - message.origin.z,
      ) < 5;
      if (!closeEnough || originBlock !== BlockId.RiftGate) {
        this.network.send({ type: "toast", text: "The rift route could not be verified." }, peerId);
        return;
      }
      const destination = this.riftDestination(message.origin);
      const entering = isEmberdeepCoordinate(destination.x);
      this.network.send({
        type: "teleport",
        position: destination,
        text: entering ? "The Rift Gate opens into the Emberdeep." : "You return to the living frontier.",
      }, peerId);
    } else if (message.type === "teleport" && this.network.role === "guest") {
      this.physics.position.set(message.position.x, message.position.y, message.position.z);
      this.physics.velocity.set(0, 0, 0);
      this.portalReleaseRequired = true;
      this.queueNearbyChunks(true);
      this.audio.play("rift");
      this.objective = isDungeonCoordinate(message.position.z)
        ? "Expedition active: clear the generated chambers, defeat the guardian, and share the loot."
        : isEmberdeepCoordinate(message.position.x)
        ? "The Emberdeep: gather Riftwood, rare ores, and Ember Glowstone—avoid the molten currents."
        : `Day ${this.dayCount}: returned from the Emberdeep.`;
      this.callbacks.onToast(message.text);
    } else if (message.type === "chat") {
      const text = message.text.trim().slice(0, 180);
      if (text) this.callbacks.onChat({
        id: message.id ?? `chat-${peerId}-${Date.now().toString(36)}`,
        kind: "chat",
        name: message.name?.trim().slice(0, 18) || "Traveler",
        text,
        timestamp: message.timestamp ?? Date.now(),
      });
    } else if (message.type === "death") {
      const source = message.source.trim().slice(0, 80) || "the frontier";
      this.callbacks.onChat({
        id: message.id ?? `death-${peerId}-${Date.now().toString(36)}`,
        kind: "death",
        name: message.name?.trim().slice(0, 18) || "Traveler",
        text: `was defeated by ${source}.`,
        timestamp: message.timestamp ?? Date.now(),
      });
    } else if (message.type === "player") {
      this.remotePlayers.set(message.player.id, message.player);
      this.remotePeerPlayers.set(peerId, message.player);
      if (this.network.role === "host") {
        this.world.getChunk(
          floorDiv(Math.floor(message.player.position.x), CHUNK_SIZE),
          floorDiv(Math.floor(message.player.position.z), CHUNK_SIZE),
        );
      }
    } else if (message.type === "peer-left") {
      const player = this.remotePeerPlayers.get(message.playerId);
      if (player) this.remotePlayers.delete(player.id);
      this.remotePeerPlayers.delete(message.playerId);
    } else if (message.type === "toast") {
      this.callbacks.onToast(message.text);
    }
  }

  private applyRemoteSnapshot(save: WorldSave, preserveLocalPlayer = false): void {
    this.world = new VoxelWorld(save.seed, save.generation ?? WORLD_GENERATION_VERSION);
    this.wildlifeRandom = seededRandom(hashString(`wildlife:${this.world.seedText}`));
    this.world.loadMutations(save.mutations);
    this.world.loadWaterLevels(save.waterLevels);
    for (const [key, state] of save.machines) {
      this.world.machines.set(key, cloneMachineState(state));
    }
    this.world.drops.push(...save.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
    this.world.mobs.push(...save.mobs.map((mob) => ({
      ...mob,
      natural: mob.natural ?? (!mob.boss && mob.kind !== "wayfarer"),
      spawnedAt: mob.spawnedAt ?? Date.now(),
      position: { ...mob.position },
      velocity: { ...mob.velocity },
    })));
    this.timeOfDay = save.timeOfDay;
    this.dayCount = save.dayCount ?? this.dayCount;
    this.mode = save.mode ?? this.mode;
    if (!preserveLocalPlayer) {
      this.inventory = this.mode === "creative" ? creativeInventory() : {};
      this.hotbar = defaultHotbar(this.mode);
      this.inventorySlots = createInventoryLayout(this.inventory, undefined, this.hotbar);
      this.hotbar = hotbarFromLayout(this.inventorySlots);
      this.selectedSlot = 0;
      this.health = 100;
      this.hunger = 100;
      this.stamina = 100;
      this.tradeCredit = 0;
      this.creativeFlying = false;
      this.physics.position.set(save.player.position.x + 1.4, save.player.position.y, save.player.position.z + 1.4);
    }
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    for (const meshSet of this.chunks.values()) {
      this.chunkRoot.remove(meshSet.group);
      disposeObject(meshSet.group);
    }
    this.chunks.clear();
    this.chunkQueue.length = 0;
    this.queuedChunks.clear();
    this.queueNearbyChunks(true);
  }

  private emitHud(networkStatus?: string): void {
    this.clearDepletedHotbar();
    const mobDefinition = this.targetedMob ? MOB_DEFINITIONS[this.targetedMob.kind] : null;
    const locatorMarkers = buildLocatorMarkers(this.physics.position, this.physics.yaw, this.remotePlayers.values());
    this.callbacks.onHud({
      health: this.health,
      hunger: this.hunger,
      stamina: this.stamina,
      selectedSlot: this.selectedSlot,
      hotbar: [...this.hotbar],
      inventorySlots: [...this.inventorySlots],
      inventory: cloneInventory(this.inventory),
      targetedBlock: this.currentHit?.id ?? null,
      miningProgress: this.miningProgress,
      timeOfDay: this.timeOfDay,
      biome: this.world.getBiome(this.physics.position.x, this.physics.position.z),
      coordinates: {
        x: Math.floor(this.physics.position.x),
        y: Math.floor(this.physics.position.y),
        z: Math.floor(this.physics.position.z),
      },
      fps: this.fps,
      networkStatus: networkStatus ?? (this.network.role === "offline" ? "Offline" : `${this.network.role === "host" ? "Hosting" : "Guest"} · ${this.network.connectedPeers} peer${this.network.connectedPeers === 1 ? "" : "s"}`),
      objective: this.objective,
      gameMode: this.mode,
      flying: this.mode === "creative" && this.creativeFlying,
      critical: this.criticalFlash > 0,
      timeLabel: formatFrontierTime(this.timeOfDay),
      dayCount: this.dayCount,
      targetedMob: this.targetedMob && mobDefinition
        ? {
            name: this.targetedMob.bossName ?? mobDefinition.name,
            health: Math.max(0, this.targetedMob.health),
            maxHealth: this.targetedMob.maxHealth ?? mobDefinition.maxHealth,
          }
        : null,
      locatorHeading: compassHeading(this.physics.yaw),
      locatorMarkers,
      workbenchActive: this.stationAvailable("workbench"),
      sprinting: this.input.sprint && (this.mode === "creative" || this.hunger > 10),
    });
  }

  private stationAvailable(station: Recipe["station"]): boolean {
    if (station === "hand") return true;
    if (station === "furnace" || station === "fabricator") return false;
    if (!this.activeWorkbenchKey) return false;
    const [x, y, z] = parseWorldKey(this.activeWorkbenchKey);
    return this.world.getBlock(x, y, z) === BlockId.Workbench
      && Math.hypot(
        this.physics.position.x - (x + 0.5),
        this.physics.position.y + 0.8 - (y + 0.5),
        this.physics.position.z - (z + 0.5),
      ) <= 6.5;
  }

  getRecipes(): Recipe[] {
    return RECIPES.map((recipe) => ({
      ...recipe,
      inputs: { ...recipe.inputs },
      inputOptions: recipe.inputOptions?.map((option) => ({ ...option })),
      output: { ...recipe.output },
    }));
  }

  craft(recipeId: string): boolean {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) return false;
    if (!this.stationAvailable(recipe.station)) {
      this.callbacks.onToast(recipe.station === "workbench" ? "Interact with a placed Tinker Bench to use that recipe." : "That recipe runs inside a machine.");
      return false;
    }
    const recipeInputs = matchingRecipeInputs(recipe, this.inventory);
    if (this.mode === "survival" && !recipeInputs) {
      this.callbacks.onToast("You are missing ingredients.");
      return false;
    }
    if (this.mode === "survival") {
      for (const [item, count] of Object.entries(recipeInputs ?? recipe.inputs)) changeItem(this.inventory, item as ItemId, -count);
      this.clearDepletedHotbar();
      this.collectItem(recipe.output.item, recipe.output.count);
    }
    this.audio.play("craft");
    if (this.mode === "survival") {
      this.objective = recipe.output.item === "tool:wood-pick"
        ? "Your Wooden Pickaxe can harvest stone and coal. Upgrade before mining copper."
        : recipe.output.item === "tool:stone-spear"
          ? "You are armed. Explore by day; hostile creatures emerge after dusk."
          : this.objective;
      this.callbacks.onToast(`Crafted ${recipe.name}.`);
    } else this.callbacks.onToast(`${recipe.name} is already available in the Creative catalog.`);
    this.emitHud();
    return true;
  }

  getMachine(key: string): MachinePanelData | null {
    const inspection = this.automation.inspect(this.world, key);
    if (!inspection) return null;
    return { key, ...inspection, state: cloneMachineState(inspection.state) };
  }

  private adjacentChestKeys(key: string): string[] {
    const [x, y, z] = parseWorldKey(key);
    if (this.world.getBlock(x, y, z) !== BlockId.Crate) return [];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => worldKey(x + dx, y, z + dz))
      .filter((candidate) => {
        const [cx, cy, cz] = parseWorldKey(candidate);
        return this.world.getBlock(cx, cy, cz) === BlockId.Crate;
      })
      .sort((a, b) => {
        const [ax, , az] = parseWorldKey(a);
        const [bx, , bz] = parseWorldKey(b);
        return ax - bx || az - bz;
      });
  }

  private chestKeys(key: string): string[] {
    if (this.world.getBlock(...parseWorldKey(key)) !== BlockId.Crate) return [];
    const partner = this.adjacentChestKeys(key)[0];
    if (!partner || this.adjacentChestKeys(partner)[0] !== key) return [key];
    return [key, partner].sort((a, b) => {
      const [ax, , az] = parseWorldKey(a);
      const [bx, , bz] = parseWorldKey(b);
      return ax - bx || az - bz;
    });
  }

  private ensureChestState(key: string): MachineState | null {
    const state = this.world.machines.get(key);
    if (!state) return null;
    state.storageSlots = reconcileStorageSlots(state.storageSlots, state.storage, SINGLE_CHEST_SLOTS);
    return state;
  }

  getChest(key: string): ChestPanelData | null {
    const keys = this.chestKeys(key);
    if (keys.length === 0) return null;
    const slots: InventoryLayout = [];
    const storage: Inventory = {};
    for (const chestKey of keys) {
      const state = this.ensureChestState(chestKey);
      if (!state) return null;
      slots.push(...(state.storageSlots ?? []));
      for (const [item, count] of Object.entries(state.storage)) storage[item] = (storage[item] ?? 0) + count;
    }
    return {
      keys,
      title: keys.length === 2 ? "Double Frontier Chest" : "Frontier Chest",
      rows: keys.length === 2 ? 6 : 3,
      slots,
      storage,
    };
  }

  private chestInRange(key: string, peer?: PlayerSnapshot): boolean {
    const [x, y, z] = parseWorldKey(key);
    const position = peer?.position ?? this.physics.position;
    return this.world.getBlock(x, y, z) === BlockId.Crate
      && Math.hypot(position.x - (x + 0.5), position.y + 0.8 - (y + 0.5), position.z - (z + 0.5)) <= 7.5;
  }

  private machineInRange(key: string, expected: BlockId, peer?: PlayerSnapshot): boolean {
    const [x, y, z] = parseWorldKey(key);
    const position = peer?.position ?? this.physics.position;
    return this.world.getBlock(x, y, z) === expected
      && Math.hypot(position.x - (x + 0.5), position.y + 0.8 - (y + 0.5), position.z - (z + 0.5)) <= 7.5;
  }

  private chestSlotLocation(key: string, slot: number): { key: string; state: MachineState; localSlot: number } | null {
    const keys = this.chestKeys(key);
    if (!Number.isInteger(slot) || slot < 0 || slot >= keys.length * SINGLE_CHEST_SLOTS) return null;
    const chestIndex = Math.floor(slot / SINGLE_CHEST_SLOTS);
    const chestKey = keys[chestIndex];
    const state = this.ensureChestState(chestKey);
    return state ? { key: chestKey, state, localSlot: slot % SINGLE_CHEST_SLOTS } : null;
  }

  private addToChest(key: string, item: ItemId, count: number, targetSlot?: number): boolean {
    const keys = this.chestKeys(key);
    const states = keys.map((chestKey) => ({ key: chestKey, state: this.ensureChestState(chestKey)! }));
    const requested = targetSlot === undefined ? null : this.chestSlotLocation(key, targetSlot);
    if (targetSlot !== undefined && (!requested || !storageCanAcceptAt(requested.state.storageSlots ?? [], item, requested.localSlot))) return false;
    const destination = states.find(({ state }) => (state.storage[item] ?? 0) > 0)
      ?? (requested ? { key: requested.key, state: requested.state } : null)
      ?? states.find(({ state }) => storageCanAccept(state.storageSlots ?? [], item));
    if (!destination || count <= 0) return false;
    const localTarget = requested?.key === destination.key ? requested.localSlot : undefined;
    destination.state.storageSlots = placeStorageItem(destination.state.storageSlots ?? [], item, localTarget);
    changeItem(destination.state.storage, item, count);
    this.broadcastMachine(destination.key, destination.state);
    return true;
  }

  private takeFromChest(key: string, item: ItemId, count: number): number {
    let remaining = Math.max(0, Math.floor(count));
    let taken = 0;
    for (const chestKey of this.chestKeys(key)) {
      const state = this.ensureChestState(chestKey);
      if (!state || remaining <= 0) break;
      const available = state.storage[item] ?? 0;
      const amount = Math.min(available, remaining);
      if (amount <= 0) continue;
      changeItem(state.storage, item, -amount);
      if ((state.storage[item] ?? 0) <= 0) state.storageSlots = clearStorageItem(state.storageSlots ?? [], item);
      remaining -= amount;
      taken += amount;
      this.broadcastMachine(chestKey, state);
    }
    return taken;
  }

  private takeFromChestSlot(key: string, slot: number, count: number): { item: ItemId; count: number } | null {
    const location = this.chestSlotLocation(key, slot);
    const item = location?.state.storageSlots?.[location.localSlot] ?? null;
    if (!location || !item) return null;
    const amount = Math.min(location.state.storage[item] ?? 0, Math.max(0, Math.floor(count)));
    if (amount <= 0) return null;
    changeItem(location.state.storage, item, -amount);
    if ((location.state.storage[item] ?? 0) <= 0) {
      location.state.storageSlots = clearStorageItem(location.state.storageSlots ?? [], item);
    }
    this.broadcastMachine(location.key, location.state);
    return { item, count: amount };
  }

  private moveChestSlotAuthoritative(key: string, sourceSlot: number, targetSlot: number): boolean {
    const source = this.chestSlotLocation(key, sourceSlot);
    const target = this.chestSlotLocation(key, targetSlot);
    const sourceItem = source?.state.storageSlots?.[source.localSlot] ?? null;
    if (!source || !target || !sourceItem || sourceSlot === targetSlot) return false;
    const targetItem = target.state.storageSlots?.[target.localSlot] ?? null;
    if (source.key === target.key) {
      source.state.storageSlots = moveStorageSlot(source.state.storageSlots ?? [], source.localSlot, target.localSlot);
      this.broadcastMachine(source.key, source.state);
      return true;
    }

    const sourceCount = source.state.storage[sourceItem] ?? 0;
    const targetCount = targetItem ? target.state.storage[targetItem] ?? 0 : 0;
    delete source.state.storage[sourceItem];
    if (targetItem) source.state.storage[targetItem] = targetCount;
    delete target.state.storage[targetItem ?? ""];
    target.state.storage[sourceItem] = sourceCount;
    const sourceSlots = [...(source.state.storageSlots ?? [])];
    const targetSlots = [...(target.state.storageSlots ?? [])];
    sourceSlots[source.localSlot] = targetItem;
    targetSlots[target.localSlot] = sourceItem;
    source.state.storageSlots = sourceSlots;
    target.state.storageSlots = targetSlots;
    this.broadcastMachine(source.key, source.state);
    this.broadcastMachine(target.key, target.state);
    return true;
  }

  depositToChest(key: string, item: ItemId, requestedCount?: number, targetSlot?: number, sourceSlot?: number): boolean {
    if (!this.chestInRange(key)) return false;
    const available = this.mode === "creative" ? 1 : this.inventory[item] ?? 0;
    const count = Math.max(0, Math.min(available, Math.floor(requestedCount ?? available)));
    if (count <= 0) return false;
    const panel = this.getChest(key);
    const targetAvailable = targetSlot === undefined
      ? Boolean(panel && (panel.slots.includes(item) || panel.slots.includes(null)))
      : Boolean(panel && targetSlot >= 0 && targetSlot < panel.slots.length && (panel.slots[targetSlot] === null || panel.slots[targetSlot] === item));
    if (!targetAvailable) {
      this.callbacks.onToast("That chest has no open slots.");
      return false;
    }
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -count);
      this.clearDepletedHotbar();
    }
    if (this.network.role === "guest") this.network.send({ type: "request-chest", key, direction: "deposit", item, count, targetSlot, sourceSlot });
    else this.addToChest(key, item, count, targetSlot);
    this.audio.play("click");
    this.emitHud();
    return true;
  }

  withdrawFromChest(key: string, slot: number, requestedCount?: number, targetSlot?: number): boolean {
    if (!this.chestInRange(key)) return false;
    const panel = this.getChest(key);
    const item = panel?.slots[slot] ?? null;
    if (!panel || !item) return false;
    const count = Math.max(1, Math.min(panel.storage[item] ?? 0, Math.floor(requestedCount ?? (panel.storage[item] ?? 0))));
    if (!this.canStoreItem(item)) {
      this.callbacks.onToast("Make room in your inventory before withdrawing that item type.");
      return false;
    }
    if (this.network.role === "guest") {
      this.network.send({ type: "request-chest", key, direction: "withdraw", item, count, sourceSlot: slot, targetSlot });
      return true;
    }
    const taken = this.takeFromChestSlot(key, slot, count);
    if (!taken || !this.collectItem(taken.item, taken.count)) return false;
    if (targetSlot !== undefined && this.inventorySlots[targetSlot] === null) this.assignInventorySlot(targetSlot, taken.item);
    this.audio.play("click");
    this.emitHud();
    return true;
  }

  moveChestSlot(key: string, sourceSlot: number, targetSlot: number): boolean {
    if (!this.chestInRange(key)) return false;
    if (this.network.role === "guest") {
      this.network.send({ type: "request-chest", key, direction: "move", sourceSlot, targetSlot });
      return true;
    }
    const moved = this.moveChestSlotAuthoritative(key, sourceSlot, targetSlot);
    if (moved) this.audio.play("click");
    return moved;
  }

  depositToFurnace(
    key: string,
    slot: Exclude<FurnaceSlot, "output">,
    item: ItemId,
    requestedCount?: number,
    sourceSlot?: number,
  ): boolean {
    const [x, y, z] = parseWorldKey(key);
    const state = this.world.machines.get(key);
    if (!state || this.world.getBlock(x, y, z) !== BlockId.HearthFurnace || !this.machineInRange(key, BlockId.HearthFurnace)) return false;
    ensureFurnaceSlots(state);
    if (!furnaceCanDeposit(state, slot, item)) {
      this.callbacks.onToast(slot === "fuel" ? "The lower slot accepts Coal fuel." : "The upper slot accepts raw ore, clay, or sand.");
      return false;
    }
    const available = this.mode === "creative" ? 1 : this.inventory[item] ?? 0;
    const count = Math.max(0, Math.min(available, Math.floor(requestedCount ?? available)));
    if (count <= 0) return false;
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -count);
      this.clearDepletedHotbar();
    }
    if (this.network.role === "guest") {
      this.network.send({ type: "request-furnace", key, direction: "deposit", slot, item, count, sourceSlot });
    } else {
      depositFurnaceItem(state, slot, item, count);
      this.broadcastMachine(key, state);
    }
    this.audio.play("click");
    this.emitHud();
    return true;
  }

  withdrawFromFurnace(key: string, slot: FurnaceSlot, requestedCount?: number, targetSlot?: number): boolean {
    const [x, y, z] = parseWorldKey(key);
    const state = this.world.machines.get(key);
    if (!state || this.world.getBlock(x, y, z) !== BlockId.HearthFurnace || !this.machineInRange(key, BlockId.HearthFurnace)) return false;
    const item = furnaceSlotItem(state, slot);
    if (!item || !this.canStoreItem(item)) return false;
    const count = Math.max(1, Math.min(state.storage[item] ?? 0, Math.floor(requestedCount ?? (state.storage[item] ?? 0))));
    if (this.network.role === "guest") {
      this.network.send({ type: "request-furnace", key, direction: "withdraw", slot, count, targetSlot });
      return true;
    }
    const taken = withdrawFurnaceItem(state, slot, count);
    if (!taken || !this.collectItem(taken.item, taken.count)) return false;
    if (targetSlot !== undefined && this.inventorySlots[targetSlot] === null) this.assignInventorySlot(targetSlot, taken.item);
    this.broadcastMachine(key, state);
    this.audio.play("click");
    this.emitHud();
    return true;
  }

  transferToMachine(key: string, item: ItemId, count = 1): boolean {
    const state = this.world.machines.get(key);
    if (!state || !itemAvailable(this.inventory, item, count)) return false;
    if (this.mode === "survival") changeItem(this.inventory, item, -count);
    changeItem(state.storage, item, count);
    this.broadcastMachine(key, state);
    this.emitHud();
    return true;
  }

  transferFromMachine(key: string, item: ItemId, count = 1): boolean {
    const state = this.world.machines.get(key);
    if (!state || !itemAvailable(state.storage, item, count) || !this.canStoreItem(item)) return false;
    changeItem(state.storage, item, -count);
    this.collectItem(item, count);
    this.broadcastMachine(key, state);
    this.emitHud();
    return true;
  }

  toggleMachine(key: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    state.enabled = !state.enabled;
    this.broadcastMachine(key, state);
  }

  rotateMachine(key: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    state.orientation = ((state.orientation + 1) % 4) as 0 | 1 | 2 | 3;
    const [x, y, z] = parseWorldKey(key);
    this.world.setBlock(x, y, z, this.world.getBlock(x, y, z));
    this.broadcastMachine(key, state);
  }

  configureMachine(key: string, value: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    const [x, y, z] = parseWorldKey(key);
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.ProximitySensor && ["near", "day", "night"].includes(value)) {
      state.mode = value as "near" | "day" | "night";
    }
    if (id === BlockId.FluxComparator && ["compare", "subtract"].includes(value)) {
      state.mode = value as "compare" | "subtract";
    }
    if (id === BlockId.PulseRepeater && ["1", "2", "3", "4"].includes(value)) {
      state.delayTicks = Number(value);
      this.world.setBlock(x, y, z, id);
    }
    if (id === BlockId.Fabricator && ["flux-coil", "logic-wafer", "gear"].includes(value)) state.recipe = value;
    this.broadcastMachine(key, state);
  }

  private merchantInRange(mobId: string, showError = true): boolean {
    if (mobId.startsWith("post:")) {
      const [x, , z] = parseWorldKey(mobId.slice(5));
      const nearby = Math.hypot(x + 0.5 - this.physics.position.x, z + 0.5 - this.physics.position.z) <= 7;
      if (!nearby && showError) this.callbacks.onToast("The village market is no longer close enough.");
      return nearby;
    }
    const merchant = this.world.mobs.find((mob) => mob.id === mobId && mob.kind === "wayfarer");
    const nearby = Boolean(merchant && Math.hypot(
      merchant.position.x - this.physics.position.x,
      merchant.position.z - this.physics.position.z,
    ) <= 6);
    if (!nearby && showError) this.callbacks.onToast("That villager is no longer close enough to trade.");
    return nearby;
  }

  sellToMerchant(mobId: string, item: ItemId, requestedCount?: number): boolean {
    if (!this.merchantInRange(mobId)) return false;
    const available = this.inventory[item] ?? 0;
    const count = Math.max(0, Math.min(available, Math.floor(requestedCount ?? available)));
    if (count <= 0) {
      this.callbacks.onToast(`You are not carrying ${itemName(item)}.`);
      return false;
    }
    const salePoints = itemSalePoints(item) * count;
    const pooledPoints = this.tradeCredit + salePoints;
    const marks = Math.floor(pooledPoints / 20);
    const credit = pooledPoints % 20;
    if (this.mode === "survival") {
      changeItem(this.inventory, item, -count);
      this.inventorySlots = reconcileInventoryLayout(this.inventorySlots, this.inventory);
      this.hotbar = hotbarFromLayout(this.inventorySlots);
      this.tradeCredit = credit;
      if (marks > 0) this.collectItem("currency:frontier-mark", marks);
      this.clearDepletedHotbar();
    }
    this.audio.play("trade");
    this.callbacks.onToast(this.mode === "creative"
      ? `${itemName(item)} is infinitely available in Creative mode.`
      : `Sold ${count} × ${itemName(item)} · ${marks} Frontier Mark${marks === 1 ? "" : "s"}${credit ? ` · ${credit}/20 value saved` : ""}.`);
    this.emitHud();
    const refreshed = this.buildTradePanel(mobId);
    if (refreshed) this.callbacks.onTrade(refreshed);
    return true;
  }

  trade(mobId: string, offerId: string): boolean {
    const panel = this.buildTradePanel(mobId);
    const offer = panel?.offers.find((candidate) => candidate.id === offerId);
    if (!panel || !offer) return false;
    if (!this.merchantInRange(mobId)) return false;
    if (offer.stock <= 0) {
      this.callbacks.onToast("That offer is sold out until the next village restock.");
      return false;
    }
    if (this.mode === "survival" && !itemAvailable(this.inventory, offer.cost.item, offer.cost.count)) {
      this.callbacks.onToast(`You need ${offer.cost.count} ${itemName(offer.cost.item)}.`);
      return false;
    }
    if (this.mode === "survival") {
      changeItem(this.inventory, offer.cost.item, -offer.cost.count);
      this.clearDepletedHotbar();
    }
    if (!this.collectItem(offer.reward.item, offer.reward.count)) {
      if (this.mode === "survival") changeItem(this.inventory, offer.cost.item, offer.cost.count);
      this.inventorySlots = addItemToLayout(this.inventorySlots, offer.cost.item, false);
      this.hotbar = hotbarFromLayout(this.inventorySlots);
      this.callbacks.onToast("Make room in your inventory before completing that trade.");
      return false;
    }
    if (mobId.startsWith("post:")) {
      const key = mobId.slice(5);
      const state = this.world.machines.get(key);
      if (state?.tradeStock) {
        state.tradeStock[offer.id] = Math.max(0, offer.stock - 1);
        this.broadcastMachine(key, state);
      }
    } else {
      const merchant = this.world.mobs.find((mob) => mob.id === mobId && mob.kind === "wayfarer");
      if (merchant?.tradeStock) merchant.tradeStock[offer.id] = Math.max(0, offer.stock - 1);
    }
    this.audio.play("trade");
    this.callbacks.onToast(`Trade complete · ${offer.reward.count} ${itemName(offer.reward.item)} · ${Math.max(0, offer.stock - 1)} use${offer.stock - 1 === 1 ? "" : "s"} left.`);
    this.emitHud();
    const refreshed = this.buildTradePanel(mobId);
    if (refreshed) this.callbacks.onTrade(refreshed);
    return true;
  }

  assignHotbar(slot: number, item: ItemId): void {
    this.assignInventorySlot(HOTBAR_START + slot, item);
  }

  assignInventorySlot(slot: number, item: ItemId): void {
    if (slot < 0 || slot >= INVENTORY_SLOT_COUNT || !itemAvailable(this.inventory, item)) return;
    const existing = this.inventorySlots.indexOf(item);
    if (existing >= 0 && existing !== slot) this.inventorySlots[existing] = null;
    this.inventorySlots[slot] = item;
    this.hotbar = hotbarFromLayout(this.inventorySlots);
    if (slot >= HOTBAR_START) this.selectedSlot = slot - HOTBAR_START;
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.emitHud();
  }

  moveInventorySlot(from: number, to: number): void {
    this.inventorySlots = moveSlotInLayout(this.inventorySlots, from, to);
    this.hotbar = hotbarFromLayout(this.inventorySlots);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.audio.play("click");
    this.emitHud();
  }

  shiftInventorySlot(slot: number): void {
    this.inventorySlots = shiftSlotInLayout(this.inventorySlots, slot);
    this.hotbar = hotbarFromLayout(this.inventorySlots);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.audio.play("click");
    this.emitHud();
  }

  setSelectedSlot(slot: number): void {
    this.selectedSlot = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.audio.play("click");
    this.emitHud();
  }

  setMove(strafe: number, forward: number): void {
    this.input.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
    this.input.forward = THREE.MathUtils.clamp(forward, -1, 1);
  }

  addLook(x: number, y: number): void {
    this.input.lookX += x;
    this.input.lookY += y;
  }

  setAction(action: "jump" | "sprint" | "crouch" | "mine" | "place" | "interact", active: boolean): void {
    if (action === "sprint" && this.settings.toggleSprint) {
      if (active) this.input.sprint = !this.input.sprint;
      if (active) void this.audio.unlock();
      this.emitHud();
      return;
    }
    this.input[action] = active;
    if (action === "mine" && active) this.viewModel.swing("attack");
    if (active) void this.audio.unlock();
  }

  toggleCreativeFlight(): void {
    if (this.mode !== "creative") {
      this.callbacks.onToast("Flight is available in Creative mode.");
      return;
    }
    this.creativeFlying = !this.creativeFlying;
    this.physics.velocity.y = 0;
    this.callbacks.onToast(this.creativeFlying ? "Creative flight enabled · Space rises, Shift descends." : "Creative flight disabled.");
    this.emitHud();
  }

  private showCriticalHit(): void {
    this.criticalFlash = 0.52;
    this.audio.play("critical");
  }

  tapInteract(): void {
    this.input.interact = true;
    window.setTimeout(() => {
      this.input.interact = false;
    }, 80);
  }

  private openChat(): void {
    if (this.paused) return;
    this.input.forward = 0;
    this.input.strafe = 0;
    this.input.mine = false;
    this.input.place = false;
    this.input.interact = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.callbacks.onChatOpen();
  }

  beginChat(): void {
    this.openChat();
  }

  sendChat(value: string): boolean {
    const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180);
    if (!text) return false;
    const entry: ChatEntry = {
      id: `chat-${this.network.playerId}-${Date.now().toString(36)}`,
      kind: "chat",
      name: this.playerName,
      text,
      timestamp: Date.now(),
    };
    this.callbacks.onChat(entry);
    if (this.network.role !== "offline") this.network.send({ type: "chat", text });
    return true;
  }

  private publishDeath(sourceValue: string): void {
    const source = sourceValue.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || "the frontier";
    this.callbacks.onChat({
      id: `death-${this.network.playerId}-${Date.now().toString(36)}`,
      kind: "death",
      name: this.playerName,
      text: `was defeated by ${source}.`,
      timestamp: Date.now(),
    });
    if (this.network.role !== "offline") this.network.send({ type: "death", source });
  }

  resumeInputCapture(): void {
    if (window.matchMedia("(pointer: fine)").matches && document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock().catch(() => undefined);
    }
    void this.audio.unlock();
  }

  updateSettings(settings: GameSettings): void {
    const renderDistanceChanged = settings.renderDistance !== this.settings.renderDistance;
    if (settings.toggleSprint !== this.settings.toggleSprint) this.input.sprint = false;
    this.settings = { ...settings };
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.updateSettings(settings);
    this.scene.fog = new THREE.Fog(
      (this.scene.background as THREE.Color)?.getHex() ?? 0x8fc8d8,
      28,
      settings.renderDistance * CHUNK_SIZE + 32,
    );
    if (renderDistanceChanged) this.queueNearbyChunks(true);
    this.resize();
  }

  pause(): void {
    this.paused = true;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resume(): void {
    this.paused = false;
    this.activeWorkbenchKey = null;
    this.activeChestKey = null;
    this.previousFrame = performance.now();
    void this.audio.unlock();
    if (window.matchMedia("(pointer: fine)").matches && document.pointerLockElement !== this.canvas) {
      // Resume is called directly by the menu button/key gesture, so browsers
      // permit pointer capture here without a second click on the canvas.
      void this.canvas.requestPointerLock().catch(() => undefined);
    }
  }

  makeSave(): WorldSave {
    return {
      version: SAVE_VERSION,
      generation: this.world.generation,
      createdAt: Date.now(),
      seed: this.world.seedText,
      mode: this.mode,
      player: {
        position: {
          x: this.physics.position.x,
          y: this.physics.position.y,
          z: this.physics.position.z,
        },
        yaw: this.physics.yaw,
        pitch: this.physics.pitch,
        health: this.health,
        hunger: this.hunger,
        stamina: this.stamina,
        inventory: cloneInventory(this.inventory),
        hotbar: [...this.hotbar],
        inventorySlots: [...this.inventorySlots],
        selectedSlot: this.selectedSlot,
        tradeCredit: this.tradeCredit,
      },
      timeOfDay: this.timeOfDay,
      dayCount: this.dayCount,
      mutations: this.world.serializeMutations(),
      machines: Array.from(this.world.machines, ([key, state]) => [
        key,
        cloneMachineState(state),
      ]),
      drops: this.world.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })),
      mobs: this.world.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })),
      waterLevels: this.world.serializeWaterLevels(),
    };
  }

  saveNow(showToast = true): string {
    try {
      const save = this.makeSave();
      const key = saveLocally(save);
      if (this.network.role === "host") this.network.checkpoint(save);
      if (showToast) this.callbacks.onToast(`World saved · ${key.length.toLocaleString()} character key`);
      return key;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage error";
      this.callbacks.onToast(`Could not save: ${message}`);
      return "";
    }
  }

  exportKey(): string {
    const key = encodeWorldKey(this.makeSave());
    this.callbacks.onToast(`Export key ready · ${key.length.toLocaleString()} characters`);
    return key;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameRequest);
    if (this.network.role !== "guest") this.saveNow(false);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.audio.dispose();
    this.viewModel.dispose();
    for (const material of this.breakMaterials) {
      material.map?.dispose();
      material.dispose();
    }
    (this.selection.material as THREE.Material).dispose();
    this.starField.geometry.dispose();
    (this.starField.material as THREE.Material).dispose();
    (this.sunDisc.material as THREE.Material).dispose();
    (this.moonDisc.material as THREE.Material).dispose();
    this.atlas.dispose();
    this.solidMaterial.dispose();
    this.translucentMaterial.dispose();
    this.liquidMaterial.dispose();
    this.signalOnMaterial.dispose();
    this.powerMaterial.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.renderer.dispose();
  }
}
