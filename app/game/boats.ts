import { BlockId, BoatState, Vec3Data } from "./types";
import { VoxelWorld } from "./world";

export interface BoatInput {
  forward: number;
  turn: number;
}

const BOAT_RADIUS = 0.72;
const BOAT_HALF_HEIGHT = 0.34;

function waterSurfaceNear(world: VoxelWorld, position: Vec3Data): number | null {
  let best: number | null = null;
  for (const dx of [-0.48, 0, 0.48]) {
    for (const dz of [-0.48, 0, 0.48]) {
      for (let dy = 1; dy >= -2; dy -= 1) {
        const y = Math.floor(position.y + dy);
        if (world.peekBlock(position.x + dx, y, position.z + dz) === BlockId.Water) {
          best = Math.max(best ?? -Infinity, y + 0.74);
          break;
        }
      }
    }
  }
  return best;
}

export function canPlaceBoat(world: VoxelWorld, position: Vec3Data): boolean {
  const waterY = Math.floor(position.y);
  if (world.peekBlock(position.x, waterY, position.z) !== BlockId.Water) return false;
  return world.getCollisionHeight(position.x, waterY + 1, position.z) <= 0;
}

export function boatIntersectsSolid(world: VoxelWorld, position: Vec3Data): boolean {
  const minX = Math.floor(position.x - BOAT_RADIUS);
  const maxX = Math.floor(position.x + BOAT_RADIUS);
  const minY = Math.floor(position.y - BOAT_HALF_HEIGHT);
  const maxY = Math.floor(position.y + BOAT_HALF_HEIGHT);
  const minZ = Math.floor(position.z - BOAT_RADIUS);
  const maxZ = Math.floor(position.z + BOAT_RADIUS);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const collision = world.getCollisionHeight(x, y, z);
        if (collision <= 0) continue;
        if (
          position.x + BOAT_RADIUS > x + 0.02
          && position.x - BOAT_RADIUS < x + 0.98
          && position.z + BOAT_RADIUS > z + 0.02
          && position.z - BOAT_RADIUS < z + 0.98
          && position.y + BOAT_HALF_HEIGHT > y
          && position.y - BOAT_HALF_HEIGHT < y + collision
        ) return true;
      }
    }
  }
  return false;
}

function moveBoatAxis(world: VoxelWorld, boat: BoatState, axis: "x" | "z", amount: number): boolean {
  if (Math.abs(amount) < 1e-7) return false;
  const original = boat.position[axis];
  boat.position[axis] += amount;
  if (!boatIntersectsSolid(world, boat.position)) return false;
  let safe = 0;
  let blocked = 1;
  for (let iteration = 0; iteration < 9; iteration += 1) {
    const midpoint = (safe + blocked) / 2;
    boat.position[axis] = original + amount * midpoint;
    if (boatIntersectsSolid(world, boat.position)) blocked = midpoint;
    else safe = midpoint;
  }
  boat.position[axis] = original + amount * safe;
  boat.velocity[axis] *= -0.12;
  return true;
}

function moveBoatVertical(world: VoxelWorld, boat: BoatState, amount: number): boolean {
  if (Math.abs(amount) < 1e-7) return false;
  const original = boat.position.y;
  boat.position.y += amount;
  if (!boatIntersectsSolid(world, boat.position)) return false;
  let safe = 0;
  let blocked = 1;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const midpoint = (safe + blocked) / 2;
    boat.position.y = original + amount * midpoint;
    if (boatIntersectsSolid(world, boat.position)) blocked = midpoint;
    else safe = midpoint;
  }
  boat.position.y = original + amount * safe;
  boat.velocity.y = 0;
  return true;
}

export function updateBoatPhysics(
  world: VoxelWorld,
  boat: BoatState,
  input: BoatInput,
  dt: number,
): { inWater: boolean; collided: boolean } {
  const safeDt = Math.min(0.05, Math.max(0, dt));
  const surface = waterSurfaceNear(world, boat.position);
  const inWater = surface !== null;
  const forwardInput = Math.max(-1, Math.min(1, input.forward));
  const turnInput = Math.max(-1, Math.min(1, input.turn));
  const speed = Math.hypot(boat.velocity.x, boat.velocity.z);
  const steering = inWater ? 2.2 : 0.7;
  const steeringAuthority = 0.32 + Math.min(1, speed / 2.4) * 0.68;
  boat.angularVelocity += turnInput * steering * steeringAuthority * safeDt;
  boat.angularVelocity *= Math.exp(-(inWater ? 4.2 : 8.5) * safeDt);
  boat.yaw += boat.angularVelocity;

  const forwardX = -Math.sin(boat.yaw);
  const forwardZ = -Math.cos(boat.yaw);
  const thrust = inWater ? (forwardInput >= 0 ? 11 : 5.5) : 2.2;
  boat.velocity.x += forwardX * forwardInput * thrust * safeDt;
  boat.velocity.z += forwardZ * forwardInput * thrust * safeDt;
  const drag = Math.exp(-(inWater ? (forwardInput ? 1.15 : 2.15) : 5.5) * safeDt);
  boat.velocity.x *= drag;
  boat.velocity.z *= drag;
  const maxSpeed = inWater ? 7.4 : 2.1;
  const horizontalSpeed = Math.hypot(boat.velocity.x, boat.velocity.z);
  if (horizontalSpeed > maxSpeed) {
    boat.velocity.x = (boat.velocity.x / horizontalSpeed) * maxSpeed;
    boat.velocity.z = (boat.velocity.z / horizontalSpeed) * maxSpeed;
  }

  if (surface !== null) {
    const error = surface - boat.position.y;
    boat.velocity.y += error * 18 * safeDt;
    boat.velocity.y *= Math.exp(-5.5 * safeDt);
  } else {
    boat.velocity.y = Math.max(-10, boat.velocity.y - 12 * safeDt);
  }
  const hitY = moveBoatVertical(world, boat, boat.velocity.y * safeDt);
  const hitX = moveBoatAxis(world, boat, "x", boat.velocity.x * safeDt);
  const hitZ = moveBoatAxis(world, boat, "z", boat.velocity.z * safeDt);
  return { inWater, collided: hitX || hitY || hitZ };
}

export function safeBoatDismount(world: VoxelWorld, boat: BoatState): Vec3Data {
  const rightX = Math.cos(boat.yaw);
  const rightZ = -Math.sin(boat.yaw);
  for (const side of [1, -1]) {
    const x = boat.position.x + rightX * side * 1.35;
    const z = boat.position.z + rightZ * side * 1.35;
    const y = Math.max(boat.position.y, world.getHeight(x, z) + 1.01);
    if (world.getCollisionHeight(x, Math.floor(y), z) <= 0) return { x, y, z };
  }
  return { x: boat.position.x, y: boat.position.y + 1.25, z: boat.position.z };
}
