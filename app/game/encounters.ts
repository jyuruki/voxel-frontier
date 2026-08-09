import { BLOCKS } from "./blocks";
import { MOB_DEFINITIONS } from "./mobs";
import { MobState, PlayerSnapshot, Vec3Data } from "./types";
import { realmForPosition } from "./realms";
import { VoxelWorld } from "./world";

const PLAYER_HEIGHT = 1.76;
const PLAYER_RADIUS = 0.31;

export function clearCombatLine(world: VoxelWorld, from: Vec3Data, to: Vec3Data): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.18));
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    const id = world.peekBlock(from.x + dx * ratio, from.y + dy * ratio, from.z + dz * ratio);
    if (BLOCKS[id].solid || BLOCKS[id].opaque) return false;
  }
  return true;
}

/** Maps a world-space source onto the HUD, where zero points to screen-top. */
export function damageIndicatorAngle(player: Vec3Data, yaw: number, source: Vec3Data): number {
  const bearing = Math.atan2(source.x - player.x, -(source.z - player.z));
  const relative = bearing + yaw;
  return Math.atan2(Math.sin(relative), Math.cos(relative));
}

export function mobCanMeleeHit(
  world: VoxelWorld,
  mob: MobState,
  player: Pick<PlayerSnapshot, "position" | "realm">,
): boolean {
  const definition = MOB_DEFINITIONS[mob.kind];
  const mobRealm = realmForPosition(mob.position);
  const playerRealm = player.realm ?? realmForPosition(player.position);
  if (mobRealm !== playerRealm || definition.passive || definition.reach <= 0) return false;

  const horizontal = Math.hypot(
    player.position.x - mob.position.x,
    player.position.z - mob.position.z,
  );
  const verticalOverlap = mob.position.y < player.position.y + PLAYER_HEIGHT
    && mob.position.y + definition.height > player.position.y;
  if (!verticalOverlap || horizontal > definition.reach + definition.radius + PLAYER_RADIUS) return false;

  const mobCenter = {
    x: mob.position.x,
    y: mob.position.y + definition.height * 0.58,
    z: mob.position.z,
  };
  const playerCenter = {
    x: player.position.x,
    y: player.position.y + PLAYER_HEIGHT * 0.52,
    z: player.position.z,
  };
  const centerDistance = Math.hypot(
    playerCenter.x - mobCenter.x,
    playerCenter.y - mobCenter.y,
    playerCenter.z - mobCenter.z,
  );
  return centerDistance <= definition.reach + definition.radius + 0.42
    && clearCombatLine(world, mobCenter, playerCenter);
}

export function mobCanShootPlayer(
  world: VoxelWorld,
  mob: MobState,
  player: Pick<PlayerSnapshot, "position" | "realm">,
  minimum = 4.5,
  maximum = 17,
): boolean {
  const mobRealm = realmForPosition(mob.position);
  const playerRealm = player.realm ?? realmForPosition(player.position);
  if (mobRealm !== playerRealm) return false;
  const from = { x: mob.position.x, y: mob.position.y + 1.28, z: mob.position.z };
  const to = { x: player.position.x, y: player.position.y + 1.05, z: player.position.z };
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return distance >= minimum && distance <= maximum && clearCombatLine(world, from, to);
}
