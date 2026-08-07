import * as THREE from "three";
import { BLOCKS, tileUv } from "./blocks";
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT } from "./types";
import { VoxelWorld } from "./world";

interface GeometryBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
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

function emptyBuffers(): GeometryBuffers {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function toGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
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
  if (BLOCKS[id].liquid) return liquid;
  if (!BLOCKS[id].opaque) return translucent;
  return solid;
}

function shouldRenderFace(id: BlockId, neighbor: BlockId): boolean {
  if (neighbor === BlockId.Air) return true;
  if (id === BlockId.Water) return neighbor !== BlockId.Water && !BLOCKS[neighbor].opaque;
  if (!BLOCKS[id].opaque) return id !== neighbor && !BLOCKS[neighbor].opaque;
  return !BLOCKS[neighbor].opaque;
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

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const id = world.getBlock(x, y, z);
        if (id === BlockId.Air) continue;
        const uv = tileUv(id);
        const buffers = targetBuffers(id, solid, translucent, liquid);

        for (const face of FACES) {
          const neighbor = world.getBlock(
            x + face.normal[0],
            y + face.normal[1],
            z + face.normal[2],
          );
          if (!shouldRenderFace(id, neighbor)) continue;
          const baseIndex = buffers.positions.length / 3;
          for (const corner of face.corners) {
            const waterOffset = id === BlockId.Water && corner[1] === 1 ? -0.12 : 0;
            buffers.positions.push(lx + corner[0], y + corner[1] + waterOffset, lz + corner[2]);
            buffers.normals.push(...face.normal);
          }
          buffers.uvs.push(
            uv.u0, uv.v0,
            uv.u1, uv.v0,
            uv.u1, uv.v1,
            uv.u0, uv.v1,
          );
          buffers.indices.push(
            baseIndex,
            baseIndex + 1,
            baseIndex + 2,
            baseIndex,
            baseIndex + 2,
            baseIndex + 3,
          );
        }
      }
    }
  }

  return {
    solid: toGeometry(solid),
    translucent: toGeometry(translucent),
    liquid: toGeometry(liquid),
  };
}

