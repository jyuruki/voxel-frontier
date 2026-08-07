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
};

export interface AutomationEvent {
  type: "mined" | "smelted" | "crafted" | "pushed" | "pulled" | "fuel" | "note";
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

function directionalOutputTarget(
  world: VoxelWorld,
  key: string,
  id: BlockId,
  state: MachineState,
): string | null {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  if (id === BlockId.PulseRepeater || id === BlockId.FluxComparator) {
    return worldKey(x + facing.x, y, z + facing.z);
  }
  if (id === BlockId.Observer) {
    return worldKey(x - facing.x, y, z - facing.z);
  }
  return null;
}

function emittedSignal(world: VoxelWorld, sourceKey: string, targetKey: string): number {
  const state = world.machines.get(sourceKey);
  if (!state) return 0;
  const [x, y, z] = parseWorldKey(sourceKey);
  const id = world.getBlock(x, y, z);
  const directional = directionalOutputTarget(world, sourceKey, id, state);
  return directional && directional !== targetKey ? 0 : state.signal;
}

function maxAdjacentSignal(world: VoxelWorld, key: string): number {
  let maximum = 0;
  for (const neighbor of adjacentKeys(key)) {
    maximum = Math.max(maximum, emittedSignal(world, neighbor, key));
  }
  return maximum;
}

function activeAdjacentSignals(world: VoxelWorld, key: string): number {
  return adjacentKeys(key).filter((neighbor) => emittedSignal(world, neighbor, key) > 0).length;
}

function rearKey(key: string, state: MachineState): string {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  return worldKey(x - facing.x, y, z - facing.z);
}

function sideKeys(key: string, state: MachineState): [string, string] {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  return [
    worldKey(x + facing.z, y, z - facing.x),
    worldKey(x - facing.z, y, z + facing.x),
  ];
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

function daylightOutput(timeOfDay: number): number {
  const daylight = Math.sin(((timeOfDay - 0.2) / 0.56) * Math.PI);
  return Math.max(0, Math.min(15, Math.round(daylight * 15)));
}

function entityOnPlate(world: VoxelWorld, position: Vec3Data, players: Vec3Data[]): boolean {
  const near = (entity: Vec3Data) =>
    Math.abs(entity.x - (position.x + 0.5)) < 0.72 &&
    Math.abs(entity.z - (position.z + 0.5)) < 0.72 &&
    entity.y >= position.y - 0.15 &&
    entity.y <= position.y + 1.35;
  return players.some(near) || world.mobs.some((mob) => near(mob.position)) || world.drops.some((drop) => near(drop.position));
}

function analogAt(world: VoxelWorld, key: string): number {
  const state = world.machines.get(key);
  if (!state) return 0;
  const stored = Object.values(state.storage).reduce((sum, count) => sum + count, 0);
  return Math.max(state.signal, Math.min(15, Math.ceil(stored / 4)));
}

function updatePrimarySources(world: VoxelWorld, players: Vec3Data[], timeOfDay: number): void {
  for (const [key, state] of world.machines) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (id === BlockId.FluxWire) state.signal = 0;
    else if (id === BlockId.Toggle) state.signal = state.enabled ? 15 : 0;
    else if (id === BlockId.PulseButton || id === BlockId.TargetBlock) {
      state.signal = (state.pulseTicks ?? 0) > 0 ? 15 : 0;
      state.pulseTicks = Math.max(0, (state.pulseTicks ?? 0) - 1);
    } else if (id === BlockId.ProximitySensor) {
      state.signal = sensorOutput(state, { x, y, z }, players, timeOfDay);
    } else if (id === BlockId.PressurePlate) {
      state.signal = entityOnPlate(world, { x, y, z }, players) ? 15 : 0;
    } else if (id === BlockId.DaylightSensor) {
      state.signal = daylightOutput(timeOfDay);
    }
  }
}

function updateLogic(world: VoxelWorld): void {
  for (const [key, state] of world.machines) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (id === BlockId.AndGate) {
      state.signal = activeAdjacentSignals(world, key) >= 2 ? 15 : 0;
    } else if (id === BlockId.OrGate) {
      state.signal = activeAdjacentSignals(world, key) >= 1 ? 15 : 0;
    } else if (id === BlockId.NotGate) {
      state.signal = activeAdjacentSignals(world, key) === 0 ? 15 : 0;
    } else if (id === BlockId.DelayGate) {
      const active = activeAdjacentSignals(world, key) > 0;
      state.delay = active ? Math.min(4, state.delay + 1) : 0;
      state.signal = state.delay >= 4 ? 15 : 0;
    } else if (id === BlockId.PulseRepeater) {
      const input = emittedSignal(world, rearKey(key, state), key);
      const targetDelay = Math.max(1, Math.min(4, state.delayTicks ?? 2));
      state.delay = input > 0 ? Math.min(targetDelay, state.delay + 1) : 0;
      state.signal = state.delay >= targetDelay ? 15 : 0;
    } else if (id === BlockId.FluxComparator) {
      const rear = analogAt(world, rearKey(key, state));
      const sides = sideKeys(key, state).map((side) => emittedSignal(world, side, key));
      const side = Math.max(...sides);
      state.signal = state.mode === "subtract"
        ? Math.max(0, rear - side)
        : rear >= side
          ? rear
          : 0;
    } else if (id === BlockId.InverterTorch) {
      state.signal = emittedSignal(world, rearKey(key, state), key) > 0 ? 0 : 15;
    } else if (id === BlockId.Observer) {
      const facing = FACING[state.orientation];
      const observed = world.getBlock(x + facing.x, y, z + facing.z);
      if (state.observedBlock !== undefined && observed !== state.observedBlock) state.pulseTicks = 2;
      state.observedBlock = observed;
      state.signal = (state.pulseTicks ?? 0) > 0 ? 15 : 0;
      state.pulseTicks = Math.max(0, (state.pulseTicks ?? 0) - 1);
    }
  }
}

function propagateWires(world: VoxelWorld): void {
  const queue: Array<[string, number]> = [];
  for (const [key, state] of world.machines) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (state.signal <= 0 || id === BlockId.FluxWire) continue;
    const directional = directionalOutputTarget(world, key, id, state);
    if (directional) {
      const [dx, dy, dz] = parseWorldKey(directional);
      if (world.machines.has(directional) && world.getBlock(dx, dy, dz) === BlockId.FluxWire) {
        const wire = world.machines.get(directional)!;
        const strength = Math.max(0, state.signal - 1);
        if (wire.signal < strength) {
          wire.signal = strength;
          queue.push([directional, strength]);
        }
      }
    } else queue.push([key, state.signal]);
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
}

function updateSignalConsumers(world: VoxelWorld, events: AutomationEvent[]): void {
  const logicIds = new Set<BlockId>([
    BlockId.FluxWire, BlockId.Toggle, BlockId.ProximitySensor, BlockId.AndGate,
    BlockId.OrGate, BlockId.NotGate, BlockId.DelayGate, BlockId.PulseRepeater,
    BlockId.FluxComparator, BlockId.InverterTorch, BlockId.Observer,
    BlockId.PulseButton, BlockId.PressurePlate, BlockId.DaylightSensor, BlockId.TargetBlock,
  ]);
  for (const [key, state] of world.machines) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (logicIds.has(id)) continue;
    const input = maxAdjacentSignal(world, key);
    if (id === BlockId.LatchLamp) {
      if (input > 0 && (state.lastInput ?? 0) === 0) state.enabled = !state.enabled;
      state.lastInput = input;
      state.signal = state.enabled ? 15 : 0;
    } else {
      state.signal = input;
      if (id === BlockId.NoteEmitter && input > 0 && (state.lastInput ?? 0) === 0) {
        events.push({ type: "note", position: { x, y, z } });
      }
      state.lastInput = input;
    }
  }
}

function propagateSignals(
  world: VoxelWorld,
  players: Vec3Data[],
  timeOfDay: number,
  events: AutomationEvent[],
): void {
  updatePrimarySources(world, players, timeOfDay);
  updateLogic(world);
  propagateWires(world);
  updateSignalConsumers(world, events);
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
    pickupDelay: 0.28,
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

function runFurnace(state: MachineState, position: Vec3Data, events: AutomationEvent[]): void {
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

function runFabricator(state: MachineState, position: Vec3Data, events: AutomationEvent[]): void {
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
  if (!state.enabled) return;
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  const outputKey = worldKey(x + facing.x, y, z + facing.z);
  const output = world.machines.get(outputKey);
  for (let index = world.drops.length - 1; index >= 0; index -= 1) {
    const drop = world.drops[index];
    if (Math.hypot(drop.position.x - (x + 0.5), drop.position.y - (y + 0.65), drop.position.z - (z + 0.5)) < 1.2) {
      addItem(state.storage, drop.item, drop.count);
      world.drops.splice(index, 1);
    }
  }
  if (!output) return;
  const entry = Object.entries(state.storage).find(([, count]) => count > 0);
  if (!entry) return;
  const [item] = entry as [ItemId, number];
  addItem(state.storage, item, -1);
  addItem(output.storage, item, 1);
}

function movable(id: BlockId): boolean {
  return id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Bedrock && id !== BlockId.RelicCache;
}

function cloneMachine(state: MachineState | undefined): MachineState | undefined {
  return state ? { ...state, storage: { ...state.storage } } : undefined;
}

function pushLine(world: VoxelWorld, key: string, state: MachineState): boolean {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  const line: Array<{ x: number; y: number; z: number; id: BlockId; state?: MachineState }> = [];
  for (let distance = 1; distance <= 7; distance += 1) {
    const position = { x: x + facing.x * distance, y, z: z + facing.z * distance };
    const id = world.getBlock(position.x, position.y, position.z);
    if (id === BlockId.Air || id === BlockId.Water) {
      for (let index = line.length - 1; index >= 0; index -= 1) {
        const source = line[index];
        const destination = {
          x: source.x + facing.x,
          y: source.y,
          z: source.z + facing.z,
        };
        world.setBlock(destination.x, destination.y, destination.z, source.id);
        if (source.state) world.machines.set(worldKey(destination.x, destination.y, destination.z), source.state);
      }
      if (line.length > 0) world.setBlock(line[0].x, line[0].y, line[0].z, BlockId.Air);
      return true;
    }
    if (!movable(id) || distance > 6) return false;
    line.push({
      ...position,
      id,
      state: cloneMachine(world.machines.get(worldKey(position.x, position.y, position.z))),
    });
  }
  return false;
}

function pullBlock(world: VoxelWorld, key: string, state: MachineState): boolean {
  const [x, y, z] = parseWorldKey(key);
  const facing = FACING[state.orientation];
  const front = { x: x + facing.x, y, z: z + facing.z };
  const source = { x: x + facing.x * 2, y, z: z + facing.z * 2 };
  const id = world.getBlock(source.x, source.y, source.z);
  if (world.getBlock(front.x, front.y, front.z) !== BlockId.Air || !movable(id)) return false;
  const machine = cloneMachine(world.machines.get(worldKey(source.x, source.y, source.z)));
  world.setBlock(front.x, front.y, front.z, id);
  if (machine) world.machines.set(worldKey(front.x, front.y, front.z), machine);
  world.setBlock(source.x, source.y, source.z, BlockId.Air);
  return true;
}

function runPistons(world: VoxelWorld, events: AutomationEvent[]): void {
  for (const [key, state] of Array.from(world.machines)) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (id !== BlockId.Ram && id !== BlockId.AdhesiveRam) continue;
    const powered = state.signal > 0 && state.enabled;
    if (powered && !state.extended) {
      if (pushLine(world, key, state)) {
        state.extended = true;
        events.push({ type: "pushed", position: { x, y, z } });
      }
    } else if (!powered && state.extended) {
      state.extended = false;
      if (id === BlockId.AdhesiveRam && pullBlock(world, key, state)) {
        events.push({ type: "pulled", position: { x, y, z } });
      }
    }
  }
}

function runUnpoweredDevices(world: VoxelWorld, events: AutomationEvent[]): void {
  for (const [key, state] of Array.from(world.machines)) {
    const [x, y, z] = parseWorldKey(key);
    const id = world.getBlock(x, y, z);
    if (id === BlockId.Hopper) runHopper(world, key, state);
  }
  runPistons(world, events);
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
}

function distributeEnergy(world: VoxelWorld, component: string[], events: AutomationEvent[]): void {
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
    propagateSignals(world, players, timeOfDay, events);
    runUnpoweredDevices(world, events);
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
