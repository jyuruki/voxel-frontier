export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 18;
export const SAVE_VERSION = 1;

export type GameMode = "survival" | "creative";

export enum BlockId {
  Air = 0,
  Turf = 1,
  Soil = 2,
  Stone = 3,
  Sand = 4,
  Snow = 5,
  Water = 6,
  EmberwoodLog = 7,
  EmberwoodLeaves = 8,
  CoalOre = 9,
  CopperOre = 10,
  AetherCrystal = 11,
  EmberwoodPlanks = 12,
  StoneBrick = 13,
  Glass = 14,
  Workbench = 15,
  FluxWire = 16,
  Toggle = 17,
  FluxLamp = 18,
  ThermalGenerator = 19,
  FluxCell = 20,
  BoreDrill = 21,
  Conveyor = 22,
  ArcFurnace = 23,
  Fabricator = 24,
  Ram = 25,
  ProximitySensor = 26,
  AndGate = 27,
  OrGate = 28,
  NotGate = 29,
  DelayGate = 30,
  Hopper = 31,
  Crate = 32,
  GlowRod = 33,
  Basalt = 34,
  Ice = 35,
  Clay = 36,
  SunCactus = 37,
  StarBloom = 38,
  Bedrock = 39,
  CopperBlock = 40,
  Cinnabar = 41,
  SulfurStone = 42,
  MoonshardOre = 43,
  Mossstone = 44,
  RuinStone = 45,
  RelicCache = 46,
  Thornvine = 47,
  MoonshardBlock = 48,
  WayfinderBrazier = 49,
  AshGlass = 50,
  PulseRepeater = 51,
  FluxComparator = 52,
  InverterTorch = 53,
  Observer = 54,
  AdhesiveRam = 55,
  PulseButton = 56,
  PressurePlate = 57,
  DaylightSensor = 58,
  TargetBlock = 59,
  LatchLamp = 60,
  NoteEmitter = 61,
  FrostpineLog = 62,
  FrostpineLeaves = 63,
  FrostpinePlanks = 64,
  Limestone = 65,
  Marble = 66,
  Slate = 67,
  CaveMushroom = 68,
  GlowMushroom = 69,
  CrystalSpike = 70,
  CaveMoss = 71,
  StoneSlab = 72,
  StoneStairs = 73,
  RopeLadder = 74,
  DeepLantern = 75,
}

export type ItemId =
  | `block:${BlockId}`
  | "tool:wood-pick"
  | "tool:wood-hatchet"
  | "tool:wood-spade"
  | "tool:wood-club"
  | "tool:rough-pick"
  | "tool:copper-pick"
  | "tool:crystal-pick"
  | "tool:hatchet"
  | "tool:spade"
  | "tool:blade"
  | "tool:stone-spear"
  | "tool:copper-saber"
  | "tool:aether-repeater"
  | "part:copper-ingot"
  | "part:flux-coil"
  | "part:logic-wafer"
  | "part:gear"
  | "part:moonshard"
  | "part:carapace"
  | "part:cinder-core"
  | "ammo:aether-bolt"
  | "food:starfruit"
  | "food:glowcut"
  | "consumable:mender-tonic";

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export type Inventory = Record<string, number>;

export interface MachineState {
  orientation: 0 | 1 | 2 | 3;
  enabled: boolean;
  signal: number;
  energy: number;
  progress: number;
  delay: number;
  mode?: "near" | "day" | "night" | "compare" | "subtract";
  recipe?: string;
  delayTicks?: number;
  lastInput?: number;
  observedBlock?: BlockId;
  pulseTicks?: number;
  extended?: boolean;
  note?: number;
  storage: Inventory;
}

export interface DroppedItemState {
  id: string;
  item: ItemId;
  count: number;
  position: Vec3Data;
  velocity: Vec3Data;
  pickupDelay?: number;
}

export interface MobState {
  id: string;
  kind: "mireling" | "glowgrazer" | "cinderling" | "thornback" | "nightwisp";
  position: Vec3Data;
  velocity: Vec3Data;
  health: number;
  yaw: number;
  targetTimer: number;
  attackTimer?: number;
  hurtTimer?: number;
}

export type MutationTuple = [number, number, number, BlockId];

export interface WorldSave {
  version: number;
  createdAt: number;
  seed: string;
  mode?: GameMode;
  player: {
    position: Vec3Data;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
    stamina: number;
    inventory: Inventory;
    hotbar: Array<ItemId | null>;
    selectedSlot: number;
  };
  timeOfDay: number;
  dayCount?: number;
  mutations: MutationTuple[];
  machines: Array<[string, MachineState]>;
  drops: DroppedItemState[];
  mobs: MobState[];
}

export type BlockShape =
  | "cube"
  | "cross"
  | "wire"
  | "plate"
  | "torch"
  | "rod"
  | "hopper"
  | "slab"
  | "stair"
  | "piston"
  | "column"
  | "ladder";

export interface BlockDefinition {
  id: BlockId;
  name: string;
  description: string;
  color: string;
  topColor?: string;
  sideColor?: string;
  bottomColor?: string;
  solid: boolean;
  opaque: boolean;
  liquid?: boolean;
  hardness: number;
  tool: "none" | "pick" | "axe" | "spade";
  collectible: boolean;
  shape?: BlockShape;
  collisionHeight?: number;
  automation?:
    | "wire"
    | "source"
    | "sink"
    | "machine"
    | "storage"
    | "logic";
  emissive?: number;
}

export interface Recipe {
  id: string;
  name: string;
  station: "hand" | "workbench" | "furnace" | "fabricator";
  inputs: Inventory;
  output: { item: ItemId; count: number };
  description: string;
}

export interface InputFrame {
  forward: number;
  strafe: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  mine: boolean;
  place: boolean;
  interact: boolean;
}

export interface GameSettings {
  sensitivity: number;
  fov: number;
  renderDistance: number;
  graphics: "low" | "balanced" | "high";
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
  invertY: boolean;
  leftHanded: boolean;
  touchOpacity: number;
  showFps: boolean;
  autoJump: boolean;
}

export interface HudState {
  health: number;
  hunger: number;
  stamina: number;
  selectedSlot: number;
  hotbar: Array<ItemId | null>;
  inventory: Inventory;
  targetedBlock: BlockId | null;
  miningProgress: number;
  timeOfDay: number;
  biome: string;
  coordinates: Vec3Data;
  fps: number;
  networkStatus: string;
  objective: string;
  gameMode: GameMode;
  timeLabel: string;
  dayCount: number;
  targetedMob: { name: string; health: number; maxHealth: number } | null;
  toast?: string;
}

export interface RayHit {
  block: Vec3Data;
  adjacent: Vec3Data;
  normal: Vec3Data;
  id: BlockId;
  distance: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  position: Vec3Data;
  yaw: number;
  pitch: number;
  color: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 0.9,
  fov: 72,
  renderDistance: 2,
  graphics: "balanced",
  masterVolume: 0.8,
  effectsVolume: 0.85,
  musicVolume: 0.35,
  invertY: false,
  leftHanded: false,
  touchOpacity: 0.72,
  showFps: false,
  autoJump: false,
};
