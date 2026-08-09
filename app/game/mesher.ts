import * as THREE from "three";
import { BLOCKS, tileUv } from "./blocks";
import { worldKey } from "./prng";
import { BlockId, CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from "./types";
import { VoxelWorld } from "./world";

interface GeometryBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export interface ChunkGeometries {
  solid: THREE.BufferGeometry;
  translucent: THREE.BufferGeometry;
  liquid: THREE.BufferGeometry;
}

const FACES = [
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
] as const;

type Point = [number, number, number];

function emptyBuffers(): GeometryBuffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function toGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function targetBuffers(
  id: BlockId,
  solid: GeometryBuffers,
  translucent: GeometryBuffers,
  liquid: GeometryBuffers,
): GeometryBuffers {
  const layer = blockRenderLayer(id);
  if (layer === "liquid") return liquid;
  // Leaves use alpha-tested cutouts in the depth-writing solid pass. Sending
  // them through the blended pass made water behind a tree tint the canopy.
  if (layer === "solid") return solid;
  if (layer === "translucent") return translucent;
  return solid;
}

export function blockRenderLayer(id: BlockId): "solid" | "translucent" | "liquid" {
  if (BLOCKS[id].liquid) return "liquid";
  if ([BlockId.Glass, BlockId.GlassPane, BlockId.AshGlass, BlockId.Ice, BlockId.RiftGate, BlockId.DungeonGate, BlockId.DungeonReturn].includes(id)) return "translucent";
  // Plants, doors, fences, leaves, and logic parts are alpha-tested cutouts.
  // Keeping them in the depth-writing pass prevents foliage from drawing over
  // the first-person hand and held blocks.
  return "solid";
}

function faceBrightness(normal: Point): number {
  if (normal[1] > 0) return 1;
  if (normal[1] < 0) return 0.66;
  if (normal[0] !== 0) return normal[0] > 0 ? 0.86 : 0.78;
  return normal[2] > 0 ? 0.93 : 0.82;
}

function pushVertexColors(buffers: GeometryBuffers, vertices: [Point, Point, Point, Point], normal: Point): void {
  const base = faceBrightness(normal);
  for (const [index] of vertices.entries()) {
    const gradient = normal[1] === 0 ? (index >= 2 ? 0.045 : -0.025) : 0;
    const light = Math.max(0.55, Math.min(1, base + gradient));
    buffers.colors.push(light, light, light);
  }
}

function shouldRenderFace(id: BlockId, neighbor: BlockId): boolean {
  if (neighbor === BlockId.Air) return true;
  if (BLOCKS[id].liquid) return id !== neighbor && !BLOCKS[neighbor].opaque;
  if (!BLOCKS[id].opaque) return id !== neighbor && !BLOCKS[neighbor].opaque;
  return !BLOCKS[neighbor].opaque || BLOCKS[neighbor].shape !== "cube";
}

function pushQuad(
  buffers: GeometryBuffers,
  vertices: [Point, Point, Point, Point],
  normal: Point,
  id: BlockId,
): void {
  const baseIndex = buffers.positions.length / 3;
  const uv = tileUv(id);
  for (const vertex of vertices) {
    buffers.positions.push(...vertex);
    buffers.normals.push(...normal);
  }
  pushVertexColors(buffers, vertices, normal);
  buffers.uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
  buffers.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
}

function addCuboid(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  min: Point,
  max: Point,
): void {
  for (const face of FACES) {
    const vertices = face.corners.map((corner) => [
      lx + min[0] + corner[0] * (max[0] - min[0]),
      y + min[1] + corner[1] * (max[1] - min[1]),
      lz + min[2] + corner[2] * (max[2] - min[2]),
    ] as Point) as unknown as [Point, Point, Point, Point];
    pushQuad(buffers, vertices, [...face.normal] as Point, id);
  }
}

function rotateXZ(x: number, z: number, orientation: number): [number, number] {
  if (orientation === 1) return [1 - z, x];
  if (orientation === 2) return [1 - x, 1 - z];
  if (orientation === 3) return [z, 1 - x];
  return [x, z];
}

function addOrientedCuboid(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  min: Point,
  max: Point,
  orientation: number,
): void {
  const corners = [
    rotateXZ(min[0], min[2], orientation),
    rotateXZ(min[0], max[2], orientation),
    rotateXZ(max[0], min[2], orientation),
    rotateXZ(max[0], max[2], orientation),
  ];
  const xs = corners.map((corner) => corner[0]);
  const zs = corners.map((corner) => corner[1]);
  addCuboid(
    buffers,
    id,
    lx,
    y,
    lz,
    [Math.min(...xs), min[1], Math.min(...zs)],
    [Math.max(...xs), max[1], Math.max(...zs)],
  );
}

function addFullCube(
  world: VoxelWorld,
  buffers: GeometryBuffers,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  lx: number,
  lz: number,
): void {
  const uv = tileUv(id);
  const liquidTop = BLOCKS[id].liquid
    ? id === BlockId.Water
      ? Math.max(0.22, 0.88 - world.getWaterLevel(x, y, z) * 0.095)
      : 0.88
    : 1;
  for (const face of FACES) {
    const neighbor = world.peekBlock(
      x + face.normal[0],
      y + face.normal[1],
      z + face.normal[2],
    );
    if (!shouldRenderFace(id, neighbor)) continue;
    const baseIndex = buffers.positions.length / 3;
    for (const corner of face.corners) {
      const localY = corner[1] === 1 ? liquidTop : 0;
      buffers.positions.push(lx + corner[0], y + localY, lz + corner[2]);
      buffers.normals.push(...face.normal);
    }
    const vertices = face.corners.map((corner) => [
      lx + corner[0],
      y + (corner[1] === 1 ? liquidTop : 0),
      lz + corner[2],
    ] as Point) as unknown as [Point, Point, Point, Point];
    pushVertexColors(buffers, vertices, [...face.normal] as Point);
    buffers.uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
    buffers.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
  }
}

function addCross(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number): void {
  pushQuad(buffers, [
    [lx + 0.08, y, lz + 0.08],
    [lx + 0.92, y, lz + 0.92],
    [lx + 0.92, y + 0.96, lz + 0.92],
    [lx + 0.08, y + 0.96, lz + 0.08],
  ], [-0.707, 0, 0.707], id);
  pushQuad(buffers, [
    [lx + 0.92, y, lz + 0.08],
    [lx + 0.08, y, lz + 0.92],
    [lx + 0.08, y + 0.96, lz + 0.92],
    [lx + 0.92, y + 0.96, lz + 0.08],
  ], [0.707, 0, 0.707], id);
}

function connectsToWire(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const id = world.peekBlock(x, y, z);
  return id === BlockId.FluxWire || Boolean(BLOCKS[id].automation);
}

function addWire(
  world: VoxelWorld,
  buffers: GeometryBuffers,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  lx: number,
  lz: number,
): void {
  addCuboid(buffers, id, lx, y, lz, [0.4, 0.025, 0.4], [0.6, 0.075, 0.6]);
  const arms: Array<[boolean, Point, Point]> = [
    [connectsToWire(world, x, y, z - 1), [0.44, 0.025, 0], [0.56, 0.075, 0.5]],
    [connectsToWire(world, x + 1, y, z), [0.5, 0.025, 0.44], [1, 0.075, 0.56]],
    [connectsToWire(world, x, y, z + 1), [0.44, 0.025, 0.5], [0.56, 0.075, 1]],
    [connectsToWire(world, x - 1, y, z), [0, 0.025, 0.44], [0.5, 0.075, 0.56]],
  ];
  let connected = false;
  for (const [active, min, max] of arms) {
    if (!active) continue;
    connected = true;
    addCuboid(buffers, id, lx, y, lz, min, max);
  }
  if (!connected) {
    addCuboid(buffers, id, lx, y, lz, [0.44, 0.025, 0.2], [0.56, 0.075, 0.8]);
    addCuboid(buffers, id, lx, y, lz, [0.2, 0.025, 0.44], [0.8, 0.075, 0.56]);
  }
}

function addPlate(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
  delayTicks = 2,
): void {
  const broad = id === BlockId.PressurePlate || id === BlockId.CaveMoss;
  addCuboid(
    buffers,
    id,
    lx,
    y,
    lz,
    broad ? [0.08, 0.018, 0.08] : [0.13, 0.025, 0.12],
    broad ? [0.92, 0.055, 0.92] : [0.87, 0.12, 0.88],
  );
  if (id === BlockId.PulseRepeater || id === BlockId.DelayGate) {
    addOrientedCuboid(buffers, id, lx, y, lz, [0.43, 0.12, 0.23], [0.57, 0.38, 0.37], orientation);
    const delay = Math.max(1, Math.min(4, delayTicks));
    const sliderZ = 0.48 + (delay - 1) * 0.1;
    addOrientedCuboid(buffers, id, lx, y, lz, [0.43, 0.12, sliderZ], [0.57, 0.32, sliderZ + 0.14], orientation);
    for (let notch = 0; notch < delay; notch += 1) {
      const x0 = 0.29 + notch * 0.14;
      addOrientedCuboid(buffers, id, lx, y, lz, [x0, 0.12, 0.84], [x0 + 0.065, 0.18, 0.88], orientation);
    }
  } else if (id === BlockId.FluxComparator) {
    for (const [px, pz] of [[0.3, 0.34], [0.7, 0.34], [0.5, 0.7]]) {
      addOrientedCuboid(buffers, id, lx, y, lz, [px - 0.055, 0.12, pz - 0.055], [px + 0.055, 0.34, pz + 0.055], orientation);
    }
  } else if (id === BlockId.Toggle) {
    addOrientedCuboid(buffers, id, lx, y, lz, [0.44, 0.11, 0.28], [0.56, 0.58, 0.4], orientation);
  } else if (id === BlockId.DaylightSensor) {
    for (let strip = 0; strip < 3; strip += 1) {
      addCuboid(buffers, id, lx, y, lz, [0.2 + strip * 0.22, 0.12, 0.2], [0.32 + strip * 0.22, 0.155, 0.8]);
    }
  } else if (!broad && id !== BlockId.PulseButton) {
    addCuboid(buffers, id, lx, y, lz, [0.31, 0.12, 0.31], [0.69, 0.2, 0.69]);
  }
}

function addTorch(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number): void {
  addCuboid(buffers, id, lx, y, lz, [0.445, 0, 0.445], [0.555, 0.7, 0.555]);
  addCuboid(buffers, id, lx, y, lz, [0.34, 0.68, 0.34], [0.66, 0.94, 0.66]);
}

function addRod(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number): void {
  addCuboid(buffers, id, lx, y, lz, [0.39, 0, 0.39], [0.61, 0.78, 0.61]);
  addCuboid(buffers, id, lx, y, lz, [0.31, 0.76, 0.31], [0.69, 0.96, 0.69]);
  if (id === BlockId.DeepLantern) {
    addCuboid(buffers, id, lx, y, lz, [0.25, 0.18, 0.25], [0.32, 0.9, 0.32]);
    addCuboid(buffers, id, lx, y, lz, [0.68, 0.18, 0.68], [0.75, 0.9, 0.75]);
  }
}

function addHopper(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number, orientation: number): void {
  addCuboid(buffers, id, lx, y, lz, [0.08, 0.72, 0.08], [0.92, 0.92, 0.22]);
  addCuboid(buffers, id, lx, y, lz, [0.08, 0.72, 0.78], [0.92, 0.92, 0.92]);
  addCuboid(buffers, id, lx, y, lz, [0.08, 0.72, 0.22], [0.22, 0.92, 0.78]);
  addCuboid(buffers, id, lx, y, lz, [0.78, 0.72, 0.22], [0.92, 0.92, 0.78]);
  addCuboid(buffers, id, lx, y, lz, [0.25, 0.35, 0.25], [0.75, 0.72, 0.75]);
  addCuboid(buffers, id, lx, y, lz, [0.41, 0.18, 0.41], [0.59, 0.35, 0.59]);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.41, 0.16, 0.02], [0.59, 0.34, 0.48], orientation);
}

function addObserver(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number, orientation: number): void {
  addOrientedCuboid(buffers, id, lx, y, lz, [0.06, 0.08, 0.08], [0.94, 0.92, 0.92], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.25, 0.25, 0.015], [0.75, 0.75, 0.13], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.42, 0.38, 0.9], [0.58, 0.62, 0.995], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.46, 0.92, 0.18], [0.54, 0.975, 0.75], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.34, 0.92, 0.16], [0.66, 0.975, 0.27], orientation);
}

function addPiston(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
): void {
  addOrientedCuboid(buffers, id, lx, y, lz, [0.08, 0.08, 0.19], [0.92, 0.92, 0.95], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.03, 0.03, 0.02], [0.97, 0.97, 0.22], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.42, 0.35, 0.0], [0.58, 0.65, 0.3], orientation);
}

function addStair(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
): void {
  addCuboid(buffers, id, lx, y, lz, [0, 0, 0], [1, 0.5, 1]);
  addOrientedCuboid(buffers, id, lx, y, lz, [0, 0.5, 0.5], [1, 1, 1], orientation);
}

function addLadder(buffers: GeometryBuffers, id: BlockId, lx: number, y: number, lz: number): void {
  addCuboid(buffers, id, lx, y, lz, [0.18, 0.02, 0.88], [0.26, 0.98, 0.96]);
  addCuboid(buffers, id, lx, y, lz, [0.74, 0.02, 0.88], [0.82, 0.98, 0.96]);
  for (let rung = 0; rung < 4; rung += 1) {
    const rungY = 0.14 + rung * 0.24;
    addCuboid(buffers, id, lx, y, lz, [0.22, rungY, 0.865], [0.78, rungY + 0.07, 0.975]);
  }
}

function addBed(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
): void {
  addOrientedCuboid(buffers, id, lx, y, lz, [0.06, 0.18, 0.05], [0.94, 0.46, 0.95], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.12, 0.44, 0.65], [0.88, 0.58, 0.91], orientation);
  for (const [x, z] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
    addOrientedCuboid(buffers, id, lx, y, lz, [x - 0.045, 0, z - 0.045], [x + 0.045, 0.2, z + 0.045], orientation);
  }
}

function addPortal(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
): void {
  addOrientedCuboid(buffers, id, lx, y, lz, [0.05, 0, 0.42], [0.16, 1, 0.58], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.84, 0, 0.42], [0.95, 1, 0.58], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.16, 0.86, 0.42], [0.84, 1, 0.58], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.19, 0.08, 0.475], [0.81, 0.84, 0.525], orientation);
}

function addDoor(
  buffers: GeometryBuffers,
  id: BlockId,
  lx: number,
  y: number,
  lz: number,
  orientation: number,
): void {
  addOrientedCuboid(buffers, id, lx, y, lz, [0.06, 0, 0.44], [0.94, 1, 0.56], orientation);
  addOrientedCuboid(buffers, id, lx, y, lz, [0.72, 0.48, 0.39], [0.79, 0.56, 0.61], orientation);
}

function addFence(
  world: VoxelWorld,
  buffers: GeometryBuffers,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  lx: number,
  lz: number,
): void {
  addCuboid(buffers, id, lx, y, lz, [0.39, 0, 0.39], [0.61, 1, 0.61]);
  const connects = (neighbor: BlockId) => BLOCKS[neighbor].solid || BLOCKS[neighbor].shape === "fence";
  const arms: Array<[boolean, Point, Point]> = [
    [connects(world.getBlock(x, y, z - 1)), [0.43, 0.38, 0], [0.57, 0.82, 0.5]],
    [connects(world.getBlock(x + 1, y, z)), [0.5, 0.38, 0.43], [1, 0.82, 0.57]],
    [connects(world.getBlock(x, y, z + 1)), [0.43, 0.38, 0.5], [0.57, 0.82, 1]],
    [connects(world.getBlock(x - 1, y, z)), [0, 0.38, 0.43], [0.5, 0.82, 0.57]],
  ];
  for (const [active, min, max] of arms) if (active) addCuboid(buffers, id, lx, y, lz, min, max);
}

function addPane(
  world: VoxelWorld,
  buffers: GeometryBuffers,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  lx: number,
  lz: number,
): void {
  const connects = (neighbor: BlockId) => BLOCKS[neighbor].solid || BLOCKS[neighbor].shape === "pane";
  const north = connects(world.getBlock(x, y, z - 1));
  const east = connects(world.getBlock(x + 1, y, z));
  const south = connects(world.getBlock(x, y, z + 1));
  const west = connects(world.getBlock(x - 1, y, z));
  if (!north && !east && !south && !west) {
    addCuboid(buffers, id, lx, y, lz, [0.47, 0, 0.06], [0.53, 1, 0.94]);
    addCuboid(buffers, id, lx, y, lz, [0.06, 0, 0.47], [0.94, 1, 0.53]);
    return;
  }
  addCuboid(buffers, id, lx, y, lz, [0.47, 0, 0.47], [0.53, 1, 0.53]);
  if (north) addCuboid(buffers, id, lx, y, lz, [0.47, 0, 0], [0.53, 1, 0.5]);
  if (south) addCuboid(buffers, id, lx, y, lz, [0.47, 0, 0.5], [0.53, 1, 1]);
  if (west) addCuboid(buffers, id, lx, y, lz, [0, 0, 0.47], [0.5, 1, 0.53]);
  if (east) addCuboid(buffers, id, lx, y, lz, [0.5, 0, 0.47], [1, 1, 0.53]);
}

export function buildChunkGeometries(
  world: VoxelWorld,
  cx: number,
  cz: number,
): ChunkGeometries {
  const solid = emptyBuffers();
  const translucent = emptyBuffers();
  const liquid = emptyBuffers();
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let y = WORLD_MIN_Y; y < WORLD_MAX_Y; y += 1) {
    for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const id = world.getBlock(x, y, z);
        if (id === BlockId.Air) continue;
        const buffers = targetBuffers(id, solid, translucent, liquid);
        const definition = BLOCKS[id];
        const shape = definition.shape ?? "cube";
        const machine = world.machines.get(worldKey(x, y, z));
        const orientation = machine?.orientation ?? 0;

        if (shape === "cube") addFullCube(world, buffers, id, x, y, z, lx, lz);
        else if (shape === "cross") addCross(buffers, id, lx, y, lz);
        else if (shape === "wire") addWire(world, buffers, id, x, y, z, lx, lz);
        else if (shape === "plate") addPlate(buffers, id, lx, y, lz, orientation, machine?.delayTicks);
        else if (shape === "torch") addTorch(buffers, id, lx, y, lz);
        else if (shape === "rod") addRod(buffers, id, lx, y, lz);
        else if (shape === "hopper") addHopper(buffers, id, lx, y, lz, orientation);
        else if (shape === "observer") addObserver(buffers, id, lx, y, lz, orientation);
        else if (shape === "slab") addCuboid(buffers, id, lx, y, lz, [0, 0, 0], [1, definition.collisionHeight ?? 0.5, 1]);
        else if (shape === "stair") addStair(buffers, id, lx, y, lz, orientation);
        else if (shape === "piston") addPiston(buffers, id, lx, y, lz, orientation);
        else if (shape === "column") addCuboid(buffers, id, lx, y, lz, [0.2, 0, 0.2], [0.8, 1, 0.8]);
        else if (shape === "ladder") addLadder(buffers, id, lx, y, lz);
        else if (shape === "bed") addBed(buffers, id, lx, y, lz, orientation);
        else if (shape === "portal") addPortal(buffers, id, lx, y, lz, orientation);
        else if (shape === "door") addDoor(buffers, id, lx, y, lz, orientation);
        else if (shape === "fence") addFence(world, buffers, id, x, y, z, lx, lz);
        else if (shape === "pane") addPane(world, buffers, id, x, y, z, lx, lz);
      }
    }
  }

  return {
    solid: toGeometry(solid),
    translucent: toGeometry(translucent),
    liquid: toGeometry(liquid),
  };
}
