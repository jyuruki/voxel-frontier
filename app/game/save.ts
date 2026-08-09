import { strFromU8, strToU8, zlibSync, unzlibSync } from "fflate";
import { hashString } from "./prng";
import { BoatState, PlayerSaveState, SAVE_VERSION, WORLD_MAX_Y, WORLD_MIN_Y, WorldSave } from "./types";
import { parseWorldKey, worldKey } from "./prng";

export const LOCAL_SAVE_KEY = "voxel-frontier.save.v10";
const MAX_KEY_LENGTH = 8_000_000;
const LEGACY_Y_OFFSET = 46;
const TALL_WORLD_GENERATION = 2;
const MAX_COORDINATE = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validatePoint(value: unknown, label: string): void {
  if (!isRecord(value)
    || !finiteNumber(value.x, -MAX_COORDINATE, MAX_COORDINATE)
    || !finiteNumber(value.y, WORLD_MIN_Y - 32, WORLD_MAX_Y + 32)
    || !finiteNumber(value.z, -MAX_COORDINATE, MAX_COORDINATE)) {
    throw new Error(`${label} has invalid coordinates.`);
  }
}

function validateInventory(value: unknown, label: string): void {
  if (!isRecord(value) || Object.keys(value).length > 256) throw new Error(`${label} is invalid.`);
  for (const [item, count] of Object.entries(value)) {
    if (!item || item.length > 80 || !Number.isInteger(count) || !finiteNumber(count, 0, 1_000_000_000)) {
      throw new Error(`${label} contains an invalid item stack.`);
    }
  }
}

function validItemSlot(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 80);
}

function validatePlayerState(value: unknown, label: string): asserts value is PlayerSaveState {
  if (!isRecord(value)) throw new Error(`${label} is incomplete.`);
  validatePoint(value.position, `${label} position`);
  validateInventory(value.inventory, `${label} inventory`);
  if (!Array.isArray(value.hotbar) || value.hotbar.length > 9 || !value.hotbar.every(validItemSlot)) {
    throw new Error(`${label} hotbar is invalid.`);
  }
  if (value.inventorySlots !== undefined && (
    !Array.isArray(value.inventorySlots)
    || value.inventorySlots.length > 36
    || !value.inventorySlots.every(validItemSlot)
  )) throw new Error(`${label} inventory layout is invalid.`);
  if (!Number.isInteger(value.selectedSlot) || !finiteNumber(value.selectedSlot, 0, 8)) {
    throw new Error(`${label} selected slot is invalid.`);
  }
  for (const field of ["health", "hunger", "stamina"] as const) {
    if (!finiteNumber(value[field], 0, 100)) throw new Error(`${label} ${field} is invalid.`);
  }
  if (!finiteNumber(value.yaw, -10_000_000, 10_000_000) || !finiteNumber(value.pitch, -10, 10)) {
    throw new Error(`${label} view direction is invalid.`);
  }
  if (value.tradeCredit !== undefined && !finiteNumber(value.tradeCredit, 0, 1_000_000_000)) {
    throw new Error(`${label} trade credit is invalid.`);
  }
  if (value.spawnPoint !== undefined) validatePoint(value.spawnPoint, `${label} spawn point`);
  if (value.realm !== undefined && (typeof value.realm !== "string" || value.realm.length > 80)) {
    throw new Error(`${label} realm is invalid.`);
  }
  if (value.skinSeed !== undefined && (!Number.isInteger(value.skinSeed) || !finiteNumber(value.skinSeed, 0, 0xffff_ffff))) {
    throw new Error(`${label} skin is invalid.`);
  }
}

function validateBoatState(value: unknown): asserts value is BoatState {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || value.id.length > 120) {
    throw new Error("The saved boat state is invalid.");
  }
  validatePoint(value.position, "A saved boat");
  if (!isRecord(value.velocity)
    || !finiteNumber(value.velocity.x, -128, 128)
    || !finiteNumber(value.velocity.y, -128, 128)
    || !finiteNumber(value.velocity.z, -128, 128)
    || !finiteNumber(value.yaw, -10_000_000, 10_000_000)
    || !finiteNumber(value.angularVelocity, -128, 128)
    || !["emberwood", "frostpine", "riftwood"].includes(String(value.wood))
    || typeof value.realm !== "string"
    || value.realm.length > 80
    || (value.riderId !== undefined && (typeof value.riderId !== "string" || value.riderId.length > 120))) {
    throw new Error("The saved boat state is invalid.");
  }
}

function shiftPositionY<T extends { y: number }>(position: T): T {
  return {
    ...position,
    y: Math.max(WORLD_MIN_Y + 1, Math.min(WORLD_MAX_Y - 2, position.y + LEGACY_Y_OFFSET)),
  };
}

function shiftWorldKeyY(key: string): string {
  const [x, y, z] = parseWorldKey(key);
  return worldKey(x, Math.max(WORLD_MIN_Y + 1, Math.min(WORLD_MAX_Y - 1, y + LEGACY_Y_OFFSET)), z);
}

/** Lifts Version 5's 0…47 world state into the taller Version 6 terrain datum. */
export function migrateWorldSave(save: WorldSave): WorldSave {
  if ((save.generation ?? 1) >= TALL_WORLD_GENERATION) return save;
  return {
    ...save,
    generation: TALL_WORLD_GENERATION,
    player: {
      ...save.player,
      position: shiftPositionY(save.player.position),
      tradeCredit: save.player.tradeCredit ?? 0,
    },
    mutations: save.mutations
      .map(([x, y, z, id]) => [x, y + LEGACY_Y_OFFSET, z, id] as [number, number, number, typeof id])
      .filter(([, y]) => y > WORLD_MIN_Y && y < WORLD_MAX_Y),
    machines: save.machines.map(([key, state]) => [shiftWorldKeyY(key), state]),
    drops: save.drops.map((drop) => ({ ...drop, position: shiftPositionY(drop.position) })),
    mobs: save.mobs.map((mob) => ({
      ...mob,
      position: shiftPositionY(mob.position),
      home: mob.home ? shiftPositionY(mob.home) : undefined,
    })),
    waterLevels: save.waterLevels?.map(([key, level]) => [shiftWorldKeyY(key), level]),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateSave(value: unknown): asserts value is WorldSave {
  if (!value || typeof value !== "object") throw new Error("The key does not contain a world.");
  const save = value as Partial<WorldSave>;
  if (save.version !== SAVE_VERSION) throw new Error(`Unsupported world version: ${save.version ?? "unknown"}.`);
  if (typeof save.seed !== "string" || !save.seed.trim()) throw new Error("The world seed is missing.");
  if (save.mode !== undefined && save.mode !== "survival" && save.mode !== "creative") {
    throw new Error("The world mode is invalid.");
  }
  if (save.dayCount !== undefined && (!Number.isInteger(save.dayCount) || save.dayCount < 1)) {
    throw new Error("The saved day counter is invalid.");
  }
  validatePlayerState(save.player, "The player state");
  if (!Array.isArray(save.mutations) || !Array.isArray(save.machines)) throw new Error("The terrain state is incomplete.");
  if (!Array.isArray(save.drops) || !Array.isArray(save.mobs)) throw new Error("The entity state is incomplete.");
  if (save.boats !== undefined && (!Array.isArray(save.boats) || save.boats.length > 1_024)) {
    throw new Error("The saved boat state is invalid.");
  }
  for (const boat of save.boats ?? []) validateBoatState(boat);
  if (save.playerProfiles !== undefined && (
    !isRecord(save.playerProfiles)
    || Object.keys(save.playerProfiles).length > 32
  )) throw new Error("The saved player profiles are invalid.");
  for (const [playerId, profile] of Object.entries(save.playerProfiles ?? {})) {
    if (!playerId || playerId.length > 120) throw new Error("A saved player identity is invalid.");
    validatePlayerState(profile, `The profile for ${playerId.slice(0, 24)}`);
  }
  if (save.mutations.length > 1_000_000) throw new Error("This save contains too many block changes.");
  if (save.waterLevels !== undefined && (!Array.isArray(save.waterLevels) || save.waterLevels.length > 1_000_000)) {
    throw new Error("The saved water state is invalid.");
  }
}

export function encodeWorldKey(save: WorldSave): string {
  const json = JSON.stringify(save);
  const checksum = hashString(json).toString(36);
  const compressed = zlibSync(strToU8(json), { level: 9 });
  return `VF2.${checksum}.${bytesToBase64(compressed)}`;
}

export function decodeWorldKey(key: string): WorldSave {
  const cleaned = key.trim();
  if (cleaned.length > MAX_KEY_LENGTH) throw new Error("That world key is too large to import safely.");
  const [prefix, checksum, payload] = cleaned.split(".");
  if (prefix !== "VF2" || !checksum || !payload) throw new Error("This is not a Version 10 Voxel Frontier world key.");
  let json: string;
  try {
    json = strFromU8(unzlibSync(base64ToBytes(payload)));
  } catch {
    throw new Error("The world key is damaged or incomplete.");
  }
  if (hashString(json).toString(36) !== checksum) throw new Error("The world key failed its integrity check.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The world key contains invalid data.");
  }
  validateSave(parsed);
  return migrateWorldSave(parsed);
}

export function saveLocally(save: WorldSave): string {
  const encoded = encodeWorldKey(save);
  localStorage.setItem(LOCAL_SAVE_KEY, encoded);
  return encoded;
}

export function loadLocalSave(): WorldSave | null {
  const encoded = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!encoded) return null;
  try {
    return decodeWorldKey(encoded);
  } catch {
    localStorage.removeItem(LOCAL_SAVE_KEY);
    return null;
  }
}

export function hasLocalSave(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(LOCAL_SAVE_KEY));
}

export function downloadWorldKey(key: string, seed: string): void {
  const blob = new Blob([key], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${seed.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "frontier"}.vfworld.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
