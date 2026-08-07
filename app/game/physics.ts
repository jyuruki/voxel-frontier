import * as THREE from "three";
import { BlockId, InputFrame } from "./types";
import { VoxelWorld } from "./world";

const PLAYER_RADIUS = 0.31;
const STANDING_HEIGHT = 1.76;
const CROUCH_HEIGHT = 1.27;
const STEP_HEIGHT = 0.58;

export class PlayerPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  crouched = false;
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private verticalPeak = 0;

  constructor(position: { x: number; y: number; z: number }) {
    this.position.set(position.x, position.y, position.z);
    this.verticalPeak = position.y;
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
    const minY = Math.floor(position.y + 0.01);
    const maxY = Math.floor(position.y + height - 0.01);
    const minZ = Math.floor(position.z - PLAYER_RADIUS + 0.001);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS - 0.001);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (world.isSolid(x, y, z)) return true;
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

  private horizontalStep(
    world: VoxelWorld,
    dx: number,
    dz: number,
  ): boolean {
    const start = this.position.clone();
    const hitX = this.moveAxis(world, "x", dx);
    const hitZ = this.moveAxis(world, "z", dz);
    if (!(hitX || hitZ)) return false;
    if (!this.grounded) return true;

    const flatResult = this.position.clone();
    this.position.copy(start);
    const raised = this.position.clone();
    raised.y += STEP_HEIGHT;
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
    this.moveAxis(world, "y", -STEP_HEIGHT - 0.04);
    return false;
  }

  update(
    dt: number,
    input: InputFrame,
    world: VoxelWorld,
    onLand?: (fallDistance: number) => void,
    autoJump = false,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    const inWater = world.getBlock(
      this.position.x,
      this.position.y + this.eyeHeight * 0.65,
      this.position.z,
    ) === BlockId.Water;

    if (input.jump) this.jumpBuffer = 0.12;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - safeDt);
    if (this.grounded) this.coyoteTimer = 0.12;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - safeDt);

    const wantsCrouch = input.crouch;
    if (!wantsCrouch && this.crouched) {
      const standing = this.position.clone();
      if (!this.collidesAt(world, standing, STANDING_HEIGHT)) this.crouched = false;
    } else if (wantsCrouch) this.crouched = true;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = forward.multiplyScalar(input.forward).add(right.multiplyScalar(input.strafe));
    if (wish.lengthSq() > 1) wish.normalize();

    const sprinting = input.sprint && !this.crouched && input.forward > 0.2;
    const maxSpeed = inWater ? 2.7 : this.crouched ? 2.1 : sprinting ? 6.25 : 4.35;
    const acceleration = this.grounded ? 34 : inWater ? 16 : 10;
    const desiredX = wish.x * maxSpeed;
    const desiredZ = wish.z * maxSpeed;
    const blend = 1 - Math.exp(-acceleration * safeDt);
    this.velocity.x += (desiredX - this.velocity.x) * blend;
    this.velocity.z += (desiredZ - this.velocity.z) * blend;

    if (wish.lengthSq() < 0.001 && this.grounded) {
      const friction = Math.exp(-18 * safeDt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
    }

    if (this.jumpBuffer > 0 && (this.coyoteTimer > 0 || inWater)) {
      this.velocity.y = inWater ? 4.2 : 7.2;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
    }

    this.velocity.y += (inWater ? -5.5 : -22) * safeDt;
    if (inWater) {
      this.velocity.multiplyScalar(1 - Math.min(0.55, safeDt * 2.3));
      if (input.jump) this.velocity.y += 11 * safeDt;
    }

    const horizontalLength = Math.hypot(this.velocity.x, this.velocity.z) * safeDt;
    const substeps = Math.max(1, Math.ceil(horizontalLength / 0.22));
    let blockedHorizontally = false;
    for (let step = 0; step < substeps; step += 1) {
      blockedHorizontally = this.horizontalStep(
        world,
        (this.velocity.x * safeDt) / substeps,
        (this.velocity.z * safeDt) / substeps,
      ) || blockedHorizontally;
    }
    if (autoJump && blockedHorizontally && this.grounded && wish.lengthSq() > 0.05) {
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
    if (!this.grounded) this.verticalPeak = Math.max(this.verticalPeak, this.position.y);
    if (!wasGrounded && this.grounded) {
      const fallDistance = Math.max(0, this.verticalPeak - this.position.y);
      if (fallDistance > 3.4) onLand?.(fallDistance);
      this.verticalPeak = this.position.y;
    }

    if (this.position.y < -8) {
      const spawn = world.findSpawn();
      this.position.set(spawn.x, spawn.y, spawn.z);
      this.velocity.set(0, 0, 0);
      this.verticalPeak = spawn.y;
    }
  }
}
