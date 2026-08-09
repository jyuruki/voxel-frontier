import * as THREE from "three";
import { BlockId, InputFrame } from "./types";
import { WORLD_MIN_Y } from "./types";
import { VoxelWorld } from "./world";

const PLAYER_RADIUS = 0.31;
const STANDING_HEIGHT = 1.76;
const CROUCH_HEIGHT = 1.27;
const STEP_HEIGHT = 0.58;

export const SAFE_FALL_DISTANCE = 4;

/**
 * Converts a measured block fall into damage. Ordinary jumps and small combat
 * knock-ups stay below the safe distance; genuinely long falls ramp up in a
 * predictable way without the old near-instant-death multiplier.
 */
export function fallDamageForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance <= SAFE_FALL_DISTANCE) return 0;
  return Math.min(100, (distance - SAFE_FALL_DISTANCE) * 5);
}

export class PlayerPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  crouched = false;
  waterImmersion = 0;
  swimming = false;
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private verticalPeak = 0;
  private shoreAssistTimer = 0;

  constructor(position: { x: number; y: number; z: number }) {
    this.position.set(position.x, position.y, position.z);
    this.verticalPeak = position.y;
  }

  /** Move the player without carrying fall history across realms or respawns. */
  teleport(
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ): void {
    this.position.set(position.x, position.y, position.z);
    this.velocity.set(velocity.x, velocity.y, velocity.z);
    this.verticalPeak = position.y;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBuffer = 0;
    this.shoreAssistTimer = 0;
    this.waterImmersion = 0;
    this.swimming = false;
  }

  get eyeHeight(): number {
    return this.crouched ? 1.12 : 1.62;
  }

  get height(): number {
    return this.crouched ? CROUCH_HEIGHT : STANDING_HEIGHT;
  }

  private collidesAt(world: VoxelWorld, position: THREE.Vector3, height = this.height): boolean {
    const minX = Math.floor(position.x - PLAYER_RADIUS + 0.001);
    const maxX = Math.floor(position.x + PLAYER_RADIUS - 0.001);
    const minY = Math.floor(position.y + 0.001);
    const maxY = Math.floor(position.y + height - 0.001);
    const minZ = Math.floor(position.z - PLAYER_RADIUS + 0.001);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS - 0.001);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const collisionHeight = world.getCollisionHeight(x, y, z);
          if (
            collisionHeight > 0 &&
            position.y < y + collisionHeight - 0.001 &&
            position.y + height > y + 0.001
          ) return true;
        }
      }
    }
    return false;
  }

  occupiesBlock(x: number, y: number, z: number): boolean {
    return (
      x + 1 > this.position.x - PLAYER_RADIUS &&
      x < this.position.x + PLAYER_RADIUS &&
      y + 1 > this.position.y &&
      y < this.position.y + this.height &&
      z + 1 > this.position.z - PLAYER_RADIUS &&
      z < this.position.z + PLAYER_RADIUS
    );
  }

  private moveAxis(world: VoxelWorld, axis: "x" | "y" | "z", amount: number): boolean {
    if (Math.abs(amount) < 1e-7) return false;
    const original = this.position[axis];
    this.position[axis] += amount;
    if (!this.collidesAt(world, this.position)) return false;
    let safe = 0;
    let blocked = 1;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const midpoint = (safe + blocked) / 2;
      this.position[axis] = original + amount * midpoint;
      if (this.collidesAt(world, this.position)) blocked = midpoint;
      else safe = midpoint;
    }
    this.position[axis] = original + amount * safe;
    this.velocity[axis] = 0;
    return true;
  }

  private hasFootSupport(world: VoxelWorld): boolean {
    const probe = this.position.clone();
    probe.y -= 0.075;
    return this.collidesAt(world, probe);
  }

  private horizontalStep(world: VoxelWorld, dx: number, dz: number, shoreAssist = false): boolean {
    const start = this.position.clone();
    const hitX = this.moveAxis(world, "x", dx);
    const hitZ = this.moveAxis(world, "z", dz);
    if (this.crouched && this.grounded && !shoreAssist && !this.hasFootSupport(world)) {
      this.position.x = start.x;
      this.position.z = start.z;
      this.velocity.x = 0;
      this.velocity.z = 0;
      return true;
    }
    if (!(hitX || hitZ)) return false;
    if (!this.grounded && !shoreAssist) return true;

    const flatResult = this.position.clone();
    this.position.copy(start);
    const raised = this.position.clone();
    const stepHeight = this.grounded ? STEP_HEIGHT : 0.46;
    raised.y += stepHeight;
    if (this.collidesAt(world, raised)) {
      this.position.copy(flatResult);
      return true;
    }
    this.position.copy(raised);
    const stepHitX = this.moveAxis(world, "x", dx);
    const stepHitZ = this.moveAxis(world, "z", dz);
    if (stepHitX || stepHitZ) {
      this.position.copy(flatResult);
      return true;
    }
    this.moveAxis(world, "y", -stepHeight - 0.04);
    if (this.crouched && this.grounded && !shoreAssist && !this.hasFootSupport(world)) {
      this.position.copy(start);
      this.velocity.x = 0;
      this.velocity.z = 0;
      return true;
    }
    return false;
  }

  private sampleWater(world: VoxelWorld): number {
    const samples = [0.14, Math.min(this.height - 0.1, 0.86), Math.min(this.height - 0.06, 1.56)];
    let wet = 0;
    for (const height of samples) {
      if (world.getBlock(this.position.x, this.position.y + height, this.position.z) === BlockId.Water) wet += 1;
    }
    return wet / samples.length;
  }

  update(
    dt: number,
    input: InputFrame,
    world: VoxelWorld,
    onLand?: (fallDistance: number) => void,
    autoJump = false,
    flying = false,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    this.waterImmersion = this.sampleWater(world);
    const inWater = this.waterImmersion > 0;
    this.shoreAssistTimer = Math.max(0, this.shoreAssistTimer - safeDt);
    const onLadder = world.getBlock(
      this.position.x,
      this.position.y + Math.min(0.82, this.height * 0.55),
      this.position.z,
    ) === BlockId.RopeLadder;
    this.swimming = this.waterImmersion >= 2 / 3;
    const nearSurface = inWater && this.waterImmersion <= 2 / 3;

    if (input.jump && !inWater) this.jumpBuffer = 0.12;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - safeDt);
    if (this.grounded) this.coyoteTimer = 0.12;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - safeDt);

    const wantsCrouch = input.crouch;
    if (!wantsCrouch && this.crouched) {
      const standing = this.position.clone();
      if (!this.collidesAt(world, standing, STANDING_HEIGHT)) this.crouched = false;
    } else if (wantsCrouch) this.crouched = true;

    const horizontalForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const sprinting = input.sprint && !this.crouched && input.forward > 0.2;

    if (flying) {
      const wish = horizontalForward.multiplyScalar(input.forward).add(right.multiplyScalar(input.strafe));
      if (wish.lengthSq() > 1) wish.normalize();
      const speed = input.sprint ? 13.5 : 8.5;
      const control = 1 - Math.exp(-12 * safeDt);
      const verticalControl = 1 - Math.exp(-18 * safeDt);
      this.velocity.x += (wish.x * speed - this.velocity.x) * control;
      this.velocity.z += (wish.z * speed - this.velocity.z) * control;
      const vertical = (input.jump ? 1 : 0) - (input.crouch ? 1 : 0);
      this.velocity.y += (vertical * speed - this.velocity.y) * verticalControl;
      this.grounded = false;
      this.swimming = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.verticalPeak = this.position.y;
    } else if (inWater) {
      const cosPitch = Math.cos(this.pitch);
      const swimForward = this.swimming
        ? new THREE.Vector3(
            -Math.sin(this.yaw) * cosPitch,
            Math.sin(this.pitch),
            -Math.cos(this.yaw) * cosPitch,
          )
        : horizontalForward;
      const wish = swimForward.multiplyScalar(input.forward).add(right.multiplyScalar(input.strafe));
      if (input.jump) wish.y += 1;
      if (input.crouch) wish.y -= 1;
      if (wish.lengthSq() > 1) wish.normalize();

      const maxSpeed = sprinting ? 3.25 : 2.35;
      const control = 1 - Math.exp(-7.5 * safeDt);
      this.velocity.x += (wish.x * maxSpeed - this.velocity.x) * control;
      this.velocity.z += (wish.z * maxSpeed - this.velocity.z) * control;

      const hasVerticalIntent = Math.abs(wish.y) > 0.05;
      const movingInWater = Math.abs(input.forward) + Math.abs(input.strafe) > 0.08;
      const movingTowardShore = nearSurface && movingInWater;
      const idleVertical = nearSurface ? (movingTowardShore ? 1.05 : 0.78) : movingInWater ? 0.72 : -0.12;
      const desiredY = hasVerticalIntent ? wish.y * (sprinting ? 3.05 : 2.35) : idleVertical;
      const verticalControl = 1 - Math.exp(-5.2 * safeDt);
      this.velocity.y += (desiredY - this.velocity.y) * verticalControl;

      if (wish.lengthSq() < 0.001) {
        const drag = Math.exp(-2.8 * safeDt);
        this.velocity.x *= drag;
        this.velocity.z *= drag;
      }
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.verticalPeak = this.position.y;
      if (movingTowardShore) this.shoreAssistTimer = 0.28;
    } else if (onLadder) {
      const wish = horizontalForward.multiplyScalar(input.forward).add(right.multiplyScalar(input.strafe));
      if (wish.lengthSq() > 1) wish.normalize();
      const ladderBlend = 1 - Math.exp(-9 * safeDt);
      this.velocity.x += (wish.x * 1.8 - this.velocity.x) * ladderBlend;
      this.velocity.z += (wish.z * 1.8 - this.velocity.z) * ladderBlend;
      const climb = input.jump ? 2.7 : input.crouch ? -2.2 : input.forward > 0.1 ? 1.9 : -0.22;
      this.velocity.y += (climb - this.velocity.y) * (1 - Math.exp(-10 * safeDt));
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.verticalPeak = this.position.y;
    } else {
      const wish = horizontalForward.multiplyScalar(input.forward).add(right.multiplyScalar(input.strafe));
      if (wish.lengthSq() > 1) wish.normalize();
      const maxSpeed = this.crouched ? 2.1 : sprinting ? 6.25 : 4.35;
      const acceleration = this.grounded ? 34 : 10;
      const blend = 1 - Math.exp(-acceleration * safeDt);
      this.velocity.x += (wish.x * maxSpeed - this.velocity.x) * blend;
      this.velocity.z += (wish.z * maxSpeed - this.velocity.z) * blend;

      if (wish.lengthSq() < 0.001 && this.grounded) {
        const friction = Math.exp(-18 * safeDt);
        this.velocity.x *= friction;
        this.velocity.z *= friction;
      }
      if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
        this.velocity.y = 7.2;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBuffer = 0;
      }
      if (this.shoreAssistTimer > 0 && input.forward > 0.05) {
        this.velocity.y = Math.max(this.velocity.y, 0.72);
        this.velocity.y += -7 * safeDt;
      } else this.velocity.y += -22 * safeDt;
    }

    const horizontalWish = Math.abs(input.forward) + Math.abs(input.strafe);
    const horizontalLength = Math.hypot(this.velocity.x, this.velocity.z) * safeDt;
    const substeps = Math.max(1, Math.ceil(horizontalLength / 0.22));
    let blockedHorizontally = false;
    for (let step = 0; step < substeps; step += 1) {
      blockedHorizontally = this.horizontalStep(
        world,
        (this.velocity.x * safeDt) / substeps,
        (this.velocity.z * safeDt) / substeps,
        this.shoreAssistTimer > 0 && horizontalWish > 0.05,
      ) || blockedHorizontally;
    }

    if (inWater && nearSurface && blockedHorizontally && horizontalWish > 0.05) {
      this.shoreAssistTimer = 0.34;
      this.velocity.y = Math.max(this.velocity.y, input.jump ? 3.9 : 2.15);
    }

    if (autoJump && !flying && !inWater && !onLadder && blockedHorizontally && this.grounded && horizontalWish > 0.05) {
      const raised = this.position.clone();
      raised.y += 1.02;
      if (!this.collidesAt(world, raised)) {
        this.velocity.y = 7.2;
        this.grounded = false;
        this.coyoteTimer = 0;
      }
    }

    const wasGrounded = this.grounded;
    const wasDescending = this.velocity.y <= 0;
    const hitY = this.moveAxis(world, "y", this.velocity.y * safeDt);
    this.grounded = hitY && wasDescending;
    if (!flying && !this.grounded && !inWater && !onLadder) this.verticalPeak = Math.max(this.verticalPeak, this.position.y);
    if (!flying && !inWater && !onLadder && !wasGrounded && this.grounded) {
      const fallDistance = Math.max(0, this.verticalPeak - this.position.y);
      if (fallDistance > 3.4) onLand?.(fallDistance);
      this.verticalPeak = this.position.y;
    }

    if (this.position.y < WORLD_MIN_Y - 16) {
      const spawn = world.findSpawn();
      this.teleport(spawn);
    }
  }
}
