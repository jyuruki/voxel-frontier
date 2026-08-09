import { RealmId, Vec3Data } from "./types";

export const EMBERDEEP_OFFSET = 100_000;
export const DUNGEON_REALM_MIN = 8_192;
export const DUNGEON_REALM_CELL = 256;
export const DUNGEON_REALM_GRID = 48;
export const DUNGEON_REALM_MAX = DUNGEON_REALM_MIN + DUNGEON_REALM_CELL * DUNGEON_REALM_GRID;

export function isEmberdeepCoordinate(x: number): boolean {
  return Math.abs(x) >= EMBERDEEP_OFFSET / 2;
}

export function isDungeonCoordinate(x: number, z: number): boolean {
  return x >= DUNGEON_REALM_MIN
    && z >= DUNGEON_REALM_MIN
    && x < DUNGEON_REALM_MAX
    && z < DUNGEON_REALM_MAX;
}

export function dungeonRealmCell(x: number, z: number): { x: number; z: number } | null {
  if (!isDungeonCoordinate(x, z)) return null;
  return {
    x: Math.floor((x - DUNGEON_REALM_MIN) / DUNGEON_REALM_CELL),
    z: Math.floor((z - DUNGEON_REALM_MIN) / DUNGEON_REALM_CELL),
  };
}

export function realmForPosition(position: Pick<Vec3Data, "x" | "z">): RealmId {
  const cell = dungeonRealmCell(position.x, position.z);
  if (cell) return `dungeon:${cell.x}:${cell.z}`;
  if (isEmberdeepCoordinate(position.x)) return "emberdeep";
  return "frontier";
}

export function realmLabel(realm: RealmId): string {
  if (realm === "frontier") return "Living Frontier";
  if (realm === "emberdeep") return "The Emberdeep";
  return "Expedition Realm";
}

export function localRealmCoordinates(position: Vec3Data): Vec3Data {
  const cell = dungeonRealmCell(position.x, position.z);
  if (!cell) return { ...position };
  return {
    x: position.x - (DUNGEON_REALM_MIN + cell.x * DUNGEON_REALM_CELL),
    y: position.y,
    z: position.z - (DUNGEON_REALM_MIN + cell.z * DUNGEON_REALM_CELL),
  };
}
