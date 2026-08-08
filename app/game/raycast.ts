import * as THREE from "three";
import { BLOCKS } from "./blocks";
import { BlockId, RayHit } from "./types";
import { VoxelWorld } from "./world";

export function voxelRaycast(
  world: VoxelWorld,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance = 6,
  includeLiquids = false,
): RayHit | null {
  const dir = direction.clone().normalize();
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;
  const deltaX = dir.x === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.x);
  const deltaY = dir.y === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.y);
  const deltaZ = dir.z === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.z);
  let maxX = dir.x === 0 ? Number.POSITIVE_INFINITY : ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * deltaX);
  let maxY = dir.y === 0 ? Number.POSITIVE_INFINITY : ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * deltaY);
  let maxZ = dir.z === 0 ? Number.POSITIVE_INFINITY : ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * deltaZ);
  let distance = 0;
  let normal = { x: 0, y: 0, z: 0 };
  let previous = { x, y, z };

  while (distance <= maxDistance) {
    const id = world.getBlock(x, y, z);
    const originLiquid = includeLiquids && distance === 0 && BLOCKS[id].liquid;
    if (id !== BlockId.Air && !originLiquid && (includeLiquids || !BLOCKS[id].liquid)) {
      return {
        block: { x, y, z },
        adjacent: previous,
        normal,
        id,
        distance,
      };
    }
    previous = { x, y, z };
    if (maxX < maxY && maxX < maxZ) {
      x += stepX;
      distance = maxX;
      maxX += deltaX;
      normal = { x: -stepX, y: 0, z: 0 };
    } else if (maxY < maxZ) {
      y += stepY;
      distance = maxY;
      maxY += deltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      distance = maxZ;
      maxZ += deltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
  }
  return null;
}
