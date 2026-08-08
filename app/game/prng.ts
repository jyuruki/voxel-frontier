/** Deterministic helpers used by terrain, textures, mobs, and music. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  let value = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value ^= Math.imul(z, 2147483647);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const WORLD_SEED_ADJECTIVES = [
  "Amber", "Bright", "Copper", "Distant", "Frosted", "Hidden", "Lunar", "Misty",
  "Quiet", "River", "Solar", "Verdant", "Wild", "Windy", "Woven",
] as const;

const WORLD_SEED_LANDSCAPES = [
  "Basin", "Cedar", "Delta", "Hollow", "Mesa", "Orchard", "Prairie", "Range",
  "Reach", "Ridge", "Valley", "Watershed", "Wilds",
] as const;

/** Creates a readable, high-entropy seed without running during server render. */
export function createRandomWorldSeed(): string {
  const entropy = crypto.getRandomValues(new Uint32Array(3));
  const adjective = WORLD_SEED_ADJECTIVES[entropy[0] % WORLD_SEED_ADJECTIVES.length];
  const landscape = WORLD_SEED_LANDSCAPES[entropy[1] % WORLD_SEED_LANDSCAPES.length];
  return `${adjective} ${landscape} ${entropy[2].toString(36).toUpperCase().padStart(6, "0")}`;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);
  const sample = (sx: number, sz: number) =>
    hash3(sx, 0, sz, seed) / 4294967295;
  return lerp(
    lerp(sample(x0, z0), sample(x0 + 1, z0), tx),
    lerp(sample(x0, z0 + 1), sample(x0 + 1, z0 + 1), tx),
    tz,
  );
}

export function valueNoise3(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const tz = smoothstep(z - z0);
  const sample = (sx: number, sy: number, sz: number) =>
    hash3(sx, sy, sz, seed) / 4294967295;
  const lower = lerp(
    lerp(sample(x0, y0, z0), sample(x0 + 1, y0, z0), tx),
    lerp(sample(x0, y0, z0 + 1), sample(x0 + 1, y0, z0 + 1), tx),
    tz,
  );
  const upper = lerp(
    lerp(sample(x0, y0 + 1, z0), sample(x0 + 1, y0 + 1, z0), tx),
    lerp(
      sample(x0, y0 + 1, z0 + 1),
      sample(x0 + 1, y0 + 1, z0 + 1),
      tx,
    ),
    tz,
  );
  return lerp(lower, upper, ty);
}

export function fractalNoise2(
  x: number,
  z: number,
  seed: number,
  octaves = 4,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2(x * frequency, z * frequency, seed + octave * 1013) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalization;
}

export function worldKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function parseWorldKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(",").map(Number);
  return [x, y, z];
}
