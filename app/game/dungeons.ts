import { BlockId, CHUNK_SIZE, Vec3Data } from "./types";
import { hash3, hashString } from "./prng";

export const DUNGEON_Z_OFFSET = 180_000;

export function isDungeonCoordinate(z: number): boolean {
  return z >= DUNGEON_Z_OFFSET / 2;
}

export type DungeonTheme = "moss crypt" | "ember foundry" | "moon vault";

export interface DungeonRoom {
  x: number;
  z: number;
  radius: number;
}

export interface DungeonPlan {
  id: string;
  theme: DungeonTheme;
  floor: BlockId;
  accent: BlockId;
  baseY: number;
  rooms: DungeonRoom[];
  origin: Vec3Data;
  destination: Vec3Data;
  returnPosition: Vec3Data;
  sealPosition: Vec3Data;
  bossPosition: Vec3Data;
}

export function isDungeonEntranceChunk(cx: number, cz: number, seed: number): boolean {
  const regionSize = 11;
  const regionX = Math.floor(cx / regionSize);
  const regionZ = Math.floor(cz / regionSize);
  if (hash3(regionX, 811, regionZ, seed ^ 0x7f4a7c15) % 100 >= 34) return false;
  const candidateX = regionX * regionSize + 2 + hash3(regionX, 823, regionZ, seed ^ 0x94d049bb) % (regionSize - 4);
  const candidateZ = regionZ * regionSize + 2 + hash3(regionX, 839, regionZ, seed ^ 0x27d4eb2f) % (regionSize - 4);
  return cx === candidateX && cz === candidateZ;
}

/** A deterministic instance plan. Rooms turn as they progress, so entrances do not share a fixed layout. */
export function createDungeonPlan(origin: Vec3Data, seed: number): DungeonPlan {
  const originKey = `${Math.floor(origin.x)},${Math.floor(origin.y)},${Math.floor(origin.z)}`;
  const dungeonHash = hashString(`${seed}:dungeon:${originKey}`);
  const themes: DungeonTheme[] = ["moss crypt", "ember foundry", "moon vault"];
  const theme = themes[dungeonHash % themes.length];
  const floor = theme === "moss crypt" ? BlockId.Mossstone : theme === "ember foundry" ? BlockId.FiredBrick : BlockId.DungeonBrick;
  const accent = theme === "moss crypt" ? BlockId.CarvedStone : theme === "ember foundry" ? BlockId.GoldTrim : BlockId.MoonshardBlock;
  const roomCount = 3 + (dungeonHash % 3);
  const instanceX = (dungeonHash % 20_000) - 10_000;
  const instanceZ = DUNGEON_Z_OFFSET + (hash3(dungeonHash, 853, seed, 0x165667b1) % 30_000);
  const baseY = -30 + (dungeonHash % 4) * 8;
  const rooms: DungeonRoom[] = [{ x: instanceX, z: instanceZ, radius: 5 }];
  let direction = dungeonHash % 4;
  for (let index = 1; index < roomCount; index += 1) {
    const turn = hash3(dungeonHash, index, seed, 0x9e3779b9) % 3;
    direction = (direction + (turn === 0 ? 3 : turn === 2 ? 1 : 0)) % 4;
    const previous = rooms[index - 1];
    const distance = 11 + (hash3(index, dungeonHash, seed, 0xbb67ae85) % 3);
    const dx = direction === 1 ? distance : direction === 3 ? -distance : 0;
    const dz = direction === 2 ? distance : direction === 0 ? -distance : 0;
    rooms.push({ x: previous.x + dx, z: previous.z + dz, radius: index === roomCount - 1 ? 6 : 4 + (index % 2) });
  }
  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  return {
    id: `dungeon-${dungeonHash.toString(36)}`,
    theme,
    floor,
    accent,
    baseY,
    rooms,
    origin: { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) },
    destination: { x: first.x + 0.5, y: baseY + 1.01, z: first.z + 0.5 },
    returnPosition: { x: first.x, y: baseY + 1, z: first.z + 3 },
    sealPosition: { x: last.x, y: baseY + 1, z: last.z },
    bossPosition: { x: last.x + 0.5, y: baseY + 1.01, z: last.z - 2.5 },
  };
}

export function chunkContainsDungeonEntrance(cx: number, cz: number, position: Vec3Data): boolean {
  return Math.floor(position.x / CHUNK_SIZE) === cx && Math.floor(position.z / CHUNK_SIZE) === cz;
}
