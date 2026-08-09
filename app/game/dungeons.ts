import { BlockId, CHUNK_SIZE, RealmId, Vec3Data } from "./types";
import { hash3, hashString } from "./prng";
import {
  DUNGEON_REALM_CELL,
  DUNGEON_REALM_GRID,
  DUNGEON_REALM_MIN,
} from "./realms";

export { isDungeonCoordinate } from "./realms";

export type DungeonTheme = "verdant basilica" | "ember foundry" | "moon vault" | "sunken archive";
export type DungeonRoomKind = "arrival" | "atrium" | "garden" | "gallery" | "bridge" | "sanctum" | "vault";

export interface DungeonRoom {
  x: number;
  z: number;
  radius: number;
  height: number;
  kind: DungeonRoomKind;
}

export interface DungeonPlan {
  id: string;
  realm: RealmId;
  theme: DungeonTheme;
  floor: BlockId;
  accent: BlockId;
  flora: BlockId[];
  baseY: number;
  rooms: DungeonRoom[];
  links: Array<[number, number]>;
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

const DIRECTIONS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
] as const;

function themeMaterials(theme: DungeonTheme): { floor: BlockId; accent: BlockId; flora: BlockId[] } {
  if (theme === "verdant basilica") return {
    floor: BlockId.Mossstone,
    accent: BlockId.CarvedStone,
    flora: [BlockId.CaveMoss, BlockId.GlowMushroom, BlockId.StarBloom],
  };
  if (theme === "ember foundry") return {
    floor: BlockId.FiredBrick,
    accent: BlockId.GoldTrim,
    flora: [BlockId.EmberGlow, BlockId.CrystalSpike],
  };
  if (theme === "sunken archive") return {
    floor: BlockId.PolishedStone,
    accent: BlockId.Bookshelf,
    flora: [BlockId.CaveMoss, BlockId.GlowMushroom, BlockId.FlowerPot],
  };
  return {
    floor: BlockId.DungeonBrick,
    accent: BlockId.MoonshardBlock,
    flora: [BlockId.CrystalSpike, BlockId.GlowMushroom],
  };
}

/**
 * Builds a deterministic roguelike realm. The realm has its own void-backed
 * coordinate namespace; the player UI presents local dungeon coordinates, so
 * entering a delve is no longer exposed as a giant overworld teleport.
 */
export function createDungeonPlan(origin: Vec3Data, seed: number): DungeonPlan {
  const originKey = `${Math.floor(origin.x)},${Math.floor(origin.y)},${Math.floor(origin.z)}`;
  const dungeonHash = hashString(`${seed}:v10-dungeon:${originKey}`);
  const themes: DungeonTheme[] = ["verdant basilica", "ember foundry", "moon vault", "sunken archive"];
  const theme = themes[dungeonHash % themes.length];
  const materials = themeMaterials(theme);
  const cellX = dungeonHash % DUNGEON_REALM_GRID;
  const cellZ = hash3(dungeonHash, 853, seed, 0x165667b1) % DUNGEON_REALM_GRID;
  const centerX = DUNGEON_REALM_MIN + cellX * DUNGEON_REALM_CELL + DUNGEON_REALM_CELL / 2;
  const centerZ = DUNGEON_REALM_MIN + cellZ * DUNGEON_REALM_CELL + DUNGEON_REALM_CELL / 2;
  const baseY = 42 + (dungeonHash % 4) * 5;
  const roomCount = 8 + (dungeonHash % 4);
  const gridRooms: Array<{ gx: number; gz: number }> = [{ gx: 0, gz: 0 }];
  const occupied = new Set(["0,0"]);
  let direction = dungeonHash % 4;

  for (let index = 1; index < roomCount; index += 1) {
    const previous = gridRooms[index - 1];
    const turn = hash3(dungeonHash, index, seed, 0x9e3779b9) % 5;
    direction = (direction + (turn === 0 ? 3 : turn >= 3 ? 1 : 0)) % 4;
    let chosen: { gx: number; gz: number } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidateDirection = (direction + attempt) % 4;
      const offset = DIRECTIONS[candidateDirection];
      const candidate = { gx: previous.gx + offset.x, gz: previous.gz + offset.z };
      if (Math.abs(candidate.gx) > 3 || Math.abs(candidate.gz) > 3 || occupied.has(`${candidate.gx},${candidate.gz}`)) continue;
      direction = candidateDirection;
      chosen = candidate;
      break;
    }
    if (!chosen) {
      outer: for (let radius = 1; radius <= 3; radius += 1) {
        for (let gx = -radius; gx <= radius; gx += 1) {
          for (const gz of [-radius, radius]) {
            if (!occupied.has(`${gx},${gz}`)) { chosen = { gx, gz }; break outer; }
          }
        }
      }
    }
    const room = chosen ?? { gx: index - 3, gz: 3 };
    occupied.add(`${room.gx},${room.gz}`);
    gridRooms.push(room);
  }

  const kinds: DungeonRoomKind[] = ["arrival", "atrium", "garden", "gallery", "bridge", "sanctum", "gallery", "garden", "atrium", "bridge", "vault"];
  const rooms = gridRooms.map((room, index): DungeonRoom => ({
    x: centerX + room.gx * 31,
    z: centerZ + room.gz * 31,
    radius: index === 0 ? 10 : index === roomCount - 1 ? 14 : 8 + (hash3(dungeonHash, index, seed, 0xbb67ae85) % 4),
    height: index === roomCount - 1 ? 14 : 8 + (hash3(index, dungeonHash, seed, 0x3c6ef372) % 5),
    kind: index === roomCount - 1 ? "vault" : kinds[index],
  }));
  const links: Array<[number, number]> = rooms.slice(1).map((_, index) => [index, index + 1]);
  for (let a = 0; a < rooms.length; a += 1) {
    for (let b = a + 2; b < rooms.length; b += 1) {
      const distance = Math.hypot(rooms[a].x - rooms[b].x, rooms[a].z - rooms[b].z);
      if (distance < 45 && hash3(a, b, dungeonHash, seed) % 100 < 28) links.push([a, b]);
    }
  }

  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  return {
    id: `dungeon-${dungeonHash.toString(36)}`,
    realm: `dungeon:${cellX}:${cellZ}`,
    theme,
    ...materials,
    baseY,
    rooms,
    links,
    origin: { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) },
    destination: { x: first.x + 0.5, y: baseY + 1.01, z: first.z - 4.5 },
    returnPosition: { x: first.x, y: baseY + 1, z: first.z + 7 },
    sealPosition: { x: last.x, y: baseY + 1, z: last.z },
    bossPosition: { x: last.x + 0.5, y: baseY + 1.01, z: last.z - 5.5 },
  };
}

export function chunkContainsDungeonEntrance(cx: number, cz: number, position: Vec3Data): boolean {
  return Math.floor(position.x / CHUNK_SIZE) === cx && Math.floor(position.z / CHUNK_SIZE) === cz;
}
