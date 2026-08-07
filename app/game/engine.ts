import * as THREE from "three";
import {
  ALL_ITEMS,
  BLOCKS,
  RECIPES,
  TOOL_POWER,
  blockForItem,
  createOriginalTextureAtlas,
  itemForBlock,
  itemName,
  tileUv,
} from "./blocks";
import { AutomationSystem } from "./automation";
import { FrontierAudio } from "./audio";
import { WeaponStats, weaponStats } from "./combat";
import { buildChunkGeometries } from "./mesher";
import { NetworkMessage, NetworkSession } from "./network";
import { MOB_DEFINITIONS, mobIntersectsSolid, moveMobWithCollision, resolveMobPenetration } from "./mobs";
import { PlayerPhysics } from "./physics";
import { hashString, parseWorldKey, seededRandom, worldKey } from "./prng";
import { voxelRaycast } from "./raycast";
import { encodeWorldKey, saveLocally } from "./save";
import { FirstPersonViewModel } from "./viewmodel";
import {
  BlockId,
  CHUNK_SIZE,
  GameMode,
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
  mode: GameMode;
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

function creativeInventory(): Inventory {
  return Object.fromEntries(ALL_ITEMS.map((item) => [item, 999]));
}

function defaultHotbar(mode: GameMode): Array<ItemId | null> {
  if (mode === "survival") return Array<ItemId | null>(HOTBAR_SIZE).fill(null);
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

function createCrackMaterials(): THREE.MeshBasicMaterial[] {
  return Array.from({ length: 7 }, (_, stage) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas textures are unavailable in this browser.");
    context.clearRect(0, 0, 64, 64);
    context.strokeStyle = "rgba(18, 15, 17, .88)";
    context.lineCap = "square";
    context.lineJoin = "miter";
    context.lineWidth = 2.5 + stage * 0.34;
    const branches = 2 + stage * 2;
    for (let branch = 0; branch < branches; branch += 1) {
      const angle = (branch / branches) * Math.PI * 2 + stage * 0.19;
      let x = 32;
      let y = 32;
      context.beginPath();
      context.moveTo(x, y);
      const segments = 2 + Math.floor(stage / 2);
      for (let segment = 0; segment < segments; segment += 1) {
        const distance = 7 + segment * 4 + stage * 1.2;
        x = 32 + Math.cos(angle + Math.sin(branch * 9 + segment) * 0.22) * distance;
        y = 32 + Math.sin(angle + Math.cos(branch * 5 + segment) * 0.22) * distance;
        context.lineTo(x, y);
      }
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  });
}

function createStarField(seed: number): THREE.Points {
  const random = seededRandom(seed ^ 0x7f4a7c15);
  const positions: number[] = [];
  for (let index = 0; index < 420; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(0.12 + random() * 0.88);
    const radius = 155;
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius,
      Math.sin(phi) * Math.sin(theta) * radius,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd9edff, size: 0.85, transparent: true, opacity: 0 }));
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

function formatFrontierTime(timeOfDay: number): string {
  const totalMinutes = Math.floor(((timeOfDay % 1) + 1) % 1 * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const phase = hours < 5
    ? "Deep night"
    : hours < 8
      ? "Dawn"
      : hours < 17
        ? "Daylight"
        : hours < 20
          ? "Dusk"
          : "Night";
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} · ${phase}`;
}

function paintBlockUv(geometry: THREE.BoxGeometry, id: BlockId): void {
  const uv = tileUv(id);
  const attribute = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) {
    const x = attribute.getX(index);
    const y = attribute.getY(index);
    attribute.setXY(index, uv.u0 + x * (uv.u1 - uv.u0), uv.v0 + y * (uv.v1 - uv.v0));
  }
  attribute.needsUpdate = true;
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
  private readonly remotePeerPlayers = new Map<string, PlayerSnapshot>();
  private readonly remotePlayerMeshes = new Map<string, THREE.Group>();
  private readonly indicatorMeshes = new Map<string, THREE.Mesh>();
  private readonly automation = new AutomationSystem();
  private readonly callbacks: GameEngineCallbacks;
  private readonly playerName: string;
  private readonly audio: FrontierAudio;
  private mode: GameMode;
  private physics: PlayerPhysics;
  private settings: GameSettings;
  private inventory: Inventory;
  private hotbar: Array<ItemId | null>;
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
  private mobNetworkTimer = 0;
  private chunkTimer = 0;
  private mobTimer = 0;
  private mobSpawnTimer = 4;
  private placeCooldown = 0;
  private attackCooldown = 0;
  private interactLatch = false;
  private miningKey = "";
  private miningProgress = 0;
  private mineSoundTimer = 0;
  private stepSoundTimer = 0;
  private objective = "Gather Emberwood by hand and prepare for nightfall.";
  private dayCount = 1;
  private nightAnnouncementDay = 0;
  private dropSerial = 0;
  private wildlifeRandom: () => number;
  private targetedMob: MobState | null = null;
  private currentHit: ReturnType<typeof voxelRaycast> = null;
  private readonly selection: THREE.LineSegments;
  private readonly breakOverlay: THREE.Mesh;
  private readonly breakMaterials: THREE.MeshBasicMaterial[];
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly starField: THREE.Points;
  private readonly moonDisc: THREE.Mesh;
  private readonly sunDisc: THREE.Mesh;
  private readonly atlas: THREE.CanvasTexture;
  private readonly viewModel: FirstPersonViewModel;
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
    this.mode = loaded?.mode ?? options.mode;
    this.world = new VoxelWorld(loaded?.seed ?? options.seed);
    this.wildlifeRandom = seededRandom(hashString(`wildlife:${this.world.seedText}`));
    if (loaded) {
      this.world.loadMutations(loaded.mutations);
      for (const [key, state] of loaded.machines) {
        this.world.machines.set(key, { ...state, storage: cloneInventory(state.storage) });
      }
      this.world.drops.push(...loaded.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
      this.world.mobs.push(...loaded.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })));
      this.inventory = cloneInventory(loaded.player.inventory);
      this.hotbar = [...loaded.player.hotbar].slice(0, HOTBAR_SIZE).map((item) => item ?? null);
      while (this.hotbar.length < HOTBAR_SIZE) this.hotbar.push(null);
      this.selectedSlot = Math.max(0, Math.min(HOTBAR_SIZE - 1, loaded.player.selectedSlot));
      this.health = loaded.player.health;
      this.hunger = loaded.player.hunger;
      this.stamina = loaded.player.stamina;
      this.timeOfDay = loaded.timeOfDay;
      this.dayCount = loaded.dayCount ?? 1;
      this.physics = new PlayerPhysics(loaded.player.position);
      this.physics.yaw = loaded.player.yaw;
      this.physics.pitch = loaded.player.pitch;
    } else {
      this.inventory = this.mode === "creative" ? creativeInventory() : {};
      this.hotbar = defaultHotbar(this.mode);
      this.physics = new PlayerPhysics(this.world.findSpawn());
      this.spawnInitialMobs();
    }
    this.objective = this.mode === "creative"
      ? "Creative systems online — build, explore, or test a factory."
      : "Gather Emberwood by hand and prepare for nightfall.";

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
    this.scene.add(this.chunkRoot, this.entityRoot, this.indicatorRoot, this.remotePlayerRoot, this.camera);

    this.hemisphere = new THREE.HemisphereLight(0xbce9ff, 0x5a4a36, 1.35);
    this.sun = new THREE.DirectionalLight(0xfff1c2, 1.75);
    this.sun.position.set(40, 64, 25);
    this.sun.castShadow = this.settings.graphics === "high";
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.scene.add(this.hemisphere, this.sun, this.sun.target);

    this.starField = createStarField(this.world.seed);
    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xb8cdf8, fog: false }),
    );
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.4, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe3a0, fog: false }),
    );
    this.scene.add(this.starField, this.moonDisc, this.sunDisc);

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
    this.viewModel = new FirstPersonViewModel(this.camera, this.atlas);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);

    const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.018, 1.018, 1.018));
    this.selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selection.visible = false;
    this.scene.add(this.selection);
    this.breakMaterials = createCrackMaterials();
    const breakGeometry = new THREE.BoxGeometry(1.028, 1.028, 1.028);
    this.breakOverlay = new THREE.Mesh(breakGeometry, this.breakMaterials[0]);
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
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const sprinting = this.input.sprint && (this.mode === "creative" || (this.stamina > 1 && this.hunger > 4));
    const physicsInput = { ...this.input, sprint: sprinting };
    this.physics.update(dt, physicsInput, this.world, (fallDistance) => {
      const damage = Math.max(0, (fallDistance - 3.2) * 6.5);
      if (damage > 0) this.damage(damage, "Hard landing");
    }, this.settings.autoJump);
    if (this.mode === "creative") {
      this.health = 100;
      this.hunger = 100;
      this.stamina = 100;
    } else {
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
    }

    this.camera.position.set(
      this.physics.position.x,
      this.physics.position.y + this.physics.eyeHeight,
      this.physics.position.z,
    );
    this.camera.rotation.set(this.physics.pitch, this.physics.yaw, 0);
    this.updateTargeting(dt);
    this.updateActions(dt);
    if (this.network.role !== "guest") this.updateDrops(dt);
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
    this.viewModel.update(dt, Math.hypot(this.physics.velocity.x, this.physics.velocity.z));
    this.stepSoundTimer = Math.max(0, this.stepSoundTimer - dt);
    if (
      this.physics.grounded &&
      Math.hypot(this.physics.velocity.x, this.physics.velocity.z) > 1.4 &&
      this.stepSoundTimer <= 0
    ) {
      this.stepSoundTimer = sprinting ? 0.27 : 0.39;
      this.audio.play("step");
    }

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
      if (this.network.role !== "guest") this.updateMobs(this.mobTimer);
      this.mobTimer = 0;
    }
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) {
      this.mobSpawnTimer = 3.5;
      if (this.network.role !== "guest") this.spawnNightMob();
    }
    this.syncEntityMeshes();
    this.updateRemotePlayerMeshes();
    this.updateDayNight(dt);

    this.networkTimer += dt;
    if (this.networkTimer >= 0.1 && this.network.role !== "offline") {
      this.networkTimer = 0;
      this.network.send({ type: "player", player: this.playerSnapshot() });
    }
    this.mobNetworkTimer += dt;
    if (this.mobNetworkTimer >= 0.2 && this.network.role === "host") {
      this.mobNetworkTimer = 0;
      this.network.send({
        type: "mob-state",
        mobs: this.world.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })),
        drops: this.world.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })),
        timeOfDay: this.timeOfDay,
        dayCount: this.dayCount,
      });
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
    const selected = this.hotbar[this.selectedSlot];
    const reach = weaponStats(selected).reach;
    this.currentHit = voxelRaycast(this.world, this.camera.position, direction, Math.max(6.2, reach));
    this.targetedMob = this.findTargetedMob(direction, reach);
    if (this.currentHit && !this.targetedMob) {
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

  private findTargetedMob(direction: THREE.Vector3, maxRange: number): MobState | null {
    let nearest: MobState | null = null;
    let nearestDistance = Math.min(maxRange, this.currentHit?.distance ?? maxRange);
    for (const mob of this.world.mobs) {
      const definition = MOB_DEFINITIONS[mob.kind];
      const center = new THREE.Vector3(
        mob.position.x,
        mob.position.y + definition.height * 0.55,
        mob.position.z,
      );
      const offset = center.sub(this.camera.position);
      const alongRay = offset.dot(direction);
      if (alongRay <= 0 || alongRay > nearestDistance) continue;
      const perpendicularSq = Math.max(0, offset.lengthSq() - alongRay * alongRay);
      const hitRadius = definition.radius + 0.28;
      if (perpendicularSq <= hitRadius * hitRadius) {
        nearest = mob;
        nearestDistance = alongRay;
      }
    }
    return nearest;
  }

  private updateActions(dt: number): void {
    if (this.input.mine && this.targetedMob) {
      this.breakOverlay.visible = false;
      this.miningKey = "";
      this.miningProgress = 0;
      if (this.attackCooldown <= 0) this.attackTargetedMob();
    } else if (this.input.mine && this.currentHit) this.mineTarget(dt);
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
    if (this.mode === "creative") return 100;
    const power = selected ? TOOL_POWER[selected] ?? 0.62 : 0.62;
    if (block.tool === "none") return Math.max(1, power);
    if (block.tool === "pick" && selected?.includes("pick")) return power;
    if (block.tool === "axe" && selected === "tool:hatchet") return power;
    if (block.tool === "spade" && selected === "tool:spade") return power;
    return 0.48;
  }

  private mineTarget(dt: number): void {
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const id = this.currentHit.id;
    if (id === BlockId.RelicCache) {
      this.interactTarget();
      this.miningProgress = 0;
      this.miningKey = "";
      this.breakOverlay.visible = false;
      return;
    }
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
    this.breakOverlay.scale.setScalar(1);
    this.breakOverlay.material = this.breakMaterials[Math.min(6, Math.floor(Math.max(0, this.miningProgress) * 7))];
    this.breakOverlay.visible = true;
    if (this.mineSoundTimer <= 0) {
      this.mineSoundTimer = 0.22;
      this.audio.play("mine");
      this.viewModel.swing("mine");
    }
    if (this.miningProgress < 1) return;
    const selected = this.hotbar[this.selectedSlot];
    const canCollectCrystal = id !== BlockId.AetherCrystal || selected === "tool:copper-pick" || selected === "tool:crystal-pick";
    this.applyBlockChange(x, y, z, BlockId.Air);
    if (this.mode === "survival" && id === BlockId.StarBloom) this.collectItem("food:starfruit", 1);
    else if (this.mode === "survival" && BLOCKS[id].collectible && canCollectCrystal) this.collectItem(itemForBlock(id), 1);
    else if (id === BlockId.AetherCrystal) this.callbacks.onToast("The crystal shattered. A Copper Pick can harvest it.");
    this.audio.play("break");
    if (this.mode === "survival" && id === BlockId.EmberwoodLog) {
      this.objective = "Open the pack, cut planks, then craft a Roughstone Spear before night.";
    }
    this.miningProgress = 0;
    this.miningKey = "";
    this.breakOverlay.visible = false;
  }

  private placeSelected(): void {
    const item = this.hotbar[this.selectedSlot];
    if (!item) {
      this.interactTarget();
      return;
    }
    const id = blockForItem(item);
    if (id === null) {
      if (!this.useSelectedItem(item)) this.interactTarget();
      return;
    }
    if (!this.currentHit || (this.mode === "survival" && !itemAvailable(this.inventory, item))) return;
    const { x, y, z } = this.currentHit.adjacent;
    if (this.world.getBlock(x, y, z) !== BlockId.Air || this.physics.occupiesBlock(x, y, z)) return;
    this.applyBlockChange(x, y, z, id);
    const machine = this.world.machines.get(worldKey(x, y, z));
    if (machine) {
      machine.orientation = ((Math.round(-this.physics.yaw / (Math.PI / 2)) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
      if (id === BlockId.ThermalGenerator) machine.storage[itemForBlock(BlockId.CoalOre)] = 4;
      this.broadcastMachine(worldKey(x, y, z), machine);
    }
    if (this.mode === "survival") changeItem(this.inventory, item, -1);
    this.audio.play("place");
    this.viewModel.swing("place");
  }

  private useSelectedItem(item: ItemId): boolean {
    let used = false;
    if (item === "food:starfruit" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 18);
      this.health = Math.min(100, this.health + 3);
      used = true;
    } else if (item === "food:glowcut" && (this.hunger < 100 || this.health < 100)) {
      this.hunger = Math.min(100, this.hunger + 32);
      this.health = Math.min(100, this.health + 6);
      used = true;
    } else if (item === "consumable:mender-tonic" && this.health < 100) {
      this.health = Math.min(100, this.health + 46);
      used = true;
    }
    if (!used) return false;
    if (this.mode === "survival") changeItem(this.inventory, item, -1);
    this.viewModel.swing("use");
    this.audio.play("craft");
    this.callbacks.onToast(`${itemName(item)} used.`);
    return true;
  }

  private collectItem(item: ItemId, count: number): void {
    changeItem(this.inventory, item, count);
    if (!this.hotbar.includes(item)) {
      const emptySlot = this.hotbar.indexOf(null);
      if (emptySlot >= 0) this.hotbar[emptySlot] = item;
    }
  }

  private spawnDrop(item: ItemId, count: number, position: MobState["position"]): void {
    this.dropSerial += 1;
    const angle = this.wildlifeRandom() * Math.PI * 2;
    this.world.drops.push({
      id: `loot-${Date.now().toString(36)}-${this.dropSerial.toString(36)}`,
      item,
      count,
      position: { x: position.x, y: position.y + 0.65, z: position.z },
      velocity: {
        x: Math.cos(angle) * (0.5 + this.wildlifeRandom()),
        y: 2.2 + this.wildlifeRandom(),
        z: Math.sin(angle) * (0.5 + this.wildlifeRandom()),
      },
    });
  }

  private attackTargetedMob(): void {
    const mob = this.targetedMob;
    if (!mob) return;
    const selected = this.hotbar[this.selectedSlot];
    const stats = weaponStats(selected);
    if (stats.ammo && this.mode === "survival" && !itemAvailable(this.inventory, stats.ammo)) {
      this.attackCooldown = 0.25;
      this.callbacks.onToast(`${itemName(selected ?? stats.ammo)} needs ${itemName(stats.ammo)} ammunition.`);
      return;
    }
    if (stats.ammo && this.mode === "survival") changeItem(this.inventory, stats.ammo, -1);
    this.attackCooldown = stats.cooldown;
    this.viewModel.swing("attack");
    this.audio.play(selected === "tool:aether-repeater" ? "shoot" : "attack");
    if (this.network.role === "guest") {
      this.network.send({ type: "request-mob-hit", mobId: mob.id, item: selected });
      return;
    }
    this.strikeMob(mob, stats, this.physics.position);
  }

  private strikeMob(
    mob: MobState,
    stats: WeaponStats,
    origin: { x: number; y: number; z: number },
    attackerPeerId?: string,
  ): void {
    mob.health -= stats.damage;
    mob.hurtTimer = 0.24;
    const dx = mob.position.x - origin.x;
    const dz = mob.position.z - origin.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    mob.velocity.x += (dx / distance) * stats.knockback;
    mob.velocity.z += (dz / distance) * stats.knockback;
    mob.velocity.y = Math.max(mob.velocity.y, stats.knockback * 0.34);
    mob.yaw = Math.atan2(dx, dz);
    if (mob.health > 0) return;

    const definition = MOB_DEFINITIONS[mob.kind];
    for (const loot of definition.loot) {
      const amount = loot.min + Math.floor(this.wildlifeRandom() * (loot.max - loot.min + 1));
      if (amount > 0) this.spawnDrop(loot.item, amount, mob.position);
    }
    const index = this.world.mobs.findIndex((candidate) => candidate.id === mob.id);
    if (index >= 0) this.world.mobs.splice(index, 1);
    if (this.targetedMob?.id === mob.id) this.targetedMob = null;
    this.objective = definition.passive
      ? "Explore farther—the old Wayfarer ruins hide advanced materials."
      : "Night threat cleared. Search ruins for a Relic Cache and Moonshard seams.";
    const message = `${definition.name} defeated · loot dropped.`;
    if (attackerPeerId) this.network.send({ type: "toast", text: message }, attackerPeerId);
    else this.callbacks.onToast(message);
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
    if (id === BlockId.RelicCache) {
      const moonshards = 2 + Math.floor(this.wildlifeRandom() * 3);
      const bolts = 4 + Math.floor(this.wildlifeRandom() * 5);
      this.applyBlockChange(x, y, z, BlockId.Air);
      this.collectItem("part:moonshard", moonshards);
      this.collectItem("ammo:aether-bolt", bolts);
      this.collectItem("part:copper-ingot", 1 + Math.floor(this.wildlifeRandom() * 2));
      if (this.wildlifeRandom() > 0.6) this.collectItem("consumable:mender-tonic", 1);
      this.viewModel.swing("use");
      this.audio.play("craft");
      this.objective = "Relic recovered. Build an Aether Repeater—or automate the frontier.";
      this.callbacks.onToast(`Relic Cache opened · ${moonshards} Moonshards · ${bolts} Aether Bolts.`);
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
      const localDistance = Math.hypot(
        drop.position.x - this.physics.position.x,
        drop.position.y - (this.physics.position.y + 0.8),
        drop.position.z - this.physics.position.z,
      );
      if (localDistance < 1.25) {
        this.collectItem(drop.item, drop.count);
        this.world.drops.splice(index, 1);
        this.audio.play("click");
        continue;
      }
      for (const [peerId, player] of this.remotePeerPlayers) {
        const distance = Math.hypot(
          drop.position.x - player.position.x,
          drop.position.y - (player.position.y + 0.8),
          drop.position.z - player.position.z,
        );
        if (distance >= 1.25) continue;
        this.network.send({ type: "give-item", item: drop.item, count: drop.count }, peerId);
        this.world.drops.splice(index, 1);
        break;
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
        : index % 7 === 0
          ? "thornback"
          : index % 3 === 0
          ? "mireling"
          : "glowgrazer";
      const mob: MobState = {
        id: `mob-${index}-${Math.floor(random() * 1e7).toString(36)}`,
        kind,
        position: { x, y, z },
        velocity: { x: 0, y: 0, z: 0 },
        health: MOB_DEFINITIONS[kind].maxHealth,
        yaw: random() * Math.PI * 2,
        targetTimer: random() * 4,
        attackTimer: random() * 2,
        hurtTimer: 0,
      };
      resolveMobPenetration(this.world, mob);
      this.world.mobs.push(mob);
    }
  }

  private spawnNightMob(): void {
    const night = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    if (!night || this.world.mobs.length >= 30) return;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = this.wildlifeRandom() * Math.PI * 2;
      const distance = 18 + this.wildlifeRandom() * 14;
      const x = Math.floor(this.physics.position.x + Math.cos(angle) * distance) + 0.5;
      const z = Math.floor(this.physics.position.z + Math.sin(angle) * distance) + 0.5;
      const y = this.world.getHeight(x, z) + 1.01;
      const biome = this.world.getBiome(x, z);
      const roll = this.wildlifeRandom();
      const kind: MobState["kind"] = biome === "Cinder Reach"
        ? "cinderling"
        : roll < 0.46
          ? "nightwisp"
          : roll < 0.74
            ? "mireling"
            : "thornback";
      const mob: MobState = {
        id: `night-${this.dayCount}-${Date.now().toString(36)}-${Math.floor(this.wildlifeRandom() * 1e6).toString(36)}`,
        kind,
        position: { x, y, z },
        velocity: { x: 0, y: 0, z: 0 },
        health: MOB_DEFINITIONS[kind].maxHealth,
        yaw: angle + Math.PI,
        targetTimer: 1 + this.wildlifeRandom() * 3,
        attackTimer: 1.2,
        hurtTimer: 0,
      };
      if (!this.world.isSolid(x, y - 0.08, z) || mobIntersectsSolid(this.world, mob)) continue;
      this.world.mobs.push(mob);
      if (this.mode === "survival" && this.world.mobs.filter((candidate) => !MOB_DEFINITIONS[candidate.kind].passive).length === 1) {
        this.callbacks.onToast("Nightfall stirs hostile creatures. Ready a weapon or find shelter.");
      }
      return;
    }
  }

  private createMobMesh(mob: MobState): THREE.Group {
    const group = new THREE.Group();
    const colors: Record<MobState["kind"], [number, number]> = {
      glowgrazer: [0x496e74, 0x8de2d2],
      mireling: [0x48625b, 0x8bc2a2],
      cinderling: [0x8e493d, 0xff9a4c],
      thornback: [0x44543b, 0xa2bd62],
      nightwisp: [0x39445f, 0x91a9ff],
    };
    const rememberColor = (material: THREE.MeshLambertMaterial) => {
      material.userData.baseColor = material.color.getHex();
      return material;
    };
    const palette = colors[mob.kind];
    const bodyMaterial = rememberColor(new THREE.MeshLambertMaterial({ color: palette[0] }));
    const accentMaterial = rememberColor(new THREE.MeshLambertMaterial({ color: palette[1], emissive: palette[1], emissiveIntensity: mob.kind === "nightwisp" ? 0.72 : 0.14 }));
    if (mob.kind === "nightwisp") {
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.46), accentMaterial);
      core.position.y = 0.58;
      core.rotation.set(0.12, 0.18, 0.08);
      group.add(core);
      for (const [index, x] of [-0.24, -0.08, 0.08, 0.24].entries()) {
        const tendril = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42 + (index % 2) * 0.13, 0.09), bodyMaterial);
        tendril.position.set(x, 0.17, 0.05 + Math.abs(x) * 0.3);
        tendril.userData.baseY = tendril.position.y;
        tendril.name = `leg-${index}`;
        group.add(tendril);
      }
      return group;
    }
    const bodyWidth = mob.kind === "thornback" ? 1.02 : 0.78;
    const bodyLength = mob.kind === "thornback" ? 1.2 : 1.02;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 0.62, bodyLength), bodyMaterial);
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.56, 0.56), accentMaterial);
    head.position.set(0, 0.78, -0.58);
    group.add(body, head);
    if (mob.kind === "thornback") {
      for (const z of [-0.35, 0, 0.35]) {
        const spike = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.14), accentMaterial);
        spike.position.set(0, 1.02, z);
        spike.rotation.z = Math.PI / 4;
        group.add(spike);
      }
    } else if (mob.kind === "glowgrazer") {
      for (const x of [-0.24, 0.24]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), accentMaterial);
        horn.position.set(x, 1.12, -0.62);
        horn.rotation.z = x < 0 ? -0.45 : 0.45;
        group.add(horn);
      }
    }
    let legIndex = 0;
    for (const x of [-0.27, 0.27]) {
      for (const z of [-0.32, 0.32]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.18), bodyMaterial);
        leg.position.set(x, 0.22, z);
        leg.userData.baseY = leg.position.y;
        leg.name = `leg-${legIndex}`;
        legIndex += 1;
        group.add(leg);
      }
    }
    return group;
  }

  private updateMobs(dt: number): void {
    const night = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    for (const mob of this.world.mobs) {
      const definition = MOB_DEFINITIONS[mob.kind];
      resolveMobPenetration(this.world, mob);
      let targetPosition = this.physics.position as { x: number; y: number; z: number };
      let targetPeerId: string | undefined;
      let distance = Math.hypot(targetPosition.x - mob.position.x, targetPosition.z - mob.position.z);
      for (const [peerId, player] of this.remotePeerPlayers) {
        const candidateDistance = Math.hypot(player.position.x - mob.position.x, player.position.z - mob.position.z);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          targetPosition = player.position;
          targetPeerId = peerId;
        }
      }
      const dx = targetPosition.x - mob.position.x;
      const dz = targetPosition.z - mob.position.z;
      const hostile = !definition.passive && (night || mob.kind === "cinderling");
      mob.targetTimer -= dt;
      mob.attackTimer = Math.max(0, (mob.attackTimer ?? 0) - dt);
      mob.hurtTimer = Math.max(0, (mob.hurtTimer ?? 0) - dt);
      const fleeing = definition.passive && (mob.hurtTimer ?? 0) > 0;
      if (hostile && distance < 15) mob.yaw = Math.atan2(-dx, -dz);
      else if (fleeing && distance < 9) mob.yaw = Math.atan2(dx, dz);
      else if (mob.targetTimer <= 0) {
        mob.targetTimer = 2 + this.wildlifeRandom() * 5;
        mob.yaw += (this.wildlifeRandom() - 0.5) * Math.PI * 1.3;
      }
      const speed = fleeing
        ? definition.speed * 1.45
        : hostile && distance < 15
          ? definition.speed
          : Math.min(0.74, definition.speed * 0.42);
      let desiredX = -Math.sin(mob.yaw) * speed;
      let desiredZ = -Math.cos(mob.yaw) * speed;
      for (const other of this.world.mobs) {
        if (other === mob) continue;
        const separationX = mob.position.x - other.position.x;
        const separationZ = mob.position.z - other.position.z;
        const separation = Math.hypot(separationX, separationZ);
        const desiredGap = definition.radius + MOB_DEFINITIONS[other.kind].radius + 0.08;
        if (separation > 0.001 && separation < desiredGap) {
          const force = (desiredGap - separation) * 4;
          desiredX += (separationX / separation) * force;
          desiredZ += (separationZ / separation) * force;
        }
      }
      if (distance > 0.001 && distance < definition.radius + 0.42) {
        desiredX -= (dx / distance) * 2.5;
        desiredZ -= (dz / distance) * 2.5;
      }
      const probeX = mob.position.x + desiredX * Math.min(0.28, dt * 2);
      const probeZ = mob.position.z + desiredZ * Math.min(0.28, dt * 2);
      if (this.world.getBlock(probeX, mob.position.y + 0.1, probeZ) === BlockId.Water) {
        mob.yaw += Math.PI * 0.72;
        desiredX *= -0.35;
        desiredZ *= -0.35;
      }
      const movement = moveMobWithCollision(this.world, mob, dt, desiredX, desiredZ);
      if (movement.blocked) {
        mob.yaw += Math.PI * (0.45 + this.wildlifeRandom() * 0.45);
        mob.targetTimer = 0.6;
      }
      resolveMobPenetration(this.world, mob);
      if (hostile && distance < definition.reach && (mob.attackTimer ?? 0) <= 0) {
        mob.attackTimer = 1.45 + this.wildlifeRandom() * 0.55;
        const source = `${definition.name} attack`;
        if (targetPeerId) this.network.send({ type: "damage", amount: definition.damage, source }, targetPeerId);
        else this.damage(definition.damage, source);
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
      const motion = Math.hypot(mob.velocity.x, mob.velocity.z);
      const now = performance.now() / 1000;
      const hover = mob.kind === "nightwisp" ? 0.16 + Math.sin(now * 3.4 + mob.id.length) * 0.12 : 0;
      mesh.position.set(mob.position.x, mob.position.y + hover, mob.position.z);
      mesh.rotation.y = mob.yaw;
      mesh.scale.setScalar((mob.hurtTimer ?? 0) > 0 ? 1.06 : 1);
      let legIndex = 0;
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material;
          const materials = Array.isArray(material) ? material : [material];
          for (const entry of materials) {
            if (entry instanceof THREE.MeshLambertMaterial && typeof entry.userData.baseColor === "number") {
              entry.color.setHex(entry.userData.baseColor);
              if ((mob.hurtTimer ?? 0) > 0) entry.color.lerp(new THREE.Color(0xffe2da), 0.72);
            }
          }
        }
        if (child.name.startsWith("leg-")) {
          const baseY = Number(child.userData.baseY ?? child.position.y);
          child.position.y = baseY + Math.sin(now * (5 + motion) + legIndex * Math.PI) * Math.min(0.09, motion * 0.035);
          legIndex += 1;
        }
      });
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
        mesh = this.createDropMesh(drop.item);
        this.dropMeshes.set(drop.id, mesh);
        this.entityRoot.add(mesh);
      }
      const hover = Math.sin(performance.now() / 310 + drop.id.length) * 0.035;
      mesh.position.set(drop.position.x, drop.position.y + hover, drop.position.z);
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

  private createDropMesh(item: ItemId): THREE.Mesh {
    const blockId = blockForItem(item);
    if (blockId !== null) {
      const geometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
      paintBlockUv(geometry, blockId);
      return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: this.atlas, transparent: !BLOCKS[blockId].opaque, alphaTest: 0.08 }));
    }
    const geometry: THREE.BufferGeometry = item.startsWith("tool:")
      ? new THREE.BoxGeometry(0.09, 0.46, 0.09)
      : item.startsWith("ammo:")
        ? new THREE.BoxGeometry(0.08, 0.08, 0.5)
        : item.startsWith("food:")
          ? new THREE.DodecahedronGeometry(0.19, 0)
          : item.startsWith("consumable:")
            ? new THREE.CylinderGeometry(0.11, 0.14, 0.31, 6)
            : new THREE.OctahedronGeometry(0.2, 0);
    const hue = (hashString(item) % 360) / 360;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(hue, 0.62, 0.61),
      emissive: item.startsWith("ammo:") || item.includes("moonshard") ? 0x294d5d : 0x000000,
      emissiveIntensity: 0.38,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (item.startsWith("tool:")) mesh.rotation.z = 0.65;
    return mesh;
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
    const previousTime = this.timeOfDay;
    this.timeOfDay = (this.timeOfDay + dt / 480) % 1;
    if (previousTime < 0.25 && this.timeOfDay >= 0.25) {
      this.dayCount += 1;
      if (this.mode === "survival") this.objective = `Day ${this.dayCount}: explore farther, improve your gear, and prepare your defenses.`;
    }
    const isNight = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    if (isNight && this.nightAnnouncementDay !== this.dayCount) {
      this.nightAnnouncementDay = this.dayCount;
      if (this.mode === "survival") {
        this.objective = "Nightfall: seek shelter, light the area, or defend yourself until dawn.";
        this.callbacks.onToast(`Night ${this.dayCount} has fallen. Hostile creatures are active.`);
      }
    }
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const solarHeight = Math.sin(angle);
    const daylight = THREE.MathUtils.smoothstep(solarHeight, -0.2, 0.16);
    const dayColor = new THREE.Color(0x8fc8d8);
    const nightColor = new THREE.Color(0x081122);
    const twilightColor = new THREE.Color(0xc17774);
    const sky = nightColor.clone().lerp(dayColor, daylight);
    const twilight = Math.max(0, 1 - Math.abs(solarHeight) / 0.34) * 0.46;
    sky.lerp(twilightColor, twilight);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    this.hemisphere.color.setHex(daylight > 0.28 ? 0xbce9ff : 0x657cb8);
    this.hemisphere.groundColor.setHex(daylight > 0.28 ? 0x5a4a36 : 0x20233a);
    this.hemisphere.intensity = 0.14 + daylight * 1.22;
    this.sun.intensity = 0.025 + daylight * 1.82;
    const orbitRadius = 145;
    const orbitX = Math.cos(angle) * orbitRadius;
    const orbitY = solarHeight * orbitRadius;
    this.sun.position.set(
      this.physics.position.x + orbitX,
      this.physics.position.y + orbitY,
      this.physics.position.z + 44,
    );
    this.sun.target.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    this.sunDisc.position.copy(this.sun.position);
    this.sunDisc.visible = solarHeight > -0.12;
    this.moonDisc.position.set(
      this.physics.position.x - orbitX,
      this.physics.position.y - orbitY,
      this.physics.position.z - 44,
    );
    this.moonDisc.visible = solarHeight < 0.18;
    this.starField.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    const starMaterial = this.starField.material as THREE.PointsMaterial;
    starMaterial.opacity = Math.max(0, 1 - daylight * 1.35);
  }

  private damage(amount: number, source: string): void {
    if (this.mode === "creative") return;
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
    } else if (message.type === "request-mob-hit" && this.network.role === "host") {
      const player = this.remotePeerPlayers.get(peerId);
      const mob = this.world.mobs.find((candidate) => candidate.id === message.mobId);
      if (!player || !mob) return;
      const stats = weaponStats(message.item);
      const origin = new THREE.Vector3(player.position.x, player.position.y + 1.62, player.position.z);
      const center = new THREE.Vector3(
        mob.position.x,
        mob.position.y + MOB_DEFINITIONS[mob.kind].height * 0.55,
        mob.position.z,
      );
      const toMob = center.sub(origin);
      const distance = toMob.length();
      const look = new THREE.Vector3(
        -Math.sin(player.yaw) * Math.cos(player.pitch),
        Math.sin(player.pitch),
        -Math.cos(player.yaw) * Math.cos(player.pitch),
      ).normalize();
      const aim = toMob.clone().normalize();
      const obstruction = voxelRaycast(this.world, origin, aim, stats.reach + 0.9);
      if (
        distance <= stats.reach + 0.9 &&
        look.dot(aim) > 0.55 &&
        (!obstruction || obstruction.distance + 0.3 >= distance)
      ) this.strikeMob(mob, stats, player.position, peerId);
    } else if (message.type === "mob-state" && this.network.role === "guest") {
      this.world.mobs.splice(0, this.world.mobs.length, ...message.mobs.map((mob) => ({
        ...mob,
        position: { ...mob.position },
        velocity: { ...mob.velocity },
      })));
      this.world.drops.splice(0, this.world.drops.length, ...message.drops.map((drop) => ({
        ...drop,
        position: { ...drop.position },
        velocity: { ...drop.velocity },
      })));
      this.timeOfDay = message.timeOfDay;
      this.dayCount = message.dayCount;
    } else if (message.type === "damage" && this.network.role === "guest") {
      this.damage(message.amount, message.source);
    } else if (message.type === "give-item" && this.network.role === "guest") {
      this.collectItem(message.item, message.count);
      this.audio.play("click");
      this.callbacks.onToast(`Collected ${message.count} × ${itemName(message.item)}.`);
    } else if (message.type === "player") {
      this.remotePlayers.set(message.player.id, message.player);
      this.remotePeerPlayers.set(peerId, message.player);
    } else if (message.type === "peer-left") {
      const player = this.remotePeerPlayers.get(message.playerId);
      if (player) this.remotePlayers.delete(player.id);
      this.remotePeerPlayers.delete(message.playerId);
    } else if (message.type === "toast") {
      this.callbacks.onToast(message.text);
    }
  }

  private applyRemoteSnapshot(save: WorldSave): void {
    this.world = new VoxelWorld(save.seed);
    this.wildlifeRandom = seededRandom(hashString(`wildlife:${this.world.seedText}`));
    this.world.loadMutations(save.mutations);
    for (const [key, state] of save.machines) {
      this.world.machines.set(key, { ...state, storage: cloneInventory(state.storage) });
    }
    this.world.drops.push(...save.drops.map((drop) => ({ ...drop, position: { ...drop.position }, velocity: { ...drop.velocity } })));
    this.world.mobs.push(...save.mobs.map((mob) => ({ ...mob, position: { ...mob.position }, velocity: { ...mob.velocity } })));
    this.timeOfDay = save.timeOfDay;
    this.dayCount = save.dayCount ?? this.dayCount;
    this.mode = save.mode ?? this.mode;
    this.inventory = this.mode === "creative" ? creativeInventory() : {};
    this.hotbar = defaultHotbar(this.mode);
    this.selectedSlot = 0;
    this.health = 100;
    this.hunger = 100;
    this.stamina = 100;
    this.viewModel.setItem(this.hotbar[0]);
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
    const mobDefinition = this.targetedMob ? MOB_DEFINITIONS[this.targetedMob.kind] : null;
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
      gameMode: this.mode,
      timeLabel: formatFrontierTime(this.timeOfDay),
      dayCount: this.dayCount,
      targetedMob: this.targetedMob && mobDefinition
        ? { name: mobDefinition.name, health: Math.max(0, this.targetedMob.health), maxHealth: mobDefinition.maxHealth }
        : null,
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
    if (this.mode === "survival" && !Object.entries(recipe.inputs).every(([item, count]) => (this.inventory[item] ?? 0) >= count)) {
      this.callbacks.onToast("You are missing ingredients.");
      return false;
    }
    if (this.mode === "survival") {
      for (const [item, count] of Object.entries(recipe.inputs)) changeItem(this.inventory, item as ItemId, -count);
      this.collectItem(recipe.output.item, recipe.output.count);
    }
    this.audio.play("craft");
    if (this.mode === "survival") {
      this.objective = recipe.output.item === "tool:stone-spear"
        ? "You are armed. Explore by day; hostile creatures emerge after dusk."
        : this.objective;
      this.callbacks.onToast(`Crafted ${recipe.name}.`);
    } else this.callbacks.onToast(`${recipe.name} is already available in the Creative catalog.`);
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
    if (this.mode === "survival") changeItem(this.inventory, item, -count);
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
    this.viewModel.setItem(item);
    this.emitHud();
  }

  setSelectedSlot(slot: number): void {
    this.selectedSlot = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.viewModel.setItem(this.hotbar[this.selectedSlot]);
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
      mode: this.mode,
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
      dayCount: this.dayCount,
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
    this.viewModel.dispose();
    for (const material of this.breakMaterials) {
      material.map?.dispose();
      material.dispose();
    }
    (this.selection.material as THREE.Material).dispose();
    this.starField.geometry.dispose();
    (this.starField.material as THREE.Material).dispose();
    (this.sunDisc.material as THREE.Material).dispose();
    (this.moonDisc.material as THREE.Material).dispose();
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
