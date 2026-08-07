import { BlockId, ItemId, MobState } from "./types";
import { VoxelWorld } from "./world";

export interface MobDefinition {
  name: string;
  maxHealth: number;
  radius: number;
  height: number;
  passive: boolean;
  speed: number;
  waterSpeed: number;
  damage: number;
  reach: number;
  loot: Array<{ item: ItemId; min: number; max: number }>;
}

export const MOB_DEFINITIONS: Record<MobState["kind"], MobDefinition> = {
  glowgrazer: {
    name: "Glowgrazer",
    maxHealth: 28,
    radius: 0.4,
    height: 1.18,
    passive: true,
    speed: 0.72,
    waterSpeed: 0.82,
    damage: 0,
    reach: 0,
    loot: [
      { item: "food:glowcut", min: 1, max: 2 },
      { item: "part:soft-fiber", min: 1, max: 3 },
    ],
  },
  mireling: {
    name: "Mireling",
    maxHealth: 36,
    radius: 0.38,
    height: 1.05,
    passive: false,
    speed: 2.05,
    waterSpeed: 1.72,
    damage: 6,
    reach: 1.2,
    loot: [{ item: "part:carapace", min: 1, max: 2 }],
  },
  cinderling: {
    name: "Cinderling",
    maxHealth: 42,
    radius: 0.4,
    height: 1.24,
    passive: false,
    speed: 2.2,
    waterSpeed: 0.76,
    damage: 9,
    reach: 1.25,
    loot: [{ item: "part:cinder-core", min: 1, max: 1 }],
  },
  thornback: {
    name: "Thornback",
    maxHealth: 58,
    radius: 0.52,
    height: 1.28,
    passive: false,
    speed: 1.35,
    waterSpeed: 0.72,
    damage: 12,
    reach: 1.45,
    loot: [{ item: "part:carapace", min: 2, max: 4 }],
  },
  nightwisp: {
    name: "Nightwisp",
    maxHealth: 24,
    radius: 0.32,
    height: 0.88,
    passive: false,
    speed: 2.65,
    waterSpeed: 1.58,
    damage: 7,
    reach: 1.1,
    loot: [{ item: "part:moonshard", min: 1, max: 2 }],
  },
  wayfarer: {
    name: "Wayfarer",
    maxHealth: 30,
    radius: 0.34,
    height: 1.72,
    passive: true,
    speed: 1.05,
    waterSpeed: 0.78,
    damage: 0,
    reach: 0,
    loot: [],
  },
};

const EPSILON = 0.002;

export function mobWaterImmersion(
  world: VoxelWorld,
  mob: Pick<MobState, "kind" | "position">,
): number {
  const definition = MOB_DEFINITIONS[mob.kind];
  const heights = [0.12, definition.height * 0.52, definition.height * 0.9];
  let wet = 0;
  for (const height of heights) {
    if (world.getBlock(mob.position.x, mob.position.y + height, mob.position.z) === BlockId.Water) wet += 1;
  }
  return wet / heights.length;
}

export function mobIntersectsSolid(
  world: VoxelWorld,
  mob: Pick<MobState, "kind" | "position">,
  position = mob.position,
): boolean {
  const definition = MOB_DEFINITIONS[mob.kind];
  const minX = Math.floor(position.x - definition.radius + EPSILON);
  const maxX = Math.floor(position.x + definition.radius - EPSILON);
  const minY = Math.floor(position.y + EPSILON);
  const maxY = Math.floor(position.y + definition.height - EPSILON);
  const minZ = Math.floor(position.z - definition.radius + EPSILON);
  const maxZ = Math.floor(position.z + definition.radius - EPSILON);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const collisionHeight = world.getCollisionHeight(x, y, z);
        if (
          collisionHeight > 0 &&
          position.y < y + collisionHeight - EPSILON &&
          position.y + definition.height > y + EPSILON
        ) return true;
      }
    }
  }
  return false;
}

function moveAxis(world: VoxelWorld, mob: MobState, axis: "x" | "y" | "z", amount: number): boolean {
  if (Math.abs(amount) < 1e-7) return false;
  const original = mob.position[axis];
  mob.position[axis] += amount;
  if (!mobIntersectsSolid(world, mob)) return false;
  let safe = 0;
  let blocked = 1;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const midpoint = (safe + blocked) / 2;
    mob.position[axis] = original + amount * midpoint;
    if (mobIntersectsSolid(world, mob)) blocked = midpoint;
    else safe = midpoint;
  }
  mob.position[axis] = original + amount * safe;
  mob.velocity[axis] = 0;
  return true;
}

function grounded(world: VoxelWorld, mob: MobState): boolean {
  const lowered = { ...mob.position, y: mob.position.y - 0.055 };
  return mobIntersectsSolid(world, mob, lowered);
}

export function resolveMobPenetration(world: VoxelWorld, mob: MobState): boolean {
  if (!mobIntersectsSolid(world, mob)) return true;
  const original = { ...mob.position };
  for (let dy = 0.1; dy <= 4; dy += 0.1) {
    const candidate = { ...original, y: original.y + dy };
    if (!mobIntersectsSolid(world, mob, candidate)) {
      mob.position = candidate;
      mob.velocity.y = 0;
      return true;
    }
  }
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  for (const [dx, dz] of offsets) {
    const x = Math.floor(original.x + dx) + 0.5;
    const z = Math.floor(original.z + dz) + 0.5;
    const candidate = { x, y: world.getHeight(x, z) + 1.01, z };
    if (!mobIntersectsSolid(world, mob, candidate)) {
      mob.position = candidate;
      mob.velocity = { x: 0, y: 0, z: 0 };
      return true;
    }
  }
  mob.position = { x: original.x, y: world.getHeight(original.x, original.z) + 2.01, z: original.z };
  mob.velocity = { x: 0, y: 0, z: 0 };
  return !mobIntersectsSolid(world, mob);
}

export function moveMobWithCollision(
  world: VoxelWorld,
  mob: MobState,
  dt: number,
  desiredX: number,
  desiredZ: number,
  desiredY = 0,
): { blocked: boolean; grounded: boolean; inWater: boolean } {
  const safeDt = Math.min(0.08, Math.max(0, dt));
  resolveMobPenetration(world, mob);
  mob.jumpCooldown = Math.max(0, (mob.jumpCooldown ?? 0) - safeDt);
  const immersion = mobWaterImmersion(world, mob);
  const inWater = immersion > 0;
  const definition = MOB_DEFINITIONS[mob.kind];

  if (inWater) {
    const magnitude = Math.hypot(desiredX, desiredZ);
    if (magnitude > definition.waterSpeed && magnitude > 0) {
      desiredX = (desiredX / magnitude) * definition.waterSpeed;
      desiredZ = (desiredZ / magnitude) * definition.waterSpeed;
    }
    const waterBlend = 1 - Math.exp(-5.8 * safeDt);
    mob.velocity.x += (desiredX - mob.velocity.x) * waterBlend;
    mob.velocity.z += (desiredZ - mob.velocity.z) * waterBlend;
    const buoyancy = immersion < 0.67 ? 0.72 : 0.08;
    const targetY = Math.abs(desiredY) > 0.05 ? Math.max(-1.8, Math.min(1.8, desiredY)) : buoyancy;
    mob.velocity.y += (targetY - mob.velocity.y) * (1 - Math.exp(-4.8 * safeDt));
    const drag = Math.exp(-0.85 * safeDt);
    mob.velocity.x *= drag;
    mob.velocity.z *= drag;
  } else {
    const blend = 1 - Math.exp(-7 * safeDt);
    mob.velocity.x += (desiredX - mob.velocity.x) * blend;
    mob.velocity.z += (desiredZ - mob.velocity.z) * blend;
    mob.velocity.y = Math.max(-18, mob.velocity.y - 19 * safeDt);
  }

  const start = { ...mob.position };
  const hitX = moveAxis(world, mob, "x", mob.velocity.x * safeDt);
  const hitZ = moveAxis(world, mob, "z", mob.velocity.z * safeDt);
  const blocked = hitX || hitZ;

  if (!inWater && blocked && grounded(world, { ...mob, position: start }) && (mob.jumpCooldown ?? 0) <= 0) {
    mob.velocity.y = Math.max(mob.velocity.y, mob.kind === "wayfarer" ? 6.35 : 6.55);
    mob.jumpCooldown = 0.72;
  } else if (inWater && blocked && immersion <= 2 / 3) {
    mob.velocity.y = Math.max(mob.velocity.y, 2.2);
  }

  const falling = mob.velocity.y <= 0;
  const hitY = moveAxis(world, mob, "y", mob.velocity.y * safeDt);
  const onGround = hitY && falling;
  if (onGround) mob.velocity.y = 0;
  return { blocked, grounded: onGround || (!inWater && grounded(world, mob)), inWater };
}
