"use client";

import {
  type CSSProperties,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BLOCKS, RECIPES, itemName } from "./game/blocks";
import { GameEngine, MachinePanelData } from "./game/engine";
import { ItemArt } from "./item-art";
import { NetworkSession } from "./game/network";
import {
  decodeWorldKey,
  downloadWorldKey,
  hasLocalSave,
  loadLocalSave,
} from "./game/save";
import {
  BlockId,
  DEFAULT_SETTINGS,
  GameMode,
  GameSettings,
  HudState,
  ItemId,
  Recipe,
  WorldSave,
} from "./game/types";

type Overlay = "none" | "pause" | "inventory" | "guide" | "options" | "save" | "network" | "machine";

const EMPTY_HUD: HudState = {
  health: 100,
  hunger: 100,
  stamina: 100,
  selectedSlot: 0,
  hotbar: [],
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
  timeLabel: "07:00 · Dawn",
  dayCount: 1,
  targetedMob: null,
};

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
  const [seed, setSeed] = useState("Copper Skies");
  const [gameMode, setGameMode] = useState<GameMode>("survival");
  const [saveAvailable, setSaveAvailable] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [toast, setToast] = useState("");
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [exportValue, setExportValue] = useState("");
  const [inventoryTab, setInventoryTab] = useState<"items" | "craft">("items");
  const [machine, setMachine] = useState<MachinePanelData | null>(null);
  const [networkMode, setNetworkMode] = useState<"host" | "join">("host");
  const [inviteKey, setInviteKey] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [guestAnswer, setGuestAnswer] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const toastTimer = useRef<number | null>(null);

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

  const openOverlay = useCallback((next: Overlay) => {
    engineRef.current?.pause();
    setOverlay(next);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay("none");
    engineRef.current?.resume();
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
          onInventory: () => openOverlay("inventory"),
          onPause: () => openOverlay("pause"),
          onGuide: () => openOverlay("guide"),
          onMachine: (data) => {
            setMachine(data);
            openOverlay("machine");
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
    const normalized = worldSeed.trim() || `Frontier-${Math.floor(Math.random() * 999999)}`;
    setHud({ ...EMPTY_HUD, gameMode: mode });
    setLaunchError("");
    setOverlay("none");
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

  const inventoryItems = useMemo(
    () => Object.entries(hud.inventory)
      .filter((entry) => entry[1] > 0)
      .sort((a, b) => itemName(a[0] as ItemId).localeCompare(itemName(b[0] as ItemId))),
    [hud.inventory],
  );

  const heldItem = hud.hotbar[hud.selectedSlot] ?? null;

  const refreshMachine = () => {
    if (!machine) return;
    const latest = engineRef.current?.getMachine(machine.key);
    if (latest) setMachine(latest);
  };

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
          <span className="build-tag">Depths & Circuits · Stage 3</span>
        </header>

        <section className="landing__content">
          <div className="hero-copy">
            <p className="eyebrow">Shape the wild. Teach it to move.</p>
            <h1>A living block world with an engineer&apos;s soul.</h1>
            <p>
              Begin empty-handed, survive a living night, uncover Wayfarer ruins, or open an infinite Creative catalog and engineer without limits—alone or online.
            </p>
            <div className="feature-chips">
              <span>True swimming</span><span>75 distinct blocks</span><span>Deep caves &amp; circuits</span><span>Physical item drops</span>
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
                <input value={seed} maxLength={42} onChange={(event) => setSeed(event.target.value)} placeholder="Any phrase or number" />
                <button className="icon-button" onClick={() => setSeed(`Frontier-${Math.floor(Math.random() * 999999)}`)} title="Random seed">↻</button>
              </div>
            </label>
            <fieldset className="mode-picker">
              <legend>World mode</legend>
              <button type="button" className={gameMode === "survival" ? "selected" : ""} onClick={() => setGameMode("survival")}>
                <span className="mode-picker__mark">◇</span>
                <span><strong>Survival</strong><small>Start with nothing. Gather, craft, eat, fight, and endure the night.</small></span>
              </button>
              <button type="button" className={gameMode === "creative" ? "selected" : ""} onClick={() => setGameMode("creative")}>
                <span className="mode-picker__mark">∞</span>
                <span><strong>Creative</strong><small>Infinite catalog, instant mining, and no health or hunger damage.</small></span>
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
              <textarea value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="Paste a VF1 world key…" />
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
          <OptionsModal settings={settings} update={updateSetting} onClose={() => setOverlay("none")} />
        )}
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Voxel Frontier 3D world" />
      <div className="vignette" />
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

      <div className="hud-top-left">
        <div className="brand brand--hud">
          <span className="brand__mark"><i /><i /><i /></span>
          <span><strong>VOXEL</strong><em>FRONTIER</em></span>
        </div>
        <div className="location-card">
          <strong>{hud.biome}</strong>
          <span>{hud.coordinates.x} · {hud.coordinates.y} · {hud.coordinates.z}</span>
          <span>{hud.timeLabel} · Day {hud.dayCount} · {hud.gameMode}</span>
        </div>
      </div>

      <div className="hud-top-center">
        <p>ACTIVE BLUEPRINT</p>
        <strong>{hud.objective}</strong>
      </div>

      <button className="pause-button" onClick={() => openOverlay("pause")} aria-label="Pause game">Ⅱ</button>

      {hud.targetedMob && (
        <div className="combat-target" aria-label={`${hud.targetedMob.name} health`}>
          <div><span>THREAT</span><strong>{hud.targetedMob.name}</strong></div>
          <div className="combat-target__track"><i style={{ width: `${(hud.targetedMob.health / hud.targetedMob.maxHealth) * 100}%` }} /></div>
          <small>{Math.ceil(hud.targetedMob.health)} / {hud.targetedMob.maxHealth}</small>
        </div>
      )}

      <div className="hud-status">
        <Meter label="HEALTH" value={hud.health} tone="#ef725d" />
        <Meter label="NUTRITION" value={hud.hunger} tone="#e4b859" />
        <Meter label="STAMINA" value={hud.stamina} tone="#57c9c5" />
      </div>

      <div className="network-pill"><span className={network.role === "offline" ? "" : "online"} />{hud.networkStatus}</div>
      {settings.showFps && <div className="fps-pill">{hud.fps} FPS</div>}

      <div className="held-item-label" aria-live="polite">
        {heldItem ? itemName(heldItem) : "Empty hand"}
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

      {!isTouch && (
        <div className="desktop-hints">
          <span><kbd>WASD</kbd> move / swim</span><span><kbd>SPACE</kbd> jump / ascend</span><span><kbd>CTRL</kbd> crouch / dive</span><span><kbd>LMB</kbd> mine / attack</span><span><kbd>RMB</kbd> place / use</span><span><kbd>F</kbd> interact</span><span><kbd>E</kbd> inventory</span>
        </div>
      )}

      {isTouch && overlay === "none" && (
        <div className="touch-controls">
          <TouchLookZone leftHanded={settings.leftHanded} onLook={(x, y) => engineRef.current?.addLook(x, y)} />
          <MoveStick
            leftHanded={settings.leftHanded}
            opacity={settings.touchOpacity}
            onMove={(x, y) => engineRef.current?.setMove(x, y)}
          />
          <div className={`touch-actions ${settings.leftHanded ? "touch-actions--left" : ""}`} style={{ opacity: settings.touchOpacity }}>
            <HoldButton label="MINE / HIT" className="touch-button--mine" onChange={(pressed) => engineRef.current?.setAction("mine", pressed)} />
            <HoldButton label="PLACE" onChange={(pressed) => engineRef.current?.setAction("place", pressed)} />
            <HoldButton label="JUMP" onChange={(pressed) => engineRef.current?.setAction("jump", pressed)} />
            <HoldButton label="RUN" onChange={(pressed) => engineRef.current?.setAction("sprint", pressed)} />
            <HoldButton label="USE" onChange={(pressed) => engineRef.current?.setAction("interact", pressed)} />
            <HoldButton label="DIVE" className="touch-button--dive" onChange={(pressed) => engineRef.current?.setAction("crouch", pressed)} />
          </div>
        </div>
      )}

      {overlay === "pause" && (
        <Modal title="Frontier paused" eyebrow={`${hud.gameMode} · ${hud.timeLabel} · Day ${hud.dayCount}`} onClose={closeOverlay}>
          <div className="menu-stack">
            <button className="primary-button" onClick={closeOverlay}>Resume expedition</button>
            <button className="secondary-button" onClick={() => setOverlay("inventory")}>Inventory & crafting</button>
            <button className="secondary-button" onClick={() => setOverlay("network")}>Online room</button>
            <button className="secondary-button" onClick={() => setOverlay("save")}>Save & world key</button>
            <button className="secondary-button" onClick={() => setOverlay("guide")}>Engineering guide</button>
            <button className="secondary-button" onClick={() => setOverlay("options")}>Options</button>
            <button className="text-button danger" onClick={exitWorld}>Save and return to title</button>
          </div>
        </Modal>
      )}

      {overlay === "inventory" && (
        <Modal title="Field inventory" eyebrow={`${inventoryItems.length} resource types`} onClose={closeOverlay} wide>
          <div className="tab-row">
            <button className={inventoryTab === "items" ? "active" : ""} onClick={() => setInventoryTab("items")}>Pack</button>
            <button className={inventoryTab === "craft" ? "active" : ""} onClick={() => setInventoryTab("craft")}>Crafting</button>
          </div>
          {inventoryTab === "items" ? (
            <>
              <p className="modal-copy">Tap an item to assign it to your currently selected hotbar slot.</p>
              {inventoryItems.length === 0 && <div className="empty-inventory"><strong>Your pack is empty.</strong><span>Mine an Emberwood log by hand to begin.</span></div>}
              <div className="inventory-grid">
                {inventoryItems.map(([item, count]) => (
                  <button key={item} onClick={() => engineRef.current?.assignHotbar(hud.selectedSlot, item as ItemId)}>
                    <ItemIcon item={item as ItemId} count={hud.gameMode === "creative" ? "∞" : count} />
                    <span><strong>{itemName(item as ItemId)}</strong><small>Assign to slot {hud.selectedSlot + 1}</small></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <RecipeList recipes={RECIPES} inventory={hud.inventory} onCraft={(id) => engineRef.current?.craft(id)} />
          )}
        </Modal>
      )}

      {overlay === "guide" && <GuideModal onClose={closeOverlay} />}
      {overlay === "options" && <OptionsModal settings={settings} update={updateSetting} onClose={closeOverlay} />}

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
        <Modal title="Direct online room" eyebrow="Host-authoritative WebRTC" onClose={closeOverlay} wide>
          <div className="network-callout">
            <strong>No account or game server required.</strong>
            <span>The host owns the world state. Connection keys perform the private browser-to-browser handshake needed by a GitHub Pages game.</span>
          </div>
          <div className="tab-row">
            <button className={networkMode === "host" ? "active" : ""} onClick={() => setNetworkMode("host")}>Host this world</button>
            <button className={networkMode === "join" ? "active" : ""} onClick={() => setNetworkMode("join")}>Join a host</button>
          </div>
          {networkMode === "host" ? (
            <div className="network-steps">
              <section>
                <span className="step-number">1</span>
                <div><h3>Create an invite</h3><p>Send the resulting key to one friend. Create another invite for each additional player.</p></div>
                <button className="primary-button" disabled={networkBusy} onClick={async () => {
                  setNetworkBusy(true);
                  try { setInviteKey(await network.createHostInvite()); }
                  catch (error) { showToast(error instanceof Error ? error.message : "Invite failed."); }
                  setNetworkBusy(false);
                }}>{networkBusy ? "Finding route…" : "Generate invite"}</button>
              </section>
              {inviteKey && <><textarea className="key-field key-field--small" readOnly value={inviteKey} /><button className="secondary-button" onClick={() => void copyText(inviteKey, "Invite")}>Copy invite</button></>}
              <section>
                <span className="step-number">2</span>
                <div><h3>Accept their answer</h3><p>Your friend sends one answer key back. Paste it here to complete the direct route.</p></div>
              </section>
              <textarea className="key-field key-field--small" value={guestAnswer} onChange={(event) => setGuestAnswer(event.target.value)} placeholder="Paste guest answer…" />
              <button className="secondary-button" disabled={!guestAnswer || networkBusy} onClick={async () => {
                setNetworkBusy(true);
                try { await network.acceptAnswer(guestAnswer); showToast("Answer accepted. Connecting…"); }
                catch (error) { showToast(error instanceof Error ? error.message : "Could not accept answer."); }
                setNetworkBusy(false);
              }}>Accept answer</button>
            </div>
          ) : (
            <div className="network-steps">
              <section>
                <span className="step-number">1</span>
                <div><h3>Paste the host invite</h3><p>Your browser will generate an answer for the host.</p></div>
              </section>
              <textarea className="key-field key-field--small" value={joinKey} onChange={(event) => setJoinKey(event.target.value)} placeholder="Paste host invite…" />
              <button className="primary-button" disabled={!joinKey || networkBusy} onClick={async () => {
                setNetworkBusy(true);
                try { setAnswerKey(await network.joinInvite(joinKey)); }
                catch (error) { showToast(error instanceof Error ? error.message : "Could not join."); }
                setNetworkBusy(false);
              }}>{networkBusy ? "Finding route…" : "Create answer"}</button>
              {answerKey && (
                <>
                  <section><span className="step-number">2</span><div><h3>Send this answer to the host</h3><p>Once they accept it, the host&apos;s terrain and machines synchronize automatically.</p></div></section>
                  <textarea className="key-field key-field--small" readOnly value={answerKey} />
                  <button className="secondary-button" onClick={() => void copyText(answerKey, "Answer")}>Copy answer</button>
                </>
              )}
            </div>
          )}
          <p className="network-status-line"><span className={network.role === "offline" ? "" : "online"} /> {hud.networkStatus}</p>
        </Modal>
      )}

      {overlay === "machine" && machine && (
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
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RecipeList({ recipes, inventory, onCraft }: { recipes: Recipe[]; inventory: Record<string, number>; onCraft: (id: string) => void }) {
  return (
    <div className="recipe-list">
      {recipes.filter((recipe) => recipe.station === "hand" || recipe.station === "workbench").map((recipe) => {
        const canCraft = Object.entries(recipe.inputs).every(([item, count]) => (inventory[item] ?? 0) >= count);
        return (
          <article key={recipe.id}>
            <ItemIcon item={recipe.output.item} count={recipe.output.count} />
            <div>
              <div className="recipe-list__title"><h3>{recipe.name}</h3><span>{recipe.station}</span></div>
              <p>{recipe.description}</p>
              <div className="ingredient-row">
                {Object.entries(recipe.inputs).map(([item, count]) => (
                  <span key={item} className={(inventory[item] ?? 0) >= count ? "ready" : "missing"}>
                    {itemName(item as ItemId)} {inventory[item] ?? 0}/{count}
                  </span>
                ))}
              </div>
            </div>
            <button className="secondary-button" disabled={!canCraft} onClick={() => onCraft(recipe.id)}>Craft</button>
          </article>
        );
      })}
    </div>
  );
}

function OptionsModal({
  settings,
  update,
  onClose,
}: {
  settings: GameSettings;
  update: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Options" eyebrow="Performance, controls, and audio" onClose={onClose} wide>
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
          <label className="switch-row"><input type="checkbox" checked={settings.showFps} onChange={(e) => update("showFps", e.target.checked)} /><span>Show frame rate</span></label>
        </section>
      </div>
    </Modal>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Frontier field guide" eyebrow="Depths & Circuits · Stage 3" onClose={onClose} wide>
      <div className="guide-grid">
        <article className="guide-card guide-card--accent">
          <span>01</span><h3>Physical gathering</h3>
          <p>Broken blocks pop into the world. Walk close to collect them. Cut Emberwood into planks, build a Tinker Bench, then craft an Emberwood Pick before harvesting stone.</p>
        </article>
        <article className="guide-card">
          <span>02</span><h3>Swimming</h3>
          <p>Water has drag and buoyancy. Move while looking up or down to steer your stroke, hold jump to ascend, crouch or use DIVE to descend, and sprint for a faster swim.</p>
        </article>
        <article className="guide-card">
          <span>03</span><h3>Explore the deep</h3>
          <p>Large caverns, winding tunnels, vertical rifts, aquifers, crystal growths, mushrooms, moss, limestone, marble, and deep slate form connected underground regions.</p>
        </article>
        <article className="guide-card">
          <span>04</span><h3>Directional circuits</h3>
          <p>Thin Flux Conduit links sources to repeaters, comparators, inverter torches, observers, pressure plates, daylight sensors, memory lamps, targets, and tone blocks.</p>
        </article>
        <article className="guide-card">
          <span>05</span><h3>Movement &amp; logistics</h3>
          <p>Linear Rams push up to six blocks; Adhesive Rams pull on retraction. Collector Funnels gather physical drops and transfer one item per beat into facing storage.</p>
        </article>
        <article className="guide-card">
          <span>06</span><h3>Creative &amp; portable worlds</h3>
          <p>Creative opens all 75 original blocks and every tool. VF1 keys remain compatible and preserve terrain, optional Stage 3 circuit state, creatures, inventory, and time.</p>
        </article>
      </div>
      <div className="controls-table">
        <h3>Desktop controls</h3>
        <div><span><kbd>W A S D</kbd> Move / swim</span><span><kbd>Shift</kbd> Sprint / stroke</span><span><kbd>Ctrl / C</kbd> Crouch / dive</span><span><kbd>Space</kbd> Jump / ascend</span><span><kbd>Mouse</kbd> Look</span><span><kbd>LMB</kbd> Mine / attack</span><span><kbd>RMB</kbd> Place / use held item</span><span><kbd>F</kbd> Interact/configure</span><span><kbd>R</kbd> Rotate machine</span><span><kbd>E</kbd> Inventory</span></div>
      </div>
      <div className="scope-note">
        <strong>What this release contains</strong>
        <p>Six biomes, extensive cave networks and aquifers, ruins, 75 original textured blocks with twelve mesh shapes, Survival and Creative modes, an Emberwood tool tier, physical block drops, true swimming, water-stable creatures, five mobs, combat, held-item silhouettes and labels, block cracking, day/night, crafting, directional signal logic, pistons, funnels, direct online rooms, mobile ascend/dive controls with optional auto-jump, autosave, and backward-compatible world keys.</p>
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
