import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { AutomationSystem } from "../app/game/automation";
import { ALL_ITEMS, BLOCKS, RECIPES, itemForBlock } from "../app/game/blocks";
import { CRITICAL_DAMAGE_MULTIPLIER, isCriticalHit, weaponStats } from "../app/game/combat";
import { itemSalePoints } from "../app/game/economy";
import {
  HOTBAR_START,
  INVENTORY_SLOT_COUNT,
  createInventoryLayout,
  hotbarFromLayout,
  moveInventorySlot,
  shiftInventorySlot,
} from "../app/game/inventory";
import { MOB_DEFINITIONS, mobIntersectsSolid, mobWaterImmersion, moveMobWithCollision, resolveMobPenetration } from "../app/game/mobs";
import { generateRoomCode, normalizeRoomCode } from "../app/game/network";
import { PlayerPhysics } from "../app/game/physics";
import { voxelRaycast } from "../app/game/raycast";
import { decodeWorldKey, encodeWorldKey } from "../app/game/save";
import { BlockId, CHUNK_SIZE, InputFrame, MobState, SAVE_VERSION, WORLD_GENERATION_VERSION, WORLD_MAX_Y, WORLD_MIN_Y, WorldSave } from "../app/game/types";
import { EMBERDEEP_OFFSET, isVillageChunk, VoxelWorld } from "../app/game/world";

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

test("terrain mixes broad lowlands, rolling hills, and rare tall mountains", () => {
  const world = new VoxelWorld("Copper Skies");
  const heights: number[] = [];
  for (let x = -512; x <= 512; x += 8) {
    for (let z = -512; z <= 512; z += 8) heights.push(world.getHeight(x, z));
  }
  const tall = heights.filter((height) => height >= 200).length / heights.length;
  const hilly = heights.filter((height) => height >= 120).length / heights.length;
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 240, "terrain should span lowlands through dramatic summits");
  assert.ok(hilly > 0.2 && hilly < 0.5, `rolling terrain balance drifted to ${(hilly * 100).toFixed(1)}%`);
  assert.ok(tall > 0.03 && tall < 0.15, `mountain balance drifted to ${(tall * 100).toFixed(1)}%`);
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

test("the 36-slot inventory keeps items unique and supports drag and shift transfer", () => {
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
      inventory: { [itemForBlock(BlockId.CopperOre)]: 12 },
      hotbar: ["tool:rough-pick"],
      selectedSlot: 0,
    },
    timeOfDay: 0.72,
    dayCount: 4,
    mutations: [[2, 22, 3, BlockId.FluxWire]],
    machines: [],
    drops: [],
    mobs: [],
  };
  const key = encodeWorldKey(save);
  assert.ok(key.startsWith("VF1."));
  assert.deepEqual(decodeWorldKey(key), save);
  const legacySave = { ...save };
  delete legacySave.generation;
  delete legacySave.mode;
  delete legacySave.dayCount;
  const migrated = decodeWorldKey(encodeWorldKey(legacySave));
  assert.equal(migrated.generation, WORLD_GENERATION_VERSION);
  assert.equal(migrated.player.position.y, legacySave.player.position.y + 46);
  assert.equal(migrated.mutations[0][1], legacySave.mutations[0][1] + 46);
  const parts = key.split(".");
  const damaged = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.throws(() => decodeWorldKey(damaged), /damaged|integrity/i);
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

test("automatic multiplayer uses normalized human-readable room codes", () => {
  assert.equal(normalizeRoomCode(" ember otter 4827 "), "EMBER-OTTER-4827");
  assert.match(generateRoomCode(), /^[A-Z]+-[A-Z]+-\d{4}$/);
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
    id: "physical-stone-drop",
    item: itemForBlock(BlockId.Stone),
    count: 1,
    position: { x: 5.5, y: 42.7, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
  });
  automation.tick(world, [], 0.5);
  assert.equal(world.drops.length, 0);
  assert.equal(world.machines.get("5,42,-1")!.storage[itemForBlock(BlockId.Stone)], 1);
});

test("the Emberwood tool tier establishes early survival progression", () => {
  const woodenTools = ["wood-pick", "wood-hatchet", "wood-spade", "wood-club"];
  for (const id of woodenTools) assert.ok(RECIPES.some((recipe) => recipe.id === id), `missing recipe ${id}`);
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
  const automation = new AutomationSystem();
  const events = [];
  for (let tick = 0; tick < 22; tick += 1) events.push(...automation.tick(world, [], 0.5));
  assert.equal(state.storage["part:coal"] ?? 0, 0);
  assert.equal(state.storage[itemForBlock(BlockId.IronOre)] ?? 0, 0);
  assert.equal(state.storage["part:iron-ingot"], 1);
  assert.ok(events.some((event) => event.type === "smelted" && event.item === "part:iron-ingot"));
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
  assert.equal(villageWayfarers.length, 4);
  assert.deepEqual(new Set(villageWayfarers.map((mob) => mob.profession)), new Set(["farmer", "blacksmith", "builder", "riftwright"]));
  assert.ok(villageWayfarers.every((mob) => mob.home && mob.activity));
  const second = new VoxelWorld("v4 survey");
  assert.ok(second.getChunk(village.cx, village.cz).blocks.includes(BlockId.TradePost));
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
