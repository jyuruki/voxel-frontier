import * as THREE from "three";
import {
  BLOCKS,
  RECIPES,
  TOOL_POWER,
  blockForItem,
  createOriginalTextureAtlas,
  itemForBlock,
} from "./blocks";
import { AutomationSystem } from "./automation";
import { FrontierAudio } from "./audio";
import { buildChunkGeometries } from "./mesher";
import { NetworkMessage, NetworkSession } from "./network";
import { PlayerPhysics } from "./physics";
import { hashString, parseWorldKey, seededRandom, worldKey } from "./prng";
import { voxelRaycast } from "./raycast";
import { encodeWorldKey, saveLocally } from "./save";
import {
  BlockId,
  CHUNK_SIZE,
  GameSettings,
  HudState,
  InputFrame,
  Inventory,
  ItemId,
  MachineState,
  MobState,
  PlayerSnapshot,
  Recipe,
  SAVE_VERSION,
  WorldSave,
} from "./types";
import { chunkKey, floorDiv, VoxelWorld } from "./world";

export interface MachinePanelData {
  key: string;
  id: BlockId;
  state: MachineState;
  inputs: number;
}

export interface GameEngineCallbacks {
  onHud: (state: HudState) => void;
  onInventory: () => void;
  onPause: () => void;
  onGuide: () => void;
  onMachine: (data: MachinePanelData) => void;
  onToast: (message: string) => void;
}

export interface GameEngineOptions {
  canvas: HTMLCanvasElement;
  seed: string;
  save?: WorldSave | null;
  settings: GameSettings;
  playerName: string;
  network: NetworkSession;
  callbacks: GameEngineCallbacks;
}

interface ChunkMeshSet {
  group: THREE.Group;
  revision: number;
}

const HOTBAR_SIZE = 9;
const AUTOSAVE_SECONDS = 18;

function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

function defaultInventory(): Inventory {
  return {
    "tool:rough-pick": 1,
    "tool:hatchet": 1,
    "tool:spade": 1,
    "tool:blade": 1,
    [itemForBlock(BlockId.EmberwoodPlanks)]: 24,
    [itemForBlock(BlockId.Stone)]: 32,
    [itemForBlock(BlockId.CoalOre)]: 12,
    [itemForBlock(BlockId.CopperOre)]: 4,
    [itemForBlock(BlockId.AetherCrystal)]: 4,
    [itemForBlock(BlockId.FluxWire)]: 32,
    [itemForBlock(BlockId.Toggle)]: 3,
    [itemForBlock(BlockId.FluxLamp)]: 4,
    [itemForBlock(BlockId.ThermalGenerator)]: 1,
    [itemForBlock(BlockId.FluxCell)]: 1,
    [itemForBlock(BlockId.BoreDrill)]: 1,
    [itemForBlock(BlockId.Conveyor)]: 12,
    [itemForBlock(BlockId.ArcFurnace)]: 1,
    [itemForBlock(BlockId.Hopper)]: 1,
    [itemForBlock(BlockId.Crate)]: 2,
    [itemForBlock(BlockId.AndGate)]: 2,
    [itemForBlock(BlockId.OrGate)]: 2,
    [itemForBlock(BlockId.NotGate)]: 2,
    [itemForBlock(BlockId.DelayGate)]: 2,
    [itemForBlock(BlockId.ProximitySensor)]: 1,
    [itemForBlock(BlockId.GlowRod)]: 12,
  };
}

function defaultHotbar(): ItemId[] {
  return [
    "tool:rough-pick",
    itemForBlock(BlockId.Stone),
    itemForBlock(BlockId.FluxWire),
    itemForBlock(BlockId.Toggle),
    itemForBlock(BlockId.ThermalGenerator),
    itemForBlock(BlockId.BoreDrill),
    itemForBlock(BlockId.Conveyor),
    itemForBlock(BlockId.Hopper),
    itemForBlock(BlockId.FluxLamp),
  ];
}

function disposeObject(object: THREE.Object3D, disposeMaterials = false): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (disposeMaterials) {
        const material = child.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    }
  });
}

function itemAvailable(inventory: Inventory, item: ItemId, count = 1): boolean {
  return (inventory[item] ?? 0) >= count;
}

function changeItem(inventory: Inventory, item: ItemId, amount: number): void {
  inventory[item] = Math.max(0, (inventory[item] ?? 0) + amount);
  if (inventory[item] === 0) delete inventory[item];
}

export class GameEngine {
  readonly input: InputFrame = {
    forward: 0,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: false,
    crouch: false,
    mine: false,
    place: false,
    interact: false,
  };

  world: VoxelWorld;
  readonly network: NetworkSession;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly chunkRoot = new THREE.Group();
  private readonly entityRoot = new THREE.Group();
  private readonly indicatorRoot = new THREE.Group();
  private readonly remotePlayerRoot = new THREE.Group();
  private readonly chunks = new Map<string, ChunkMeshSet>();
  private readonly chunkQueue: string[] = [];
  private readonly queuedChunks = new Set<string>();
  private readonly mobMeshes = new Map<string, THREE.Group>();
  private readonly dropMeshes = new Map<string, THREE.Mesh>();
  private readonly remotePlayers = new Map<string, PlayerSnapshot>();
  private readonly remotePlayerMeshes = new Map<string, THREE.Group>();
  private readonly indicatorMeshes = new Map<string, THREE.Mesh>();
  private readonly automation = new AutomationSystem();
  private readonly callbacks: GameEngineCallbacks;
  private readonly playerName: string;
  private readonly audio: FrontierAudio;
  private physics: PlayerPhysics;
  private settings: GameSettings;
  private inventory: Inventory;
  private hotbar: ItemId[];
  private selectedSlot = 0;
  private health = 100;
  private hunger = 100;
  private stamina = 100;
  private timeOfDay = 0.29;
  private paused = false;
  private destroyed = false;
  private frameRequest = 0;
  private previousFrame = performance.now();
  private frameCounter = 0;
  private frameTimer = 0;
  private fps = 60;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private automationTimer = 0;
  private networkTimer = 0;
  private chunkTimer = 0;
  private mobTimer = 0;
  private placeCooldown = 0;
  private interactLatch = false;
  private miningKey = "";
  private miningProgress = 0;
  private mineSoundTimer = 0;
  private stepSoundTimer = 0;
  private objective = "Build a Toggle Relay → Flux Conduit → Flux Lamp circuit.";
  private currentHit: ReturnType<typeof voxelRaycast> = null;
  private readonly selection: THREE.LineSegments;
  private readonly breakOverlay: THREE.LineSegments;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly atlas: THREE.CanvasTexture;
  private readonly solidMaterial: THREE.MeshLambertMaterial;
  private readonly translucentMaterial: THREE.MeshLambertMaterial;
  private readonly liquidMaterial: THREE.MeshLambertMaterial;
  private readonly signalOnMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b46 });
  private readonly signalOffMaterial = new THREE.MeshBasicMaterial({ color: 0x27343b });
  private readonly powerMaterial = new THREE.MeshBasicMaterial({ color: 0x54d7e5 });

  private readonly onResize = () => this.resize();
  private readonly onPointerMove = (event: PointerEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.addLook(event.movementX, event.movementY);
  };
  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) this.input.mine = true;
    if (event.button === 2) this.input.place = true;
    if (document.pointerLockElement !== this.canvas) void this.canvas.requestPointerLock();
    void this.audio.unlock();
  };
  private readonly onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) this.input.mine = false;
    if (event.button === 2) this.input.place = false;
  };
  private readonly onContextMenu = (event: Event) => event.preventDefault();
  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.setSelectedSlot(this.selectedSlot + (event.deltaY > 0 ? 1 : -1));
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat && ["KeyE", "KeyF", "KeyG", "Escape"].includes(event.code)) return;
    if (event.code === "KeyW") this.input.forward = 1;
    if (event.code === "KeyS") this.input.forward = -1;
    if (event.code === "KeyA") this.input.strafe = -1;
    if (event.code === "KeyD") this.input.strafe = 1;
    if (event.code === "Space") this.input.jump = true;
    if (event.code === "ShiftLeft") this.input.sprint = true;
    if (event.code === "ControlLeft" || event.code === "KeyC") this.input.crouch = true;
    if (event.code === "KeyF") this.tapInteract();
    if (event.code === "KeyE") this.callbacks.onInventory();
    if (event.code === "KeyG") this.callbacks.onGuide();
    if (event.code === "KeyR") this.rotateTargetedMachine();
    if (event.code === "Escape") this.callbacks.onPause();
    if (/^Digit[1-9]$/.test(event.code)) this.setSelectedSlot(Number(event.code.slice(5)) - 1);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "KeyW" && this.input.forward > 0) this.input.forward = 0;
    if (event.code === "KeyS" && this.input.forward < 0) this.input.forward = 0;
    if (event.code === "KeyA" && this.input.strafe < 0) this.input.strafe = 0;
    if (event.code === "KeyD" && this.input.strafe > 0) this.input.strafe = 0;
    if (event.code === "Space") this.input.jump = false;
    if (event.code === "ShiftLeft") this.input.sprint = false;
    if (event.code === "ControlLeft" || event.code === "KeyC") this.input.crouch = false;
  };
  private readonly onVisibility = () => {
    if (document.hidden && this.network.role !== "guest") this.saveNow();
  };

  constructor(options: GameEngineOptions) {
    this.canvas = options.canvas;
    this.callbacks = options.callbacks;
    this.settings = { ...options.settings };
    this.playerName = options.playerName || "Traveler";
    this.network = options.network;
    const loaded = options.save ?? null;
    this.world = new VoxelWorld(loaded?.seed ?? options.seed);
    if (loaded) {
      this.world.loadMutations(loaded.mutations);
      for (const [key, state] of loaded.machines) {
        this.world.machines.set(key, { ...state, storage: cloneInventory(state.storage) });
      }
      this.world.drops.push(...loaded.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
      this.world.mobs.push(...loaded.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })));
      this.inventory = cloneInventory(loaded.player.inventory);
      this.hotbar = [...loaded.player.hotbar].slice(0, HOTBAR_SIZE);
      while (this.hotbar.length < HOTBAR_SIZE) this.hotbar.push(itemForBlock(BlockId.Stone));
      this.selectedSlot = loaded.player.selectedSlot;
      this.health = loaded.player.health;
      this.hunger = loaded.player.hunger;
      this.stamina = loaded.player.stamina;
      this.timeOfDay = loaded.timeOfDay;
      this.physics = new PlayerPhysics(loaded.player.position);
      this.physics.yaw = loaded.player.yaw;
      this.physics.pitch = loaded.player.pitch;
    } else {
      this.inventory = defaultInventory();
      this.hotbar = defaultHotbar();
      this.physics = new PlayerPhysics(this.world.findSpawn());
      this.spawnInitialMobs();
    }

    this.audio = new FrontierAudio(this.settings, this.world.seedText);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.settings.graphics !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.settings.graphics === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 420);
    this.camera.rotation.order = "YXZ";
    this.scene.background = new THREE.Color(0x8fc8d8);
    this.scene.fog = new THREE.Fog(0x8fc8d8, 28, this.settings.renderDistance * CHUNK_SIZE + 32);
    this.scene.add(this.chunkRoot, this.entityRoot, this.indicatorRoot, this.remotePlayerRoot);

    this.hemisphere = new THREE.HemisphereLight(0xbce9ff, 0x5a4a36, 1.35);
    this.sun = new THREE.DirectionalLight(0xfff1c2, 1.75);
    this.sun.position.set(40, 64, 25);
    this.sun.castShadow = this.settings.graphics === "high";
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.scene.add(this.hemisphere, this.sun);

    this.atlas = createOriginalTextureAtlas();
    this.solidMaterial = new THREE.MeshLambertMaterial({ map: this.atlas, alphaTest: 0.1 });
    this.translucentMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      alphaTest: 0.08,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.liquidMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.018, 1.018, 1.018));
    this.selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selection.visible = false;
    this.scene.add(this.selection);
    const breakGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.035, 1.035, 1.035));
    this.breakOverlay = new THREE.LineSegments(breakGeometry, new THREE.LineBasicMaterial({ color: 0xffa45b, transparent: true, opacity: 0.7 }));
    this.breakOverlay.visible = false;
    this.scene.add(this.breakOverlay);

    this.bindEvents();
    this.configureNetwork();
    this.resize();
    this.queueNearbyChunks(true);
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  private bindEvents(): void {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private configureNetwork(): void {
    this.network.onStatus = (status) => {
      this.callbacks.onToast(status);
      this.emitHud(status);
    };
    this.network.onMessage = (message, peerId) => this.handleNetworkMessage(message, peerId);
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.graphics === "high" ? 2 : 1.45));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.previousFrame) / 1000);
    this.previousFrame = now;
    if (!this.paused) this.update(dt);
    this.processChunkQueue();
    this.renderer.render(this.scene, this.camera);
    this.frameCounter += 1;
    this.frameTimer += dt;
    if (this.frameTimer >= 0.5) {
      this.fps = Math.round(this.frameCounter / this.frameTimer);
      this.frameCounter = 0;
      this.frameTimer = 0;
    }
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const lookScale = 0.00205 * this.settings.sensitivity;
    this.physics.yaw -= this.input.lookX * lookScale;
    this.physics.pitch -= this.input.lookY * lookScale * (this.settings.invertY ? -1 : 1);
    this.physics.pitch = THREE.MathUtils.clamp(this.physics.pitch, -Math.PI * 0.495, Math.PI * 0.495);
    this.input.lookX = 0;
    this.input.lookY = 0;

    const sprinting = this.input.sprint && this.stamina > 1 && this.hunger > 4;
    const physicsInput = { ...this.input, sprint: sprinting };
    this.physics.update(dt, physicsInput, this.world, (fallDistance) => {
      const damage = Math.max(0, (fallDistance - 3.2) * 6.5);
      if (damage > 0) this.damage(damage, "Hard landing");
    });
    if (sprinting && Math.abs(this.input.forward) + Math.abs(this.input.strafe) > 0.2) {
      this.stamina = Math.max(0, this.stamina - dt * 14);
      this.hunger = Math.max(0, this.hunger - dt * 0.055);
    } else this.stamina = Math.min(100, this.stamina + dt * (this.hunger > 20 ? 18 : 7));
    this.hunger = Math.max(0, this.hunger - dt * 0.012);
    if (this.hunger <= 0) this.health = Math.max(1, this.health - dt * 1.4);
    else if (this.hunger > 75 && this.health < 100) {
      this.health = Math.min(100, this.health + dt * 0.5);
      this.hunger = Math.max(0, this.hunger - dt * 0.035);
    }

    this.camera.position.set(
      this.physics.position.x,
      this.physics.position.y + this.physics.eyeHeight,
      this.physics.position.z,
    );
    this.camera.rotation.set(this.physics.pitch, this.physics.yaw, 0);
    this.updateTargeting(dt);
    this.updateActions(dt);
    this.updateDrops(dt);

    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) {
      this.chunkTimer = 0.4;
      this.queueNearbyChunks();
    }
    this.automationTimer += dt;
    if (this.automationTimer >= 0.2) {
      this.automationTimer %= 0.2;
      const players = [
        { x: this.physics.position.x, y: this.physics.position.y, z: this.physics.position.z },
        ...Array.from(this.remotePlayers.values(), (player) => player.position),
      ];
      const events = this.automation.tick(this.world, players, this.timeOfDay);
      if (events.length > 0) this.audio.play("machine");
      this.updateIndicators();
    }

    this.mobTimer += dt;
    if (this.mobTimer >= 0.08) {
      this.updateMobs(this.mobTimer);
      this.mobTimer = 0;
    }
    this.syncEntityMeshes();
    this.updateRemotePlayerMeshes();
    this.updateDayNight(dt);

    this.networkTimer += dt;
    if (this.networkTimer >= 0.1 && this.network.role !== "offline") {
      this.networkTimer = 0;
      this.network.send({ type: "player", player: this.playerSnapshot() });
    }
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS && this.network.role !== "guest") {
      this.autosaveTimer = 0;
      this.saveNow(false);
    }
    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private updateTargeting(dt: number): void {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.currentHit = voxelRaycast(this.world, this.camera.position, direction, 6.2);
    if (this.currentHit) {
      const { x, y, z } = this.currentHit.block;
      this.selection.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.selection.visible = true;
    } else {
      this.selection.visible = false;
      this.breakOverlay.visible = false;
    }
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.mineSoundTimer = Math.max(0, this.mineSoundTimer - dt);
  }

  private updateActions(dt: number): void {
    if (this.input.mine && this.currentHit) this.mineTarget(dt);
    else {
      this.miningKey = "";
      this.miningProgress = 0;
      this.breakOverlay.visible = false;
    }
    if (this.input.place && this.placeCooldown <= 0) {
      this.placeCooldown = 0.19;
      this.placeSelected();
    }
    if (this.input.interact && !this.interactLatch) {
      this.interactLatch = true;
      this.interactTarget();
    }
    if (!this.input.interact) this.interactLatch = false;
  }

  private toolPower(id: BlockId): number {
    const selected = this.hotbar[this.selectedSlot];
    const block = BLOCKS[id];
    const power = TOOL_POWER[selected] ?? 0.62;
    if (block.tool === "none") return Math.max(1, power);
    if (block.tool === "pick" && selected.includes("pick")) return power;
    if (block.tool === "axe" && selected === "tool:hatchet") return power;
    if (block.tool === "spade" && selected === "tool:spade") return power;
    return 0.48;
  }

  private mineTarget(dt: number): void {
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const id = this.currentHit.id;
    if (id === BlockId.Bedrock || BLOCKS[id].hardness >= 999) {
      this.miningProgress = 0;
      this.callbacks.onToast("Deepstone cannot be broken.");
      return;
    }
    const key = worldKey(x, y, z);
    if (key !== this.miningKey) {
      this.miningKey = key;
      this.miningProgress = 0;
    }
    this.miningProgress += (dt * this.toolPower(id)) / Math.max(0.15, BLOCKS[id].hardness);
    this.breakOverlay.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.breakOverlay.scale.setScalar(0.94 + this.miningProgress * 0.07);
    this.breakOverlay.visible = true;
    if (this.mineSoundTimer <= 0) {
      this.mineSoundTimer = 0.22;
      this.audio.play("mine");
    }
    if (this.miningProgress < 1) return;
    const canCollectCrystal = id !== BlockId.AetherCrystal || ["tool:copper-pick", "tool:crystal-pick"].includes(this.hotbar[this.selectedSlot]);
    this.applyBlockChange(x, y, z, BlockId.Air);
    if (BLOCKS[id].collectible && canCollectCrystal) changeItem(this.inventory, itemForBlock(id), 1);
    else if (id === BlockId.AetherCrystal) this.callbacks.onToast("The crystal shattered. A Copper Pick can harvest it.");
    this.audio.play("break");
    this.miningProgress = 0;
    this.miningKey = "";
    this.breakOverlay.visible = false;
  }

  private placeSelected(): void {
    if (!this.currentHit) return;
    const item = this.hotbar[this.selectedSlot];
    const id = blockForItem(item);
    if (id === null || !itemAvailable(this.inventory, item)) {
      if (id === null) this.interactTarget();
      return;
    }
    const { x, y, z } = this.currentHit.adjacent;
    if (this.world.getBlock(x, y, z) !== BlockId.Air || this.physics.occupiesBlock(x, y, z)) return;
    this.applyBlockChange(x, y, z, id);
    const machine = this.world.machines.get(worldKey(x, y, z));
    if (machine) {
      machine.orientation = ((Math.round(-this.physics.yaw / (Math.PI / 2)) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
      if (id === BlockId.ThermalGenerator) machine.storage[itemForBlock(BlockId.CoalOre)] = 4;
      this.broadcastMachine(worldKey(x, y, z), machine);
    }
    changeItem(this.inventory, item, -1);
    this.audio.play("place");
  }

  private applyBlockChange(x: number, y: number, z: number, id: BlockId, fromNetwork = false): void {
    this.world.setBlock(x, y, z, id);
    if (fromNetwork) return;
    const message: NetworkMessage = { type: this.network.role === "guest" ? "request-block" : "block", x, y, z, id };
    this.network.send(message);
  }

  private interactTarget(): void {
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const key = worldKey(x, y, z);
    const id = this.world.getBlock(x, y, z);
    const state = this.world.machines.get(key);
    if (id === BlockId.Toggle && state) {
      state.enabled = !state.enabled;
      this.broadcastMachine(key, state);
      this.audio.play("click");
      this.callbacks.onToast(state.enabled ? "Toggle relay: ON" : "Toggle relay: OFF");
      return;
    }
    if (id === BlockId.ProximitySensor && state) {
      const modes: Array<"near" | "day" | "night"> = ["near", "day", "night"];
      state.mode = modes[(modes.indexOf(state.mode ?? "near") + 1) % modes.length];
      this.broadcastMachine(key, state);
      this.callbacks.onToast(`Field sensor: ${state.mode}`);
      return;
    }
    if (id === BlockId.Workbench) {
      this.callbacks.onInventory();
      return;
    }
    const inspection = this.automation.inspect(this.world, key);
    if (inspection) {
      this.callbacks.onMachine({ key, ...inspection, state: { ...inspection.state, storage: cloneInventory(inspection.state.storage) } });
    }
  }

  private rotateTargetedMachine(): void {
    if (!this.currentHit) return;
    const key = worldKey(this.currentHit.block.x, this.currentHit.block.y, this.currentHit.block.z);
    const state = this.world.machines.get(key);
    if (!state) return;
    state.orientation = ((state.orientation + 1) % 4) as 0 | 1 | 2 | 3;
    this.broadcastMachine(key, state);
    this.callbacks.onToast("Machine rotated clockwise.");
  }

  private broadcastMachine(key: string, state: MachineState): void {
    this.network.send({ type: "machine", key, state: { ...state, storage: cloneInventory(state.storage) } });
  }

  private queueChunk(key: string): void {
    if (this.queuedChunks.has(key)) return;
    this.queuedChunks.add(key);
    this.chunkQueue.push(key);
  }

  private queueNearbyChunks(force = false): void {
    const centerX = floorDiv(Math.floor(this.physics.position.x), CHUNK_SIZE);
    const centerZ = floorDiv(Math.floor(this.physics.position.z), CHUNK_SIZE);
    const radius = this.settings.renderDistance;
    const desired = new Set<string>();
    const candidates: Array<{ key: string; distance: number }> = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const key = chunkKey(centerX + dx, centerZ + dz);
        desired.add(key);
        if (force || !this.chunks.has(key)) candidates.push({ key, distance: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) this.queueChunk(candidate.key);
    for (const key of this.world.clearDirty()) {
      if (desired.has(key) && this.chunks.has(key)) this.queueChunk(key);
    }

    for (const [key, meshSet] of this.chunks) {
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx - centerX) > radius + 1 || Math.abs(cz - centerZ) > radius + 1) {
        this.chunkRoot.remove(meshSet.group);
        disposeObject(meshSet.group);
        this.chunks.delete(key);
      }
    }
  }

  private processChunkQueue(): void {
    const key = this.chunkQueue.shift();
    if (!key) return;
    this.queuedChunks.delete(key);
    const [cx, cz] = key.split(",").map(Number);
    const centerX = floorDiv(Math.floor(this.physics.position.x), CHUNK_SIZE);
    const centerZ = floorDiv(Math.floor(this.physics.position.z), CHUNK_SIZE);
    if (
      Math.abs(cx - centerX) > this.settings.renderDistance + 1 ||
      Math.abs(cz - centerZ) > this.settings.renderDistance + 1
    ) return;
    this.rebuildChunk(cx, cz);
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const old = this.chunks.get(key);
    if (old) {
      this.chunkRoot.remove(old.group);
      disposeObject(old.group);
    }
    const chunk = this.world.getChunk(cx, cz);
    const geometries = buildChunkGeometries(this.world, cx, cz);
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    const solid = new THREE.Mesh(geometries.solid, this.solidMaterial);
    solid.receiveShadow = this.settings.graphics === "high";
    solid.castShadow = this.settings.graphics === "high";
    const translucent = new THREE.Mesh(geometries.translucent, this.translucentMaterial);
    translucent.renderOrder = 1;
    const liquid = new THREE.Mesh(geometries.liquid, this.liquidMaterial);
    liquid.renderOrder = 2;
    group.add(solid, translucent, liquid);
    this.chunkRoot.add(group);
    this.chunks.set(key, { group, revision: chunk.revision });
    this.world.dirtyChunks.delete(key);
  }

  private updateIndicators(): void {
    const nearby = new Set<string>();
    const radius = this.settings.renderDistance * CHUNK_SIZE + 10;
    for (const [key, state] of this.world.machines) {
      const [x, y, z] = parseWorldKey(key);
      if (Math.hypot(x - this.physics.position.x, z - this.physics.position.z) > radius) continue;
      nearby.add(key);
      let mesh = this.indicatorMeshes.get(key);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), this.signalOffMaterial);
        this.indicatorMeshes.set(key, mesh);
        this.indicatorRoot.add(mesh);
      }
      const id = this.world.getBlock(x, y, z);
      mesh.position.set(x + 0.5, y + 1.025, z + 0.5);
      mesh.material = state.energy > 0 && [BlockId.BoreDrill, BlockId.Conveyor, BlockId.ArcFurnace, BlockId.Fabricator, BlockId.Hopper, BlockId.Ram].includes(id)
        ? this.powerMaterial
        : state.signal > 0
          ? this.signalOnMaterial
          : this.signalOffMaterial;
      mesh.scale.setScalar(state.signal > 0 || state.energy > 0 ? 1.12 : 0.82);
    }
    for (const [key, mesh] of this.indicatorMeshes) {
      if (!nearby.has(key)) {
        this.indicatorRoot.remove(mesh);
        mesh.geometry.dispose();
        this.indicatorMeshes.delete(key);
      }
    }
  }

  private updateDrops(dt: number): void {
    for (let index = this.world.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.world.drops[index];
      drop.velocity.y -= 13 * dt;
      drop.velocity.x *= Math.exp(-1.8 * dt);
      drop.velocity.z *= Math.exp(-1.8 * dt);
      const next = {
        x: drop.position.x + drop.velocity.x * dt,
        y: drop.position.y + drop.velocity.y * dt,
        z: drop.position.z + drop.velocity.z * dt,
      };
      if (this.world.isSolid(next.x, next.y - 0.12, next.z)) {
        drop.velocity.y = Math.max(0, -drop.velocity.y * 0.15);
        next.y = Math.floor(next.y) + 0.18;
      }
      drop.position = next;
      if (
        Math.hypot(
          drop.position.x - this.physics.position.x,
          drop.position.y - (this.physics.position.y + 0.8),
          drop.position.z - this.physics.position.z,
        ) < 1.25
      ) {
        changeItem(this.inventory, drop.item, drop.count);
        this.world.drops.splice(index, 1);
        this.audio.play("click");
      }
    }
  }

  private spawnInitialMobs(): void {
    const random = seededRandom(hashString(`mobs:${this.world.seedText}`));
    const spawn = this.world.findSpawn();
    for (let index = 0; index < 12; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = 10 + random() * 32;
      const x = Math.floor(spawn.x + Math.cos(angle) * distance) + 0.5;
      const z = Math.floor(spawn.z + Math.sin(angle) * distance) + 0.5;
      const y = this.world.getHeight(x, z) + 1;
      const biome = this.world.getBiome(x, z);
      const kind: MobState["kind"] = biome === "Cinder Reach"
        ? "cinderling"
        : index % 3 === 0
          ? "mireling"
          : "glowgrazer";
      this.world.mobs.push({
        id: `mob-${index}-${Math.floor(random() * 1e7).toString(36)}`,
        kind,
        position: { x, y, z },
        velocity: { x: 0, y: 0, z: 0 },
        health: kind === "glowgrazer" ? 24 : 34,
        yaw: random() * Math.PI * 2,
        targetTimer: random() * 4,
      });
    }
  }

  private createMobMesh(mob: MobState): THREE.Group {
    const group = new THREE.Group();
    const colors = mob.kind === "mireling"
      ? [0x48625b, 0x8bc2a2]
      : mob.kind === "cinderling"
        ? [0x8e493d, 0xff9a4c]
        : [0x496e74, 0x8de2d2];
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: colors[0] });
    const accentMaterial = new THREE.MeshLambertMaterial({ color: colors[1], emissive: colors[1], emissiveIntensity: 0.14 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 1.02), bodyMaterial);
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.56, 0.56), accentMaterial);
    head.position.set(0, 0.78, -0.58);
    group.add(body, head);
    for (const x of [-0.27, 0.27]) {
      for (const z of [-0.32, 0.32]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.18), bodyMaterial);
        leg.position.set(x, 0.22, z);
        group.add(leg);
      }
    }
    return group;
  }

  private updateMobs(dt: number): void {
    const night = this.timeOfDay < 0.2 || this.timeOfDay > 0.77;
    for (const mob of this.world.mobs) {
      const dx = this.physics.position.x - mob.position.x;
      const dz = this.physics.position.z - mob.position.z;
      const distance = Math.hypot(dx, dz);
      const hostile = mob.kind !== "glowgrazer" && (night || mob.kind === "cinderling");
      mob.targetTimer -= dt;
      if (hostile && distance < 14) mob.yaw = Math.atan2(-dx, -dz);
      else if (mob.targetTimer <= 0) {
        mob.targetTimer = 2 + Math.random() * 5;
        mob.yaw += (Math.random() - 0.5) * Math.PI * 1.3;
      }
      const speed = hostile && distance < 14 ? 2.05 : 0.62;
      const moveX = -Math.sin(mob.yaw) * speed * dt;
      const moveZ = -Math.cos(mob.yaw) * speed * dt;
      const candidateX = mob.position.x + moveX;
      const candidateZ = mob.position.z + moveZ;
      const ground = this.world.getHeight(candidateX, candidateZ) + 1;
      if (Math.abs(ground - mob.position.y) <= 1.2 && this.world.getBlock(candidateX, ground, candidateZ) !== BlockId.Water) {
        mob.position.x = candidateX;
        mob.position.z = candidateZ;
        mob.position.y += (ground - mob.position.y) * Math.min(1, dt * 8);
      } else mob.yaw += Math.PI * 0.65;
      if (hostile && distance < 1.15 && mob.targetTimer < 1.5) {
        mob.targetTimer = 2.4;
        this.damage(mob.kind === "cinderling" ? 9 : 6, mob.kind === "cinderling" ? "Cinderling scorch" : "Mireling bite");
      }
    }
  }

  private syncEntityMeshes(): void {
    const mobIds = new Set(this.world.mobs.map((mob) => mob.id));
    for (const mob of this.world.mobs) {
      let mesh = this.mobMeshes.get(mob.id);
      if (!mesh) {
        mesh = this.createMobMesh(mob);
        this.mobMeshes.set(mob.id, mesh);
        this.entityRoot.add(mesh);
      }
      mesh.position.set(mob.position.x, mob.position.y, mob.position.z);
      mesh.rotation.y = mob.yaw;
    }
    for (const [id, mesh] of this.mobMeshes) {
      if (!mobIds.has(id)) {
        this.entityRoot.remove(mesh);
        disposeObject(mesh, true);
        this.mobMeshes.delete(id);
      }
    }

    const dropIds = new Set(this.world.drops.map((drop) => drop.id));
    for (const drop of this.world.drops) {
      let mesh = this.dropMeshes.get(drop.id);
      if (!mesh) {
        const hue = (hashString(drop.item) % 360) / 360;
        const material = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.55, 0.58) });
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), material);
        this.dropMeshes.set(drop.id, mesh);
        this.entityRoot.add(mesh);
      }
      mesh.position.set(drop.position.x, drop.position.y, drop.position.z);
      mesh.rotation.y += 0.035;
    }
    for (const [id, mesh] of this.dropMeshes) {
      if (!dropIds.has(id)) {
        this.entityRoot.remove(mesh);
        disposeObject(mesh, true);
        this.dropMeshes.delete(id);
      }
    }
  }

  private createRemotePlayerMesh(player: PlayerSnapshot): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: player.color });
    const dark = material.clone();
    dark.color.multiplyScalar(0.68);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), material);
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), material);
    head.position.y = 1.68;
    group.add(body, head);
    for (const x of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
      leg.position.set(x, 0.4, 0);
      group.add(leg);
    }
    return group;
  }

  private updateRemotePlayerMeshes(): void {
    for (const [id, player] of this.remotePlayers) {
      if (id === this.network.playerId) continue;
      let mesh = this.remotePlayerMeshes.get(id);
      if (!mesh) {
        mesh = this.createRemotePlayerMesh(player);
        this.remotePlayerMeshes.set(id, mesh);
        this.remotePlayerRoot.add(mesh);
      }
      mesh.position.set(player.position.x, player.position.y, player.position.z);
      mesh.rotation.y = player.yaw;
    }
    for (const [id, mesh] of this.remotePlayerMeshes) {
      if (!this.remotePlayers.has(id)) {
        this.remotePlayerRoot.remove(mesh);
        disposeObject(mesh, true);
        this.remotePlayerMeshes.delete(id);
      }
    }
  }

  private updateDayNight(dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt / 840) % 1;
    const angle = this.timeOfDay * Math.PI * 2;
    const daylight = THREE.MathUtils.smoothstep(Math.sin(angle - Math.PI / 2), -0.28, 0.38);
    const dayColor = new THREE.Color(0x8fc8d8);
    const nightColor = new THREE.Color(0x101a32);
    const sky = nightColor.clone().lerp(dayColor, daylight);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    this.hemisphere.intensity = 0.18 + daylight * 1.2;
    this.sun.intensity = 0.05 + daylight * 1.8;
    this.sun.position.set(
      this.physics.position.x + Math.cos(angle) * 58,
      12 + Math.sin(angle) * 62,
      this.physics.position.z + 28,
    );
  }

  private damage(amount: number, source: string): void {
    this.health = Math.max(0, this.health - amount);
    this.audio.play("hurt");
    this.callbacks.onToast(`${source} · −${Math.round(amount)} health`);
    if (this.health <= 0) {
      const spawn = this.world.findSpawn();
      this.physics.position.set(spawn.x, spawn.y, spawn.z);
      this.physics.velocity.set(0, 0, 0);
      this.health = 100;
      this.hunger = 76;
      this.callbacks.onToast("You reformed at the frontier beacon.");
    }
  }

  private playerSnapshot(): PlayerSnapshot {
    const hue = hashString(this.network.playerId) % 360;
    return {
      id: this.network.playerId,
      name: this.playerName,
      position: {
        x: this.physics.position.x,
        y: this.physics.position.y,
        z: this.physics.position.z,
      },
      yaw: this.physics.yaw,
      pitch: this.physics.pitch,
      color: `hsl(${hue} 62% 58%)`,
    };
  }

  private handleNetworkMessage(message: NetworkMessage, peerId: string): void {
    if (message.type === "request-snapshot" && this.network.role === "host") {
      this.network.send({ type: "snapshot", save: this.makeSave() }, peerId);
    } else if (message.type === "snapshot" && this.network.role === "guest") {
      this.applyRemoteSnapshot(message.save);
      this.callbacks.onToast(`Joined world “${message.save.seed}”`);
    } else if (message.type === "request-block" && this.network.role === "host") {
      if (Number.isInteger(message.x) && Number.isInteger(message.y) && Number.isInteger(message.z)) {
        this.applyBlockChange(message.x, message.y, message.z, message.id, true);
        this.network.send({ ...message, type: "block" });
      }
    } else if (message.type === "block") {
      this.applyBlockChange(message.x, message.y, message.z, message.id, true);
    } else if (message.type === "machine") {
      this.world.machines.set(message.key, { ...message.state, storage: cloneInventory(message.state.storage) });
    } else if (message.type === "player") {
      this.remotePlayers.set(message.player.id, message.player);
    } else if (message.type === "peer-left") {
      this.remotePlayers.delete(message.playerId);
    } else if (message.type === "toast") {
      this.callbacks.onToast(message.text);
    }
  }

  private applyRemoteSnapshot(save: WorldSave): void {
    this.world = new VoxelWorld(save.seed);
    this.world.loadMutations(save.mutations);
    for (const [key, state] of save.machines) {
      this.world.machines.set(key, { ...state, storage: cloneInventory(state.storage) });
    }
    this.world.drops.push(...save.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
    this.world.mobs.push(...save.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })));
    this.timeOfDay = save.timeOfDay;
    this.physics.position.set(save.player.position.x + 1.4, save.player.position.y, save.player.position.z + 1.4);
    for (const meshSet of this.chunks.values()) {
      this.chunkRoot.remove(meshSet.group);
      disposeObject(meshSet.group);
    }
    this.chunks.clear();
    this.chunkQueue.length = 0;
    this.queuedChunks.clear();
    this.queueNearbyChunks(true);
  }

  private emitHud(networkStatus?: string): void {
    this.callbacks.onHud({
      health: this.health,
      hunger: this.hunger,
      stamina: this.stamina,
      selectedSlot: this.selectedSlot,
      hotbar: [...this.hotbar],
      inventory: cloneInventory(this.inventory),
      targetedBlock: this.currentHit?.id ?? null,
      miningProgress: this.miningProgress,
      timeOfDay: this.timeOfDay,
      biome: this.world.getBiome(this.physics.position.x, this.physics.position.z),
      coordinates: {
        x: Math.floor(this.physics.position.x),
        y: Math.floor(this.physics.position.y),
        z: Math.floor(this.physics.position.z),
      },
      fps: this.fps,
      networkStatus: networkStatus ?? (this.network.role === "offline" ? "Offline" : `${this.network.role === "host" ? "Hosting" : "Guest"} · ${this.network.connectedPeers} peer${this.network.connectedPeers === 1 ? "" : "s"}`),
      objective: this.objective,
    });
  }

  private stationAvailable(station: Recipe["station"]): boolean {
    if (station === "hand") return true;
    if (station === "furnace" || station === "fabricator") return false;
    if (itemAvailable(this.inventory, itemForBlock(BlockId.Workbench))) return true;
    const px = Math.floor(this.physics.position.x);
    const py = Math.floor(this.physics.position.y);
    const pz = Math.floor(this.physics.position.z);
    for (let x = px - 4; x <= px + 4; x += 1) {
      for (let y = py - 3; y <= py + 3; y += 1) {
        for (let z = pz - 4; z <= pz + 4; z += 1) {
          if (this.world.getBlock(x, y, z) === BlockId.Workbench) return true;
        }
      }
    }
    return false;
  }

  getRecipes(): Recipe[] {
    return RECIPES.map((recipe) => ({ ...recipe, inputs: { ...recipe.inputs }, output: { ...recipe.output } }));
  }

  craft(recipeId: string): boolean {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) return false;
    if (!this.stationAvailable(recipe.station)) {
      this.callbacks.onToast(recipe.station === "workbench" ? "Place or carry a Tinker Bench first." : "That recipe runs inside a machine.");
      return false;
    }
    if (!Object.entries(recipe.inputs).every(([item, count]) => (this.inventory[item] ?? 0) >= count)) {
      this.callbacks.onToast("You are missing ingredients.");
      return false;
    }
    for (const [item, count] of Object.entries(recipe.inputs)) changeItem(this.inventory, item as ItemId, -count);
    changeItem(this.inventory, recipe.output.item, recipe.output.count);
    this.audio.play("craft");
    this.callbacks.onToast(`Crafted ${recipe.name}.`);
    this.emitHud();
    return true;
  }

  getMachine(key: string): MachinePanelData | null {
    const inspection = this.automation.inspect(this.world, key);
    if (!inspection) return null;
    return { key, ...inspection, state: { ...inspection.state, storage: cloneInventory(inspection.state.storage) } };
  }

  transferToMachine(key: string, item: ItemId, count = 1): boolean {
    const state = this.world.machines.get(key);
    if (!state || !itemAvailable(this.inventory, item, count)) return false;
    changeItem(this.inventory, item, -count);
    changeItem(state.storage, item, count);
    this.broadcastMachine(key, state);
    this.emitHud();
    return true;
  }

  transferFromMachine(key: string, item: ItemId, count = 1): boolean {
    const state = this.world.machines.get(key);
    if (!state || !itemAvailable(state.storage, item, count)) return false;
    changeItem(state.storage, item, -count);
    changeItem(this.inventory, item, count);
    this.broadcastMachine(key, state);
    this.emitHud();
    return true;
  }

  toggleMachine(key: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    state.enabled = !state.enabled;
    this.broadcastMachine(key, state);
  }

  rotateMachine(key: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    state.orientation = ((state.orientation + 1) % 4) as 0 | 1 | 2 | 3;
    this.broadcastMachine(key, state);
  }

  configureMachine(key: string, value: string): void {
    const state = this.world.machines.get(key);
    if (!state) return;
    const [x, y, z] = parseWorldKey(key);
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.ProximitySensor && ["near", "day", "night"].includes(value)) {
      state.mode = value as "near" | "day" | "night";
    }
    if (id === BlockId.Fabricator && ["flux-coil", "logic-wafer", "gear"].includes(value)) state.recipe = value;
    this.broadcastMachine(key, state);
  }

  assignHotbar(slot: number, item: ItemId): void {
    if (slot < 0 || slot >= HOTBAR_SIZE || !itemAvailable(this.inventory, item)) return;
    this.hotbar[slot] = item;
    this.selectedSlot = slot;
    this.emitHud();
  }

  setSelectedSlot(slot: number): void {
    this.selectedSlot = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.audio.play("click");
    this.emitHud();
  }

  setMove(strafe: number, forward: number): void {
    this.input.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
    this.input.forward = THREE.MathUtils.clamp(forward, -1, 1);
  }

  addLook(x: number, y: number): void {
    this.input.lookX += x;
    this.input.lookY += y;
  }

  setAction(action: "jump" | "sprint" | "crouch" | "mine" | "place" | "interact", active: boolean): void {
    this.input[action] = active;
    if (active) void this.audio.unlock();
  }

  tapInteract(): void {
    this.input.interact = true;
    window.setTimeout(() => {
      this.input.interact = false;
    }, 80);
  }

  updateSettings(settings: GameSettings): void {
    const renderDistanceChanged = settings.renderDistance !== this.settings.renderDistance;
    this.settings = { ...settings };
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.updateSettings(settings);
    this.scene.fog = new THREE.Fog(
      (this.scene.background as THREE.Color)?.getHex() ?? 0x8fc8d8,
      28,
      settings.renderDistance * CHUNK_SIZE + 32,
    );
    if (renderDistanceChanged) this.queueNearbyChunks(true);
    this.resize();
  }

  pause(): void {
    this.paused = true;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resume(): void {
    this.paused = false;
    this.previousFrame = performance.now();
    void this.audio.unlock();
  }

  makeSave(): WorldSave {
    return {
      version: SAVE_VERSION,
      createdAt: Date.now(),
      seed: this.world.seedText,
      player: {
        position: {
          x: this.physics.position.x,
          y: this.physics.position.y,
          z: this.physics.position.z,
        },
        yaw: this.physics.yaw,
        pitch: this.physics.pitch,
        health: this.health,
        hunger: this.hunger,
        stamina: this.stamina,
        inventory: cloneInventory(this.inventory),
        hotbar: [...this.hotbar],
        selectedSlot: this.selectedSlot,
      },
      timeOfDay: this.timeOfDay,
      mutations: this.world.serializeMutations(),
      machines: Array.from(this.world.machines, ([key, state]) => [
        key,
        { ...state, storage: cloneInventory(state.storage) },
      ]),
      drops: this.world.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })),
      mobs: this.world.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })),
    };
  }

  saveNow(showToast = true): string {
    try {
      const key = saveLocally(this.makeSave());
      if (showToast) this.callbacks.onToast(`World saved · ${key.length.toLocaleString()} character key`);
      return key;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage error";
      this.callbacks.onToast(`Could not save: ${message}`);
      return "";
    }
  }

  exportKey(): string {
    const key = encodeWorldKey(this.makeSave());
    this.callbacks.onToast(`Export key ready · ${key.length.toLocaleString()} characters`);
    return key;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameRequest);
    if (this.network.role !== "guest") this.saveNow(false);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.audio.dispose();
    this.atlas.dispose();
    this.solidMaterial.dispose();
    this.translucentMaterial.dispose();
    this.liquidMaterial.dispose();
    this.signalOnMaterial.dispose();
    this.signalOffMaterial.dispose();
    this.powerMaterial.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.renderer.dispose();
  }
}
