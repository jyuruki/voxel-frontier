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
  WORLD_HEIGHT,
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

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

export function positiveMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function chunkIndex(lx: number, y: number, lz: number): number {
  return y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
}

function defaultMachineState(id: BlockId): MachineState {
  return {
    orientation: 0,
    enabled: id === BlockId.Toggle ? false : true,
    signal: 0,
    energy: id === BlockId.FluxCell ? 250 : 0,
    progress: 0,
    delay: 0,
    mode: id === BlockId.ProximitySensor ? "near" : undefined,
    storage: {},
  };
}

export class VoxelWorld {
  readonly seedText: string;
  readonly seed: number;
  readonly chunks = new Map<string, ChunkData>();
  readonly mutations = new Map<string, BlockId>();
  readonly machines = new Map<string, MachineState>();
  readonly drops: DroppedItemState[] = [];
  readonly mobs: MobState[] = [];
  readonly dirtyChunks = new Set<string>();
  private readonly heightCache = new Map<string, number>();

  constructor(seedText: string) {
    this.seedText = seedText.trim() || "frontier";
    this.seed = hashString(this.seedText);
  }

  getHeight(x: number, z: number): number {
    const cacheKey = `${x},${z}`;
    const cached = this.heightCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const continental = fractalNoise2(x / 82, z / 82, this.seed ^ 0x91e10da5, 5);
    const detail = fractalNoise2(x / 27, z / 27, this.seed ^ 0xa54ff53a, 3);
    const ridgeNoise = Math.abs(fractalNoise2(x / 48, z / 48, this.seed ^ 0x5a17c9e3, 4) - 0.5) * 2;
    const ridges = Math.max(0, ridgeNoise - 0.47) * 16;
    const height = Math.max(
      7,
      Math.min(WORLD_HEIGHT - 9, Math.floor(12 + continental * 14 + detail * 5 + ridges)),
    );
    this.heightCache.set(cacheKey, height);
    return height;
  }

  getBiome(x: number, z: number): string {
    const heat = fractalNoise2(x / 150, z / 150, this.seed ^ 0x243f6a88, 3);
    const moisture = fractalNoise2(x / 130, z / 130, this.seed ^ 0xb7e15162, 3);
    const volcanic = fractalNoise2(x / 210, z / 210, this.seed ^ 0x8aed2a6b, 2);
    if (volcanic > 0.71) return "Cinder Reach";
    if (heat > 0.67 && moisture < 0.48) return "Sunscar Dunes";
    if (heat < 0.35) return "Frostcap Expanse";
    if (moisture > 0.62) return "Emberwood Wilds";
    if (moisture < 0.38) return "Windcut Prairie";
    return "Starbloom Meadow";
  }

  private baseTerrainBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    if (y === 0) return BlockId.Bedrock;
    const height = this.getHeight(x, z);
    const biome = this.getBiome(x, z);
    if (y > height) return y <= SEA_LEVEL ? BlockId.Water : BlockId.Air;

    const depth = height - y;
    if (depth === 0) {
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

    const caveLarge = valueNoise3(x / 19, y / 11, z / 19, this.seed ^ 0xc2b2ae35);
    const caveDetail = valueNoise3(x / 8, y / 7, z / 8, this.seed ^ 0x27d4eb2f);
    const cave = caveLarge * 0.68 + caveDetail * 0.32;
    if (y > 3 && y < height - 3 && cave > 0.685) {
      return y < 7 && hash3(x, y, z, this.seed) % 7 === 0
        ? BlockId.Water
        : BlockId.Air;
    }

    const oreRoll = hash3(x, y, z, this.seed ^ 0x165667b1) % 1000;
    if (y < 14 && oreRoll < 11) return BlockId.AetherCrystal;
    if (y < 25 && oreRoll >= 11 && oreRoll < 35) return BlockId.CopperOre;
    if (y < 35 && oreRoll >= 35 && oreRoll < 68) return BlockId.CoalOre;
    if (biome === "Cinder Reach" && y < 24 && oreRoll > 968) return BlockId.Cinnabar;
    if (biome === "Cinder Reach" && y < 20 && oreRoll > 930) return BlockId.SulfurStone;
    return biome === "Cinder Reach" && y > height - 8 ? BlockId.Basalt : BlockId.Stone;
  }

  private addSurfaceFeatures(chunk: ChunkData): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx += 1) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const height = this.getHeight(x, z);
        if (height >= WORLD_HEIGHT - 7) continue;
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
        }
      }
    }
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
      y < 0 ||
      y >= WORLD_HEIGHT
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
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
          chunk.blocks[chunkIndex(lx, y, lz)] = this.baseTerrainBlock(
            baseX + lx,
            y,
            baseZ + lz,
          );
        }
      }
    }
    this.addSurfaceFeatures(chunk);
    for (const [keyString, id] of this.mutations) {
      const [x, y, z] = keyString.split(",").map(Number);
      if (floorDiv(x, CHUNK_SIZE) === cx && floorDiv(z, CHUNK_SIZE) === cz) {
        chunk.blocks[
          chunkIndex(positiveMod(x, CHUNK_SIZE), y, positiveMod(z, CHUNK_SIZE))
        ] = id;
      }
    }
    this.chunks.set(key, chunk);
    this.dirtyChunks.add(key);
    return chunk;
  }

  getBlock(x: number, y: number, z: number): BlockId {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < 0 || by >= WORLD_HEIGHT) return BlockId.Air;
    const chunk = this.getChunk(floorDiv(bx, CHUNK_SIZE), floorDiv(bz, CHUNK_SIZE));
    return chunk.blocks[
      chunkIndex(positiveMod(bx, CHUNK_SIZE), by, positiveMod(bz, CHUNK_SIZE))
    ] as BlockId;
  }

  setBlock(x: number, y: number, z: number, id: BlockId, record = true): void {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by <= 0 || by >= WORLD_HEIGHT) return;
    const cx = floorDiv(bx, CHUNK_SIZE);
    const cz = floorDiv(bz, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    chunk.blocks[
      chunkIndex(positiveMod(bx, CHUNK_SIZE), by, positiveMod(bz, CHUNK_SIZE))
    ] = id;
    chunk.revision += 1;
    const key = worldKey(bx, by, bz);
    if (record) this.mutations.set(key, id);
    if (BLOCKS[id].automation && !this.machines.has(key)) {
      this.machines.set(key, defaultMachineState(id));
    } else if (!BLOCKS[id].automation) {
      this.machines.delete(key);
    }
    this.markDirty(cx, cz, positiveMod(bx, CHUNK_SIZE), positiveMod(bz, CHUNK_SIZE));
  }

  private markDirty(cx: number, cz: number, lx: number, lz: number): void {
    this.dirtyChunks.add(chunkKey(cx, cz));
    if (lx === 0) this.dirtyChunks.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyChunks.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyChunks.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyChunks.add(chunkKey(cx, cz + 1));
  }

  isSolid(x: number, y: number, z: number): boolean {
    return BLOCKS[this.getBlock(x, y, z)].solid;
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
        BLOCKS[id]
      ) this.mutations.set(worldKey(x, y, z), id);
    }
  }

  clearDirty(): string[] {
    const dirty = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();
    return dirty;
  }
}

