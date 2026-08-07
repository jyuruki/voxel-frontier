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

    const caveRegion = valueNoise3(x / 52, y / 34, z / 52, this.seed ^ 0x7f4a7c15);
    const cavernLarge = valueNoise3(x / 23, y / 15, z / 23, this.seed ^ 0xc2b2ae35);
    const cavernDetail = valueNoise3(x / 9, y / 7, z / 9, this.seed ^ 0x27d4eb2f);
    const cavernField = cavernLarge * 0.7 + cavernDetail * 0.3;
    const wormA = Math.abs(valueNoise3(x / 18, y / 12, z / 18, this.seed ^ 0x85ebca6b) - 0.5);
    const wormB = Math.abs(valueNoise3(x / 17, y / 14, z / 17, this.seed ^ 0x165667b1) - 0.5);
    const fracture = Math.abs(valueNoise3(x / 36, y / 8, z / 36, this.seed ^ 0xd3a2646c) - 0.5);
    const cavern = cavernField > 0.625 + Math.max(0, y - 24) * 0.002 && caveRegion > 0.25;
    const windingTunnel = wormA < 0.105 && wormB < 0.135 && caveRegion > 0.2;
    const verticalRift = fracture < 0.038 && cavernDetail > 0.46 && y < 25;
    if (y > 2 && y < height - 2 && (cavern || windingTunnel || verticalRift)) {
      const aquifer = y < 10 && valueNoise3(x / 31, y / 19, z / 31, this.seed ^ 0x94d049bb) > 0.58;
      return aquifer ? BlockId.Water : BlockId.Air;
    }

    const oreRoll = hash3(x, y, z, this.seed ^ 0x165667b1) % 1000;
    if (y < 11 && oreRoll < 5) return BlockId.MoonshardOre;
    if (y < 14 && oreRoll < 11) return BlockId.AetherCrystal;
    if (y < 25 && oreRoll >= 11 && oreRoll < 35) return BlockId.CopperOre;
    if (y < 35 && oreRoll >= 35 && oreRoll < 68) return BlockId.CoalOre;
    if (biome === "Cinder Reach" && y < 24 && oreRoll > 968) return BlockId.Cinnabar;
    if (biome === "Cinder Reach" && y < 20 && oreRoll > 930) return BlockId.SulfurStone;
    if (oreRoll > 955 && oreRoll < 974 && y > 8 && y < 31) return BlockId.Marble;
    if (y < 13) return BlockId.Slate;
    if (y < 30 && valueNoise3(x / 21, y / 9, z / 21, this.seed ^ 0x51ed270b) > 0.61) return BlockId.Limestone;
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
    this.addRuinLandmark(chunk);
  }

  private addCaveFeatures(chunk: ChunkData): void {
    for (let y = 2; y < WORLD_HEIGHT - 2; y += 1) {
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
          if (roll < 4 && y < 20) chunk.blocks[index] = BlockId.CrystalSpike;
          else if (roll < 10 && y < 28) chunk.blocks[index] = BlockId.GlowMushroom;
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
    if (baseY <= SEA_LEVEL + 1 || baseY >= WORLD_HEIGHT - 7) return;

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
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
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
    this.addCaveFeatures(chunk);
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
