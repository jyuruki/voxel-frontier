import type { InputFrame } from "./types";

export const TOUCH_MINE_HOLD_MS = 360;
export const TOUCH_MINE_DRAG_THRESHOLD = 12;

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizedScreenPoint {
  x: number;
  y: number;
}

export function screenPointToNdc(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
): NormalizedScreenPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
  return {
    x: (localX / rect.width) * 2 - 1,
    y: 1 - (localY / rect.height) * 2,
  };
}

export function touchMovedBeyondHoldSlop(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = TOUCH_MINE_DRAG_THRESHOLD,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > threshold;
}

export function releaseTransientInput(input: InputFrame, preserveToggleSprint = false): void {
  input.forward = 0;
  input.strafe = 0;
  input.lookX = 0;
  input.lookY = 0;
  input.jump = false;
  input.crouch = false;
  input.mine = false;
  input.place = false;
  input.interact = false;
  if (!preserveToggleSprint) input.sprint = false;
}
