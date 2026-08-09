import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { AutomationSystem } from "../app/game/automation";
import { thrownItemLaunch } from "../app/game/aiming";
import { ALL_ITEMS, BLOCKS, RECIPES, isLeafBlock, itemForBlock, matchingRecipeInputs } from "../app/game/blocks";
import { boatIntersectsSolid, canPlaceBoat, updateBoatPhysics } from "../app/game/boats";
import { CRITICAL_DAMAGE_MULTIPLIER, isCriticalHit, weaponStats } from "../app/game/combat";
import { craftingGridCells, recipeFitsGrid, RECIPE_BOOK_PAGE_SIZE } from "../app/game/crafting";
import {
  TOOL_MAX_DURABILITY,
  addItemDurability,
  currentItemDurability,
  damageItemDurability,
  durabilityPercent,
  maxItemDurability,
  normalizeDurability,
  takeItemDurability,
} from "../app/game/durability";
import { itemSalePoints } from "../app/game/economy";
import { createDungeonPlan, isDungeonCoordinate, isDungeonEntranceChunk } from "../app/game/dungeons";
import { clearCombatLine, damageIndicatorAngle, mobCanMeleeHit, mobCanShootPlayer } from "../app/game/encounters";
import {
  HOTBAR_START,
  INVENTORY_SLOT_COUNT,
  createInventoryLayout,
  hotbarFromLayout,
  moveInventorySlot,
  shiftInventorySlot,
} from "../app/game/inventory";
import {
  TOUCH_MINE_DRAG_THRESHOLD,
  TOUCH_MINE_HOLD_MS,
  releaseTransientInput,
  screenPointToNdc,
  touchMovedBeyondHoldSlop,
} from "../app/game/input";
import { MOB_DEFINITIONS, mobIntersectsSolid, mobWaterImmersion, moveMobWithCollision, resolveMobPenetration } from "../app/game/mobs";
import { blockRenderLayer, buildChunkGeometries } from "../app/game/mesher";
import { buildLocatorMarkers, compassHeading } from "../app/game/locator";
import { configuredMultiplayerServer, generateRoomCode, normalizeRoomCode } from "../app/game/network";
import { fallDamageForDistance, PlayerPhysics } from "../app/game/physics";
import { createRandomWorldSeed } from "../app/game/prng";
import { voxelRaycast } from "../app/game/raycast";
import { decodeWorldKey, encodeWorldKey } from "../app/game/save";
import { blockLightLevel, canNaturalMobSpawn, NATURAL_DESPAWN_DISTANCE, NATURAL_SPAWN_MAX_DISTANCE, NATURAL_SPAWN_MIN_DISTANCE } from "../app/game/spawning";
import { depositFurnaceItem, ensureFurnaceSlots, furnaceSlotItem, withdrawFurnaceItem } from "../app/game/smelting";
import { DOUBLE_CHEST_SLOTS, SINGLE_CHEST_SLOTS, clearStorageItem, moveStorageSlot, placeStorageItem, reconcileStorageSlots, storageCanAccept } from "../app/game/storage";
import { BlockId, BoatState, CHUNK_SIZE, DAY_LENGTH_SECONDS, InputFrame, ItemDurability, ItemId, MobState, PlayerSnapshot, SAVE_VERSION, SEA_LEVEL, WORLD_GENERATION_VERSION, WORLD_MAX_Y, WORLD_MIN_Y, WorldSave } from "../app/game/types";
import { EMBERDEEP_OFFSET, createVillagePlan, isVillageChunk, surfaceCaveEntranceForRegion, VoxelWorld } from "../app/game/world";
import { NETWORK_PROTOCOL_VERSION, isValidRoomCode, routeGameMessage } from "../shared/room-protocol";

function prepareArena(
  world: VoxelWorld,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  floorY = 40,
  headroom = 6,
): void {
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      world.setBlock(x, floorY, z, BlockId.Stone);
      for (let y = floorY + 1; y <= floorY + headroom; y += 1) world.setBlock(x, y, z, BlockId.Air);
    }
  }
}

test("mobile touch input releases held actions and maps direct mining to the touched point", () => {
  const input: InputFrame = {
    forward: 1,
    strafe: -1,
    lookX: 18,
    lookY: -9,
    jump: true,
    sprint: true,
    crouch: true,
    mine: true,
    place: true,
    interact: true,
  };
  releaseTransientInput(input, true);
  assert.deepEqual(input, {
    forward: 0,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: true,
    crouch: false,
    mine: false,
    place: false,
    interact: false,
  });
  releaseTransientInput(input);
  assert.equal(input.sprint, false, "hold-to-run must release when an overlay interrupts it");

  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(screenPointToNdc(300, 150, rect), { x: 0, y: 0 });
  assert.deepEqual(screenPointToNdc(500, 50, rect), { x: 1, y: 1 });
  assert.equal(screenPointToNdc(99, 150, rect), null);
  assert.equal(touchMovedBeyondHoldSlop(20, 20, 20 + TOUCH_MINE_DRAG_THRESHOLD, 20), false);
  assert.equal(touchMovedBeyondHoldSlop(20, 20, 21 + TOUCH_MINE_DRAG_THRESHOLD, 20), true);
  assert.ok(TOUCH_MINE_HOLD_MS >= 300, "direct mining needs an intentional-hold delay");
});

test("procedural terrain is deterministic for a seed", () => {
  const first = new VoxelWorld("copper skies");
  const second = new VoxelWorld("copper skies");
  const different = new VoxelWorld("glass ocean");
  const samples: Array<[number, number, number]> = [];
  for (let x = -19; x <= 19; x += 7) {
    for (let z = -17; z <= 17; z += 6) {
      const y = first.getHeight(x, z);
      samples.push([x, y, z], [x, Math.max(1, y - 8), z]);
    }
  }
  assert.deepEqual(
    samples.map(([x, y, z]) => first.getBlock(x, y, z)),
    samples.map(([x, y, z]) => second.getBlock(x, y, z)),
  );
  assert.ok(samples.some(([x, , z]) => first.getHeight(x, z) !== different.getHeight(x, z)));
});

test("terrain is mostly low rolling country with rare bounded mountains", () => {
  const world = new VoxelWorld("Copper Skies");
  const heights: number[] = [];
  for (let x = -512; x <= 512; x += 8) {
    for (let z = -512; z <= 512; z += 8) heights.push(world.getHeight(x, z));
  }
  const lowCountry = heights.filter((height) => height < 100).length / heights.length;
  const mountains = heights.filter((height) => height >= 110).length / heights.length;
  const sorted = heights.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 65, "terrain should still include meaningful ranges");
  assert.ok(median >= 62 && median <= 78, `median terrain drifted to Y ${median}`);
  assert.ok(lowCountry > 0.95, `only ${(lowCountry * 100).toFixed(1)}% of terrain remained low country`);
  assert.ok(mountains > 0.002 && mountains < 0.03, `mountain balance drifted to ${(mountains * 100).toFixed(2)}%`);
  assert.ok(Math.max(...heights) <= 196, "natural terrain must leave the upper build space empty");
  assert.ok(Math.max(...heights) < WORLD_MAX_Y && Math.min(...heights) > WORLD_MIN_Y);
});

test("block mutations work across negative chunk boundaries", () => {
  const world = new VoxelWorld("negative coordinates");
  world.setBlock(-17, 42, -1, BlockId.FluxLamp);
  world.setBlock(-16, 42, 0, BlockId.Toggle);
  assert.equal(world.getBlock(-17, 42, -1), BlockId.FluxLamp);
  assert.equal(world.getBlock(-16, 42, 0), BlockId.Toggle);
  const restored = new VoxelWorld("negative coordinates");
  restored.loadMutations(world.serializeMutations());
  assert.equal(restored.getBlock(-17, 42, -1), BlockId.FluxLamp);
  assert.equal(restored.getBlock(-16, 42, 0), BlockId.Toggle);
});

test("authoritative mutation deltas drain once without echoing on guests", () => {
  const host = new VoxelWorld("network mutation bench");
  host.setBlock(2, 72, -3, BlockId.FluxLamp);
  const delta = host.drainNetworkMutations();
  assert.deepEqual(delta, [[2, 72, -3, BlockId.FluxLamp]]);
  assert.deepEqual(host.drainNetworkMutations(), []);
  const guest = new VoxelWorld("network mutation bench");
  guest.applyAuthoritativeMutations(delta);
  assert.equal(guest.getBlock(2, 72, -3), BlockId.FluxLamp);
  assert.deepEqual(guest.drainNetworkMutations(), [], "received authority should not echo back into the network");
  assert.ok(guest.serializeMutations().some(([x, y, z, id]) => x === 2 && y === 72 && z === -3 && id === BlockId.FluxLamp));
});

test("the buildable world spans y -64 through the 320 ceiling", () => {
  const world = new VoxelWorld("vertical bounds bench");
  world.setBlock(0, WORLD_MIN_Y + 1, 0, BlockId.FluxLamp);
  world.setBlock(0, WORLD_MAX_Y - 1, 0, BlockId.Glass);
  assert.equal(world.getBlock(0, WORLD_MIN_Y + 1, 0), BlockId.FluxLamp);
  assert.equal(world.getBlock(0, WORLD_MAX_Y - 1, 0), BlockId.Glass);
  assert.equal(world.getBlock(0, WORLD_MAX_Y, 0), BlockId.Air);
});

test("water enters a mined opening, thins by level, and stops after seven blocks", () => {
  const world = new VoxelWorld("finite water bench");
  prepareArena(world, -2, 11, -2, 2);
  for (let x = -2; x <= 11; x += 1) {
    world.setBlock(x, 41, -1, BlockId.Stone);
    world.setBlock(x, 41, 1, BlockId.Stone);
  }
  world.setBlock(0, 41, 0, BlockId.Water);
  world.setBlock(1, 41, 0, BlockId.Air);
  for (let x = 1; x <= 7; x += 1) {
    assert.equal(world.getBlock(x, 41, 0), BlockId.Water);
    assert.equal(world.getWaterLevel(x, 41, 0), x);
  }
  assert.equal(world.getBlock(8, 41, 0), BlockId.Air);
  const restored = new VoxelWorld("finite water bench");
  restored.loadMutations(world.serializeMutations());
  restored.loadWaterLevels(world.serializeWaterLevels());
  assert.equal(restored.getBlock(7, 41, 0), BlockId.Water);
  assert.equal(restored.getWaterLevel(7, 41, 0), 7);
});

test("a placed dam preserves itself and removes unreachable downstream flow", () => {
  const world = new VoxelWorld("finite water cutoff");
  prepareArena(world, -1, 10, -1, 1);
  for (let x = -1; x <= 10; x += 1) {
    world.setBlock(x, 41, -1, BlockId.Stone);
    world.setBlock(x, 41, 1, BlockId.Stone);
  }
  world.setBlock(0, 41, 0, BlockId.Water);
  world.setBlock(1, 41, 0, BlockId.Air);
  world.setBlock(3, 41, 0, BlockId.Glass);
  assert.equal(world.getBlock(3, 41, 0), BlockId.Glass);
  assert.equal(world.getBlock(2, 41, 0), BlockId.Water);
  for (let x = 4; x <= 7; x += 1) assert.equal(world.getBlock(x, 41, 0), BlockId.Air);
});

test("placement raycasts target water cells while mining raycasts through them", () => {
  const world = new VoxelWorld("water placement ray bench");
  prepareArena(world, -1, 6, -1, 1);
  world.setBlock(1, 42, 0, BlockId.Water);
  world.setBlock(3, 42, 0, BlockId.Stone);
  const origin = new THREE.Vector3(0.5, 42.5, 0.5);
  const direction = new THREE.Vector3(1, 0, 0);
  assert.equal(voxelRaycast(world, origin, direction, 6)?.id, BlockId.Stone);
  assert.equal(voxelRaycast(world, origin, direction, 6, true)?.id, BlockId.Water);
});

test("boats float, steer, respect speed limits, and stop at shore obstacles", () => {
  const world = new VoxelWorld("boat physics bench");
  prepareArena(world, -3, 12, -3, 3, 40, 5);
  for (let x = -3; x <= 12; x += 1) {
    for (let z = -3; z <= 3; z += 1) world.setBlock(x, 41, z, BlockId.Water);
  }
  assert.equal(canPlaceBoat(world, { x: 0.5, y: 41.2, z: 0.5 }), true);
  for (let z = -2; z <= 2; z += 1) {
    world.setBlock(7, 41, z, BlockId.Stone);
    world.setBlock(7, 42, z, BlockId.Stone);
  }
  const boat: BoatState = {
    id: "physics-boat",
    position: { x: 0.5, y: 41.72, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: -Math.PI / 2,
    angularVelocity: 0,
    wood: "emberwood",
    realm: "frontier",
  };
  for (let frame = 0; frame < 240; frame += 1) updateBoatPhysics(world, boat, { forward: 1, turn: frame < 20 ? 0.12 : 0 }, 1 / 60);
  assert.ok(boat.position.x > 3, `boat failed to make useful progress; x=${boat.position.x}`);
  assert.ok(boat.position.x <= 6.3, `boat crossed a solid shoreline wall; x=${boat.position.x}`);
  assert.ok(boat.position.y > 41.3 && boat.position.y < 42.1, `boat buoyancy drifted to y=${boat.position.y}`);
  assert.ok(Math.hypot(boat.velocity.x, boat.velocity.z) <= 7.41);
  assert.equal(boatIntersectsSolid(world, boat.position), false);

  const groundWorld = new VoxelWorld("falling boat bench");
  prepareArena(groundWorld, -2, 2, -2, 2, 40, 6);
  const fallingBoat: BoatState = {
    ...boat,
    id: "falling-boat",
    position: { x: 0.5, y: 46, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  for (let frame = 0; frame < 240; frame += 1) updateBoatPhysics(groundWorld, fallingBoat, { forward: 0, turn: 0 }, 1 / 60);
  assert.ok(fallingBoat.position.y >= 41.33, `falling boat passed through its solid floor; y=${fallingBoat.position.y}`);
  assert.equal(boatIntersectsSolid(groundWorld, fallingBoat.position), false);
});

test("boat steering stays bounded and frame-rate independent", () => {
  const world = new VoxelWorld("stable boat steering bench");
  prepareArena(world, -20, 20, -20, 20, 40, 5);
  for (let x = -20; x <= 20; x += 1) {
    for (let z = -20; z <= 20; z += 1) world.setBlock(x, 41, z, BlockId.Water);
  }
  const simulate = (fps: number): BoatState => {
    const boat: BoatState = {
      id: `stable-${fps}`,
      position: { x: 0.5, y: 41.72, z: 0.5 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      angularVelocity: 0,
      wood: "emberwood",
      realm: "frontier",
    };
    for (let frame = 0; frame < fps * 4; frame += 1) {
      updateBoatPhysics(world, boat, { forward: 1, turn: 0.55 }, 1 / fps);
    }
    return boat;
  };
  const at30 = simulate(30);
  const at60 = simulate(60);
  const at120 = simulate(120);
  for (const boat of [at30, at60, at120]) {
    assert.ok(Math.abs(boat.angularVelocity) <= 1.551, `angular speed escaped its bound: ${boat.angularVelocity}`);
    assert.ok(Math.hypot(boat.velocity.x, boat.velocity.z) <= 6.61, "boat exceeded its water speed cap");
  }
  assert.ok(Math.hypot(at30.position.x - at120.position.x, at30.position.z - at120.position.z) < 0.75, "30 and 120 FPS boat paths diverged");
  const yawDelta = Math.abs(Math.atan2(Math.sin(at30.yaw - at120.yaw), Math.cos(at30.yaw - at120.yaw)));
  assert.ok(yawDelta < 0.12, `boat yaw became frame dependent: ${yawDelta}`);
  assert.ok(Math.hypot(at60.position.x - at120.position.x, at60.position.z - at120.position.z) < 0.4);
});

test("teleports reset stale fall history and small knock-ups remain safe", () => {
  const world = new VoxelWorld("dungeon fall reset bench");
  prepareArena(world, -2, 2, -2, 2, 40, 8);
  const player = new PlayerPhysics({ x: 0.5, y: 96, z: 0.5 });
  player.teleport({ x: 0.5, y: 41.01, z: 0.5 });
  player.velocity.y = 7.2;
  let landedDistance = 0;
  const idle: InputFrame = {
    forward: 0, strafe: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  for (let frame = 0; frame < 150; frame += 1) player.update(1 / 60, idle, world, (distance) => { landedDistance = distance; });
  assert.equal(landedDistance, 0, "an ordinary post-teleport jump was treated as an overworld-height fall");
  assert.equal(fallDamageForDistance(4), 0);
  assert.ok(Math.abs(fallDamageForDistance(4.8) - 4) < 1e-9);
  assert.equal(fallDamageForDistance(8), 20);
});

test("thrown items follow both camera yaw and vertical pitch", () => {
  const level = thrownItemLaunch({ x: 2, y: 40, z: 3 }, 0, 0);
  const upward = thrownItemLaunch({ x: 2, y: 40, z: 3 }, 0, Math.PI / 4);
  const downward = thrownItemLaunch({ x: 2, y: 40, z: 3 }, -Math.PI / 2, -Math.PI / 4);
  assert.ok(level.velocity.z < -4.3 && Math.abs(level.velocity.x) < 0.001);
  assert.ok(upward.velocity.y > 3.5, "looking up did not produce an upward throw");
  assert.ok(Math.abs(upward.velocity.z) < Math.abs(level.velocity.z), "vertical aim did not reduce horizontal velocity");
  assert.ok(downward.velocity.y < -2.5, "looking down did not produce a downward throw");
  assert.ok(downward.velocity.x > 3, "yaw was not included in the throw direction");
});

test("the 36-slot inventory keeps items unique and supports pick/place plus shift transfer", () => {
  const inventory = {
    "tool:rough-pick": 1,
    [itemForBlock(BlockId.Stone)]: 32,
    "part:coal": 9,
  };
  const legacyHotbar = ["tool:rough-pick", "tool:rough-pick", "part:coal"] as const;
  let layout = createInventoryLayout(inventory, undefined, [...legacyHotbar]);
  assert.equal(layout.length, INVENTORY_SLOT_COUNT);
  assert.equal(layout.filter((item) => item === "tool:rough-pick").length, 1, "one tool must not appear in multiple slots");
  assert.equal(hotbarFromLayout(layout)[0], "tool:rough-pick");
  assert.equal(hotbarFromLayout(layout)[1], null);
  layout = moveInventorySlot(layout, HOTBAR_START, 4);
  assert.equal(layout[4], "tool:rough-pick");
  layout = shiftInventorySlot(layout, 4);
  assert.equal(layout[HOTBAR_START], "tool:rough-pick", "shift-click should fill the hotbar left to right");
  layout = shiftInventorySlot(layout, HOTBAR_START);
  assert.equal(layout[1], "tool:rough-pick", "shift-click from the hotbar should fill the first open upper slot");
});

test("player collision stops cleanly at walls without high-speed tunneling", () => {
  const world = new VoxelWorld("collision bench");
  prepareArena(world, -2, 4, -2, 2);
  world.setBlock(2, 41, 0, BlockId.Stone);
  world.setBlock(2, 42, 0, BlockId.Stone);

  const player = new PlayerPhysics({ x: 0.5, y: 41, z: 0.5 });
  player.yaw = -Math.PI / 2;
  const input: InputFrame = {
    forward: 1,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: true,
    crouch: false,
    mine: false,
    place: false,
    interact: false,
  };
  for (let frame = 0; frame < 90; frame += 1) player.update(1 / 20, input, world);

  assert.ok(player.position.x <= 1.691, `player crossed wall boundary at x=${player.position.x}`);
  assert.ok(player.position.x >= 1.65, `player stopped too far from wall at x=${player.position.x}`);
  assert.ok(Math.abs(player.position.y - 41) < 0.01, `player drifted vertically to y=${player.position.y}`);
});

test("portable world keys round-trip and detect corruption", () => {
  const save: WorldSave = {
    version: SAVE_VERSION,
    generation: WORLD_GENERATION_VERSION,
    createdAt: 123456,
    seed: "portable frontier",
    mode: "survival",
    player: {
      position: { x: 1.5, y: 21, z: -3.5 },
      yaw: 0.5,
      pitch: -0.1,
      health: 87,
      hunger: 65,
      stamina: 99,
      inventory: { [itemForBlock(BlockId.CopperOre)]: 12, "tool:rough-pick": 1 },
      hotbar: ["tool:rough-pick"],
      durability: { "tool:rough-pick": 73 },
      selectedSlot: 0,
    },
    timeOfDay: 0.72,
    dayCount: 4,
    mutations: [[2, 22, 3, BlockId.FluxWire]],
    machines: [["1,21,-2", {
      orientation: 0,
      enabled: true,
      signal: 0,
      energy: 0,
      progress: 0,
      delay: 0,
      storage: { "tool:rough-pick": 1 },
      durability: { "tool:rough-pick": [61] },
    }]],
    drops: [{
      id: "saved-damaged-tool",
      item: "tool:rough-pick",
      count: 1,
      durability: [49],
      position: { x: 2.5, y: 21.4, z: -1.5 },
      velocity: { x: 0, y: 0.2, z: 0 },
    }],
    mobs: [],
  };
  save.player.spawnPoint = { x: 4.5, y: 22.01, z: -8.5 };
  save.player.skinSeed = 913;
  save.playerProfiles = {
    "traveler-friend0001": {
      ...save.player,
      position: { x: 9.5, y: 23, z: 2.5 },
      inventory: { "part:diamond": 2 },
      hotbar: ["part:diamond"],
    },
  };
  save.boats = [{
    id: "saved-boat",
    position: { x: 3.5, y: 63.7, z: 4.5 },
    velocity: { x: 0.2, y: 0, z: -0.1 },
    yaw: 0.4,
    angularVelocity: 0.03,
    wood: "frostpine",
    realm: "frontier",
  }];
  const key = encodeWorldKey(save);
  assert.ok(key.startsWith("VF2."));
  assert.deepEqual(decodeWorldKey(key), save);
  const legacySave = { ...save };
  delete legacySave.generation;
  delete legacySave.mode;
  delete legacySave.dayCount;
  const migrated = decodeWorldKey(encodeWorldKey(legacySave));
  assert.equal(migrated.generation, 2);
  assert.equal(migrated.player.position.y, legacySave.player.position.y + 46);
  assert.equal(migrated.mutations[0][1], legacySave.mutations[0][1] + 46);
  const versionSixSave = { ...save, generation: 2, createdAt: 654321 };
  assert.deepEqual(decodeWorldKey(encodeWorldKey(versionSixSave)), versionSixSave, "Generation 2 worlds must not be rewritten onto Generation 3 terrain");
  const parts = key.split(".");
  const damaged = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.throws(() => decodeWorldKey(damaged), /damaged|integrity/i);
  const tooManyProfiles = {
    ...save,
    playerProfiles: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [
      `traveler-overflow-${index.toString().padStart(8, "0")}`,
      { ...save.player, position: { ...save.player.position }, inventory: {}, hotbar: [] },
    ])),
  };
  assert.throws(() => decodeWorldKey(encodeWorldKey(tooManyProfiles)), /player profiles/i);
  const invalidDropDurability = {
    ...save,
    drops: [{ ...save.drops[0], durability: [0] }],
  };
  assert.throws(() => decodeWorldKey(encodeWorldKey(invalidDropDurability)), /durability/i);
});

test("mobile auto-jump clears a full one-block rise", () => {
  const world = new VoxelWorld("auto jump bench");
  prepareArena(world, -2, 5, -2, 2);
  world.setBlock(2, 41, 0, BlockId.Stone);
  const player = new PlayerPhysics({ x: 0.5, y: 41, z: 0.5 });
  player.yaw = -Math.PI / 2;
  const input: InputFrame = {
    forward: 1, strafe: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  for (let frame = 0; frame < 95; frame += 1) player.update(1 / 30, input, world, undefined, true);
  assert.ok(player.position.x > 2.4, `auto-jump did not clear the rise; x=${player.position.x}`);
});

test("mob collision prevents clipping into placed walls and repairs embedded saves", () => {
  const world = new VoxelWorld("mob collision bench");
  prepareArena(world, -2, 5, -2, 2);
  world.setBlock(2, 41, 0, BlockId.EmberwoodLog);
  world.setBlock(2, 42, 0, BlockId.EmberwoodLog);
  const mob: MobState = {
    id: "collision-grazer",
    kind: "glowgrazer",
    position: { x: 0.5, y: 41.01, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 28,
    yaw: -Math.PI / 2,
    targetTimer: 1,
  };
  for (let frame = 0; frame < 100; frame += 1) moveMobWithCollision(world, mob, 1 / 30, 3, 0);
  assert.ok(mob.position.x <= 1.602, `mob entered the wall at x=${mob.position.x}`);
  assert.equal(mobIntersectsSolid(world, mob), false);

  mob.position = { x: 2.5, y: 41.01, z: 0.5 };
  assert.equal(mobIntersectsSolid(world, mob), true);
  assert.equal(resolveMobPenetration(world, mob), true);
  assert.equal(mobIntersectsSolid(world, mob), false);
});

test("combat equipment has distinct reach, damage, ammo, and timing", () => {
  const fist = weaponStats(null);
  const spear = weaponStats("tool:stone-spear");
  const saber = weaponStats("tool:copper-saber");
  const repeater = weaponStats("tool:aether-repeater");
  assert.ok(spear.reach > fist.reach);
  assert.ok(saber.damage > spear.damage);
  assert.equal(repeater.ammo, "ammo:aether-bolt");
  assert.ok(repeater.reach > spear.reach * 3);
  assert.ok(repeater.cooldown > saber.cooldown);
});

test("critical hits require a descending airborne melee strike", () => {
  const melee = weaponStats("tool:copper-saber");
  const ranged = weaponStats("tool:aether-repeater");
  assert.equal(isCriticalHit({ grounded: false, velocityY: -2.4 }, melee), true);
  assert.equal(isCriticalHit({ grounded: false, velocityY: 1.2 }, melee), false);
  assert.equal(isCriticalHit({ grounded: true, velocityY: -2.4 }, melee), false);
  assert.equal(isCriticalHit({ grounded: false, velocityY: -2.4, swimming: true }, melee), false);
  assert.equal(isCriticalHit({ grounded: false, velocityY: -2.4, flying: true }, melee), false);
  assert.equal(isCriticalHit({ grounded: false, velocityY: -2.4 }, ranged), false);
  assert.equal(CRITICAL_DAMAGE_MULTIPLIER, 1.5);
});

test("hostile melee requires real vertical overlap and line of sight", () => {
  const world = new VoxelWorld("combat reach bench");
  prepareArena(world, -2, 14, -2, 2, 40, 8);
  const mob: MobState = {
    id: "reach-mireling",
    kind: "mireling",
    position: { x: 0.5, y: 41.01, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 36,
    yaw: 0,
    targetTimer: 1,
  };
  const nearby = { position: { x: 2.15, y: 41.01, z: 0.5 }, realm: "frontier" as const };
  assert.equal(mobCanMeleeHit(world, mob, nearby), true);
  assert.equal(mobCanMeleeHit(world, mob, { position: { x: 0.5, y: 61, z: 0.5 }, realm: "frontier" }), false, "a mob below the player must not hit through twenty blocks of height");
  world.setBlock(1, 41, 0, BlockId.Stone);
  world.setBlock(1, 42, 0, BlockId.Stone);
  assert.equal(clearCombatLine(world, { x: 0.5, y: 41.7, z: 0.5 }, { x: 2.15, y: 41.9, z: 0.5 }), false);
  assert.equal(mobCanMeleeHit(world, mob, nearby), false, "solid cover must block a melee hit");

  world.setBlock(1, 41, 0, BlockId.Air);
  world.setBlock(1, 42, 0, BlockId.Air);
  const caster: MobState = { ...mob, id: "reach-caster", kind: "shardcaster", health: 34 };
  const distant = { position: { x: 10.5, y: 41.01, z: 0.5 }, realm: "frontier" as const };
  assert.equal(mobCanShootPlayer(world, caster, distant), true);
  world.setBlock(5, 41, 0, BlockId.Stone);
  world.setBlock(5, 42, 0, BlockId.Stone);
  assert.equal(mobCanShootPlayer(world, caster, distant), false, "ranged enemies must respect cover");
  assert.equal(mobCanShootPlayer(world, caster, { ...distant, realm: "emberdeep" }), false, "enemies cannot attack across realms");
});

test("damage direction maps world bearings onto the player's screen", () => {
  const player = { x: 0, y: 41, z: 0 };
  assert.ok(Math.abs(damageIndicatorAngle(player, 0, { x: 0, y: 41, z: -2 })) < 1e-8, "front should point up");
  assert.ok(Math.abs(damageIndicatorAngle(player, 0, { x: 2, y: 41, z: 0 }) - Math.PI / 2) < 1e-8, "right should point right");
  assert.ok(Math.abs(damageIndicatorAngle(player, -Math.PI / 2, { x: 2, y: 41, z: 0 })) < 1e-8, "camera yaw should rotate the bearing");
  assert.ok(Math.abs(Math.abs(damageIndicatorAngle(player, 0, { x: 0, y: 41, z: 2 })) - Math.PI) < 1e-8, "back should point down");
});

test("creative flight ascends smoothly while retaining collision physics", () => {
  const world = new VoxelWorld("creative flight bench");
  prepareArena(world, -2, 2, -2, 2);
  const player = new PlayerPhysics({ x: 0.5, y: 41.01, z: 0.5 });
  const input: InputFrame = {
    forward: 0, strafe: 0, lookX: 0, lookY: 0, jump: true, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  for (let frame = 0; frame < 18; frame += 1) player.update(1 / 30, input, world, undefined, false, true);
  assert.ok(player.position.y > 45, `creative flight failed to ascend; y=${player.position.y}`);
  assert.equal(player.grounded, false);
  const peak = player.position.y;
  const hover = { ...input, jump: false };
  for (let frame = 0; frame < 20; frame += 1) player.update(1 / 30, hover, world, undefined, false, true);
  assert.ok(Math.abs(player.position.y - peak) < 0.5, "flight should settle into a stable hover");
});

test("crouching holds a grounded player at a block edge", () => {
  const world = new VoxelWorld("crouch ledge bench");
  for (let x = -2; x <= 4; x += 1) {
    for (let z = -1; z <= 1; z += 1) {
      for (let y = 38; y <= 45; y += 1) world.setBlock(x, y, z, BlockId.Air);
      if (x <= 0) world.setBlock(x, 40, z, BlockId.Stone);
    }
  }
  const baseInput: InputFrame = {
    forward: 0, strafe: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  const crouched = new PlayerPhysics({ x: 0.5, y: 41.01, z: 0.5 });
  crouched.yaw = -Math.PI / 2;
  for (let frame = 0; frame < 3; frame += 1) crouched.update(1 / 30, baseInput, world);
  for (let frame = 0; frame < 45; frame += 1) crouched.update(1 / 30, { ...baseInput, forward: 1, crouch: true }, world);
  assert.ok(crouched.position.x <= 1.32, `crouching crossed the ledge at x=${crouched.position.x}`);
  assert.ok(crouched.position.y > 40.9, "crouching player fell from the ledge");

  const walker = new PlayerPhysics({ x: 0.5, y: 41.01, z: 0.5 });
  walker.yaw = -Math.PI / 2;
  for (let frame = 0; frame < 45; frame += 1) walker.update(1 / 30, { ...baseInput, forward: 1 }, world);
  assert.ok(walker.position.x > 1.45 && walker.position.y < 40.8, "an uncrouched player should be able to leave and fall from the ledge");
});

test("every inventory item has a deterministic villager sale value", () => {
  for (const item of ALL_ITEMS) assert.ok(itemSalePoints(item) > 0, `${item} should be sellable`);
  assert.equal(itemSalePoints("currency:frontier-mark"), 20);
  assert.ok(itemSalePoints("part:diamond") > itemSalePoints(itemForBlock(BlockId.Soil)) * 20);
  assert.ok(itemSalePoints(itemForBlock(BlockId.PulseRepeater)) > itemSalePoints(itemForBlock(BlockId.Stone)));
});

test("server multiplayer uses normalized six-character room codes", () => {
  assert.equal(normalizeRoomCode(" f7-k2-p9 "), "F7K2P9");
  const code = generateRoomCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(isValidRoomCode(code), true);
});

test("room server policy preserves host authority and upgrades secure endpoints", () => {
  assert.equal(NETWORK_PROTOCOL_VERSION, 10);
  assert.equal(routeGameMessage("guest", "request-block"), "host");
  assert.equal(routeGameMessage("guest", "request-machine"), "host");
  assert.equal(routeGameMessage("guest", "request-drop"), "host");
  assert.equal(routeGameMessage("guest", "request-chest"), "host");
  assert.equal(routeGameMessage("guest", "request-furnace"), "host");
  assert.equal(routeGameMessage("guest", "request-dungeon"), "host");
  assert.equal(routeGameMessage("guest", "request-boat"), "host");
  assert.equal(routeGameMessage("guest", "boat-input"), "host");
  assert.equal(routeGameMessage("guest", "player-profile"), "host");
  assert.equal(routeGameMessage("guest", "chat"), "broadcast");
  assert.equal(routeGameMessage("guest", "death"), "broadcast");
  assert.equal(routeGameMessage("guest", "block"), "reject");
  assert.equal(routeGameMessage("guest", "player"), "broadcast");
  assert.equal(routeGameMessage("host", "snapshot"), "snapshot");
  assert.equal(configuredMultiplayerServer("https://rooms.example.com/"), "wss://rooms.example.com");
  assert.equal(configuredMultiplayerServer("ftp://rooms.example.com"), null);
});

test("fresh world seeds are readable and unique", () => {
  const seeds = new Set(Array.from({ length: 24 }, () => createRandomWorldSeed()));
  assert.equal(seeds.size, 24);
  assert.ok(Array.from(seeds).every((seed) => /^[A-Za-z]+ [A-Za-z]+ [A-Z0-9]{6,7}$/.test(seed)));
});

test("leaf cutouts write depth instead of blending with water behind them", () => {
  for (const id of [BlockId.EmberwoodLeaves, BlockId.FrostpineLeaves, BlockId.RiftwoodLeaves]) {
    assert.equal(isLeafBlock(id), true);
    assert.equal(blockRenderLayer(id), "solid");
  }
  assert.equal(blockRenderLayer(BlockId.Water), "liquid");
  assert.equal(blockRenderLayer(BlockId.Glass), "translucent");
  assert.equal(blockRenderLayer(BlockId.GlassPane), "translucent");
  assert.equal(blockRenderLayer(BlockId.StarBloom), "solid");
  assert.equal(blockRenderLayer(BlockId.Thornvine), "solid");
});

test("single and double chest layouts preserve unique item slots", () => {
  assert.equal(SINGLE_CHEST_SLOTS, 27);
  assert.equal(DOUBLE_CHEST_SLOTS, 54);
  const storage = { "part:coal": 18, "part:iron-ingot": 3 };
  let slots = reconcileStorageSlots(["part:coal", "part:coal"], storage);
  assert.equal(slots.length, SINGLE_CHEST_SLOTS);
  assert.equal(slots.filter((item) => item === "part:coal").length, 1);
  assert.equal(slots.filter((item) => item === "part:iron-ingot").length, 1);
  assert.equal(storageCanAccept(slots, "part:diamond"), true);
  slots = placeStorageItem(slots, "part:diamond");
  assert.equal(slots.filter((item) => item === "part:diamond").length, 1);
  slots = clearStorageItem(slots, "part:coal");
  assert.equal(slots.includes("part:coal"), false);
  const chestWorld = new VoxelWorld("chest state bench");
  chestWorld.setBlock(0, 80, 0, BlockId.Crate);
  assert.equal(chestWorld.machines.get("0,80,0")?.storageSlots?.length, SINGLE_CHEST_SLOTS);
  const targeted = placeStorageItem(Array(SINGLE_CHEST_SLOTS).fill(null), "part:diamond", 19);
  assert.equal(targeted[19], "part:diamond");
  const moved = moveStorageSlot(targeted, 19, 3);
  assert.equal(moved[3], "part:diamond");
  assert.equal(moved[19], null);
});

test("party locator uses a forward arc, distance scale, height cues, and crouch privacy", () => {
  const players: PlayerSnapshot[] = [
    { id: "near", name: "Near", color: "#ff7755", position: { x: 0, y: 72, z: -10 }, yaw: 0, pitch: 0 },
    { id: "high", name: "High", color: "#55ddff", position: { x: -7, y: 84, z: -18 }, yaw: 0, pitch: 0 },
    { id: "behind", name: "Behind", color: "#ffffff", position: { x: 0, y: 72, z: 20 }, yaw: 0, pitch: 0 },
    { id: "hidden", name: "Hidden", color: "#ffffff", position: { x: 2, y: 72, z: -8 }, yaw: 0, pitch: 0, crouching: true },
    { id: "far", name: "Far", color: "#bb88ff", position: { x: 0, y: 60, z: -250 }, yaw: 0, pitch: 0 },
  ];
  const markers = buildLocatorMarkers({ x: 0, y: 72, z: 0 }, 0, players);
  assert.deepEqual(markers.map((marker) => marker.id).toSorted(), ["far", "high", "near"]);
  assert.equal(markers.find((marker) => marker.id === "high")?.vertical, "above");
  assert.equal(markers.find((marker) => marker.id === "far")?.vertical, "below");
  assert.ok(markers.find((marker) => marker.id === "near")!.scale > markers.find((marker) => marker.id === "far")!.scale);
  assert.equal(compassHeading(0), "N");
  assert.equal(compassHeading(Math.PI / 2), "W");
  assert.ok(markers.find((marker) => marker.id === "high")!.offset < 0, "a player west/left of north should render on the left");
});

test("natural spawning follows proximity and block-light rules", () => {
  assert.ok(NATURAL_SPAWN_MIN_DISTANCE >= 16);
  assert.ok(NATURAL_SPAWN_MAX_DISTANCE > NATURAL_SPAWN_MIN_DISTANCE);
  assert.ok(NATURAL_DESPAWN_DISTANCE > NATURAL_SPAWN_MAX_DISTANCE);
  const world = new VoxelWorld("spawn light bench");
  prepareArena(world, -2, 23, -2, 2, 40, 4);
  world.setBlock(0, 40, 0, BlockId.Turf);
  const candidate = { x: 0.5, y: 41.01, z: 0.5 };
  const players = [{ x: 20.5, y: 41.01, z: 0.5 }];
  assert.equal(blockLightLevel(world, candidate), 0);
  assert.equal(canNaturalMobSpawn(world, "hostile", candidate, 0.5, players), true, "a dark underground floor should permit hostiles even by day");
  world.setBlock(3, 41, 0, BlockId.GlowRod);
  assert.ok(blockLightLevel(world, candidate) >= 11, "a torch should propagate gameplay light well beyond one block");
  assert.equal(canNaturalMobSpawn(world, "hostile", candidate, 0.5, players), false, "torch light should suppress hostile spawning");
  assert.equal(canNaturalMobSpawn(world, "passive", candidate, 0.5, players), true, "bright Turf should permit passive animals");
});

test("all native timber crafts core utility blocks and torches cast light", () => {
  const bench = RECIPES.find((recipe) => recipe.id === "workbench")!;
  const chest = RECIPES.find((recipe) => recipe.id === "chest")!;
  const torch = RECIPES.find((recipe) => recipe.id === "trail-torch")!;
  for (const wood of [BlockId.EmberwoodPlanks, BlockId.FrostpinePlanks, BlockId.RiftwoodPlanks]) {
    assert.ok(matchingRecipeInputs(bench, { [itemForBlock(wood)]: 4 }), `missing Tinker Bench recipe for ${BLOCKS[wood].name}`);
    assert.ok(matchingRecipeInputs(chest, { [itemForBlock(wood)]: 8 }), `missing chest recipe for ${BLOCKS[wood].name}`);
    assert.ok(matchingRecipeInputs(torch, { [itemForBlock(wood)]: 1, "part:coal": 1 }), `missing torch recipe for ${BLOCKS[wood].name}`);
  }
  assert.equal(BLOCKS[BlockId.GlowRod].shape, "torch");
  assert.ok((BLOCKS[BlockId.GlowRod].emissive ?? 0) >= 0.9);
  assert.equal(BLOCKS[BlockId.Stone].color, "#a3a8a8");
});

test("surface trees require a dry shoreline buffer", () => {
  const world = new VoxelWorld("dry forest survey");
  let treeBases = 0;
  for (let cx = -3; cx <= 3; cx += 1) {
    for (let cz = -3; cz <= 3; cz += 1) {
      world.getChunk(cx, cz);
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
          const x = cx * CHUNK_SIZE + lx;
          const z = cz * CHUNK_SIZE + lz;
          const height = world.getHeight(x, z);
          const id = world.getBlock(x, height + 1, z);
          if (id !== BlockId.EmberwoodLog && id !== BlockId.FrostpineLog) continue;
          treeBases += 1;
          assert.ok(height > SEA_LEVEL + 1);
          for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            assert.ok(world.getHeight(x + dx, z + dz) > SEA_LEVEL, `tree at ${x},${z} touched water`);
          }
        }
      }
    }
  }
  assert.ok(treeBases > 0, "dry-site survey should include at least one tree");
});

test("dungeon entrances are sparse and instance plans are deterministic but varied", () => {
  const world = new VoxelWorld("dungeon plan survey");
  let entrances = 0;
  for (let cx = -44; cx <= 44; cx += 1) {
    for (let cz = -44; cz <= 44; cz += 1) {
      if (isDungeonEntranceChunk(cx, cz, world.seed)) entrances += 1;
    }
  }
  assert.ok(entrances >= 8 && entrances <= 35, `unexpected entrance density: ${entrances}`);
  const origins = [
    { x: 10, y: 72, z: 10 },
    { x: -240, y: 68, z: 380 },
    { x: 900, y: 81, z: -710 },
    { x: 42, y: 65, z: 1200 },
  ];
  const plans = origins.map((origin) => createDungeonPlan(origin, world.seed));
  assert.deepEqual(createDungeonPlan(origins[0], world.seed), plans[0]);
  assert.ok(new Set(plans.map((plan) => plan.id)).size === plans.length);
  assert.ok(new Set(plans.map((plan) => plan.theme)).size >= 2);
  assert.ok(plans.every((plan) => plan.rooms.length >= 8 && plan.rooms.length <= 11));
  assert.ok(plans.every((plan) => isDungeonCoordinate(plan.destination.x, plan.destination.z)));
  assert.ok(plans.every((plan) => plan.rooms.at(-1)?.kind === "vault"));
  assert.ok(plans.every((plan) => plan.rooms.some((room) => room.radius >= 14 && room.height >= 14)));
  assert.ok(plans.every((plan) => Math.hypot(
    plan.destination.x - (plan.returnPosition.x + 0.5),
    plan.destination.z - (plan.returnPosition.z + 0.5),
  ) >= 6), "dungeon arrival must be safely separated from the return beacon");
});

test("Wayfarer ruins generate deterministically with an interactable Relic Cache", () => {
  const first = new VoxelWorld("ruin survey");
  let cache: { x: number; y: number; z: number } | null = null;
  for (let cx = -8; cx <= 8 && !cache; cx += 1) {
    for (let cz = -8; cz <= 8 && !cache; cz += 1) {
      const blocks = first.getChunk(cx, cz).blocks;
      const index = blocks.indexOf(BlockId.RelicCache);
      if (index < 0) continue;
      const layer = CHUNK_SIZE * CHUNK_SIZE;
      const y = WORLD_MIN_Y + Math.floor(index / layer);
      const local = index % layer;
      cache = {
        x: cx * CHUNK_SIZE + (local % CHUNK_SIZE),
        y,
        z: cz * CHUNK_SIZE + Math.floor(local / CHUNK_SIZE),
      };
    }
  }
  assert.ok(cache, "expected at least one deterministic ruin in the survey area");
  const second = new VoxelWorld("ruin survey");
  assert.equal(second.getBlock(cache.x, cache.y, cache.z), BlockId.RelicCache);
});

test("logic signals attenuate through conduits and activate a lamp", () => {
  const world = new VoxelWorld("signal bench");
  world.setBlock(0, 42, 0, BlockId.Toggle);
  world.setBlock(1, 42, 0, BlockId.FluxWire);
  world.setBlock(2, 42, 0, BlockId.FluxWire);
  world.setBlock(3, 42, 0, BlockId.FluxLamp);
  world.machines.get("0,42,0")!.enabled = true;
  const automation = new AutomationSystem();
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("0,42,0")!.signal, 15);
  assert.equal(world.machines.get("1,42,0")!.signal, 14);
  assert.equal(world.machines.get("2,42,0")!.signal, 13);
  assert.ok(world.machines.get("3,42,0")!.signal > 0);
});

test("AND matrices require two live neighboring inputs", () => {
  const world = new VoxelWorld("logic bench");
  world.setBlock(0, 42, 0, BlockId.AndGate);
  world.setBlock(-1, 42, 0, BlockId.Toggle);
  world.setBlock(0, 42, -1, BlockId.Toggle);
  world.setBlock(1, 42, 0, BlockId.FluxWire);
  world.machines.get("-1,42,0")!.enabled = true;
  world.machines.get("0,42,-1")!.enabled = false;
  const automation = new AutomationSystem();
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("0,42,0")!.signal, 0);
  world.machines.get("0,42,-1")!.enabled = true;
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("0,42,0")!.signal, 15);
});

test("a fueled, signaled bore drill mines and ejects an item", () => {
  const world = new VoxelWorld("factory bench");
  world.setBlock(0, 42, 0, BlockId.ThermalGenerator);
  world.setBlock(1, 42, 0, BlockId.FluxWire);
  world.setBlock(1, 43, 0, BlockId.Toggle);
  world.setBlock(2, 42, 0, BlockId.BoreDrill);
  world.machines.get("0,42,0")!.storage[itemForBlock(BlockId.CoalOre)] = 1;
  world.machines.get("1,43,0")!.enabled = true;
  const automation = new AutomationSystem();
  for (let tick = 0; tick < 20; tick += 1) automation.tick(world, [], 0.5);
  assert.ok(world.drops.length >= 1, "drill should eject at least one resource");
  assert.ok(world.mutations.size >= 5, "drill should add a mined-air mutation");
});


test("swimming is slower than land movement and supports deliberate ascent", () => {
  const waterWorld = new VoxelWorld("swim bench");
  const landWorld = new VoxelWorld("land bench");
  for (const world of [waterWorld, landWorld]) {
    prepareArena(world, -3, 22, -3, 3);
  }
  for (let x = -3; x <= 22; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      for (let y = 41; y <= 45; y += 1) waterWorld.setBlock(x, y, z, BlockId.Water);
    }
  }
  const input: InputFrame = {
    forward: 1, strafe: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  const swimmer = new PlayerPhysics({ x: 0.5, y: 41, z: 0.5 });
  const walker = new PlayerPhysics({ x: 0.5, y: 41, z: 0.5 });
  swimmer.yaw = walker.yaw = -Math.PI / 2;
  for (let frame = 0; frame < 40; frame += 1) {
    swimmer.update(1 / 20, input, waterWorld);
    walker.update(1 / 20, input, landWorld);
  }
  assert.equal(swimmer.swimming, true);
  assert.ok(swimmer.position.x - 0.5 < (walker.position.x - 0.5) * 0.72, "water should impose meaningful drag");

  const climber = new PlayerPhysics({ x: 0.5, y: 41, z: 0.5 });
  const ascend = { ...input, forward: 0, jump: true };
  for (let frame = 0; frame < 30; frame += 1) climber.update(1 / 20, ascend, waterWorld);
  assert.ok(climber.position.y > 42.4, `swimmer did not ascend; y=${climber.position.y}`);
});

test("creatures remain buoyant and collision-safe while crossing water", () => {
  const world = new VoxelWorld("aquatic mob bench");
  prepareArena(world, -4, 10, -3, 3);
  for (let x = -4; x <= 10; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      for (let y = 41; y <= 43; y += 1) world.setBlock(x, y, z, BlockId.Water);
    }
  }
  const mob: MobState = {
    id: "swimming-mireling",
    kind: "mireling",
    position: { x: 0.5, y: 41.05, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 36,
    yaw: -Math.PI / 2,
    targetTimer: 2,
  };
  assert.ok(mobWaterImmersion(world, mob) > 0.6);
  for (let frame = 0; frame < 120; frame += 1) moveMobWithCollision(world, mob, 1 / 30, 1.3, 0);
  assert.equal(mobIntersectsSolid(world, mob), false);
  assert.ok(mob.position.y > 40.95 && mob.position.y < 44.35, `mob water height became unstable: ${mob.position.y}`);
  assert.ok(mob.position.x > 2, "mob should make steady progress through water");
});

test("plants, circuits, lights, logistics, and builders use distinct partial shapes", () => {
  assert.equal(BLOCKS[BlockId.StarBloom].shape, "cross");
  assert.equal(BLOCKS[BlockId.CaveMushroom].shape, "cross");
  assert.equal(BLOCKS[BlockId.FluxWire].shape, "wire");
  assert.equal(BLOCKS[BlockId.PulseRepeater].shape, "plate");
  assert.equal(BLOCKS[BlockId.InverterTorch].shape, "torch");
  assert.equal(BLOCKS[BlockId.Hopper].shape, "hopper");
  assert.equal(BLOCKS[BlockId.Observer].shape, "observer");
  assert.equal(BLOCKS[BlockId.Ram].shape, "piston");
  assert.equal(BLOCKS[BlockId.StoneSlab].collisionHeight, 0.5);
  assert.equal(BLOCKS[BlockId.StarBloom].solid, false);
  assert.equal(BLOCKS[BlockId.FluxWire].solid, false);
  assert.equal(BLOCKS[BlockId.GlassPane].shape, "pane");
});

test("crossed flowers, mushrooms, and spikes render from both sides", () => {
  const control = new VoxelWorld("double-sided plant mesh");
  const planted = new VoxelWorld("double-sided plant mesh");
  control.setBlock(1, WORLD_MAX_Y - 3, 1, BlockId.Air);
  planted.setBlock(1, WORLD_MAX_Y - 3, 1, BlockId.StarBloom);
  const before = buildChunkGeometries(control, 0, 0);
  const after = buildChunkGeometries(planted, 0, 0);
  const addedIndices = (after.solid.getIndex()?.count ?? 0) - (before.solid.getIndex()?.count ?? 0);
  assert.equal(addedIndices, 24, "a crossed plant should contain four visible quad faces");
  before.solid.dispose();
  before.translucent.dispose();
  before.liquid.dispose();
  after.solid.dispose();
  after.translucent.dispose();
  after.liquid.dispose();
});

test("the recipe book fits every recipe into its 2x2 or 3x3 grid and pages by 25", () => {
  assert.equal(RECIPE_BOOK_PAGE_SIZE, 25);
  const directRecipes = RECIPES.filter((recipe) => recipe.station === "hand" || recipe.station === "workbench");
  assert.ok(directRecipes.length > RECIPE_BOOK_PAGE_SIZE, "recipe pagination needs more than one populated page");
  for (const recipe of directRecipes) {
    const size = recipe.station === "hand" ? 2 : 3;
    assert.equal(recipeFitsGrid(recipe, size), true, `${recipe.id} does not fit its ${size}x${size} station`);
    assert.equal(craftingGridCells(recipe, {}, size).length, size * size);
  }
  const outputs = directRecipes.map((recipe) => recipe.output.item);
  assert.equal(new Set(outputs).size, outputs.length, "craftable items should have one compact recipe-book entry each");
  const boat = RECIPES.find((recipe) => recipe.id === "boat");
  assert.equal(boat?.station, "workbench", "the five-plank boat recipe requires a 3x3 bench");
  const boatCells = craftingGridCells(boat!, { [itemForBlock(BlockId.FrostpinePlanks)]: 5 }, 3);
  assert.equal(boatCells.filter((cell) => cell?.item === itemForBlock(BlockId.FrostpinePlanks)).length, 5);
  assert.equal(boatCells.every((cell) => !cell || cell.available), true);
  assert.deepEqual(boatCells.map((cell, index) => cell ? index : -1).filter((index) => index >= 0), [3, 5, 6, 7, 8]);

  const aetherPick = RECIPES.find((recipe) => recipe.id === "aether-pick")!;
  assert.equal(aetherPick.station, "workbench");
  const frostpineAetherInputs = {
    [itemForBlock(BlockId.AetherCrystal)]: 3,
    "part:flux-coil": 1,
    "part:diamond": 1,
    [itemForBlock(BlockId.FrostpinePlanks)]: 2,
  };
  assert.ok(matchingRecipeInputs(aetherPick, frostpineAetherInputs), "Aether Pick rejected a native-timber handle");
  const aetherCells = craftingGridCells(aetherPick, frostpineAetherInputs, 3);
  assert.deepEqual(aetherCells.map((cell) => cell?.item ?? null), [
    itemForBlock(BlockId.AetherCrystal), itemForBlock(BlockId.AetherCrystal), itemForBlock(BlockId.AetherCrystal),
    "part:flux-coil", itemForBlock(BlockId.FrostpinePlanks), "part:diamond",
    null, itemForBlock(BlockId.FrostpinePlanks), null,
  ]);

  for (const tool of Object.keys(TOOL_MAX_DURABILITY) as ItemId[]) {
    assert.ok(directRecipes.some((recipe) => recipe.output.item === tool), `${tool} has durability but no survival recipe`);
  }
});

test("tool durability increases by material tier and restores old saves safely", () => {
  const wood = maxItemDurability("tool:wood-pick")!;
  const rough = maxItemDurability("tool:rough-pick")!;
  const copper = maxItemDurability("tool:copper-pick")!;
  const iron = maxItemDurability("tool:iron-pick")!;
  const diamond = maxItemDurability("tool:diamond-pick")!;
  const crystal = maxItemDurability("tool:crystal-pick")!;
  assert.ok(wood < rough && rough < copper && copper < iron && iron < diamond && diamond < crystal);
  const restored = normalizeDurability({ "tool:wood-pick": 1, "tool:iron-pick": 1, "part:coal": 8 });
  assert.equal(currentItemDurability(restored, "tool:wood-pick"), wood);
  assert.equal(currentItemDurability(restored, "tool:iron-pick"), iron);
  const earlyVersion112 = normalizeDurability({ "tool:wood-pick": 2 }, { "tool:wood-pick": 17 });
  assert.deepEqual(earlyVersion112["tool:wood-pick"], [17]);
  assert.equal(durabilityPercent("tool:iron-pick", iron / 2), 0.5);
  assert.equal(maxItemDurability("part:coal"), null);
});

test("damaged tools keep exact durability through drops and storage without contaminating fresh crafts", () => {
  const item: ItemId = "tool:iron-pick";
  const maximum = maxItemDurability(item)!;
  const carried = normalizeDurability({ [item]: 1 }, { [item]: [73] });

  const dropped = takeItemDurability(carried, item, 1);
  assert.deepEqual(dropped, [73]);
  const pickedUp: ItemDurability = {};
  addItemDurability(pickedUp, item, 1, dropped);
  assert.equal(currentItemDurability(pickedUp, item), 73, "dropping and picking up repaired the tool");

  const deposited = takeItemDurability(pickedUp, item, 1);
  const chest: ItemDurability = {};
  addItemDurability(chest, item, 1, deposited);
  const withdrawn = takeItemDurability(chest, item, 1);
  addItemDurability(pickedUp, item, 1, withdrawn);
  assert.equal(currentItemDurability(pickedUp, item), 73, "chest storage repaired the tool");

  addItemDurability(pickedUp, item, 1);
  const lastDamagedUse = damageItemDurability(pickedUp, item, 73);
  assert.equal(lastDamagedUse?.broke, true);
  assert.equal(currentItemDurability(pickedUp, item), maximum, "a newly crafted replacement inherited the broken tool state");
});

test("durability transfer queues retain implicit full copies between damaged tools", () => {
  const item: ItemId = "tool:iron-pick";
  const maximum = maxItemDurability(item)!;
  const carried: ItemDurability = { [item]: [10] };
  addItemDurability(carried, item, 2, [20]);
  assert.deepEqual(carried[item], [20, maximum, 10]);
  assert.deepEqual(takeItemDurability(carried, item, 2), [20]);
  assert.equal(currentItemDurability(carried, item), 10);
});

test("a full frontier day lasts twelve minutes", () => {
  assert.equal(DAY_LENGTH_SECONDS, 720);
});

test("the rebuilt Fluxstone set and boats all have survival recipes", () => {
  const required = [
    BlockId.FluxWire,
    BlockId.Toggle,
    BlockId.InverterTorch,
    BlockId.PulseRepeater,
    BlockId.FluxComparator,
    BlockId.Hopper,
    BlockId.Ram,
    BlockId.AdhesiveRam,
    BlockId.Observer,
    BlockId.Dispenser,
    BlockId.Dropper,
    BlockId.PulseButton,
    BlockId.PressurePlate,
    BlockId.DaylightSensor,
    BlockId.TargetBlock,
    BlockId.NoteEmitter,
    BlockId.FluxLamp,
  ];
  for (const block of required) {
    assert.ok(RECIPES.some((recipe) => recipe.output.item === itemForBlock(block)), `missing survival recipe for ${BLOCKS[block].name}`);
  }
  const boat = RECIPES.find((recipe) => recipe.output.item === "vehicle:boat");
  assert.ok(boat);
  for (const planks of [BlockId.EmberwoodPlanks, BlockId.FrostpinePlanks, BlockId.RiftwoodPlanks]) {
    assert.ok(matchingRecipeInputs(boat, { [itemForBlock(planks)]: 5 }), `boat rejected ${BLOCKS[planks].name}`);
  }
  assert.equal(BLOCKS[BlockId.Dispenser].automation, "storage");
  assert.equal(BLOCKS[BlockId.Dropper].automation, "storage");
});

test("recognizable livestock and complete home-building recipes are available", () => {
  for (const kind of ["sheep", "cow", "pig", "chicken"] as const) {
    assert.equal(MOB_DEFINITIONS[kind].name.toLowerCase(), kind);
    assert.equal(MOB_DEFINITIONS[kind].passive, true);
  }
  assert.ok(RECIPES.some((recipe) => recipe.id === "clear-glass" && recipe.inputs[itemForBlock(BlockId.Sand)] > 0));
  assert.ok(RECIPES.some((recipe) => recipe.id === "timber-door"));
  assert.ok(RECIPES.some((recipe) => recipe.id === "glass-panes"));
  assert.ok(RECIPES.some((recipe) => recipe.id === "timber-shutters"));
});

test("expanded cave fields create substantial deterministic underground voids", () => {
  const first = new VoxelWorld("deep survey");
  const second = new VoxelWorld("deep survey");
  let undergroundVoids = 0;
  const samples: BlockId[] = [];
  for (let x = -16; x < 16; x += 1) {
    for (let z = -16; z < 16; z += 1) {
      const ceiling = Math.max(WORLD_MIN_Y + 5, first.getHeight(x, z) - 3);
      for (let y = WORLD_MIN_Y + 3; y < ceiling; y += 1) {
        const id = first.getBlock(x, y, z);
        if (id === BlockId.Air || id === BlockId.Water) undergroundVoids += 1;
        if ((x + z + y) % 17 === 0) samples.push(id);
      }
    }
  }
  assert.ok(undergroundVoids > 180, `expected extensive caves, found ${undergroundVoids} void cells`);
  let cursor = 0;
  for (let x = -16; x < 16; x += 1) {
    for (let z = -16; z < 16; z += 1) {
      const ceiling = Math.max(WORLD_MIN_Y + 5, second.getHeight(x, z) - 3);
      for (let y = WORLD_MIN_Y + 3; y < ceiling; y += 1) {
        if ((x + z + y) % 17 === 0) assert.equal(second.getBlock(x, y, z), samples[cursor++]);
      }
    }
  }
});

test("some cave shafts visibly break through the natural surface", () => {
  const world = new VoxelWorld("surface cave survey");
  let opening: { x: number; y: number; z: number } | null = null;
  outer: for (let regionX = -20; regionX <= 20; regionX += 1) {
    for (let regionZ = -20; regionZ <= 20; regionZ += 1) {
      const entrance = surfaceCaveEntranceForRegion(regionX, regionZ, world.seed);
      if (!entrance) continue;
      const x = entrance.x;
      const z = entrance.z;
      const y = world.getHeight(x, z);
      if (
        y > SEA_LEVEL + 7
        && world.getBlock(x, y, z) === BlockId.Air
        && world.getBlock(x, y - 5, z) === BlockId.Air
      ) {
        opening = { x, y, z };
        break outer;
      }
    }
  }
  assert.ok(opening, "the survey should find at least one cave mouth open to the sky");
});

test("directional repeaters delay, restore, and emit only toward their facing side", () => {
  const world = new VoxelWorld("repeater bench");
  world.setBlock(0, 42, 1, BlockId.Toggle);
  world.setBlock(0, 42, 0, BlockId.PulseRepeater);
  world.setBlock(0, 42, -1, BlockId.FluxWire);
  world.setBlock(1, 42, 0, BlockId.FluxWire);
  world.machines.get("0,42,1")!.enabled = true;
  world.machines.get("0,42,0")!.delayTicks = 2;
  const automation = new AutomationSystem();
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("0,42,-1")!.signal, 0);
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("0,42,-1")!.signal, 14);
  assert.equal(world.machines.get("1,42,0")!.signal, 0);
});

test("wire-fed Fluxstone logic powers on and clears cleanly when its source turns off", () => {
  const world = new VoxelWorld("wire-fed repeater bench");
  world.setBlock(0, 42, 0, BlockId.Toggle);
  world.setBlock(1, 42, 0, BlockId.FluxWire);
  world.setBlock(2, 42, 0, BlockId.PulseRepeater);
  world.setBlock(3, 42, 0, BlockId.FluxWire);
  const toggle = world.machines.get("0,42,0")!;
  const repeater = world.machines.get("2,42,0")!;
  repeater.orientation = 1;
  repeater.delayTicks = 1;
  const automation = new AutomationSystem();
  toggle.enabled = true;
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("1,42,0")!.signal, 14);
  assert.equal(repeater.signal, 15);
  assert.equal(world.machines.get("3,42,0")!.signal, 14);
  toggle.enabled = false;
  automation.tick(world, [], 0.5);
  assert.equal(world.machines.get("1,42,0")!.signal, 0);
  assert.equal(repeater.signal, 0);
  assert.equal(world.machines.get("3,42,0")!.signal, 0);
});

test("dispensers fire projectiles and droppers eject exactly once per rising signal", () => {
  const world = new VoxelWorld("dispenser bench");
  world.setBlock(0, 42, 0, BlockId.Toggle);
  world.setBlock(1, 42, 0, BlockId.Dispenser);
  const toggle = world.machines.get("0,42,0")!;
  const dispenser = world.machines.get("1,42,0")!;
  dispenser.storage["ammo:aether-bolt"] = 2;
  dispenser.storageSlots![0] = "ammo:aether-bolt";
  toggle.enabled = true;
  const automation = new AutomationSystem();
  automation.tick(world, [], 0.5);
  assert.equal(world.projectiles.length, 1);
  assert.equal(dispenser.storage["ammo:aether-bolt"], 1);
  automation.tick(world, [], 0.5);
  assert.equal(world.projectiles.length, 1, "a held-high signal must not repeatedly fire");
  toggle.enabled = false;
  automation.tick(world, [], 0.5);
  toggle.enabled = true;
  automation.tick(world, [], 0.5);
  assert.equal(world.projectiles.length, 2);
  assert.equal(dispenser.storage["ammo:aether-bolt"] ?? 0, 0);

  world.setBlock(5, 42, 0, BlockId.Toggle);
  world.setBlock(5, 42, -1, BlockId.Dropper);
  const dropper = world.machines.get("5,42,-1")!;
  dropper.storage["tool:rough-pick"] = 1;
  dropper.durability = { "tool:rough-pick": [23] };
  dropper.storageSlots![0] = "tool:rough-pick";
  world.machines.get("5,42,0")!.enabled = true;
  automation.tick(world, [], 0.5);
  const damagedDrop = world.drops.find((drop) => drop.item === "tool:rough-pick");
  assert.deepEqual(damagedDrop?.durability, [23]);
  assert.equal(dropper.storage["tool:rough-pick"] ?? 0, 0);
});

test("rams push block lines and collector funnels transfer physical drops", () => {
  const world = new VoxelWorld("logistics bench");
  for (let x = -1; x <= 6; x += 1) {
    for (let z = -4; z <= 1; z += 1) {
      world.setBlock(x, 42, z, BlockId.Air);
      world.setBlock(x, 43, z, BlockId.Air);
    }
  }
  world.setBlock(0, 42, 0, BlockId.Ram);
  world.setBlock(1, 42, 0, BlockId.Toggle);
  world.setBlock(0, 42, -1, BlockId.Stone);
  world.setBlock(0, 42, -2, BlockId.Limestone);
  world.machines.get("1,42,0")!.enabled = true;
  const automation = new AutomationSystem();
  automation.tick(world, [], 0.5);
  assert.equal(world.getBlock(0, 42, -1), BlockId.Air);
  assert.equal(world.getBlock(0, 42, -2), BlockId.Stone);
  assert.equal(world.getBlock(0, 42, -3), BlockId.Limestone);

  world.setBlock(5, 42, 0, BlockId.Hopper);
  world.setBlock(5, 42, -1, BlockId.Crate);
  world.drops.push({
    id: "physical-damaged-tool-drop",
    item: "tool:rough-pick",
    count: 1,
    durability: [29],
    position: { x: 5.5, y: 42.7, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
  });
  automation.tick(world, [], 0.5);
  assert.equal(world.drops.length, 0);
  assert.equal(world.machines.get("5,42,-1")!.storage["tool:rough-pick"], 1);
  assert.deepEqual(world.machines.get("5,42,-1")!.durability?.["tool:rough-pick"], [29]);
});

test("the generic wooden tool tier accepts every native plank family", () => {
  const woodenTools = ["wood-pick", "wood-hatchet", "wood-spade", "wood-club"];
  for (const id of woodenTools) {
    const recipe = RECIPES.find((candidate) => candidate.id === id)!;
    assert.ok(recipe, `missing recipe ${id}`);
    for (const planks of [BlockId.EmberwoodPlanks, BlockId.FrostpinePlanks, BlockId.RiftwoodPlanks]) {
      const count = id === "wood-spade" || id === "wood-club" ? 2 : 3;
      assert.ok(matchingRecipeInputs(recipe, { [itemForBlock(planks)]: count }), `${id} rejected ${BLOCKS[planks].name}`);
    }
  }
  assert.ok(RECIPES.find((recipe) => recipe.id === "rough-pick")!.inputs[itemForBlock(BlockId.Stone)] > 0);
});

test("surface buoyancy and shore assist let a swimmer leave deep water without jumping", () => {
  const world = new VoxelWorld("shore exit bench");
  prepareArena(world, -4, 7, -3, 3, 39, 5);
  for (let x = -4; x <= 7; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      if (x < 2) {
        world.setBlock(x, 40, z, BlockId.Water);
        world.setBlock(x, 41, z, BlockId.Water);
      } else {
        world.setBlock(x, 40, z, BlockId.Stone);
        world.setBlock(x, 41, z, BlockId.Stone);
      }
    }
  }
  const swimmer = new PlayerPhysics({ x: 0.5, y: 40.1, z: 0.5 });
  swimmer.yaw = -Math.PI / 2;
  const input: InputFrame = {
    forward: 1, strafe: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
    crouch: false, mine: false, place: false, interact: false,
  };
  let reachedBank = false;
  for (let frame = 0; frame < 90; frame += 1) {
    swimmer.update(1 / 30, input, world);
    if (swimmer.position.x > 2.4 && swimmer.position.y >= 41.99 && !swimmer.swimming) reachedBank = true;
  }
  assert.ok(swimmer.position.x > 3, `swimmer remained caught at the shoreline; x=${swimmer.position.x}`);
  assert.ok(reachedBank, "swimmer never rose onto the bank");
  assert.equal(swimmer.swimming, false);
});

test("creatures traverse one-block rises with a continuous jump arc", () => {
  const world = new VoxelWorld("creature jump bench");
  prepareArena(world, -2, 8, -2, 2);
  world.setBlock(2, 41, 0, BlockId.Stone);
  const mob: MobState = {
    id: "jumping-grazer",
    kind: "glowgrazer",
    position: { x: 0.5, y: 41.01, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 28,
    yaw: -Math.PI / 2,
    targetTimer: 1,
  };
  let peak = mob.position.y;
  const samples: number[] = [];
  for (let frame = 0; frame < 120; frame += 1) {
    moveMobWithCollision(world, mob, 1 / 30, 2, 0);
    peak = Math.max(peak, mob.position.y);
    samples.push(mob.position.y);
  }
  assert.ok(mob.position.x > 3, `creature failed to clear the rise; x=${mob.position.x}`);
  assert.ok(peak > 42.05, `jump arc was too low; peak=${peak}`);
  assert.ok(samples.some((height) => height > 41.2 && height < 41.8), "jump should contain intermediate heights rather than teleporting");
  assert.equal(mobIntersectsSolid(world, mob), false);
});

test("caves contain rare clustered veins while stone and deep slate dominate", () => {
  const world = new VoxelWorld("v4 ore survey");
  const found = new Set<BlockId>();
  const ores = [BlockId.CoalOre, BlockId.IronOre, BlockId.GoldOre, BlockId.FluxstoneOre, BlockId.DiamondOre];
  let oreCount = 0;
  let rockCount = 0;
  let solidCount = 0;
  const veinNeighbors = new Set<BlockId>();
  for (let x = -16; x <= 16; x += 1) {
    for (let z = -16; z <= 16; z += 1) {
      const ceiling = world.getHeight(x, z) - 3;
      for (let y = WORLD_MIN_Y + 2; y < ceiling; y += 1) {
        const id = world.getBlock(x, y, z);
        if (id !== BlockId.Air && id !== BlockId.Water) solidCount += 1;
        if (id === BlockId.Stone || id === BlockId.Slate) rockCount += 1;
        if (ores.includes(id)) {
          found.add(id);
          oreCount += 1;
          if ([[1, 0, 0], [0, 1, 0], [0, 0, 1]].some(([dx, dy, dz]) => world.getBlock(x + dx, y + dy, z + dz) === id)) veinNeighbors.add(id);
        }
      }
    }
  }
  for (const ore of ores) assert.ok(found.has(ore), `missing ${BLOCKS[ore].name} in cave survey`);
  assert.ok(oreCount / solidCount < 0.05, `ore abundance is too high: ${((oreCount / solidCount) * 100).toFixed(2)}%`);
  assert.ok(rockCount / solidCount > 0.72, "stone and deep slate should overwhelmingly dominate underground rock");
  assert.ok(veinNeighbors.size >= 4, "ores should usually occur in connected veins rather than isolated sprinkles");
});

test("a Hearth Furnace consumes coal and smelts raw ore into ingots", () => {
  const world = new VoxelWorld("hearth furnace bench");
  world.setBlock(0, 42, 0, BlockId.HearthFurnace);
  const state = world.machines.get("0,42,0")!;
  state.storage["part:coal"] = 1;
  state.storage[itemForBlock(BlockId.IronOre)] = 1;
  ensureFurnaceSlots(state);
  assert.equal(furnaceSlotItem(state, "input"), itemForBlock(BlockId.IronOre));
  assert.equal(furnaceSlotItem(state, "fuel"), "part:coal");
  const automation = new AutomationSystem();
  const events = [];
  for (let tick = 0; tick < 22; tick += 1) events.push(...automation.tick(world, [], 0.5));
  assert.equal(state.storage["part:coal"] ?? 0, 0);
  assert.equal(state.storage[itemForBlock(BlockId.IronOre)] ?? 0, 0);
  assert.equal(state.storage["part:iron-ingot"], 1);
  assert.equal(furnaceSlotItem(state, "output"), "part:iron-ingot");
  assert.ok(events.some((event) => event.type === "smelted" && event.item === "part:iron-ingot"));
  const output = withdrawFurnaceItem(state, "output", 1);
  assert.deepEqual(output, { item: "part:iron-ingot", count: 1 });
  assert.equal(depositFurnaceItem(state, "fuel", itemForBlock(BlockId.Stone), 1), false);
});

test("villages generate deterministically with homes, markets, and resident Wayfarers", () => {
  const first = new VoxelWorld("v4 survey");
  let village: { cx: number; cz: number } | null = null;
  for (let cx = -24; cx <= 24 && !village; cx += 1) {
    for (let cz = -24; cz <= 24 && !village; cz += 1) {
      if (!isVillageChunk(cx, cz, first.seed)) continue;
      if (first.getChunk(cx, cz).blocks.includes(BlockId.TradePost)) village = { cx, cz };
    }
  }
  assert.ok(village, "expected a valid village in the survey area");
  const villageWayfarers = first.mobs.filter((mob) => mob.kind === "wayfarer" && mob.id.startsWith(`wayfarer-${village.cx}-${village.cz}`));
  const plan = createVillagePlan(village.cx, village.cz, first.seed);
  assert.equal(villageWayfarers.length, plan.professions.length);
  assert.ok(villageWayfarers.length >= 5 && villageWayfarers.length <= 10);
  assert.ok(villageWayfarers.every((mob) => mob.home && mob.activity));
  const second = new VoxelWorld("v4 survey");
  assert.ok(second.getChunk(village.cx, village.cz).blocks.includes(BlockId.TradePost));
  assert.equal(createVillagePlan(village.cx, village.cz, second.seed).signature, plan.signature);
});

test("village plans vary in layout, buildings, and population", () => {
  const world = new VoxelWorld("village diversity survey");
  const signatures = new Set<string>();
  const buildingCounts = new Set<number>();
  const populations = new Set<number>();
  for (let cx = -48; cx <= 48; cx += 1) {
    for (let cz = -48; cz <= 48; cz += 1) {
      if (!isVillageChunk(cx, cz, world.seed)) continue;
      const plan = createVillagePlan(cx, cz, world.seed);
      signatures.add(plan.signature);
      buildingCounts.add(plan.buildings.length);
      populations.add(plan.professions.length);
    }
  }
  assert.ok(signatures.size >= 12, `only ${signatures.size} distinct village plans were produced`);
  assert.ok(buildingCounts.size >= 4, "village building counts should vary substantially");
  assert.ok(populations.size >= 3, "village populations should not be fixed");
});

test("village candidates are spaced and substantially rarer than Version 4 chunk rolls", () => {
  const world = new VoxelWorld("village spacing survey");
  let candidates = 0;
  const regionCounts = new Map<string, number>();
  for (let cx = -40; cx <= 40; cx += 1) {
    for (let cz = -40; cz <= 40; cz += 1) {
      if (!isVillageChunk(cx, cz, world.seed)) continue;
      candidates += 1;
      const key = `${Math.floor(cx / 8)},${Math.floor(cz / 8)}`;
      regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1);
    }
  }
  const rate = candidates / (81 * 81);
  assert.ok(rate > 0.008 && rate < 0.018, `village candidate rate drifted to ${(rate * 100).toFixed(2)}%`);
  assert.ok(Array.from(regionCounts.values()).every((count) => count === 1), "each generation region should have at most one village candidate");
});

test("the Emberdeep is a distinct deterministic dimension with original terrain", () => {
  const world = new VoxelWorld("rift survey");
  assert.equal(world.getBiome(EMBERDEEP_OFFSET, 0), "The Emberdeep");
  const surface = world.getHeight(EMBERDEEP_OFFSET, 0);
  assert.equal(world.getBlock(EMBERDEEP_OFFSET, surface, 0), BlockId.AshSoil);
  assert.ok([BlockId.Emberrock, BlockId.Gravel].includes(world.getBlock(EMBERDEEP_OFFSET, Math.max(2, surface - 2), 0)));
  assert.equal(BLOCKS[BlockId.RiftGate].shape, "portal");
  assert.ok(RECIPES.some((recipe) => recipe.id === "rift-gate"));
  assert.ok(RECIPES.some((recipe) => recipe.id === "frontier-bed"));
});
