import { BLOCKS, itemForBlock } from "./blocks";
import { BlockId, DroppedItemState, ItemId, MachineState, Vec3Data } from "./types";
import { parseWorldKey, worldKey } from "./prng";
import { VoxelWorld } from "./world";

const NEIGHBORS: Vec3Data[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

export const FACING: Vec3Data[] = [
  { x: 0, y: 0, z: -1 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 },
];

const MACHINE_COST: Partial<Record<BlockId, number>> = {
  [BlockId.FluxLamp]: 1,
  [BlockId.BoreDrill]: 12,
  [BlockId.Conveyor]: 2,
  [BlockId.ArcFurnace]: 10,
  [BlockId.Fabricator]: 15,
  [BlockId.Ram]: 8,
  [BlockId.Hopper]: 2,
};

export interface AutomationEvent {
  type: "mined" | "smelted" | "crafted" | "pushed" | "fuel";
  position: Vec3Data;
  item?: ItemId;
}

const itemCount = (storage: Record<string, number>, item: ItemId): number =>
  storage[item] ?? 0;

function addItem(storage: Record<string, number>, item: ItemId, count: number): void {
  storage[item] = Math.max(0, (storage[item] ?? 0) + count);
  if (storage[item] === 0) delete storage[item];
}

function adjacentKeys(key: string): string[] {
  const [x, y, z] = parseWorldKey(key);
  return NEIGHBORS.map((offset) => worldKey(x + offset.x, y + offset.y, z + offset.z));
}

function maxAdjacentSignal(world: VoxelWorld, key: string): number {
  let maximum = 0;
  for (const neighbor of adjacentKeys(key)) {
    maximum = Math.max(maximum, world.machines.get(neighbor)?.signal ?? 0);
  }
  return maximum;
}

function activeAdjacentSignals(world: VoxelWorld, key: string): number {
  return adjacentKeys(key).filter((neighbor) => (world.machines.get(neighbor)?.signal ?? 0) > 0).length;
}

function sensorOutput(
  state: MachineState,
  position: Vec3Data,
  players: Vec3Data[],
  timeOfDay: number,
): number {
  if (state.mode === "day") return timeOfDay > 0.2 && timeOfDay < 0.76 ? 15 : 0;
  if (state.mode === "night") return timeOfDay <= 0.2 || timeOfDay >= 0.76 ? 15 : 0;
  return players.some((player) =>
    Math.hypot(player.x - position.x, player.y - position.y, player.z - position.z) < 5.5,
  ) ? 15 : 0;
}

function propagateSignals(world: VoxelWorld, players: Vec3Data[], timeOfDay: number): void {
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = new Map<string, number>();
    for (const [key, state] of world.machines) previous.set(key, state.signal);

    for (const [key, state] of world.machines) {
      const [x, y, z] = parseWorldKey(key);
      const id = world.getBlock(x, y, z);
      state.signal = 0;
      if (id === BlockId.Toggle) state.signal = state.enabled ? 15 : 0;
      else if (id === BlockId.ProximitySensor) {
        state.signal = sensorOutput(state, { x, y, z }, players, timeOfDay);
      } else if (id === BlockId.AndGate) {
        const count = adjacentKeys(key).filter((neighbor) => (previous.get(neighbor) ?? 0) > 0).length;
        state.signal = count >= 2 ? 15 : 0;
      } else if (id === BlockId.OrGate) {
        const count = adjacentKeys(key).filter((neighbor) => (previous.get(neighbor) ?? 0) > 0).length;
        state.signal = count >= 1 ? 15 : 0;
      } else if (id === BlockId.NotGate) {
        const count = adjacentKeys(key).filter((neighbor) => (previous.get(neighbor) ?? 0) > 0).length;
        state.signal = count === 0 ? 15 : 0;
      } else if (id === BlockId.DelayGate) {
        const active = adjacentKeys(key).some((neighbor) => (previous.get(neighbor) ?? 0) > 0);
        state.delay = active ? Math.min(4, state.delay + 1) : 0;
        state.signal = state.delay >= 4 ? 15 : 0;
      }
    }

    const queue: Array<[string, number]> = [];
    for (const [key, state] of world.machines) {
      const [x, y, z] = parseWorldKey(key);
      const id = world.getBlock(x, y, z);
      if (state.signal > 0 && id !== BlockId.FluxWire) queue.push([key, state.signal]);
    }
    let cursor = 0;
    while (cursor < queue.length) {
      const [key, strength] = queue[cursor++];
      if (strength <= 1) continue;
      for (const neighbor of adjacentKeys(key)) {
        const state = world.machines.get(neighbor);
        if (!state) continue;
        const [nx, ny, nz] = parseWorldKey(neighbor);
        if (world.getBlock(nx, ny, nz) !== BlockId.FluxWire) continue;
        const nextSignal = strength - 1;
        if (state.signal < nextSignal) {
          state.signal = nextSignal;
          queue.push([neighbor, nextSignal]);
        }
      }
    }

    for (const [key, state] of world.machines) {
      const [x, y, z] = parseWorldKey(key);
      const id = world.getBlock(x, y, z);
      if (
        id !== BlockId.FluxWire &&
        id !== BlockId.Toggle &&
        id !== BlockId.ProximitySensor &&
        id !== BlockId.AndGate &&
        id !== BlockId.OrGate &&
        id !== BlockId.NotGate &&
        id !== BlockId.DelayGate
      ) state.signal = maxAdjacentSignal(world, key);
    }
  }
}

function componentFrom(world: VoxelWorld, start: string, visited: Set<string>): string[] {
  const component: string[] = [];
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const current = queue.shift()!;
    component.push(current);
    for (const neighbor of adjacentKeys(current)) {
      if (!visited.has(neighbor) && world.machines.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return component;
}

function spawnDrop(
  world: VoxelWorld,
  item: ItemId,
  count: number,
  position: Vec3Data,
  velocity: Vec3Data = { x: 0, y: 0.8, z: 0 },
): DroppedItemState {
  const drop: DroppedItemState = {
    id: `drop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    item,
    count,
    position: { ...position },
    velocity: { ...velocity },
  };
  world.drops.push(drop);
  return drop;
}

function runDrill(
  world: VoxelWorld,
  key: string,
  state: MachineState,
  events: AutomationEvent[],
): void {
  state.progress += 1 / 14;
  if (state.progress < 1) return;
  state.progress = 0;
  const [x, y, z] = parseWorldKey(key);
  let targetY = y - 1;
  while (targetY > 0 && world.getBlock(x, targetY, z) === BlockId.Air) targetY -= 1;
  const id = world.getBlock(x, targetY, z);
  if (id === BlockId.Bedrock || id === BlockId.Air || !BLOCKS[id].collectible) return;
  world.setBlock(x, targetY, z, BlockId.Air);
  const facing = FACING[state.orientation];
  spawnDrop(world, itemForBlock(id), 1, {
    x: x + 0.5 + facing.x * 0.72,
    y: y + 0.45,
    z: z + 0.5 + facing.z * 0.72,
  }, { x: facing.x * 0.8, y: 0.6, z: facing.z * 0.8 });
  events.push({ type: "mined", position: { x, y, z }, item: itemForBlock(id) });
}

function runConveyor(world: VoxelWorld, key: string, state: MachineState): void {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  for (const drop of world.drops) {
    if (
      drop.position.x >= x - 0.15 && drop.position.x <= x + 1.15 &&
      drop.position.z >= z - 0.15 && drop.position.z <= z + 1.15 &&
      drop.position.y >= y && drop.position.y <= y + 1.35
    ) {
      drop.velocity.x += facing.x * 0.24;
      drop.velocity.z += facing.z * 0.24;
      drop.velocity.y = Math.max(drop.velocity.y, 0.04);
    }
  }
}

function runFurnace(
  state: MachineState,
  position: Vec3Data,
  events: AutomationEvent[],
): void {
  const ore = itemForBlock(BlockId.CopperOre);
  if (itemCount(state.storage, ore) <= 0) {
    state.progress = 0;
    return;
  }
  state.progress += 1 / 20;
  if (state.progress < 1) return;
  state.progress = 0;
  addItem(state.storage, ore, -1);
  addItem(state.storage, "part:copper-ingot", 1);
  events.push({ type: "smelted", position, item: "part:copper-ingot" });
}

function runFabricator(
  state: MachineState,
  position: Vec3Data,
  events: AutomationEvent[],
): void {
  const recipe = state.recipe ?? "flux-coil";
  const recipes: Record<string, { inputs: Array<[ItemId, number]>; output: ItemId }> = {
    "flux-coil": {
      inputs: [["part:copper-ingot", 2], [itemForBlock(BlockId.AetherCrystal), 1]],
      output: "part:flux-coil",
    },
    "logic-wafer": {
      inputs: [["part:copper-ingot", 1], [itemForBlock(BlockId.AetherCrystal), 2]],
      output: "part:logic-wafer",
    },
    gear: {
      inputs: [["part:copper-ingot", 2], [itemForBlock(BlockId.Stone), 1]],
      output: "part:gear",
    },
  };
  const selected = recipes[recipe] ?? recipes["flux-coil"];
  if (!selected.inputs.every(([item, count]) => itemCount(state.storage, item) >= count)) {
    state.progress = 0;
    return;
  }
  state.progress += 1 / 24;
  if (state.progress < 1) return;
  state.progress = 0;
  for (const [item, count] of selected.inputs) addItem(state.storage, item, -count);
  addItem(state.storage, selected.output, 1);
  events.push({ type: "crafted", position, item: selected.output });
}

function runHopper(world: VoxelWorld, key: string, state: MachineState): void {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  const outputKey = worldKey(x + facing.x, y, z + facing.z);
  const output = world.machines.get(outputKey);
  const storage = output?.storage ?? state.storage;
  for (let index = world.drops.length - 1; index >= 0; index -= 1) {
    const drop = world.drops[index];
    if (Math.hypot(drop.position.x - (x + 0.5), drop.position.y - (y + 0.5), drop.position.z - (z + 0.5)) < 1.45) {
      addItem(storage, drop.item, drop.count);
      world.drops.splice(index, 1);
    }
  }
}

function runRam(
  world: VoxelWorld,
  key: string,
  state: MachineState,
  events: AutomationEvent[],
): void {
  const rising = state.signal > 0 && state.delay === 0;
  state.delay = state.signal > 0 ? 1 : 0;
  if (!rising) return;
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  const front = { x: x + facing.x, y, z: z + facing.z };
  const destination = { x: front.x + facing.x, y, z: front.z + facing.z };
  const id = world.getBlock(front.x, front.y, front.z);
  if (id === BlockId.Air || id === BlockId.Bedrock || world.getBlock(destination.x, destination.y, destination.z) !== BlockId.Air) return;
  world.setBlock(destination.x, destination.y, destination.z, id);
  world.setBlock(front.x, front.y, front.z, BlockId.Air);
  events.push({ type: "pushed", position: { x, y, z } });
}

function runPoweredMachine(
  world: VoxelWorld,
  key: string,
  state: MachineState,
  id: BlockId,
  events: AutomationEvent[],
): void {
  const [x, y, z] = parseWorldKey(key);
  const position = { x, y, z };
  if (id === BlockId.BoreDrill) runDrill(world, key, state, events);
  else if (id === BlockId.Conveyor) runConveyor(world, key, state);
  else if (id === BlockId.ArcFurnace) runFurnace(state, position, events);
  else if (id === BlockId.Fabricator) runFabricator(state, position, events);
  else if (id === BlockId.Hopper) runHopper(world, key, state);
  else if (id === BlockId.Ram) runRam(world, key, state, events);
}

function distributeEnergy(
  world: VoxelWorld,
  component: string[],
  events: AutomationEvent[],
): void {
  let available = 0;
  const consumers: Array<[string, MachineState, BlockId, number]> = [];
  const cells: MachineState[] = [];

  for (const key of component) {
    const state = world.machines.get(key)!;
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (id === BlockId.ThermalGenerator && state.enabled) {
      if (state.progress <= 0 && itemCount(state.storage, itemForBlock(BlockId.CoalOre)) > 0) {
        addItem(state.storage, itemForBlock(BlockId.CoalOre), -1);
        state.progress = 80;
        events.push({ type: "fuel", position: { x, y, z } });
      }
      if (state.progress > 0) {
        state.progress -= 1;
        available += 24;
      }
    } else if (id === BlockId.FluxCell) cells.push(state);
    else {
      const cost = MACHINE_COST[id];
      if (cost && state.enabled && state.signal > 0) consumers.push([key, state, id, cost]);
    }
  }

  const demand = consumers.reduce((sum, [, , , cost]) => sum + cost, 0);
  if (available < demand) {
    let needed = demand - available;
    for (const cell of cells) {
      const discharge = Math.min(needed, cell.energy, 28);
      cell.energy -= discharge;
      available += discharge;
      needed -= discharge;
      if (needed <= 0) break;
    }
  }

  for (const [key, state, id, cost] of consumers) {
    if (available >= cost) {
      available -= cost;
      state.energy = cost;
      runPoweredMachine(world, key, state, id, events);
    } else state.energy = 0;
  }

  for (const cell of cells) {
    if (available <= 0) break;
    const charge = Math.min(available, 1000 - cell.energy, 30);
    cell.energy += charge;
    available -= charge;
  }
}

export class AutomationSystem {
  tick(world: VoxelWorld, players: Vec3Data[], timeOfDay: number): AutomationEvent[] {
    const events: AutomationEvent[] = [];
    propagateSignals(world, players, timeOfDay);
    const visited = new Set<string>();
    for (const key of world.machines.keys()) {
      if (visited.has(key)) continue;
      distributeEnergy(world, componentFrom(world, key, visited), events);
    }
    return events;
  }

  inspect(world: VoxelWorld, key: string): {
    id: BlockId;
    state: MachineState;
    inputs: number;
  } | null {
    const state = world.machines.get(key);
    if (!state) return null;
    const [x, y, z] = parseWorldKey(key);
    return {
      id: world.getBlock(x, y, z),
      state,
      inputs: activeAdjacentSignals(world, key),
    };
  }
}

