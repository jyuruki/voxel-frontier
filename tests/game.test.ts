import assert from "node:assert/strict";
import test from "node:test";
import { AutomationSystem } from "../app/game/automation";
import { itemForBlock } from "../app/game/blocks";
import { weaponStats } from "../app/game/combat";
import { mobIntersectsSolid, moveMobWithCollision, resolveMobPenetration } from "../app/game/mobs";
import { PlayerPhysics } from "../app/game/physics";
import { decodeWorldKey, encodeWorldKey } from "../app/game/save";
import { BlockId, CHUNK_SIZE, InputFrame, MobState, SAVE_VERSION, WorldSave } from "../app/game/types";
import { VoxelWorld } from "../app/game/world";

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

test("player collision stops cleanly at walls without high-speed tunneling", () => {
  const world = new VoxelWorld("collision bench");
  for (let x = -2; x <= 4; x += 1) {
    for (let z = -2; z <= 2; z += 1) world.setBlock(x, 40, z, BlockId.Stone);
  }
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
  delete legacySave.mode;
  delete legacySave.dayCount;
  assert.deepEqual(decodeWorldKey(encodeWorldKey(legacySave)), legacySave, "v1 keys without Stage 2 fields remain compatible");
  const parts = key.split(".");
  const damaged = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.throws(() => decodeWorldKey(damaged), /damaged|integrity/i);
});

test("mobile auto-jump clears a full one-block rise", () => {
  const world = new VoxelWorld("auto jump bench");
  for (let x = -2; x <= 5; x += 1) {
    for (let z = -2; z <= 2; z += 1) world.setBlock(x, 40, z, BlockId.Stone);
  }
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
  for (let x = -2; x <= 5; x += 1) {
    for (let z = -2; z <= 2; z += 1) world.setBlock(x, 40, z, BlockId.Stone);
  }
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

test("Wayfarer ruins generate deterministically with an interactable Relic Cache", () => {
  const first = new VoxelWorld("ruin survey");
  let cache: { x: number; y: number; z: number } | null = null;
  for (let cx = -6; cx <= 6 && !cache; cx += 1) {
    for (let cz = -6; cz <= 6 && !cache; cz += 1) {
      const blocks = first.getChunk(cx, cz).blocks;
      const index = blocks.indexOf(BlockId.RelicCache);
      if (index < 0) continue;
      const layer = CHUNK_SIZE * CHUNK_SIZE;
      const y = Math.floor(index / layer);
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
