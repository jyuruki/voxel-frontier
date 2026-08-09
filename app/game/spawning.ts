import { BLOCKS } from "./blocks";
import { MOB_DEFINITIONS } from "./mobs";
import { worldKey } from "./prng";
import { BlockId, MobState, Vec3Data, WORLD_MAX_Y, WORLD_MIN_Y } from "./types";
import { isEmberdeepCoordinate, VoxelWorld } from "./world";
import { isDungeonCoordinate } from "./realms";

export const NATURAL_SPAWN_MIN_DISTANCE = 18;
export const NATURAL_SPAWN_MAX_DISTANCE = 48;
export const NATURAL_DESPAWN_DISTANCE = 72;
export const TORCH_BLOCK_LIGHT_RADIUS = 14;

export type NaturalSpawnCategory = "passive" | "hostile";

const PASSIVE_KINDS: MobState["kind"][] = ["sheep", "cow", "pig", "chicken", "glowgrazer"];
const HOSTILE_KINDS: MobState["kind"][] = ["mireling", "cinderling", "thornback", "nightwisp", "shardcaster"];

export function isNaturalSpawnKind(kind: MobState["kind"], category: NaturalSpawnCategory): boolean {
  return category === "passive" ? PASSIVE_KINDS.includes(kind) : HOSTILE_KINDS.includes(kind);
}

export function isFrontierNight(timeOfDay: number): boolean {
  return timeOfDay < 0.22 || timeOfDay > 0.78;
}

export function daylightLevel(timeOfDay: number): number {
  if (isFrontierNight(timeOfDay)) return 0;
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  return Math.max(0, Math.min(15, Math.round((Math.sin(angle) * 0.5 + 0.5) * 15)));
}

function sourceLightLevel(world: VoxelWorld, x: number, y: number, z: number): number {
  const id = world.peekBlock(x, y, z);
  const emissive = BLOCKS[id].emissive ?? 0;
  if (emissive < 0.48) return 0;
  if ([BlockId.FluxLamp, BlockId.LatchLamp].includes(id)) {
    const machine = world.machines.get(worldKey(x, y, z));
    if (!machine || machine.signal <= 0) return 0;
  }
  return Math.max(1, Math.min(15, Math.round(emissive * 16)));
}

/**
 * A compact block-light model used by natural spawning. The visual renderer
 * has a softer falloff, while this integer field mirrors the gameplay concept
 * of a level-15 source losing one level per block.
 */
export function blockLightLevel(
  world: VoxelWorld,
  position: Vec3Data,
  radius = TORCH_BLOCK_LIGHT_RADIUS,
): number {
  const originX = Math.floor(position.x);
  const originY = Math.floor(position.y);
  const originZ = Math.floor(position.z);
  let brightest = 0;
  for (let dx = -radius; dx <= radius; dx += 1) {
    const remainingX = radius - Math.abs(dx);
    for (let dy = -remainingX; dy <= remainingX; dy += 1) {
      const remainingZ = remainingX - Math.abs(dy);
      for (let dz = -remainingZ; dz <= remainingZ; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (distance >= radius || brightest >= 15 - distance) continue;
        const source = sourceLightLevel(world, originX + dx, originY + dy, originZ + dz);
        brightest = Math.max(brightest, source - distance);
        if (brightest >= 15) return 15;
      }
    }
  }
  return Math.max(0, brightest);
}

export function skyLightLevel(world: VoxelWorld, position: Vec3Data, timeOfDay: number): number {
  if (isEmberdeepCoordinate(position.x) || isDungeonCoordinate(position.x, position.z)) return 0;
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  const z = Math.floor(position.z);
  if (y <= world.getHeight(x, z)) return 0;
  const scanTop = Math.min(WORLD_MAX_Y - 1, Math.max(y + 24, world.getHeight(x, z) + 2));
  for (let scanY = y + 1; scanY <= scanTop; scanY += 1) {
    if (BLOCKS[world.peekBlock(x, scanY, z)].opaque) return 0;
  }
  return daylightLevel(timeOfDay);
}

export function nearestPlayerDistance(position: Vec3Data, players: Iterable<Vec3Data>): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const player of players) {
    nearest = Math.min(nearest, Math.hypot(
      position.x - player.x,
      position.y - player.y,
      position.z - player.z,
    ));
  }
  return nearest;
}

function hasSpawnFloor(world: VoxelWorld, position: Vec3Data): boolean {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  const z = Math.floor(position.z);
  if (y <= WORLD_MIN_Y + 1 || y >= WORLD_MAX_Y - 2) return false;
  const floor = world.peekBlock(x, y - 1, z);
  return BLOCKS[floor].solid
    && world.getCollisionHeight(x, y - 1, z) >= 0.8
    && world.peekBlock(x, y, z) === BlockId.Air
    && world.peekBlock(x, y + 1, z) === BlockId.Air;
}

export function canNaturalMobSpawn(
  world: VoxelWorld,
  category: NaturalSpawnCategory,
  position: Vec3Data,
  timeOfDay: number,
  players: Iterable<Vec3Data>,
): boolean {
  const playerList = Array.from(players);
  const distance = nearestPlayerDistance(position, playerList);
  if (distance < NATURAL_SPAWN_MIN_DISTANCE || distance > NATURAL_SPAWN_MAX_DISTANCE) return false;
  if (!hasSpawnFloor(world, position)) return false;
  const blockLight = blockLightLevel(world, position);
  const skyLight = skyLightLevel(world, position, timeOfDay);
  if (category === "hostile") return blockLight === 0 && skyLight === 0;
  const floor = world.peekBlock(position.x, position.y - 1, position.z);
  const passiveFloor = floor === BlockId.Turf || (isEmberdeepCoordinate(position.x) && floor === BlockId.AshSoil);
  return passiveFloor && Math.max(blockLight, skyLight) >= 9;
}

function caveFloorNear(world: VoxelWorld, x: number, z: number, targetY: number): number | null {
  for (let offset = 0; offset <= 16; offset += 1) {
    for (const sign of offset === 0 ? [1] : [1, -1]) {
      const y = Math.floor(targetY + offset * sign);
      if (y <= WORLD_MIN_Y + 1 || y >= WORLD_MAX_Y - 2) continue;
      const position = { x: x + 0.5, y: y + 0.01, z: z + 0.5 };
      if (hasSpawnFloor(world, position)) return y;
    }
  }
  return null;
}

export function findNaturalSpawnSite(
  world: VoxelWorld,
  category: NaturalSpawnCategory,
  anchor: Vec3Data,
  allPlayers: Iterable<Vec3Data>,
  timeOfDay: number,
  random: () => number,
  attempts = 14,
): Vec3Data | null {
  const players = Array.from(allPlayers);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = NATURAL_SPAWN_MIN_DISTANCE + random() * (NATURAL_SPAWN_MAX_DISTANCE - NATURAL_SPAWN_MIN_DISTANCE);
    const x = Math.floor(anchor.x + Math.cos(angle) * distance);
    const z = Math.floor(anchor.z + Math.sin(angle) * distance);
    let y: number;
    const surface = world.getHeight(x, z) + 1;
    if (category === "passive") y = surface;
    else {
      const anchorUnderground = anchor.y < world.getHeight(anchor.x, anchor.z) - 2;
      const chooseSurface = !anchorUnderground && isFrontierNight(timeOfDay) && random() < 0.62;
      if (chooseSurface) y = surface;
      else {
        const maximum = Math.min(surface - 3, anchor.y + 18);
        const minimum = Math.max(WORLD_MIN_Y + 2, anchor.y - 34);
        if (maximum <= minimum) continue;
        const caveY = caveFloorNear(world, x, z, minimum + random() * (maximum - minimum));
        if (caveY === null) continue;
        y = caveY;
      }
    }
    const position = { x: x + 0.5, y: y + 0.01, z: z + 0.5 };
    if (canNaturalMobSpawn(world, category, position, timeOfDay, players)) return position;
  }
  return null;
}

export function chooseNaturalMobKind(
  world: VoxelWorld,
  category: NaturalSpawnCategory,
  position: Vec3Data,
  random: () => number,
): MobState["kind"] {
  const roll = random();
  const biome = world.getBiome(position.x, position.z);
  if (category === "passive") {
    if (isEmberdeepCoordinate(position.x)) return "glowgrazer";
    if (biome === "Frostcap Expanse") return roll < 0.62 ? "sheep" : "chicken";
    if (biome === "Windcut Prairie") return roll < 0.4 ? "cow" : roll < 0.72 ? "sheep" : "pig";
    return roll < 0.27 ? "sheep" : roll < 0.52 ? "cow" : roll < 0.78 ? "pig" : "chicken";
  }
  if (isEmberdeepCoordinate(position.x)) return roll < 0.58 ? "cinderling" : roll < 0.82 ? "nightwisp" : "thornback";
  if (biome === "Cinder Reach") return roll < 0.7 ? "cinderling" : "thornback";
  return roll < 0.3 ? "nightwisp" : roll < 0.56 ? "mireling" : roll < 0.8 ? "thornback" : "shardcaster";
}

export function naturalMobCap(category: NaturalSpawnCategory, playerCount: number): number {
  const count = Math.max(1, playerCount);
  return category === "passive" ? Math.min(24, 7 + count * 5) : Math.min(32, 8 + count * 8);
}

export function naturalMobCount(mobs: Iterable<MobState>, category: NaturalSpawnCategory): number {
  let count = 0;
  for (const mob of mobs) {
    if (mob.natural && isNaturalSpawnKind(mob.kind, category) && MOB_DEFINITIONS[mob.kind].passive === (category === "passive")) count += 1;
  }
  return count;
}
