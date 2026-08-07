import { strFromU8, strToU8, zlibSync, unzlibSync } from "fflate";
import { hashString } from "./prng";
import { SAVE_VERSION, WorldSave } from "./types";

export const LOCAL_SAVE_KEY = "voxel-frontier.save.v1";
const MAX_KEY_LENGTH = 8_000_000;

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
  if (!save.player || !Array.isArray(save.player.hotbar) || typeof save.player.inventory !== "object") {
    throw new Error("The player state is incomplete.");
  }
  if (!Array.isArray(save.mutations) || !Array.isArray(save.machines)) throw new Error("The terrain state is incomplete.");
  if (!Array.isArray(save.drops) || !Array.isArray(save.mobs)) throw new Error("The entity state is incomplete.");
  if (save.mutations.length > 1_000_000) throw new Error("This save contains too many block changes.");
}

export function encodeWorldKey(save: WorldSave): string {
  const json = JSON.stringify(save);
  const checksum = hashString(json).toString(36);
  const compressed = zlibSync(strToU8(json), { level: 9 });
  return `VF1.${checksum}.${bytesToBase64(compressed)}`;
}

export function decodeWorldKey(key: string): WorldSave {
  const cleaned = key.trim();
  if (cleaned.length > MAX_KEY_LENGTH) throw new Error("That world key is too large to import safely.");
  const [prefix, checksum, payload] = cleaned.split(".");
  if (prefix !== "VF1" || !checksum || !payload) throw new Error("This is not a Voxel Frontier world key.");
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
  return parsed;
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
