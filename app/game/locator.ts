import { LocatorMarker, PlayerSnapshot, Vec3Data } from "./types";

const LOCATOR_HALF_ARC = Math.PI / 3;

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function compassHeading(yaw: number): string {
  // Engine yaw increases toward west; compass bearings increase eastward.
  const degrees = (((-yaw) * 180 / Math.PI) % 360 + 360) % 360;
  const headings = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return headings[Math.round(degrees / 45) % headings.length];
}

export function buildLocatorMarkers(
  origin: Vec3Data,
  yaw: number,
  players: Iterable<PlayerSnapshot>,
): LocatorMarker[] {
  const markers: LocatorMarker[] = [];
  for (const player of players) {
    if (player.crouching) continue;
    const dx = player.position.x - origin.x;
    const dz = player.position.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.01 || distance > 4096) continue;
    const targetYaw = Math.atan2(-dx, -dz);
    const relative = wrapAngle(targetYaw - yaw);
    if (Math.abs(relative) > LOCATOR_HALF_ARC) continue;
    const verticalDelta = player.position.y - origin.y;
    markers.push({
      id: player.id,
      name: player.name,
      color: player.color,
      // CSS left increases to the player's screen-right, opposite the signed
      // yaw delta used by the engine.
      offset: -relative / LOCATOR_HALF_ARC,
      distance,
      scale: distance < 24 ? 1 : distance < 72 ? 0.86 : distance < 192 ? 0.72 : 0.58,
      vertical: verticalDelta > 5 ? "above" : verticalDelta < -5 ? "below" : "level",
    });
  }
  return markers.sort((a, b) => b.distance - a.distance);
}
