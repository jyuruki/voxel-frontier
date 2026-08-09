"use client";

import {
  type CSSProperties,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ALL_ITEMS, BLOCKS, RECIPES, blockForItem, itemDescription, itemName, matchingRecipeInputs, recipeInputOptions } from "./game/blocks";
import { ChestPanelData, GameEngine, MachinePanelData, TradePanelData } from "./game/engine";
import { itemSalePoints } from "./game/economy";
import { HOTBAR_START, INVENTORY_SLOT_COUNT } from "./game/inventory";
import { ItemArt } from "./item-art";
import { NetworkSession } from "./game/network";
import { SMELTING_RECIPES, type FurnaceSlot, furnaceSlotItem } from "./game/smelting";
import { createRandomWorldSeed } from "./game/prng";
import {
  decodeWorldKey,
  downloadWorldKey,
  hasLocalSave,
  loadLocalSave,
} from "./game/save";
import {
  BlockId,
  ChatEntry,
  DEFAULT_SETTINGS,
  GameMode,
  GameSettings,
  HudState,
  ItemId,
  Recipe,
  WorldSave,
} from "./game/types";

type Overlay = "none" | "pause" | "inventory" | "guide" | "options" | "save" | "network" | "machine" | "chest" | "trade";

const EMPTY_HUD: HudState = {
  health: 100,
  hunger: 100,
  stamina: 100,
  selectedSlot: 0,
  hotbar: [],
  inventorySlots: Array(INVENTORY_SLOT_COUNT).fill(null),
  inventory: {},
  targetedBlock: null,
  miningProgress: 0,
  timeOfDay: 0.3,
  biome: "Generating frontier…",
  coordinates: { x: 0, y: 0, z: 0 },
  fps: 0,
  networkStatus: "Offline",
  objective: "Build a working signal circuit.",
  gameMode: "survival",
  flying: false,
  critical: false,
  timeLabel: "07:00 · Dawn",
  dayCount: 1,
  targetedMob: null,
  locatorHeading: "N",
  locatorMarkers: [],
  workbenchActive: false,
  sprinting: false,
  damageFlash: 0,
  damageDirection: 0,
  hitMarker: 0,
  realmLabel: "Living Frontier",
  ridingBoat: false,
};

const ITEM_SOURCE_HINTS: Partial<Record<ItemId, string>> = {
  "part:coal": "Mine Carbon Shale with a wooden pickaxe or better; the ore drops Coal.",
  "part:flux-dust": "Mine a deep Fluxstone Ore seam with a Roughstone Pick or better.",
  "part:diamond": "Mine Diamond Ore near the deepest stone layers with an Iron Pick or better.",
  "part:soft-fiber": "Defeat or harvest sheep; Soft Fiber is their common material drop.",
  "part:rift-core": "Trade with a Wayfarer or clear high-tier dimensional encounters.",
  "part:moonshard": "Cut Moonshard Ore at a Tinker Bench, or defeat Shardcasters in delves.",
  "part:carapace": "Defeat Thornbacks in wild biomes and dungeon encounters.",
  "part:cinder-core": "Defeat Cinderlings in the Emberdeep.",
  "part:feather": "Chickens drop feathers when defeated.",
  "currency:frontier-mark": "Sell gathered or crafted stacks to village Wayfarers, then spend the Marks with any specialist.",
  "food:starfruit": "Gather luminous Starblooms growing in the frontier.",
  "food:glowcut": "Cattle drop Raw Beef.",
  "food:pork": "Pigs drop Raw Pork.",
  "food:chicken": "Chickens drop Raw Chicken.",
};

const GUIDE_ITEMS = ALL_ITEMS.filter((item) => {
  const blockId = blockForItem(item);
  return blockId === null
    || BLOCKS[blockId].collectible
    || RECIPES.some((recipe) => recipe.output.item === item);
});

function acquisitionHint(item: ItemId): string {
  const source = ITEM_SOURCE_HINTS[item];
  if (source) return source;
  const recipe = RECIPES.find((candidate) => candidate.output.item === item);
  if (recipe) {
    const station = recipe.station === "hand"
      ? "your inventory"
      : recipe.station === "workbench"
        ? "a placed Tinker Bench"
        : recipe.station === "furnace"
          ? "a Hearth Furnace"
          : "a Fabricator";
    const ingredients = Object.entries(recipeInputOptions(recipe)[0])
      .map(([ingredient, count]) => `${count} ${itemName(ingredient as ItemId)}`)
      .join(", ");
    return `Make ${recipe.output.count} at ${station} using ${ingredients}.`;
  }
  const blockId = blockForItem(item);
  if (blockId !== null) {
    const definition = BLOCKS[blockId];
    const verb = definition.shape === "cross" ? "Gather" : "Mine or reclaim";
    return `${verb} ${definition.name} in the world with an appropriate tool.`;
  }
  return "Find this through exploration, creature drops, dungeon rewards, or Wayfarer trading.";
}

function ItemIcon({ item, count, compact = false }: { item: ItemId; count?: number | string; compact?: boolean }) {
  return (
    <span
      className={`item-icon ${compact ? "item-icon--compact" : ""}`}
      title={itemName(item)}
    >
      <ItemArt item={item} />
      {count !== undefined && <span className="item-icon__count">{count}</span>}
    </span>
  );
}

function InventorySlotGrid({
  slots,
  inventory,
  creative,
  selectedHotbar,
  onMove,
  onShift,
}: {
  slots: Array<ItemId | null>;
  inventory: Record<string, number>;
  creative: boolean;
  selectedHotbar: number;
  onMove: (from: number, to: number) => void;
  onShift: (slot: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from !== to) onMove(from, to);
    setPicked(null);
  };
  return (
    <div className="slot-grid" role="grid" aria-label="Four row inventory; bottom row is the hotbar">
      {Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
        const item = slots[index] ?? null;
        const isHotbar = index >= HOTBAR_START;
        const hotbarNumber = isHotbar ? index - HOTBAR_START + 1 : null;
        return (
          <button
            type="button"
            key={index}
            role="gridcell"
            className={`inventory-slot ${isHotbar ? "inventory-slot--hotbar" : ""} ${hotbarNumber === selectedHotbar + 1 ? "inventory-slot--selected" : ""} ${picked === index ? "inventory-slot--picked" : ""}`}
            aria-label={item ? `${itemName(item)}, ${creative ? "infinite" : inventory[item] ?? 0}` : `Empty ${isHotbar ? `hotbar ${hotbarNumber}` : "inventory"} slot`}
            onClick={(event) => {
              if (event.shiftKey && item) {
                onShift(index);
                setPicked(null);
              } else if (picked !== null) move(picked, index);
              else if (item) setPicked(index);
            }}
          >
            {hotbarNumber && <span className="inventory-slot__number">{hotbarNumber}</span>}
            {item && <ItemIcon item={item} count={creative ? "∞" : inventory[item] ?? 0} />}
            {item && (
              <span className="inventory-tooltip" role="tooltip">
                <strong>{itemName(item)}</strong>
                <span>{itemDescription(item)}</span>
                <small>{isHotbar ? `Hotbar ${hotbarNumber}` : `Inventory row ${Math.floor(index / 9) + 1}`} · Shift-click to transfer</small>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="meter" aria-label={`${label}: ${Math.round(value)} percent`}>
      <span>{label}</span>
      <div className="meter__track">
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
      </div>
    </div>
  );
}

interface StickProps {
  onMove: (x: number, y: number) => void;
  leftHanded: boolean;
  opacity: number;
}

function MoveStick({ onMove, leftHanded, opacity }: StickProps) {
  const root = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width * 0.36;
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) {
      x = (x / length) * radius;
      y = (y / length) * radius;
    }
    setKnob({ x, y });
    onMove(x / radius, -y / radius);
  };
  const release = () => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={root}
      className={`move-stick ${leftHanded ? "move-stick--right" : ""}`}
      style={{ opacity }}
      onPointerDown={(event) => {
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointerId.current === event.pointerId) update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Movement joystick"
    >
      <span className="move-stick__ring" />
      <span className="move-stick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function TouchLookZone({ onLook, leftHanded }: { onLook: (x: number, y: number) => void; leftHanded: boolean }) {
  const pointerId = useRef<number | null>(null);
  const previous = useRef({ x: 0, y: 0 });
  return (
    <div
      className={`touch-look ${leftHanded ? "touch-look--left" : ""}`}
      onPointerDown={(event) => {
        pointerId.current = event.pointerId;
        previous.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onLook((event.clientX - previous.current.x) * 1.35, (event.clientY - previous.current.y) * 1.35);
        previous.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => { pointerId.current = null; }}
      onPointerCancel={() => { pointerId.current = null; }}
      aria-label="Camera look area"
    />
  );
}

function HoldButton({
  label,
  className = "",
  onChange,
}: {
  label: string;
  className?: string;
  onChange: (pressed: boolean) => void;
}) {
  return (
    <button
      className={`touch-button ${className}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export default function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [network] = useState(() => new NetworkSession());

  const [session, setSession] = useState<{ id: number; seed: string; mode: GameMode; save?: WorldSave | null } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [playerName, setPlayerName] = useState("Traveler");
  const [seed, setSeed] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("survival");
  const [saveAvailable, setSaveAvailable] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [toast, setToast] = useState("");
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [exportValue, setExportValue] = useState("");
  const [recipeFilter, setRecipeFilter] = useState<"craftable" | "all">("craftable");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [machine, setMachine] = useState<MachinePanelData | null>(null);
  const [chest, setChest] = useState<ChestPanelData | null>(null);
  const [trade, setTrade] = useState<TradePanelData | null>(null);
  const [craftingStation, setCraftingStation] = useState<"hand" | "workbench">("hand");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [networkMode, setNetworkMode] = useState<"host" | "join">("host");
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [chatClock, setChatClock] = useState(0);
  const toastTimer = useRef<number | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3100);
  }, []);

  useEffect(() => {
    const hydrationFrame = window.requestAnimationFrame(() => {
      setSaveAvailable(hasLocalSave());
      setIsTouch(window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
      const storedSettings = localStorage.getItem("voxel-frontier.settings.v1");
      const storedName = localStorage.getItem("voxel-frontier.player-name");
      if (storedName) setPlayerName(storedName);
      if (storedSettings) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
        } catch {
          localStorage.removeItem("voxel-frontier.settings.v1");
        }
      }
    });
    return () => window.cancelAnimationFrame(hydrationFrame);
  }, []);

  useEffect(() => {
    if (chatOpen) window.setTimeout(() => chatInputRef.current?.focus(), 0);
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen || chatEntries.length === 0) return;
    const expiresAt = Math.max(...chatEntries.map((entry) => entry.timestamp)) + 5_600;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setChatClock(now);
      if (now >= expiresAt) window.clearInterval(timer);
    }, 400);
    return () => window.clearInterval(timer);
  }, [chatOpen, chatEntries]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      else showToast("Fullscreen is not available in this browser. Add the game to your home screen for an app-like view.");
    } catch {
      showToast("The browser blocked fullscreen. Try again after tapping directly inside the game.");
    }
  }, [showToast]);

  const openOverlay = useCallback((next: Overlay) => {
    engineRef.current?.pause();
    setOverlay(next);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay("none");
    engineRef.current?.resume();
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatText("");
    engineRef.current?.resumeInputCapture();
  }, []);

  const toggleInventory = useCallback((station: "hand" | "workbench" = "hand") => {
    setOverlay((current) => {
      if (current === "inventory") {
        engineRef.current?.resume();
        return "none";
      }
      setCraftingStation(station);
      engineRef.current?.pause();
      return "inventory";
    });
  }, []);

  useEffect(() => {
    if (!session || !canvasRef.current) return;
    let engine: GameEngine;
    try {
      engine = new GameEngine({
        canvas: canvasRef.current,
        seed: session.seed,
        save: session.save,
        settings,
        playerName,
        mode: session.mode,
        network,
        callbacks: {
          onHud: setHud,
          onInventory: (station) => toggleInventory(station ?? "hand"),
          onPause: () => openOverlay("pause"),
          onGuide: () => openOverlay("guide"),
          onMachine: (data) => {
            setMachine(data);
            openOverlay("machine");
          },
          onChest: (data) => {
            setChest(data);
            openOverlay("chest");
          },
          onTrade: (data) => {
            setTrade(data);
            openOverlay("trade");
          },
          onChatOpen: () => setChatOpen(true),
          onChat: (entry) => {
            const received = { ...entry, timestamp: Date.now() };
            setChatClock(received.timestamp);
            setChatEntries((current) => [...current.filter((candidate) => candidate.id !== received.id), received].slice(-30));
          },
          onToast: showToast,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The 3D renderer could not start.";
      window.setTimeout(() => setLaunchError(message), 0);
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // A session ID intentionally owns one engine lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    localStorage.setItem("voxel-frontier.settings.v1", JSON.stringify(settings));
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("voxel-frontier.player-name", playerName);
  }, [playerName]);

  const begin = (worldSeed: string, save?: WorldSave | null, mode: GameMode = save?.mode ?? gameMode) => {
    const normalized = worldSeed.trim() || createRandomWorldSeed();
    setHud({ ...EMPTY_HUD, gameMode: mode });
    setLaunchError("");
    setOverlay("none");
    setChatOpen(false);
    setChatEntries([]);
    setSession({ id: Date.now(), seed: normalized, mode, save });
  };

  const continueWorld = () => {
    const save = loadLocalSave();
    if (!save) {
      showToast("No valid local world was found.");
      setSaveAvailable(false);
      return;
    }
    begin(save.seed, save);
  };

  const importWorld = () => {
    try {
      const save = decodeWorldKey(importValue);
      setImportError("");
      begin(save.seed, save);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read that world key.");
    }
  };

  const exitWorld = () => {
    engineRef.current?.saveNow(false);
    network.close();
    setSession(null);
    setOverlay("none");
    setSaveAvailable(true);
  };

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const inventoryTypes = Object.values(hud.inventory).filter((count) => count > 0).length;

  const heldItem = hud.hotbar[hud.selectedSlot] ?? null;
  const visibleChatEntries = chatOpen
    ? chatEntries.slice(-30)
    : chatEntries.filter((entry) => chatClock - entry.timestamp < 5_600).slice(-4);

  const refreshMachine = () => {
    if (!machine) return;
    const latest = engineRef.current?.getMachine(machine.key);
    if (latest) setMachine(latest);
  };

  const refreshChest = () => {
    if (!chest) return;
    const latest = engineRef.current?.getChest(chest.keys[0]);
    if (latest) setChest(latest);
  };

  useEffect(() => {
    if (overlay !== "machine" || !machine?.key) return;
    const key = machine.key;
    const timer = window.setInterval(() => {
      const latest = engineRef.current?.getMachine(key);
      if (latest) setMachine(latest);
    }, 250);
    return () => window.clearInterval(timer);
  }, [overlay, machine?.key]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied.`);
    } catch {
      showToast("Clipboard access was blocked. Select and copy the text manually.");
    }
  };

  if (!session) {
    return (
      <main className="landing">
        <div className="landing__sky" />
        <div className="landing__terrain landing__terrain--back" />
        <div className="landing__terrain landing__terrain--front" />
        <header className="landing__header">
          <div className="brand brand--large">
            <span className="brand__mark"><i /><i /><i /></span>
            <span><strong>VOXEL</strong><em>FRONTIER</em></span>
          </div>
          <span className="build-tag">Realmworks · Version 10</span>
        </header>

        <section className="landing__content">
          <div className="hero-copy">
            <p className="eyebrow">Shape the wild. Let the world answer.</p>
            <h1>Build a world worth sharing.</h1>
            <p>
              Explore open cave mouths, build working Fluxstone circuits, sail with friends, and enter vast procedural guardian delves in their own realms.
            </p>
            <div className="feature-chips">
              <span>Readable combat</span><span>Working boats</span><span>Rebuilt Fluxstone</span><span>Realm delves</span>
            </div>
          </div>

          <div className="launch-card">
            <div className="launch-card__top">
              <span className="status-dot" />
              <span>Frontier terminal online</span>
            </div>
            <label>
              Traveler name
              <input value={playerName} maxLength={18} onChange={(event) => setPlayerName(event.target.value)} placeholder="Traveler" />
            </label>
            <label>
              World seed
              <div className="seed-row">
                <input value={seed} maxLength={42} onChange={(event) => setSeed(event.target.value)} placeholder="Blank = a fresh random world" />
                <button className="icon-button" onClick={() => setSeed(createRandomWorldSeed())} title="Generate a visible random seed">↻</button>
              </div>
              <small>Leave this blank for a different seed every time. Enter a phrase only when you want to replay a specific world.</small>
            </label>
            <fieldset className="mode-picker">
              <legend>World mode</legend>
              <button type="button" className={gameMode === "survival" ? "selected" : ""} onClick={() => setGameMode("survival")}>
                <span className="mode-picker__mark">◇</span>
                <span><strong>Survival</strong><small>Start with nothing. Gather, craft, eat, fight, and endure the night.</small></span>
              </button>
              <button type="button" className={gameMode === "creative" ? "selected" : ""} onClick={() => setGameMode("creative")}>
                <span className="mode-picker__mark">∞</span>
                <span><strong>Creative</strong><small>Infinite catalog, one-click mining, free flight, and no survival damage.</small></span>
              </button>
            </fieldset>
            <button className="primary-button primary-button--large" onClick={() => begin(seed)}>
              Begin {gameMode} world <span>→</span>
            </button>
            <button className="secondary-button" disabled={!saveAvailable} onClick={continueWorld}>
              {saveAvailable ? "Continue local world" : "No local world yet"}
            </button>
            <details className="import-panel">
              <summary>Import a world key</summary>
              <textarea value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="Paste a VF2 world key…" />
              {importError && <p className="form-error">{importError}</p>}
              <button className="secondary-button" onClick={importWorld}>Open imported world</button>
            </details>
            <div className="launch-card__footer">
              <button onClick={() => setOverlay("guide")}>Field guide</button>
              <button onClick={() => setOverlay("options")}>Options</button>
            </div>
          </div>
        </section>

        <footer className="landing__footer">
          <span>100% original procedural textures, synthesized sound, code, and creature designs.</span>
          <span>Desktop · iPhone · Android</span>
        </footer>

        {overlay === "guide" && <GuideModal onClose={() => setOverlay("none")} />}
        {overlay === "options" && (
          <OptionsModal settings={settings} update={updateSetting} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} onOpenGuide={() => setOverlay("guide")} onClose={() => setOverlay("none")} />
        )}
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="game-shell" onContextMenu={(event) => event.preventDefault()}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Voxel Frontier 3D world" />
      <div className="vignette" />
      <div
        className="damage-feedback"
        style={{
          opacity: hud.damageFlash,
          "--damage-angle": `${hud.damageDirection}rad`,
        } as CSSProperties}
        aria-hidden="true"
      ><i /></div>
      {launchError && (
        <div className="graphics-error" role="alert">
          <div className="brand brand--hud"><span className="brand__mark"><i /><i /><i /></span><span><strong>VOXEL</strong><em>FRONTIER</em></span></div>
          <p className="eyebrow">3D renderer unavailable</p>
          <h1>This browser could not open a WebGL canvas.</h1>
          <p>{launchError} Enable hardware acceleration or open the game in a current version of Safari, Chrome, Edge, or Firefox.</p>
          <button className="primary-button" onClick={() => { setSession(null); setLaunchError(""); }}>Return to title</button>
        </div>
      )}
      <div className={`crosshair ${hud.targetedMob ? "crosshair--hostile" : ""}`} aria-hidden="true"><i /><i /></div>
      <div className="hit-confirm" style={{ opacity: hud.hitMarker }} aria-hidden="true"><i /><i /><i /><i /></div>
      {hud.critical && <div className="critical-hit" role="status">CRITICAL!</div>}

      <div className="hud-top-left">
        <div className="brand brand--hud">
          <span className="brand__mark"><i /><i /><i /></span>
          <span><strong>VOXEL</strong><em>FRONTIER</em></span>
        </div>
        <div className="location-card">
          <strong>{hud.realmLabel} · {hud.biome}</strong>
          <span>{hud.coordinates.x} · {hud.coordinates.y} · {hud.coordinates.z}</span>
          <span>{hud.timeLabel} · Day {hud.dayCount} · {hud.gameMode}{hud.flying ? " · flying" : ""}</span>
        </div>
      </div>

      <button className="pause-button" onClick={() => openOverlay("pause")} aria-label="Pause game">Ⅱ</button>
      {isTouch && (
        <button className="touch-chat-utility" onPointerDown={(event) => {
          event.preventDefault();
          if (chatOpen) closeChat();
          else engineRef.current?.beginChat();
        }} aria-label={chatOpen ? "Close chat archive" : "Open chat archive"}>{chatOpen ? "CLOSE" : "CHAT"}</button>
      )}

      {hud.targetedMob && (
        <div className="combat-target" aria-label={`${hud.targetedMob.name} health`}>
          <div><span>{hud.targetedMob.name === "Wayfarer" ? "MERCHANT" : "CREATURE"}</span><strong>{hud.targetedMob.name}</strong></div>
          <div className="combat-target__track"><i style={{ width: `${(hud.targetedMob.health / hud.targetedMob.maxHealth) * 100}%` }} /></div>
          <small>{Math.ceil(hud.targetedMob.health)} / {hud.targetedMob.maxHealth}</small>
        </div>
      )}

      <div className="hud-status">
        <Meter label="HEALTH" value={hud.health} tone="#ef725d" />
        <Meter label="NUTRITION" value={hud.hunger} tone="#e4b859" />
      </div>

      <div className="network-pill"><span className={network.role === "offline" ? "" : "online"} />{hud.networkStatus}</div>
      {settings.showFps && <div className="fps-pill">{hud.fps} FPS</div>}

      <div className="held-item-label" aria-live="polite">
        {hud.ridingBoat ? "Sailing · sneak to leave" : heldItem ? itemName(heldItem) : "Empty hand"}
      </div>
      <div className="locator-bar" aria-label={`Player locator, facing ${hud.locatorHeading}`}>
        <span className="locator-bar__edge">‹</span>
        <div className="locator-bar__track">
          <i className="locator-bar__tick locator-bar__tick--left" />
          <i className="locator-bar__tick locator-bar__tick--center" />
          <i className="locator-bar__tick locator-bar__tick--right" />
          {hud.locatorMarkers.map((marker) => (
            <span
              key={marker.id}
              className={`locator-marker locator-marker--${marker.vertical}`}
              style={{
                "--marker-color": marker.color,
                "--marker-left": `${50 + marker.offset * 47}%`,
                "--marker-scale": marker.scale,
              } as CSSProperties}
              title={`${marker.name} · ${Math.round(marker.distance)} blocks · ${marker.vertical}`}
            >
              <i />
              <small>{marker.vertical === "above" ? "▲" : marker.vertical === "below" ? "▼" : ""}</small>
            </span>
          ))}
        </div>
        <strong>{hud.locatorHeading}</strong>
        <span className="locator-bar__edge">›</span>
      </div>
      <div className="hotbar" role="toolbar" aria-label="Hotbar">
        {Array.from({ length: 9 }, (_, index) => {
          const item = hud.hotbar[index];
          return (
            <button
              key={index}
              className={hud.selectedSlot === index ? "selected" : ""}
              onClick={() => engineRef.current?.setSelectedSlot(index)}
              aria-label={item ? `${index + 1}: ${itemName(item)}` : `Empty slot ${index + 1}`}
            >
              <span className="hotbar__number">{index + 1}</span>
              {item && <ItemIcon item={item} count={hud.gameMode === "creative" ? "∞" : hud.inventory[item] ?? 0} />}
            </button>
          );
        })}
      </div>

      <div className={`chat-feed ${chatOpen ? "chat-feed--open" : ""}`} aria-live="polite">
        {chatOpen && <div className="chat-archive-heading"><strong>CHAT ARCHIVE</strong><span>{chatEntries.length} recent</span><button type="button" onClick={closeChat} aria-label="Close chat">×</button></div>}
        {visibleChatEntries.map((entry) => (
          <p key={entry.id} className={`chat-entry chat-entry--${entry.kind} ${chatOpen ? "" : "chat-entry--transient"}`}>
            {entry.kind === "chat" ? <><strong>{entry.name}</strong><span>{entry.text}</span></> : <span><strong>{entry.name}</strong> {entry.text}</span>}
          </p>
        ))}
      </div>
      {chatOpen && (
        <form className="chat-input" onSubmit={(event) => {
          event.preventDefault();
          engineRef.current?.sendChat(chatText);
          closeChat();
        }}>
          <input
            ref={chatInputRef}
            value={chatText}
            maxLength={180}
            onChange={(event) => setChatText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeChat();
            }}
            placeholder={network.role === "offline" ? "Write a local note…" : "Message the room…"}
            aria-label="Chat message"
          />
          <button type="submit">SEND</button>
        </form>
      )}

      {!isTouch && (
        <div className="desktop-hints">
          <span><kbd>WASD</kbd> move / swim</span><span><kbd>R</kbd> toggle run</span><span><kbd>SHIFT</kbd> crouch / dive</span><span><kbd>SPACE</kbd> jump / ascend</span><span><kbd>Q</kbd> drop item</span><span><kbd>T</kbd> chat</span><span><kbd>V</kbd> creative flight</span><span><kbd>LMB</kbd> mine / attack</span><span><kbd>RMB</kbd> place / use</span><span><kbd>F</kbd> interact</span><span><kbd>X</kbd> rotate machinery</span><span><kbd>E</kbd> inventory</span>
        </div>
      )}

      {isTouch && overlay === "none" && !chatOpen && (
        <div className="touch-controls">
          <TouchLookZone leftHanded={settings.leftHanded} onLook={(x, y) => engineRef.current?.addLook(x, y)} />
          <MoveStick
            leftHanded={settings.leftHanded}
            opacity={settings.touchOpacity}
            onMove={(x, y) => engineRef.current?.setMove(x, y)}
          />
          <div className={`touch-actions ${settings.leftHanded ? "touch-actions--left" : ""}`} style={{ opacity: settings.touchOpacity }}>
            <HoldButton label="ATTACK" className="touch-button--attack" onChange={(pressed) => engineRef.current?.setAction("mine", pressed)} />
            <HoldButton label="PLACE / USE" className="touch-button--place" onChange={(pressed) => engineRef.current?.setAction("place", pressed)} />
            <HoldButton label="JUMP" onChange={(pressed) => engineRef.current?.setAction("jump", pressed)} />
            <HoldButton label="SNEAK" className="touch-button--sneak" onChange={(pressed) => engineRef.current?.setAction("crouch", pressed)} />
          </div>
        </div>
      )}

      {overlay === "pause" && (
        <Modal title="Frontier paused" eyebrow={`${hud.gameMode} · ${hud.timeLabel} · Day ${hud.dayCount}`} onClose={closeOverlay}>
          <div className="menu-stack">
            <button className="primary-button" onClick={closeOverlay}>Resume expedition</button>
            <button className="secondary-button" onClick={() => { setCraftingStation("hand"); setOverlay("inventory"); }}>Inventory & crafting</button>
            <button className="secondary-button" onClick={() => setOverlay("network")}>Online room</button>
            <button className="secondary-button" onClick={() => setOverlay("save")}>Save & world key</button>
            <button className="secondary-button" onClick={() => setOverlay("guide")}>Guidebook</button>
            <button className="secondary-button" onClick={() => setOverlay("options")}>Options</button>
            <button className="text-button danger" onClick={exitWorld}>Save and return to title</button>
          </div>
        </Modal>
      )}

      {overlay === "inventory" && (
        <Modal title="Inventory & crafting" eyebrow={`${inventoryTypes} resource types · 4 × 9 slots`} onClose={closeOverlay} wide>
          <div className="inventory-workspace">
            <section className="inventory-panel">
              <header className="workspace-heading">
                <div><p className="eyebrow">Your pack</p><h3>Inventory</h3></div>
                <span>Click a stack, then click its destination · shift-click to transfer</span>
              </header>
              {inventoryTypes === 0 && hud.gameMode === "survival" && <div className="empty-inventory"><strong>Your pack is empty.</strong><span>Mine an Emberwood log by hand to begin.</span></div>}
              <InventorySlotGrid
                slots={hud.inventorySlots}
                inventory={hud.inventory}
                creative={hud.gameMode === "creative"}
                selectedHotbar={hud.selectedSlot}
                onMove={(from, to) => engineRef.current?.moveInventorySlot(from, to)}
                onShift={(slot) => engineRef.current?.shiftInventorySlot(slot)}
              />
              <p className="inventory-help">The separated bottom row is your hotbar. On touch screens, tap one occupied slot and then its destination.</p>
              <div className="inventory-actions">
                <button className="secondary-button" disabled={!heldItem} onClick={() => engineRef.current?.dropSelectedItem(false)}>Drop one held item</button>
                <button className="secondary-button" disabled={!heldItem} onClick={() => engineRef.current?.dropSelectedItem(true)}>Drop held stack</button>
              </div>
              {hud.gameMode === "creative" && (
                <details className="creative-catalog">
                  <summary>Creative catalog · all blocks and items</summary>
                  <input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search creative catalog…" />
                  <div className="catalog-grid">
                    {ALL_ITEMS.filter((item) => {
                      const query = catalogSearch.trim().toLowerCase();
                      return !query || itemName(item).toLowerCase().includes(query) || itemDescription(item).toLowerCase().includes(query);
                    }).map((item) => (
                      <button key={item} onClick={() => engineRef.current?.assignInventorySlot(HOTBAR_START + hud.selectedSlot, item)} title={`${itemName(item)} — ${itemDescription(item)}`}>
                        <ItemIcon item={item} compact /><span>{itemName(item)}</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </section>
            <section className="crafting-panel">
              <header className="workspace-heading">
                <div><p className="eyebrow">Recipe book</p><h3>Crafting</h3></div>
                <span>Hand and Tinker Bench recipes</span>
              </header>
              <div className="recipe-toolbar">
                <input type="search" value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search recipes or ingredients…" />
                <div role="group" aria-label="Recipe filter">
                  <button className={recipeFilter === "craftable" ? "active" : ""} onClick={() => setRecipeFilter("craftable")}>Craftable now</button>
                  <button className={recipeFilter === "all" ? "active" : ""} onClick={() => setRecipeFilter("all")}>All recipes</button>
                </div>
              </div>
              <RecipeList
                recipes={RECIPES}
                inventory={hud.inventory}
                creative={hud.gameMode === "creative"}
                workbenchActive={craftingStation === "workbench"}
                filter={recipeFilter}
                search={recipeSearch}
                onCraft={(id) => engineRef.current?.craft(id)}
              />
            </section>
          </div>
        </Modal>
      )}

      {overlay === "guide" && <GuideModal onClose={closeOverlay} />}
      {overlay === "options" && <OptionsModal settings={settings} update={updateSetting} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} onOpenGuide={() => setOverlay("guide")} onClose={closeOverlay} />}

      {overlay === "save" && (
        <Modal title="World key" eyebrow="Portable save state" onClose={closeOverlay} wide>
          <p className="modal-copy">
            Your seed, terrain edits, position, inventory, machines, creatures, and time are compressed into this key. It grows as you change more blocks.
          </p>
          <div className="button-row">
            <button className="primary-button" onClick={() => {
              const value = engineRef.current?.exportKey() ?? "";
              setExportValue(value);
            }}>Generate current key</button>
            <button className="secondary-button" onClick={() => engineRef.current?.saveNow()}>Save locally</button>
          </div>
          <textarea className="key-field" readOnly value={exportValue} placeholder="Generate a key to display it here." />
          {exportValue && (
            <div className="button-row">
              <button className="secondary-button" onClick={() => void copyText(exportValue, "World key")}>Copy key</button>
              <button className="secondary-button" onClick={() => downloadWorldKey(exportValue, session.seed)}>Download text file</button>
              <span className="key-size">{exportValue.length.toLocaleString()} characters</span>
            </div>
          )}
        </Modal>
      )}

      {overlay === "network" && (
        <Modal title="Online room" eyebrow="Server-backed multiplayer · Version 10" onClose={closeOverlay} wide>
          <div className="network-callout">
            <strong>Share one six-character code. Both players connect to the same room server.</strong>
            <span>No SDP exchange, router negotiation, or manual answer key. The server routes authoritative world updates, preserves world and per-player checkpoints, reconnects interrupted browsers, and promotes a guest if the host leaves.</span>
          </div>
          {!network.serverConfigured && <p className="form-error">This build does not have a multiplayer server URL yet. The game server must be deployed before online rooms can open.</p>}
          <div className="tab-row">
            <button className={networkMode === "host" ? "active" : ""} onClick={() => setNetworkMode("host")}>Host this world</button>
            <button className={networkMode === "join" ? "active" : ""} onClick={() => setNetworkMode("join")}>Join a host</button>
          </div>
          {networkMode === "host" ? (
            <div className="quick-room">
              <div className="quick-room__copy"><span className="step-number">1</span><div><h3>Open a room</h3><p>Keep this tab open. Any friend can join with the same code.</p></div></div>
              <button className="primary-button" disabled={networkBusy || !network.serverConfigured} onClick={async () => {
                setNetworkBusy(true);
                try {
                  const code = await network.hostRoom();
                  setRoomCode(code);
                  setRoomCodeInput(code);
                  showToast("Room opened. Share the code with your friend.");
                } catch (error) { showToast(error instanceof Error ? error.message : "Could not open a room."); }
                setNetworkBusy(false);
              }}>{networkBusy ? "Opening server room…" : roomCode && network.role === "host" ? "Create a new code" : "Create room code"}</button>
              {roomCode && network.role === "host" && (
                <div className="room-code-card">
                  <small>YOUR ROOM CODE</small><strong>{roomCode}</strong>
                  <button className="secondary-button" onClick={() => void copyText(roomCode, "Room code")}>Copy code</button>
                </div>
              )}
            </div>
          ) : (
            <div className="quick-room">
              <div className="quick-room__copy"><span className="step-number">1</span><div><h3>Enter the host&apos;s code</h3><p>The room server will synchronize the host&apos;s world automatically.</p></div></div>
              <div className="room-code-entry">
                <input value={roomCodeInput} maxLength={6} autoCapitalize="characters" spellCheck={false} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} placeholder="F7K2P9" />
                <button className="primary-button" disabled={roomCodeInput.trim().length !== 6 || networkBusy || !network.serverConfigured} onClick={async () => {
                  setNetworkBusy(true);
                  try {
                    const code = await network.joinRoomCode(roomCodeInput);
                    setRoomCode(code);
                    showToast(`Joining ${code}…`);
                  } catch (error) { showToast(error instanceof Error ? error.message : "Could not join the room."); }
                  setNetworkBusy(false);
                }}>{networkBusy ? "Joining server room…" : "Join room"}</button>
              </div>
            </div>
          )}
          {network.role !== "offline" && <button className="text-button danger" onClick={() => { network.close(); setRoomCode(""); }}>Leave online room</button>}
          <p className="network-status-line"><span className={network.role === "offline" ? "" : "online"} /> {hud.networkStatus}</p>
        </Modal>
      )}

      {overlay === "machine" && machine && (
        machine.id === BlockId.HearthFurnace ? (
          <FurnaceModal
            machine={machine}
            inventory={hud.inventory}
            inventorySlots={hud.inventorySlots}
            creative={hud.gameMode === "creative"}
            onClose={closeOverlay}
            onDeposit={(slot, item, count, sourceSlot) => {
              engineRef.current?.depositToFurnace(machine.key, slot, item, count, sourceSlot);
              refreshMachine();
            }}
            onWithdraw={(slot, count, targetSlot) => {
              engineRef.current?.withdrawFromFurnace(machine.key, slot, count, targetSlot);
              refreshMachine();
            }}
            onMoveInventory={(from, to) => engineRef.current?.moveInventorySlot(from, to)}
          />
        ) : (
          <MachineModal
            machine={machine}
            inventory={hud.inventory}
            onClose={closeOverlay}
            onToggle={() => { engineRef.current?.toggleMachine(machine.key); refreshMachine(); }}
            onRotate={() => { engineRef.current?.rotateMachine(machine.key); refreshMachine(); }}
            onConfigure={(value) => { engineRef.current?.configureMachine(machine.key, value); refreshMachine(); }}
            onDeposit={(item) => { engineRef.current?.transferToMachine(machine.key, item); refreshMachine(); }}
            onWithdraw={(item) => { engineRef.current?.transferFromMachine(machine.key, item); refreshMachine(); }}
          />
        )
      )}

      {overlay === "chest" && chest && (
        <ChestModal
          chest={chest}
          inventory={hud.inventory}
          inventorySlots={hud.inventorySlots}
          creative={hud.gameMode === "creative"}
          onClose={closeOverlay}
          onWithdraw={(slot, count, targetSlot) => {
            engineRef.current?.withdrawFromChest(chest.keys[0], slot, count, targetSlot);
            refreshChest();
          }}
          onDepositAt={(item, count, targetSlot, sourceSlot) => {
            engineRef.current?.depositToChest(chest.keys[0], item, count, targetSlot, sourceSlot);
            refreshChest();
          }}
          onMoveChest={(sourceSlot, targetSlot) => {
            engineRef.current?.moveChestSlot(chest.keys[0], sourceSlot, targetSlot);
            refreshChest();
          }}
          onMoveInventory={(sourceSlot, targetSlot) => {
            engineRef.current?.moveInventorySlot(sourceSlot, targetSlot);
            refreshChest();
          }}
        />
      )}

      {overlay === "trade" && trade && (
        <TradeModal
          trade={trade}
          inventory={hud.inventory}
          inventorySlots={hud.inventorySlots}
          creative={hud.gameMode === "creative"}
          onClose={closeOverlay}
          onTrade={(offerId) => engineRef.current?.trade(trade.mobId, offerId)}
          onSell={(item, count) => engineRef.current?.sellToMerchant(trade.mobId, item, count)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RecipeList({
  recipes,
  inventory,
  creative,
  workbenchActive,
  filter,
  search,
  onCraft,
}: {
  recipes: Recipe[];
  inventory: Record<string, number>;
  creative: boolean;
  workbenchActive: boolean;
  filter: "craftable" | "all";
  search: string;
  onCraft: (id: string) => void;
}) {
  const query = search.trim().toLowerCase();
  const visible = recipes.filter((recipe) => {
    if (recipe.station === "fabricator" || recipe.station === "furnace") return false;
    const directRecipe = recipe.station === "hand" || (recipe.station === "workbench" && workbenchActive);
    const canCraft = directRecipe && (creative || Boolean(matchingRecipeInputs(recipe, inventory)));
    if (filter === "craftable" && !canCraft) return false;
    if (!query) return true;
    return recipe.name.toLowerCase().includes(query)
      || recipe.description.toLowerCase().includes(query)
      || recipeInputOptions(recipe).some((option) => Object.keys(option).some((item) => itemName(item as ItemId).toLowerCase().includes(query)));
  });
  return (
    <div className="recipe-list">
      {visible.length === 0 && <div className="empty-inventory"><strong>No matching recipes.</strong><span>Switch to All recipes or try another search.</span></div>}
      {visible.map((recipe) => {
        const directRecipe = recipe.station === "hand" || (recipe.station === "workbench" && workbenchActive);
        const matchingInputs = matchingRecipeInputs(recipe, inventory);
        const displayedInputs = matchingInputs ?? recipeInputOptions(recipe)[0];
        const canCraft = directRecipe && (creative || Boolean(matchingInputs));
        return (
          <article key={recipe.id}>
            <ItemIcon item={recipe.output.item} count={recipe.output.count} />
            <div>
              <div className="recipe-list__title"><h3>{recipe.name}</h3><span>{recipe.station}</span></div>
              <p>{recipe.description}</p>
              <div className="ingredient-row">
                {Object.entries(displayedInputs).map(([item, count]) => (
                  <span key={item} className={(inventory[item] ?? 0) >= count ? "ready" : "missing"}>
                    {itemName(item as ItemId)} {inventory[item] ?? 0}/{count}
                  </span>
                ))}
              </div>
            </div>
            <button className="secondary-button" disabled={!canCraft} onClick={() => onCraft(recipe.id)}>{creative ? "Take" : "Craft"}</button>
          </article>
        );
      })}
    </div>
  );
}

function OptionsModal({
  settings,
  update,
  isFullscreen,
  onToggleFullscreen,
  onOpenGuide,
  onClose,
}: {
  settings: GameSettings;
  update: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenGuide: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Options" eyebrow="Performance, controls, and audio" onClose={onClose} wide>
      <button className="guidebook-launch" onClick={onOpenGuide}>
        <span aria-hidden="true">▤</span>
        <span><strong>Open the guidebook</strong><small>Controls, progression, Fluxstone circuits, boats, beds, delves, saves, and a searchable “how to get it” index.</small></span>
        <b aria-hidden="true">→</b>
      </button>
      <div className="settings-grid">
        <section>
          <h3>View</h3>
          <label>Sensitivity <output>{settings.sensitivity.toFixed(1)}</output><input type="range" min="0.3" max="2" step="0.1" value={settings.sensitivity} onChange={(e) => update("sensitivity", Number(e.target.value))} /></label>
          <label>Field of view <output>{settings.fov}°</output><input type="range" min="55" max="95" step="1" value={settings.fov} onChange={(e) => update("fov", Number(e.target.value))} /></label>
          <label>Chunk radius <output>{settings.renderDistance}</output><input type="range" min="1" max="4" step="1" value={settings.renderDistance} onChange={(e) => update("renderDistance", Number(e.target.value))} /></label>
          <label>Graphics<select value={settings.graphics} onChange={(e) => update("graphics", e.target.value as GameSettings["graphics"])}><option value="low">Battery saver</option><option value="balanced">Balanced</option><option value="high">High</option></select></label>
        </section>
        <section>
          <h3>Audio</h3>
          <label>Master <output>{Math.round(settings.masterVolume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={settings.masterVolume} onChange={(e) => update("masterVolume", Number(e.target.value))} /></label>
          <label>Effects <output>{Math.round(settings.effectsVolume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={settings.effectsVolume} onChange={(e) => update("effectsVolume", Number(e.target.value))} /></label>
          <label>Music <output>{Math.round(settings.musicVolume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={(e) => update("musicVolume", Number(e.target.value))} /></label>
        </section>
        <section>
          <h3>Controls & HUD</h3>
          <label>Touch opacity <output>{Math.round(settings.touchOpacity * 100)}%</output><input type="range" min="0.3" max="1" step="0.05" value={settings.touchOpacity} onChange={(e) => update("touchOpacity", Number(e.target.value))} /></label>
          <label className="switch-row"><input type="checkbox" checked={settings.invertY} onChange={(e) => update("invertY", e.target.checked)} /><span>Invert vertical look</span></label>
          <label className="switch-row"><input type="checkbox" checked={settings.leftHanded} onChange={(e) => update("leftHanded", e.target.checked)} /><span>Left-handed touch layout</span></label>
          <label className="switch-row"><input type="checkbox" checked={settings.autoJump} onChange={(e) => update("autoJump", e.target.checked)} /><span>Auto-jump one-block rises</span></label>
          <label className="switch-row"><input type="checkbox" checked={settings.toggleSprint} onChange={(e) => update("toggleSprint", e.target.checked)} /><span>Toggle sprint (R)</span></label>
          <label className="switch-row"><input type="checkbox" checked={settings.showFps} onChange={(e) => update("showFps", e.target.checked)} /><span>Show frame rate</span></label>
          <button className="secondary-button fullscreen-button" onClick={onToggleFullscreen}>{isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}</button>
        </section>
      </div>
    </Modal>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleItems = GUIDE_ITEMS.filter((item) => !query
    || itemName(item).toLowerCase().includes(query)
    || itemDescription(item).toLowerCase().includes(query)
    || acquisitionHint(item).toLowerCase().includes(query));
  return (
    <Modal title="Frontier guidebook" eyebrow="Realmworks · Version 10" onClose={onClose} wide>
      <div className="guide-intro">
        <div><span aria-hidden="true">▤</span><div><strong>Everything important, in one place.</strong><p>Start with the short chapters, then search any block, tool, part, food, vehicle, or machine below to learn where it comes from.</p></div></div>
      </div>
      <div className="guide-grid">
        <article className="guide-card guide-card--accent">
          <span>01</span><h3>Your first day</h3>
          <p>Break a surface log, craft planks in your inventory, then make a Tinker Bench. A Wooden Pick gathers Roughstone and Coal; a Roughstone Pick unlocks Copper, Iron, and Fluxstone.</p>
        </article>
        <article className="guide-card">
          <span>02</span><h3>Fluxstone basics</h3>
          <p>Levers, buttons, plates, torches, and sensors make power. Dust carries a 15-level signal. Repeaters restore it with a selectable delay; comparators compare or subtract. Rotate directional parts with X.</p>
        </article>
        <article className="guide-card">
          <span>03</span><h3>Moving things</h3>
          <p>Pistons push up to six blocks; sticky pistons also pull one back. Observers pulse when the watched block changes. Hoppers transfer stored items, while droppers eject them and dispensers fire or place them.</p>
        </article>
        <article className="guide-card">
          <span>04</span><h3>Boats & beds</h3>
          <p>Craft a boat from five planks, select it, and Place / Use on water. Interact nearby to board; steer while moving and Sneak to dismount. Place and use a bed at any time to set your personal respawn.</p>
        </article>
        <article className="guide-card">
          <span>05</span><h3>Combat feedback</h3>
          <p>Damage now requires a real body overlap, vertical reach, and clear sight. A red vignette, directional knockback, and camera kick show incoming hits. Enemies flash red and recoil; Shardcaster bolts can be sidestepped.</p>
        </article>
        <article className="guide-card">
          <span>06</span><h3>Roguelike delves</h3>
          <p>Dungeon gates create a seeded realm of monumental rooms, bridges, gardens, galleries, and encounters. Each layout and architectural theme changes, with a sealed guardian vault and return beacon at the end.</p>
        </article>
        <article className="guide-card">
          <span>07</span><h3>Storage & crafting</h3>
          <p>Tap one inventory stack and then its destination; shift-click on desktop transfers quickly. Chests hold 27 slots and pair for 54. Furnaces have explicit input, fuel, and output slots.</p>
        </article>
        <article className="guide-card">
          <span>08</span><h3>Rooms, chat & saves</h3>
          <p>Chat messages fade after a few seconds; reopen Chat for the recent archive. A Version 10 world key carries the world, boats, and saved profiles for players who joined with their stable browser identity.</p>
        </article>
      </div>
      <div className="controls-table">
        <h3>Controls</h3>
        <div><span><kbd>W A S D</kbd> Move / swim / fly</span><span><kbd>R</kbd> Toggle sprint</span><span><kbd>Shift</kbd> Sneak / dive / dismount</span><span><kbd>Space</kbd> Jump / ascend</span><span><kbd>Q</kbd> Drop one</span><span><kbd>Shift + Q</kbd> Drop stack</span><span><kbd>T / Enter</kbd> Chat archive</span><span><kbd>V</kbd> Creative flight</span><span><kbd>Mouse</kbd> Look</span><span><kbd>LMB</kbd> Mine / attack</span><span><kbd>RMB</kbd> Place / use</span><span><kbd>F</kbd> Interact / board</span><span><kbd>X</kbd> Rotate machinery</span><span><kbd>E</kbd> Inventory</span><span><kbd>Mobile</kbd> Stick + Attack, Place / Use, Jump, Sneak</span></div>
      </div>
      <section className="guide-index">
        <header><div><p className="eyebrow">Acquisition index</p><h3>How do I get…?</h3></div><span>{visibleItems.length} matches</span></header>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search: boat, repeater, iron, bed, hopper…" autoComplete="off" />
        <div className="guide-item-list">
          {visibleItems.length === 0 && <div className="empty-inventory"><strong>No matching item.</strong><span>Try a simpler name or browse the recipe book in Inventory.</span></div>}
          {visibleItems.map((item) => (
            <article key={item}>
              <ItemIcon item={item} compact />
              <div><strong>{itemName(item)}</strong><span>{itemDescription(item)}</span><p>{acquisitionHint(item)}</p></div>
            </article>
          ))}
        </div>
      </section>
    </Modal>
  );
}

function TradeModal({
  trade,
  inventory,
  inventorySlots,
  creative,
  onClose,
  onTrade,
  onSell,
}: {
  trade: TradePanelData;
  inventory: Record<string, number>;
  inventorySlots: Array<ItemId | null>;
  creative: boolean;
  onClose: () => void;
  onTrade: (offerId: string) => void;
  onSell: (item: ItemId, count: number) => void;
}) {
  const [saleItem, setSaleItem] = useState<ItemId | null>(null);
  const saleCount = saleItem ? inventory[saleItem] ?? 0 : 0;
  const totalSalePoints = saleItem ? itemSalePoints(saleItem) * saleCount + trade.credit : trade.credit;
  const saleMarks = Math.floor(totalSalePoints / 20);
  const saleRemainder = totalSalePoints % 20;
  const sellStack = (item: ItemId) => {
    const count = inventory[item] ?? 0;
    if (count > 0) onSell(item, count);
    setSaleItem(null);
  };
  return (
    <Modal title={trade.name} eyebrow={`${trade.profession} · ${creative ? "Creative funds" : `${trade.marks} Frontier Marks`}`} onClose={onClose} wide>
      <div className="network-callout">
        <strong>Sell any stack, then spend Frontier Marks.</strong>
        <span>Drag a carried stack into the sell tray. Prices reflect material rarity, processing, and crafting value; purchases vary by profession and restock each day.</span>
      </div>
      <section className="merchant-sell-workspace">
        <div>
          <header><strong>Your inventory</strong><span>Drag or tap a stack</span></header>
          <div className="merchant-inventory" aria-label="Inventory available to sell">
            {inventorySlots.map((item, slot) => (
              <button
                type="button"
                key={slot}
                draggable={Boolean(item)}
                className={saleItem === item && item ? "selected" : ""}
                disabled={!item}
                title={item ? `${itemName(item)} — ${itemDescription(item)}` : "Empty slot"}
                onClick={() => item && setSaleItem(item)}
                onDragStart={(event) => {
                  if (!item) return;
                  event.dataTransfer.setData("application/x-voxel-sale", item);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                {item && <ItemIcon item={item} count={creative ? "∞" : inventory[item] ?? 0} compact />}
              </button>
            ))}
          </div>
        </div>
        <div
          className={`merchant-sell-tray ${saleItem ? "ready" : ""}`}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={(event) => {
            event.preventDefault();
            const item = event.dataTransfer.getData("application/x-voxel-sale") as ItemId;
            if (item && (inventory[item] ?? 0) > 0) sellStack(item);
          }}
        >
          <span className="merchant-sell-tray__mark">⇣</span>
          <strong>{saleItem ? `Sell ${saleCount} × ${itemName(saleItem)}` : "Villager sell tray"}</strong>
          <small>{saleItem
            ? `${saleMarks} mark${saleMarks === 1 ? "" : "s"}${saleRemainder ? ` + ${saleRemainder}/20 saved value` : ""}`
            : `Any item accepted · ${trade.credit}/20 value saved`}</small>
          <button className="primary-button" disabled={!saleItem || saleCount <= 0 || creative} onClick={() => saleItem && sellStack(saleItem)}>
            {creative ? "Infinite in Creative" : "Sell full stack"}
          </button>
        </div>
      </section>
      <div className="merchant-buy-heading"><strong>{trade.profession} stock</strong><span>Purchases cost Frontier Marks only</span></div>
      <div className="trade-list">
        {trade.offers.map((offer) => {
          const carried = inventory[offer.cost.item] ?? 0;
          const canAfford = creative || carried >= offer.cost.count;
          const canTrade = offer.stock > 0 && canAfford;
          return (
            <article key={offer.id}>
              <div className="trade-list__item">
                <ItemIcon item={offer.cost.item} count={creative ? "∞" : carried} />
                <span><small>YOU GIVE</small><strong>{offer.cost.count} × {itemName(offer.cost.item)}</strong></span>
              </div>
              <span className="trade-list__arrow">→</span>
              <div className="trade-list__item">
                <ItemIcon item={offer.reward.item} count={offer.reward.count} />
                <span><small>YOU RECEIVE</small><strong>{offer.reward.count} × {itemName(offer.reward.item)}</strong></span>
              </div>
              <div className="trade-list__copy"><strong>{offer.name}</strong><p>{offer.note}</p><small>{offer.stock}/{offer.maxStock} trades left</small></div>
              <button className="secondary-button" disabled={!canTrade} onClick={() => onTrade(offer.id)}>
                {offer.stock <= 0 ? "Sold out" : canTrade ? "Trade" : `Need ${offer.cost.count - carried}`}
              </button>
            </article>
          );
        })}
      </div>
    </Modal>
  );
}

function ChestModal({
  chest,
  inventory,
  inventorySlots,
  creative,
  onClose,
  onDepositAt,
  onWithdraw,
  onMoveChest,
  onMoveInventory,
}: {
  chest: ChestPanelData;
  inventory: Record<string, number>;
  inventorySlots: Array<ItemId | null>;
  creative: boolean;
  onClose: () => void;
  onDepositAt: (item: ItemId, count: number, targetSlot: number, sourceSlot: number) => void;
  onWithdraw: (slot: number, count: number, targetSlot: number) => void;
  onMoveChest: (sourceSlot: number, targetSlot: number) => void;
  onMoveInventory: (sourceSlot: number, targetSlot: number) => void;
}) {
  const [picked, setPicked] = useState<{ area: "chest" | "inventory"; slot: number } | null>(null);
  const pickedItem = picked?.area === "chest"
    ? chest.slots[picked.slot] ?? null
    : picked?.area === "inventory"
      ? inventorySlots[picked.slot] ?? null
      : null;
  const clickChest = (slot: number) => {
    const item = chest.slots[slot] ?? null;
    if (!picked) {
      if (item) setPicked({ area: "chest", slot });
      return;
    }
    if (picked.area === "chest") {
      if (picked.slot !== slot) onMoveChest(picked.slot, slot);
      setPicked(null);
      return;
    }
    const inventoryItem = inventorySlots[picked.slot];
    if (inventoryItem && (!item || item === inventoryItem)) {
      onDepositAt(inventoryItem, creative ? 1 : inventory[inventoryItem] ?? 0, slot, picked.slot);
    }
    setPicked(null);
  };
  const clickInventory = (slot: number) => {
    const item = inventorySlots[slot] ?? null;
    if (!picked) {
      if (item) setPicked({ area: "inventory", slot });
      return;
    }
    if (picked.area === "inventory") {
      if (picked.slot !== slot) onMoveInventory(picked.slot, slot);
      setPicked(null);
      return;
    }
    const chestItem = chest.slots[picked.slot];
    if (chestItem && (!item || item === chestItem)) {
      onWithdraw(picked.slot, chest.storage[chestItem] ?? 1, slot);
    }
    setPicked(null);
  };
  return (
    <Modal title={chest.title} eyebrow={`${chest.rows} × 9 shared storage · ${chest.keys.length === 2 ? "linked pair" : "single chest"}`} onClose={onClose} wide>
      <div className="network-callout">
        <strong>{pickedItem ? `${itemName(pickedItem)} picked up — choose a destination slot.` : "Click once to pick up a stack, then click any valid destination."}</strong>
        <span>Every chest slot is usable. Click within a grid to rearrange stacks, or click across grids to transfer the full stack. Two mutually adjacent chests form one 9 × 6 shared container.</span>
      </div>
      <div className="chest-workspace">
        <section className="chest-panel">
          <header className="workspace-heading"><div><p className="eyebrow">Container</p><h3>{chest.title}</h3></div><span>Pick and place in any slot</span></header>
          <div className={`chest-grid chest-grid--${chest.rows}`} role="grid" aria-label={`${chest.rows} row chest storage`}>
            {chest.slots.map((item, slot) => (
              <button
                type="button"
                key={slot}
                role="gridcell"
                className={picked?.area === "chest" && picked.slot === slot ? "selected" : ""}
                title={item ? `${itemName(item)} — ${itemDescription(item)}` : "Empty chest slot"}
                onClick={() => clickChest(slot)}
              >
                {item && <ItemIcon item={item} count={chest.storage[item] ?? 0} compact />}
              </button>
            ))}
          </div>
        </section>
        <section className="chest-panel">
          <header className="workspace-heading"><div><p className="eyebrow">Traveler</p><h3>Your inventory</h3></div><span>Same click-to-place controls</span></header>
          <div className="chest-grid chest-grid--4" role="grid" aria-label="Player inventory">
            {inventorySlots.map((item, slot) => (
              <button
                type="button"
                key={slot}
                role="gridcell"
                className={`${slot >= HOTBAR_START ? "chest-grid__hotbar" : ""} ${picked?.area === "inventory" && picked.slot === slot ? "selected" : ""}`}
                title={item ? `${itemName(item)} — ${itemDescription(item)}` : "Empty inventory slot"}
                onClick={() => clickInventory(slot)}
              >
                {item && <ItemIcon item={item} count={creative ? "∞" : inventory[item] ?? 0} compact />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function FurnaceModal({
  machine,
  inventory,
  inventorySlots,
  creative,
  onClose,
  onDeposit,
  onWithdraw,
  onMoveInventory,
}: {
  machine: MachinePanelData;
  inventory: Record<string, number>;
  inventorySlots: Array<ItemId | null>;
  creative: boolean;
  onClose: () => void;
  onDeposit: (slot: "input" | "fuel", item: ItemId, count: number, sourceSlot: number) => void;
  onWithdraw: (slot: FurnaceSlot, count: number, targetSlot: number) => void;
  onMoveInventory: (sourceSlot: number, targetSlot: number) => void;
}) {
  const [picked, setPicked] = useState<{ area: "inventory"; slot: number } | { area: "furnace"; slot: FurnaceSlot } | null>(null);
  const furnaceItems: Record<FurnaceSlot, ItemId | null> = {
    input: furnaceSlotItem(machine.state, "input") ?? null,
    fuel: furnaceSlotItem(machine.state, "fuel") ?? null,
    output: furnaceSlotItem(machine.state, "output") ?? null,
  };
  const pickedItem = picked?.area === "inventory"
    ? inventorySlots[picked.slot] ?? null
    : picked?.area === "furnace"
      ? furnaceItems[picked.slot]
      : null;
  const clickFurnace = (slot: FurnaceSlot) => {
    const item = furnaceItems[slot];
    if (!picked) {
      if (item) setPicked({ area: "furnace", slot });
      return;
    }
    if (picked.area === "furnace") {
      setPicked(picked.slot === slot ? null : item ? { area: "furnace", slot } : null);
      return;
    }
    const inventoryItem = inventorySlots[picked.slot];
    if (inventoryItem && slot !== "output") {
      onDeposit(slot, inventoryItem, creative ? 1 : inventory[inventoryItem] ?? 0, picked.slot);
    }
    setPicked(null);
  };
  const clickInventory = (slot: number) => {
    const item = inventorySlots[slot] ?? null;
    if (!picked) {
      if (item) setPicked({ area: "inventory", slot });
      return;
    }
    if (picked.area === "inventory") {
      if (picked.slot !== slot) onMoveInventory(picked.slot, slot);
      setPicked(null);
      return;
    }
    const furnaceItem = furnaceItems[picked.slot];
    if (furnaceItem && (!item || item === furnaceItem)) {
      onWithdraw(picked.slot, machine.state.storage[furnaceItem] ?? 1, slot);
    }
    setPicked(null);
  };
  const slotButton = (slot: FurnaceSlot, label: string) => {
    const item = furnaceItems[slot];
    return (
      <div className={`furnace-slot-wrap furnace-slot-wrap--${slot}`}>
        <span>{label}</span>
        <button
          type="button"
          className={`furnace-slot ${picked?.area === "furnace" && picked.slot === slot ? "selected" : ""}`}
          onClick={() => clickFurnace(slot)}
          title={item ? `${itemName(item)} — ${itemDescription(item)}` : `Empty ${label.toLowerCase()} slot`}
        >
          {item && <ItemIcon item={item} count={machine.state.storage[item] ?? 0} />}
        </button>
      </div>
    );
  };
  return (
    <Modal title="Hearth Furnace" eyebrow="Input · fuel · output" onClose={onClose} wide>
      <div className="network-callout">
        <strong>{pickedItem ? `${itemName(pickedItem)} picked up — choose a valid slot.` : "Click once to pick up a stack, then click its destination."}</strong>
        <span>Raw material goes in the upper slot, Coal goes below, and finished material appears on the right. The complete 4 × 9 inventory remains visible underneath.</span>
      </div>
      <div className="furnace-workspace">
        <div className="furnace-process">
          <div className="furnace-input-column">
            {slotButton("input", "INPUT")}
            <div className={`furnace-flame ${(machine.state.progress > 0) ? "active" : ""}`}><i /></div>
            {slotButton("fuel", "FUEL")}
          </div>
          <div className="furnace-progress" aria-label={`${Math.round(machine.state.progress * 100)} percent smelted`}>
            <span>SMELTING</span><div><i style={{ width: `${Math.round(Math.min(1, machine.state.progress) * 100)}%` }} /></div><strong>→</strong>
          </div>
          {slotButton("output", "OUTPUT")}
        </div>
        <div className="smelting-book">
          {SMELTING_RECIPES.map((recipe) => (
            <span key={recipe.input}><ItemIcon item={recipe.input} compact /><b>→</b><ItemIcon item={recipe.output} count={recipe.count} compact /></span>
          ))}
        </div>
        <section className="furnace-inventory">
          <header className="workspace-heading"><div><p className="eyebrow">Traveler</p><h3>Inventory</h3></div><span>Click a stack, then input or fuel</span></header>
          <div className="chest-grid chest-grid--4" role="grid" aria-label="Player inventory below furnace">
            {inventorySlots.map((item, slot) => (
              <button
                type="button"
                key={slot}
                role="gridcell"
                className={`${slot >= HOTBAR_START ? "chest-grid__hotbar" : ""} ${picked?.area === "inventory" && picked.slot === slot ? "selected" : ""}`}
                title={item ? `${itemName(item)} — ${itemDescription(item)}` : "Empty inventory slot"}
                onClick={() => clickInventory(slot)}
              >
                {item && <ItemIcon item={item} count={creative ? "∞" : inventory[item] ?? 0} compact />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function MachineModal({
  machine,
  inventory,
  onClose,
  onToggle,
  onRotate,
  onConfigure,
  onDeposit,
  onWithdraw,
}: {
  machine: MachinePanelData;
  inventory: Record<string, number>;
  onClose: () => void;
  onToggle: () => void;
  onRotate: () => void;
  onConfigure: (value: string) => void;
  onDeposit: (item: ItemId) => void;
  onWithdraw: (item: ItemId) => void;
}) {
  const definition = BLOCKS[machine.id];
  const stored = Object.entries(machine.state.storage).filter((entry) => entry[1] > 0);
  const carried = Object.entries(inventory).filter((entry) => entry[1] > 0);
  return (
    <Modal title={definition.name} eyebrow="Machine console" onClose={onClose} wide>
      <div className="machine-dashboard">
        <div className="machine-hero" style={{ "--machine-color": definition.color } as CSSProperties}>
          <ItemIcon item={`block:${machine.id}`} />
          <div><p>{definition.description}</p><span className={machine.state.enabled ? "online" : ""}>{machine.state.enabled ? "MASTER ENABLED" : "MASTER DISABLED"}</span></div>
        </div>
        <div className="machine-stats">
          <div><span>SIGNAL</span><strong>{machine.state.signal}/15</strong></div>
          <div><span>ENERGY</span><strong>{Math.round(machine.state.energy)} flux</strong></div>
          <div><span>PROGRESS</span><strong>{Math.round(Math.min(1, machine.state.progress) * 100)}%</strong></div>
          <div><span>FACING</span><strong>{["North", "East", "South", "West"][machine.state.orientation]}</strong></div>
        </div>
      </div>
      {machine.id === BlockId.HearthFurnace && (
        <div className="network-callout">
          <strong>Coal-fired smelting</strong>
          <span>Deposit Coal with Raw Iron, Raw Gold, Copper Ore, Clay, or Sand. One Coal fires one smelting cycle; finished materials appear in storage automatically.</span>
        </div>
      )}
      <div className="button-row">
        <button className="secondary-button" onClick={onToggle}>{machine.state.enabled ? "Disable" : "Enable"}</button>
        <button className="secondary-button" onClick={onRotate}>Rotate clockwise</button>
        {machine.id === BlockId.ProximitySensor && (
          <select value={machine.state.mode ?? "near"} onChange={(event) => onConfigure(event.target.value)}><option value="near">Nearby player</option><option value="day">Daylight</option><option value="night">Night</option></select>
        )}
        {machine.id === BlockId.FluxComparator && (
          <select value={machine.state.mode ?? "compare"} onChange={(event) => onConfigure(event.target.value)}><option value="compare">Compare</option><option value="subtract">Subtract</option></select>
        )}
        {machine.id === BlockId.PulseRepeater && (
          <select value={String(machine.state.delayTicks ?? 2)} onChange={(event) => onConfigure(event.target.value)}><option value="1">1 beat</option><option value="2">2 beats</option><option value="3">3 beats</option><option value="4">4 beats</option></select>
        )}
        {machine.id === BlockId.Fabricator && (
          <select value={machine.state.recipe ?? "flux-coil"} onChange={(event) => onConfigure(event.target.value)}><option value="flux-coil">Flux Coil</option><option value="logic-wafer">Logic Wafer</option><option value="gear">Drive Gear</option></select>
        )}
      </div>
      <div className="transfer-grid">
        <section>
          <h3>Machine storage</h3>
          {stored.length === 0 && <p className="empty-note">Storage is empty.</p>}
          {stored.map(([item, count]) => <button key={item} onClick={() => onWithdraw(item as ItemId)}><ItemIcon item={item as ItemId} count={count} compact /><span>{itemName(item as ItemId)}</span><em>−1</em></button>)}
        </section>
        <section>
          <h3>Your pack</h3>
          {carried.map(([item, count]) => <button key={item} onClick={() => onDeposit(item as ItemId)}><ItemIcon item={item as ItemId} count={count} compact /><span>{itemName(item as ItemId)}</span><em>+1</em></button>)}
        </section>
      </div>
    </Modal>
  );
}
