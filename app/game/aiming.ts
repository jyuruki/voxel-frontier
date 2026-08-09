import { Vec3Data } from "./types";

export function lookDirection(yaw: number, pitch: number): Vec3Data {
  const safePitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  const cosPitch = Math.cos(safePitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(safePitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

export function thrownItemLaunch(position: Vec3Data, yaw: number, pitch: number): {
  position: Vec3Data;
  velocity: Vec3Data;
} {
  const forward = lookDirection(yaw, pitch);
  return {
    position: {
      x: position.x + forward.x * 0.75,
      y: position.y + 1.18 + forward.y * 0.35,
      z: position.z + forward.z * 0.75,
    },
    velocity: {
      x: forward.x * 4.4,
      y: forward.y * 4.4 + 0.48,
      z: forward.z * 4.4,
    },
  };
}
