import { BLOCKS } from "./blocks";
import {
  BlockId,
  CHUNK_SIZE,
  DroppedItemState,
  MachineState,
  MobState,
  MutationTuple,
  SEA_LEVEL,
  Vec3Data,
  WORLD_GENERATION_VERSION,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
} from "./types";
import {
  fractalNoise2,
  hash3,
  hashString,
  valueNoise3,
  worldKey,
} from "./prng";

export interface ChunkData {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  revision: number;
}

const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const EMBERDEEP_OFFSET = 100_000;

export function isEmberdeepCoordinate(x: number): boolean {
  return Math.abs(x) >= EMBERDEEP_OFFSET / 2;
}

export function isVillageChunk(cx: number, cz: number, seed: number): boolean {
  if (isEmberdeepCoordinate(cx * CHUNK_SIZE)) return false;
  const regionSize = 8;
  const regionX = Math.floor(cx / regionSize);
  const regionZ = Math.floor(cz / regionSize);
  if (hash3(regionX, 193, regionZ, seed ^ 0x6a09e667) % 100 >= 82) return false;
  const candidateX = regionX * regionSize + 1 + (hash3(regionX, 211, regionZ, seed ^ 0xbb67ae85) % (regionSize - 2));
  const candidateZ = regionZ * regionSize + 1 + (hash3(regionX, 223, regionZ, seed ^ 0x3c6ef372) % (regionSize - 2));
  return cx === candidateX && cz === candidateZ;
}

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

export function positiveMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function chunkIndex(lx: number, y: number, lz: number): number {
  return (y - WORLD_MIN_Y) * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
}

function defaultMachineState(id: BlockId): MachineState {
  const momentary = [BlockId.Toggle, BlockId.PulseButton, BlockId.TargetBlock].includes(id);
  return {
    orientation: 0,
    enabled: !momentary,
    signal: 0,
    energy: id === BlockId.FluxCell ? 250 : 0,
    progress: 0,
    delay: 0,
    delayTicks: id === BlockId.PulseRepeater ? 2 : undefined,
    mode: id === BlockId.ProximitySensor
      ? "near"
      : id === BlockId.FluxComparator
        ? "compare"
        : undefined,
    pulseTicks: 0,
    extended: false,
    lastInput: 0,
    storage: {},
  };
}

interface VeinConfig {
  id: BlockId;
  minY: number;
  maxY: number;
  cell: [number, number, number];
  radius: [number, number, number];
  chance: number;
  salt: number;
}

const OVERWORLD_VEINS: VeinConfig[] = [
  { id: BlockId.DiamondOre, minY: -63, maxY: -8, cell: [11, 8, 11], radius: [1.7, 1.2, 1.7], chance: 42, salt: 0x2f6e2b1 },
  { id: BlockId.MoonshardOre, minY: -58, maxY: 4, cell: [12, 9, 12], radius: [1.6, 1.25, 1.6], chance: 34, salt: 0x8c3d713 },
  { id: BlockId.AetherCrystal, minY: -42, maxY: 42, cell: [11, 9, 11], radius: [1.7, 1.35, 1.7], chance: 43, salt: 0x6d54a91 },
  { id: BlockId.GoldOre, minY: -48, maxY: 34, cell: [10, 8, 10], radius: [2, 1.3, 1.8], chance: 78, salt: 0x49ad221 },
  { id: BlockId.FluxstoneOre, minY: -54, maxY: 24, cell: [10, 8, 10], radius: [2.1, 1.35, 1.85], chance: 84, salt: 0x734eb17 },
  { id: BlockId.CopperOre, minY: -16, maxY: 112, cell: [10, 9, 10], radius: [2.2, 1.5, 2], chance: 92, salt: 0x1c69b35 },
  { id: BlockId.IronOre, minY: -52, maxY: 232, cell: [10, 10, 10], radius: [2.25, 1.55, 2.05], chance: 102, salt: 0x5b81f43 },
  { id: BlockId.CoalOre, minY: 0, maxY: 272, cell: [10, 11, 10], radius: [2.55, 1.8, 2.35], chance: 125, salt: 0x3ea9c67 },
];

type VeinAnchor = [number, number, number] | null;

function blockInVein(
  x: number,
  y: number,
  z: number,
  seed: number,
  config: VeinConfig,
  cache: Map<string, VeinAnchor>,
): boolean {
  if (y < config.minY || y > config.maxY) return false;
  const [cellX, cellY, cellZ] = config.cell;
  const gx = Math.floor(x / cellX);
  const gy = Math.floor(y / cellY);
  const gz = Math.floor(z / cellZ);
  const [radiusX, radiusY, radiusZ] = config.radius;
  const cacheKey = `${config.salt}:${gx},${gy},${gz}`;
  let anchor = cache.get(cacheKey);
  if (anchor === undefined) {
    const active = hash3(gx, gy, gz, seed ^ config.salt) % 1000;
    if (active >= config.chance) anchor = null;
    else {
      const roomX = Math.max(1, Math.floor(cellX - radiusX * 2));
      const roomY = Math.max(1, Math.floor(cellY - radiusY * 2));
      const roomZ = Math.max(1, Math.floor(cellZ - radiusZ * 2));
      anchor = [
        gx * cellX + radiusX + (hash3(gx, gy + 17, gz, seed ^ (config.salt + 1)) % roomX),
        gy * cellY + radiusY + (hash3(gx + 31, gy, gz, seed ^ (config.salt + 2)) % roomY),
        gz * cellZ + radiusZ + (hash3(gx, gy, gz + 47, seed ^ (config.salt + 3)) % roomZ),
      ];
    }
    cache.set(cacheKey, anchor);
  }
  if (!anchor) return false;
  const [anchorX, anchorY, anchorZ] = anchor;
  const distance = ((x - anchorX) / radiusX) ** 2
    + ((y - anchorY) / radiusY) ** 2
    + ((z - anchorZ) / radiusZ) ** 2;
  const roughness = ((hash3(x, y, z, seed ^ (config.salt + 4)) % 101) - 50) / 420;
  return distance + roughness <= 1;
}

function overworldOreAt(x: number, y: number, z: number, seed: number, cache: Map<string, VeinAnchor>): BlockId | null {
  for (const config of OVERWORLD_VEINS) {
    if (blockInVein(x, y, z, seed, config, cache)) return config.id;
  }
  return null;
}

export class VoxelWorld {
  readonly seedText: string;
  readonly seed: number;
  readonly generation: number;
  readonly chunks = new Map<string, ChunkData>();
  readonly mutations = new Map<string, BlockId>();
  readonly machines = new Map<string, MachineState>();
  readonly drops: DroppedItemState[] = [];
  readonly mobs: MobState[] = [];
  readonly waterLevels = new Map<string, number>();
  readonly dirtyChunks = new Set<string>();
  private readonly heightCache = new Map<string, number>();
  private readonly biomeCache = new Map<string, string>();
  private readonly oreCellCache = new Map<string, VeinAnchor>();

  constructor(seedText: string, generation = WORLD_GENERATION_VERSION) {
    this.seedText = seedText.trim() || "frontier";
    this.seed = hashString(this.seedText);
    this.generation = generation;
  }

  getHeight(x: number, z: number): number {
    const cacheKey = `${x},${z}`;
    const cached = this.heightCache.get(cacheKey);
    if (cached !== undefined) return cached;
    if (isEmberdeepCoordinate(x)) {
      const localX = x > 0 ? x - EMBERDEEP_OFFSET : x + EMBERDEEP_OFFSET;
      const basin = fractalNoise2(localX / 110, z / 110, this.seed ^ 0x3c6ef372, 4);
      const broken = Math.abs(fractalNoise2(localX / 43, z / 43, this.seed ^ 0xbb67ae85, 3) - 0.5) * 2;
      const height = Math.max(-22, Math.min(108, Math.floor(12 + basin * 58 + broken * 34)));
      this.heightCache.set(cacheKey, height);
      return height;
    }
    const continental = fractalNoise2(x / 190, z / 190, this.seed ^ 0x91e10da5, 5);
    const detail = fractalNoise2(x / 38, z / 38, this.seed ^ 0xa54ff53a, 3);
    const hillField = fractalNoise2(x / 94, z / 94, this.seed ^ 0x1f83d9ab, 4);
    const mountainNoise = fractalNoise2(x / 205, z / 205, this.seed ^ 0x5a17c9e3, 4);
    const mountainRegion = Math.max(0, Math.min(1, (mountainNoise - 0.48) / 0.27));
    const ridgeNoise = 1 - Math.abs(fractalNoise2(x / 58, z / 58, this.seed ^ 0x510e527f, 4) * 2 - 1);
    const sharpRidges = 1 - Math.abs(fractalNoise2(x / 27, z / 27, this.seed ^ 0x6a09e667, 3) * 2 - 1);
    const rollingHills = Math.max(0, (hillField - 0.43) / 0.38) * 42;
    const mountainShape = mountainRegion ** 1.35;
    const mountains = mountainShape * (34 + ridgeNoise ** 2 * 148 + sharpRidges ** 4 * 42);
    const height = Math.max(
      WORLD_MIN_Y + 5,
      Math.min(WORLD_MAX_Y - 8, Math.floor(43 + continental * 42 + (detail - 0.5) * 12 + rollingHills + mountains)),
    );
    this.heightCache.set(cacheKey, height);
    return height;
  }

  getBiome(x: number, z: number): string {
    if (isEmberdeepCoordinate(x)) return "The Emberdeep";
    const cacheKey = `${Math.floor(x)},${Math.floor(z)}`;
    const cached = this.biomeCache.get(cacheKey);
    if (cached) return cached;
    if (this.getHeight(x, z) >= 164) {
      this.biomeCache.set(cacheKey, "Skybreak Peaks");
      return "Skybreak Peaks";
    }
    const heat = fractalNoise2(x / 150, z / 150, this.seed ^ 0x243f6a88, 3);
    const moisture = fractalNoise2(x / 130, z / 130, this.seed ^ 0xb7e15162, 3);
    const volcanic = fractalNoise2(x / 210, z / 210, this.seed ^ 0x8aed2a6b, 2);
    const biome = volcanic > 0.71
      ? "Cinder Reach"
      : heat > 0.67 && moisture < 0.48
        ? "Sunscar Dunes"
        : heat < 0.35
          ? "Frostcap Expanse"
          : moisture > 0.62
            ? "Emberwood Wilds"
            : moisture < 0.38
              ? "Windcut Prairie"
              : "Starbloom Meadow";
    this.biomeCache.set(cacheKey, biome);
    return biome;
  }

  private baseTerrainBlock(x: number, y: number, z: number): BlockId {
    if (y < WORLD_MIN_Y || y >= WORLD_MAX_Y) return BlockId.Air;
    if (y === WORLD_MIN_Y || (y < WORLD_MIN_Y + 4 && hash3(x, y, z, this.seed ^ 0x4cf5ad43) % 5 < WORLD_MIN_Y + 4 - y)) return BlockId.Bedrock;
    const height = this.getHeight(x, z);
    if (isEmberdeepCoordinate(x)) {
      if (y > height) return y <= -42 ? BlockId.Emberflow : BlockId.Air;
      const depth = height - y;
      const localX = x > 0 ? x - EMBERDEEP_OFFSET : x + EMBERDEEP_OFFSET;
      if (depth === 0) return BlockId.AshSoil;
      if (depth < 3) return hash3(x, y, z, this.seed) % 7 === 0 ? BlockId.Gravel : BlockId.Emberrock;
      const cavernA = valueNoise3(localX / 18, y / 10, z / 18, this.seed ^ 0xa54ff53a);
      const cavernB = Math.abs(valueNoise3(localX / 13, y / 8, z / 13, this.seed ^ 0x510e527f) - 0.5);
      if (y > WORLD_MIN_Y + 3 && y < height - 2 && (cavernA > 0.67 || cavernB < 0.07)) return y <= -42 ? BlockId.Emberflow : BlockId.Air;
      const emberRoll = hash3(x, y, z, this.seed ^ 0x9b05688c) % 1000;
      const seam = valueNoise3(localX / 5, y / 4, z / 5, this.seed ^ 0x1f83d9ab);
      if (y < -22 && seam > 0.75 && emberRoll < 72) return BlockId.DiamondOre;
      if (y < 18 && seam < 0.23 && emberRoll < 86) return BlockId.GoldOre;
      if (y < 36 && emberRoll > 988) return BlockId.FluxstoneOre;
      if (emberRoll > 993) return BlockId.EmberGlow;
      if (y < -38 && emberRoll < 9) return BlockId.Riftstone;
      return BlockId.Emberrock;
    }
    if (y > height) return y <= SEA_LEVEL ? BlockId.Water : BlockId.Air;
    const biome = this.getBiome(x, z);

    const depth = height - y;
    if (depth === 0) {
      if (biome === "Skybreak Peaks") return BlockId.Snow;
      if (biome === "Sunscar Dunes") return BlockId.Sand;
      if (biome === "Frostcap Expanse") return BlockId.Snow;
      if (biome === "Cinder Reach") return BlockId.Basalt;
      if (height <= SEA_LEVEL + 1) return BlockId.Clay;
      return BlockId.Turf;
    }
    if (depth < 4) {
      if (biome === "Sunscar Dunes") return BlockId.Sand;
      if (biome === "Cinder Reach") return BlockId.Basalt;
      return BlockId.Soil;
    }

    const caveRegion = valueNoise3(x / 52, y / 34, z / 52, this.seed ^ 0x7f4a7c15);
    const cavernLarge = valueNoise3(x / 23, y / 15, z / 23, this.seed ^ 0xc2b2ae35);
    const cavernDetail = valueNoise3(x / 9, y / 7, z / 9, this.seed ^ 0x27d4eb2f);
    const cavernField = cavernLarge * 0.7 + cavernDetail * 0.3;
    const wormA = Math.abs(cavernDetail - 0.5);
    const wormB = Math.abs(valueNoise3(x / 17, y / 14, z / 17, this.seed ^ 0x165667b1) - 0.5);
    const fracture = Math.abs(caveRegion - 0.5);
    const cavern = cavernField > 0.625 + Math.max(0, y - 118) * 0.0008 && caveRegion > 0.25;
    const windingTunnel = wormA < 0.105 && wormB < 0.135 && caveRegion > 0.2;
    const verticalRift = fracture < 0.038 && cavernDetail > 0.46 && y < 56;
    if (y > WORLD_MIN_Y + 2 && y < height - 2 && (cavern || windingTunnel || verticalRift)) {
      const aquifer = y < 22 && valueNoise3(x / 31, y / 19, z / 31, this.seed ^ 0x94d049bb) > 0.58;
      return aquifer ? BlockId.Water : BlockId.Air;
    }

    const ore = overworldOreAt(x, y, z, this.seed, this.oreCellCache);
    if (ore !== null) return ore;
    const stoneRoll = hash3(x, y, z, this.seed ^ 0x165667b1) % 1000;
    if (y < -42 && stoneRoll > 997) return BlockId.Riftstone;
    if (biome === "Cinder Reach" && y < 52 && stoneRoll > 991) return BlockId.Cinnabar;
    if (biome === "Cinder Reach" && y < 36 && stoneRoll > 982 && stoneRoll <= 991) return BlockId.SulfurStone;
    if (stoneRoll > 994 && y > -8 && y < 112) return BlockId.Marble;
    if (y < 0) return BlockId.Slate;
    if (y < 96 && caveRegion > 0.79 && cavernDetail < 0.48) return BlockId.Limestone;
    return biome === "Cinder Reach" && y > height - 8 ? BlockId.Basalt : BlockId.Stone;
  }

  private addSurfaceFeatures(chunk: ChunkData): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    if (isEmberdeepCoordinate(baseX + CHUNK_SIZE / 2)) {
      this.addEmberdeepFeatures(chunk);
      return;
    }
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx += 1) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const height = this.getHeight(x, z);
        if (height >= WORLD_MAX_Y - 7) continue;
        const biome = this.getBiome(x, z);
        const featureRoll = hash3(x, 0, z, this.seed ^ 0x9e3779b9) % 1000;
        if (
          (biome === "Emberwood Wilds" && featureRoll < 35) ||
          (biome === "Starbloom Meadow" && featureRoll < 9)
        ) {
          const trunkHeight = 3 + (hash3(x, 1, z, this.seed) % 3);
          for (let dy = 1; dy <= trunkHeight; dy += 1) {
            this.setChunkLocal(chunk, lx, height + dy, lz, BlockId.EmberwoodLog);
          }
          for (let dx = -2; dx <= 2; dx += 1) {
            for (let dz = -2; dz <= 2; dz += 1) {
              for (let dy = trunkHeight - 1; dy <= trunkHeight + 1; dy += 1) {
                const distance = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - trunkHeight);
                if (distance <= 3 && !(dx === 0 && dz === 0 && dy <= trunkHeight)) {
                  this.setChunkLocal(chunk, lx + dx, height + dy, lz + dz, BlockId.EmberwoodLeaves);
                }
              }
            }
          }
        } else if (biome === "Frostcap Expanse" && featureRoll < 24) {
          const trunkHeight = 4 + (hash3(x, 3, z, this.seed) % 3);
          for (let dy = 1; dy <= trunkHeight; dy += 1) {
            this.setChunkLocal(chunk, lx, height + dy, lz, BlockId.FrostpineLog);
          }
          for (let dy = 2; dy <= trunkHeight + 1; dy += 1) {
            const radius = Math.max(1, Math.min(2, Math.floor((trunkHeight + 2 - dy) / 2) + 1));
            for (let dx = -radius; dx <= radius; dx += 1) {
              for (let dz = -radius; dz <= radius; dz += 1) {
                if (Math.abs(dx) + Math.abs(dz) <= radius + 1 && !(dx === 0 && dz === 0 && dy <= trunkHeight)) {
                  this.setChunkLocal(chunk, lx + dx, height + dy, lz + dz, BlockId.FrostpineLeaves);
                }
              }
            }
          }
        } else if (biome === "Sunscar Dunes" && featureRoll < 12) {
          const cactusHeight = 2 + (featureRoll % 3);
          for (let dy = 1; dy <= cactusHeight; dy += 1) {
            this.setChunkLocal(chunk, lx, height + dy, lz, BlockId.SunCactus);
          }
        } else if (
          (biome === "Starbloom Meadow" || biome === "Windcut Prairie") &&
          featureRoll < 34
        ) {
          this.setChunkLocal(chunk, lx, height + 1, lz, BlockId.StarBloom);
        } else if (biome === "Emberwood Wilds" && featureRoll >= 35 && featureRoll < 48) {
          this.setChunkLocal(chunk, lx, height + 1, lz, BlockId.Thornvine);
        }
      }
    }
    if (isVillageChunk(chunk.cx, chunk.cz, this.seed)) this.addVillageLandmark(chunk);
    else this.addRuinLandmark(chunk);
  }

  private addEmberdeepFeatures(chunk: ChunkData): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx += 1) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const height = this.getHeight(x, z);
        if (height >= WORLD_MAX_Y - 7 || this.getBiome(x, z) !== "The Emberdeep") continue;
        const roll = hash3(x, 37, z, this.seed ^ 0x5be0cd19) % 1000;
        if (roll < 18) {
          const trunkHeight = 3 + (roll % 3);
          for (let dy = 1; dy <= trunkHeight; dy += 1) this.forceChunkLocal(chunk, lx, height + dy, lz, BlockId.RiftwoodLog);
          for (let dx = -2; dx <= 2; dx += 1) {
            for (let dz = -2; dz <= 2; dz += 1) {
              if (Math.abs(dx) + Math.abs(dz) <= 3) this.setChunkLocal(chunk, lx + dx, height + trunkHeight, lz + dz, BlockId.RiftwoodLeaves);
            }
          }
        } else if (roll < 36) {
          this.forceChunkLocal(chunk, lx, height + 1, lz, BlockId.EmberGlow);
        } else if (roll < 62) {
          this.setChunkLocal(chunk, lx, height + 1, lz, roll % 2 === 0 ? BlockId.GlowMushroom : BlockId.CrystalSpike);
        }
      }
    }
  }

  private addVillageLandmark(chunk: ChunkData): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const heights: number[] = [];
    for (let lx = 2; lx <= 13; lx += 1) {
      for (let lz = 2; lz <= 13; lz += 1) heights.push(this.getHeight(baseX + lx, baseZ + lz));
    }
    const minY = Math.min(...heights);
    const baseY = Math.max(...heights);
    const biome = this.getBiome(baseX + 8, baseZ + 8);
    if (baseY - minY > 12 || baseY <= SEA_LEVEL + 1 || baseY >= WORLD_MAX_Y - 8 || biome === "Cinder Reach" || biome === "Sunscar Dunes" || biome === "Skybreak Peaks") return;

    for (let lx = 1; lx < CHUNK_SIZE - 1; lx += 1) {
      for (let lz = 1; lz < CHUNK_SIZE - 1; lz += 1) {
        const terrainY = this.getHeight(baseX + lx, baseZ + lz);
        for (let y = terrainY + 1; y <= baseY; y += 1) this.forceChunkLocal(chunk, lx, y, lz, BlockId.Cobblestone);
        for (let y = baseY + 1; y <= baseY + 7; y += 1) this.forceChunkLocal(chunk, lx, y, lz, BlockId.Air);
        this.forceChunkLocal(chunk, lx, baseY, lz, lx === 7 || lx === 8 || lz === 7 || lz === 8 ? BlockId.Cobblestone : BlockId.Turf);
      }
    }

    const buildCottage = (x0: number, z0: number, doorX: number, doorZ: number): void => {
      for (let lx = x0; lx < x0 + 5; lx += 1) {
        for (let lz = z0; lz < z0 + 5; lz += 1) {
          this.forceChunkLocal(chunk, lx, baseY, lz, BlockId.Cobblestone);
          const edge = lx === x0 || lx === x0 + 4 || lz === z0 || lz === z0 + 4;
          for (let dy = 1; dy <= 3; dy += 1) {
            if (!edge) this.forceChunkLocal(chunk, lx, baseY + dy, lz, BlockId.Air);
            else if (lx === doorX && lz === doorZ && dy <= 2) this.forceChunkLocal(chunk, lx, baseY + dy, lz, dy === 1 ? BlockId.TimberDoor : BlockId.Air);
            else if (dy === 2 && ((lx + lz) & 1) === 0) this.forceChunkLocal(chunk, lx, baseY + dy, lz, BlockId.GlassPane);
            else this.forceChunkLocal(chunk, lx, baseY + dy, lz, (lx + lz) % 3 === 0 ? BlockId.TimberFrame : BlockId.VillageWall);
          }
          this.forceChunkLocal(chunk, lx, baseY + 4, lz, (lx + lz) % 2 === 0 ? BlockId.Thatch : BlockId.RoofTile);
        }
      }
      this.forceChunkLocal(chunk, x0 + 2, baseY + 1, z0 + 2, BlockId.FrontierBed);
      this.forceChunkLocal(chunk, x0 + 1, baseY + 1, z0 + 2, BlockId.Bookshelf);
      this.forceChunkLocal(chunk, x0 + 3, baseY + 1, z0 + 2, BlockId.FlowerPot);
    };
    buildCottage(1, 1, 5, 3);
    buildCottage(10, 10, 10, 12);
    this.forceChunkLocal(chunk, 7, baseY + 1, 8, BlockId.TradePost);
    this.forceChunkLocal(chunk, 8, baseY + 1, 8, BlockId.Crate);
    for (let lx = 6; lx <= 9; lx += 1) for (let lz = 6; lz <= 9; lz += 1) this.forceChunkLocal(chunk, lx, baseY + 4, lz, BlockId.MarketCanopy);
    for (const [lx, lz] of [[1, 7], [14, 7], [7, 1], [7, 14]]) this.forceChunkLocal(chunk, lx, baseY + 1, lz, BlockId.WayfinderBrazier);

    const professions = ["farmer", "blacksmith", "builder", "riftwright"] as const;
    for (let index = 0; index < professions.length; index += 1) {
      const id = `wayfarer-${chunk.cx}-${chunk.cz}-${index}`;
      if (this.mobs.some((mob) => mob.id === id)) continue;
      this.mobs.push({
        id,
        kind: "wayfarer",
        position: { x: baseX + 6.5 + index, y: baseY + 1.01, z: baseZ + 8.5 + (index % 2) },
        velocity: { x: 0, y: 0, z: 0 },
        health: 30,
        yaw: index * 2.1,
        targetTimer: 1 + index,
        attackTimer: 0,
        hurtTimer: 0,
        voiceTimer: 3 + index * 2,
        activity: "wander",
        home: { x: baseX + 8, y: baseY + 1, z: baseZ + 8 },
        profession: professions[index],
      });
    }
  }

  private addCaveFeatures(chunk: ChunkData): void {
    for (let y = WORLD_MIN_Y + 2; y < WORLD_MAX_Y - 2; y += 1) {
      for (let lz = 1; lz < CHUNK_SIZE - 1; lz += 1) {
        for (let lx = 1; lx < CHUNK_SIZE - 1; lx += 1) {
          const index = chunkIndex(lx, y, lz);
          const id = chunk.blocks[index] as BlockId;
          if (id !== BlockId.Air) continue;
          const below = chunk.blocks[chunkIndex(lx, y - 1, lz)] as BlockId;
          const above = chunk.blocks[chunkIndex(lx, y + 1, lz)] as BlockId;
          const worldX = chunk.cx * CHUNK_SIZE + lx;
          const worldZ = chunk.cz * CHUNK_SIZE + lz;
          if (y >= this.getHeight(worldX, worldZ) - 2) continue;
          const roll = hash3(worldX, y, worldZ, this.seed ^ 0xa4093822) % 1000;
          const floor = BLOCKS[below].solid;
          const headroom = above === BlockId.Air || above === BlockId.Water;
          if (!floor || !headroom) continue;
          if (roll < 4 && y < 24) chunk.blocks[index] = BlockId.CrystalSpike;
          else if (roll < 10 && y < 44) chunk.blocks[index] = BlockId.GlowMushroom;
          else if (roll < 19) chunk.blocks[index] = BlockId.CaveMushroom;
          else if (roll < 48) chunk.blocks[index] = BlockId.CaveMoss;
        }
      }
    }
  }

  private addRuinLandmark(chunk: ChunkData): void {
    const landmarkRoll = hash3(chunk.cx, 77, chunk.cz, this.seed ^ 0x51ed270b);
    if (landmarkRoll % 13 !== 0) return;
    const centerX = 5 + (landmarkRoll % 6);
    const centerZ = 5 + (Math.floor(landmarkRoll / 7) % 6);
    const worldX = chunk.cx * CHUNK_SIZE + centerX;
    const worldZ = chunk.cz * CHUNK_SIZE + centerZ;
    let baseY = 0;
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        baseY = Math.max(baseY, this.getHeight(worldX + dx, worldZ + dz));
      }
    }
    if (baseY <= SEA_LEVEL + 1 || baseY >= WORLD_MAX_Y - 7) return;

    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        const lx = centerX + dx;
        const lz = centerZ + dz;
        const terrainY = this.getHeight(worldX + dx, worldZ + dz);
        for (let y = terrainY + 1; y <= baseY; y += 1) {
          this.forceChunkLocal(chunk, lx, y, lz, (dx + dz + landmarkRoll) % 4 === 0 ? BlockId.Mossstone : BlockId.RuinStone);
        }
        this.forceChunkLocal(chunk, lx, baseY, lz, (Math.abs(dx) + Math.abs(dz)) % 3 === 0 ? BlockId.Mossstone : BlockId.RuinStone);
        for (let y = baseY + 1; y <= baseY + 4; y += 1) this.forceChunkLocal(chunk, lx, y, lz, BlockId.Air);
      }
    }

    const wallPoints = [
      [-2, -2], [-1, -2], [1, -2], [2, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-2, 2], [2, 2],
    ];
    for (const [dx, dz] of wallPoints) {
      const wallHeight = (Math.abs(dx) === 2 && Math.abs(dz) === 2) ? 3 : 1 + ((landmarkRoll + dx * 11 + dz * 17) & 1);
      for (let dy = 1; dy <= wallHeight; dy += 1) {
        this.forceChunkLocal(chunk, centerX + dx, baseY + dy, centerZ + dz, dy === wallHeight && wallHeight > 1 ? BlockId.Mossstone : BlockId.RuinStone);
      }
    }
    this.forceChunkLocal(chunk, centerX, baseY + 1, centerZ, BlockId.RelicCache);
    this.forceChunkLocal(chunk, centerX + 1, baseY + 1, centerZ + 1, BlockId.WayfinderBrazier);
    this.forceChunkLocal(chunk, centerX - 1, baseY + 1, centerZ + 1, BlockId.MoonshardBlock);
  }

  private forceChunkLocal(chunk: ChunkData, lx: number, y: number, lz: number, id: BlockId): void {
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < WORLD_MIN_Y || y >= WORLD_MAX_Y) return;
    chunk.blocks[chunkIndex(lx, y, lz)] = id;
  }

  private setChunkLocal(
    chunk: ChunkData,
    lx: number,
    y: number,
    lz: number,
    id: BlockId,
  ): void {
    if (
      lx < 0 ||
      lz < 0 ||
      lx >= CHUNK_SIZE ||
      lz >= CHUNK_SIZE ||
      y < WORLD_MIN_Y ||
      y >= WORLD_MAX_Y
    ) return;
    const index = chunkIndex(lx, y, lz);
    if (chunk.blocks[index] === BlockId.Air) chunk.blocks[index] = id;
  }

  getChunk(cx: number, cz: number): ChunkData {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const chunk: ChunkData = {
      cx,
      cz,
      blocks: new Uint8Array(CHUNK_VOLUME),
      revision: 0,
    };
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        const worldX = baseX + lx;
        const worldZ = baseZ + lz;
        const surface = this.getHeight(worldX, worldZ);
        const columnTop = isEmberdeepCoordinate(worldX)
          ? Math.max(surface, -42)
          : Math.max(surface, SEA_LEVEL);
        for (let y = WORLD_MIN_Y; y <= Math.min(WORLD_MAX_Y - 1, columnTop); y += 1) {
          chunk.blocks[chunkIndex(lx, y, lz)] = this.baseTerrainBlock(
            worldX,
            y,
            worldZ,
          );
        }
      }
    }
    this.addSurfaceFeatures(chunk);
    this.addCaveFeatures(chunk);
    for (const [keyString, id] of this.mutations) {
      const [x, y, z] = keyString.split(",").map(Number);
      if (y >= WORLD_MIN_Y && y < WORLD_MAX_Y && floorDiv(x, CHUNK_SIZE) === cx && floorDiv(z, CHUNK_SIZE) === cz) {
        chunk.blocks[
          chunkIndex(positiveMod(x, CHUNK_SIZE), y, positiveMod(z, CHUNK_SIZE))
        ] = id;
      }
    }
    this.chunks.set(key, chunk);
    this.dirtyChunks.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = chunkKey(cx + dx, cz + dz);
      if (this.chunks.has(neighbor)) this.dirtyChunks.add(neighbor);
    }
    return chunk;
  }

  /** Reads an unloaded border voxel without synchronously generating an entire neighboring chunk. */
  peekBlock(x: number, y: number, z: number): BlockId {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < WORLD_MIN_Y || by >= WORLD_MAX_Y) return BlockId.Air;
    const cx = floorDiv(bx, CHUNK_SIZE);
    const cz = floorDiv(bz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) return chunk.blocks[chunkIndex(positiveMod(bx, CHUNK_SIZE), by, positiveMod(bz, CHUNK_SIZE))] as BlockId;
    const mutation = this.mutations.get(worldKey(bx, by, bz));
    return mutation ?? this.baseTerrainBlock(bx, by, bz);
  }

  getBlock(x: number, y: number, z: number): BlockId {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < WORLD_MIN_Y || by >= WORLD_MAX_Y) return BlockId.Air;
    const chunk = this.getChunk(floorDiv(bx, CHUNK_SIZE), floorDiv(bz, CHUNK_SIZE));
    return chunk.blocks[
      chunkIndex(positiveMod(bx, CHUNK_SIZE), by, positiveMod(bz, CHUNK_SIZE))
    ] as BlockId;
  }

  private writeBlock(x: number, y: number, z: number, id: BlockId, record = true): void {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by <= WORLD_MIN_Y || by >= WORLD_MAX_Y) return;
    const cx = floorDiv(bx, CHUNK_SIZE);
    const cz = floorDiv(bz, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    chunk.blocks[
      chunkIndex(positiveMod(bx, CHUNK_SIZE), by, positiveMod(bz, CHUNK_SIZE))
    ] = id;
    chunk.revision += 1;
    const key = worldKey(bx, by, bz);
    if (record) this.mutations.set(key, id);
    if (id !== BlockId.Water) this.waterLevels.delete(key);
    if (BLOCKS[id].automation && !this.machines.has(key)) {
      this.machines.set(key, defaultMachineState(id));
    } else if (!BLOCKS[id].automation) {
      this.machines.delete(key);
    }
    this.markDirty(cx, cz, positiveMod(bx, CHUNK_SIZE), positiveMod(bz, CHUNK_SIZE));
  }

  private flowingWaterRegionAround(x: number, y: number, z: number): Array<{ x: number; y: number; z: number; level: number }> {
    const queue: Array<[number, number, number]> = [
      [x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1],
      [x, y + 1, z], [x, y - 1, z],
    ];
    const visited = new Set<string>();
    const flowing: Array<{ x: number; y: number; z: number; level: number }> = [];
    while (queue.length > 0 && visited.size < 4096) {
      const [fx, fy, fz] = queue.shift()!;
      const key = worldKey(fx, fy, fz);
      if (visited.has(key)) continue;
      visited.add(key);
      const level = this.waterLevels.get(key);
      if (level === undefined || this.getBlock(fx, fy, fz) !== BlockId.Water) continue;
      flowing.push({ x: fx, y: fy, z: fz, level });
      queue.push(
        [fx + 1, fy, fz], [fx - 1, fy, fz], [fx, fy, fz + 1], [fx, fy, fz - 1],
        [fx, fy + 1, fz], [fx, fy - 1, fz],
      );
    }
    return flowing;
  }

  private rebuildFlowAfterBlock(flowing: Array<{ x: number; y: number; z: number; level: number }>, record: boolean): void {
    if (flowing.length === 0) return;
    for (const cell of flowing) {
      const key = worldKey(cell.x, cell.y, cell.z);
      if (this.getBlock(cell.x, cell.y, cell.z) === BlockId.Water && this.waterLevels.has(key)) {
        this.writeBlock(cell.x, cell.y, cell.z, BlockId.Air, record);
      }
    }
    flowing.sort((a, b) => a.level - b.level);
    for (const cell of flowing) {
      if (this.getBlock(cell.x, cell.y, cell.z) === BlockId.Air) {
        this.flowWaterInto(cell.x, cell.y, cell.z, record);
      }
    }
  }

  setBlock(x: number, y: number, z: number, id: BlockId, record = true): void {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const wasWater = this.getBlock(bx, by, bz) === BlockId.Water;
    const flowing = wasWater && id !== BlockId.Water
      ? this.flowingWaterRegionAround(bx, by, bz)
      : [];
    this.writeBlock(bx, by, bz, id, record);
    if (id === BlockId.Water) this.waterLevels.delete(worldKey(bx, by, bz));
    else {
      if (wasWater) this.rebuildFlowAfterBlock(flowing, record);
      if (id === BlockId.Air) this.flowWaterInto(bx, by, bz, record);
    }
  }

  getWaterLevel(x: number, y: number, z: number): number {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (this.getBlock(bx, by, bz) !== BlockId.Water) return 0;
    return this.waterLevels.get(worldKey(bx, by, bz)) ?? 0;
  }

  flowWaterInto(x: number, y: number, z: number, record = true, maxLevel = 7): Array<[number, number, number]> {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by <= WORLD_MIN_Y || by >= WORLD_MAX_Y || this.getBlock(bx, by, bz) !== BlockId.Air) return [];

    let seedLevel = Number.POSITIVE_INFINITY;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      const nx = bx + dx;
      const ny = by + dy;
      const nz = bz + dz;
      if (this.getBlock(nx, ny, nz) !== BlockId.Water) continue;
      const neighborLevel = this.waterLevels.get(worldKey(nx, ny, nz)) ?? 0;
      seedLevel = Math.min(seedLevel, dy === 1 ? Math.max(1, neighborLevel) : neighborLevel + 1);
    }
    if (!Number.isFinite(seedLevel) || seedLevel > maxLevel) return [];

    const changed: Array<[number, number, number]> = [];
    const queue: Array<{ x: number; y: number; z: number; level: number }> = [];
    const best = new Map<string, number>();
    const placeFlow = (fx: number, fy: number, fz: number, level: number): boolean => {
      if (fy <= WORLD_MIN_Y || fy >= WORLD_MAX_Y || level > maxLevel) return false;
      const key = worldKey(fx, fy, fz);
      const block = this.getBlock(fx, fy, fz);
      if (block === BlockId.Water) {
        const existing = this.waterLevels.get(key) ?? 0;
        if (existing <= level) return false;
      } else if (block !== BlockId.Air) return false;
      const previousBest = best.get(key);
      if (previousBest !== undefined && previousBest <= level) return false;
      best.set(key, level);
      if (block !== BlockId.Water) changed.push([fx, fy, fz]);
      this.writeBlock(fx, fy, fz, BlockId.Water, record);
      this.waterLevels.set(key, level);
      queue.push({ x: fx, y: fy, z: fz, level });
      return true;
    };

    placeFlow(bx, by, bz, seedLevel);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (this.getBlock(current.x, current.y - 1, current.z) === BlockId.Air) {
        placeFlow(current.x, current.y - 1, current.z, current.level);
        continue;
      }
      if (current.level >= maxLevel) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        placeFlow(current.x + dx, current.y, current.z + dz, current.level + 1);
      }
    }
    return changed;
  }

  private markDirty(cx: number, cz: number, lx: number, lz: number): void {
    this.dirtyChunks.add(chunkKey(cx, cz));
    if (lx === 0) this.dirtyChunks.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyChunks.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyChunks.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyChunks.add(chunkKey(cx, cz + 1));
  }

  getCollisionHeight(x: number, y: number, z: number): number {
    const definition = BLOCKS[this.getBlock(x, y, z)];
    if (!definition.solid) return 0;
    return definition.collisionHeight ?? 1;
  }

  isSolid(x: number, y: number, z: number): boolean {
    const by = Math.floor(y);
    return this.getCollisionHeight(x, by, z) > y - by;
  }

  findSpawn(): Vec3Data {
    for (let radius = 0; radius < 24; radius += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        for (const z of [-radius, radius]) {
          const y = this.getHeight(x, z);
          const id = this.getBlock(x, y, z);
          if (id !== BlockId.Water && id !== BlockId.SunCactus) return { x: x + 0.5, y: y + 1.01, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: this.getHeight(0, 0) + 2, z: 0.5 };
  }

  serializeMutations(): MutationTuple[] {
    return Array.from(this.mutations, ([key, id]) => {
      const [x, y, z] = key.split(",").map(Number);
      return [x, y, z, id];
    });
  }

  loadMutations(mutations: MutationTuple[]): void {
    this.mutations.clear();
    this.chunks.clear();
    for (const [x, y, z, id] of mutations) {
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        Number.isInteger(z) &&
        y >= WORLD_MIN_Y &&
        y < WORLD_MAX_Y &&
        BLOCKS[id]
      ) this.mutations.set(worldKey(x, y, z), id);
    }
  }

  serializeWaterLevels(): Array<[string, number]> {
    return Array.from(this.waterLevels, ([key, level]) => [key, level]);
  }

  loadWaterLevels(levels: Array<[string, number]> = []): void {
    this.waterLevels.clear();
    for (const [key, level] of levels) {
      if (typeof key === "string" && Number.isInteger(level) && level >= 1 && level <= 7) {
        this.waterLevels.set(key, level);
      }
    }
  }

  clearDirty(): string[] {
    const dirty = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();
    return dirty;
  }
}
