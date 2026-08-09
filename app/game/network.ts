import {
  NETWORK_PROTOCOL_VERSION,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientRoomPacket,
  type OnlineRole,
  type ServerRoomPacket,
  normalizeSharedRoomCode,
} from "../../shared/room-protocol";
import { BlockId, DroppedItemState, ItemId, MachineState, MobState, MutationTuple, PlayerSnapshot, Vec3Data, WorldSave } from "./types";

export type NetworkMessage =
  | { type: "snapshot"; save: WorldSave }
  | { type: "resync"; save: WorldSave }
  | { type: "host-transfer"; save: WorldSave }
  | { type: "request-snapshot" }
  | { type: "block"; x: number; y: number; z: number; id: BlockId }
  | { type: "request-block"; x: number; y: number; z: number; id: BlockId; item?: ItemId | null }
  | { type: "machine"; key: string; state: MachineState }
  | { type: "request-machine"; key: string; state: MachineState }
  | { type: "world-state"; mutations: MutationTuple[]; machines: Array<[string, MachineState]>; waterLevels?: Array<[string, number]> }
  | { type: "player"; player: PlayerSnapshot }
  | { type: "mob-state"; mobs: MobState[]; drops: DroppedItemState[]; timeOfDay: number; dayCount: number }
  | { type: "request-mob-hit"; mobId: string; item: ItemId | null }
  | { type: "critical-hit"; mobId: string }
  | { type: "damage"; amount: number; source: string }
  | { type: "give-item"; item: ItemId; count: number }
  | { type: "request-drop"; item: ItemId; count: number }
  | { type: "request-chest"; key: string; direction: "deposit" | "withdraw"; item: ItemId; count: number }
  | { type: "request-cache"; origin: Vec3Data }
  | { type: "request-dungeon"; origin: Vec3Data }
  | { type: "request-sleep" }
  | { type: "request-rift"; origin: Vec3Data }
  | { type: "teleport"; position: Vec3Data; text: string }
  | { type: "peer-left"; playerId: string }
  | { type: "toast"; text: string };

type ClientPacket = ClientRoomPacket<NetworkMessage, WorldSave>;
type ServerPacket = ServerRoomPacket<NetworkMessage, WorldSave>;

const CONNECT_TIMEOUT_MS = 14_000;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export function normalizeRoomCode(value: string): string {
  return normalizeSharedRoomCode(value);
}

export function generateRoomCode(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(entropy, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

function randomId(prefix: string): string {
  const entropy = crypto.getRandomValues(new Uint32Array(3));
  return `${prefix}-${Array.from(entropy, (value) => value.toString(36)).join("-")}`;
}

export function configuredMultiplayerServer(explicit?: string): string | null {
  const configured = explicit?.trim() || process.env.NEXT_PUBLIC_MULTIPLAYER_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") url.protocol = "wss:";
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
      url.pathname = url.pathname.replace(/\/+$/, "");
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV === "development") {
    return "ws://127.0.0.1:8787";
  }
  return null;
}

export class NetworkSession {
  role: "offline" | OnlineRole = "offline";
  readonly playerId = randomId("traveler");
  private socket: WebSocket | null = null;
  private readonly roomPeers = new Set<string>();
  private activeRoomCode: string | null = null;
  private desiredRole: OnlineRole | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private manuallyClosed = true;
  private connectGeneration = 0;
  private preserveGuestOnNextSnapshot = false;
  private readonly explicitServer?: string;
  onMessage?: (message: NetworkMessage, peerId: string) => void;
  onStatus?: (status: string) => void;

  constructor(serverUrl?: string) {
    this.explicitServer = serverUrl;
  }

  get roomCode(): string | null {
    return this.activeRoomCode;
  }

  get connectedPeers(): number {
    return this.roomPeers.size;
  }

  get serverConfigured(): boolean {
    return configuredMultiplayerServer(this.explicitServer) !== null;
  }

  private roomStatus(): string {
    if (this.connectedPeers > 0) {
      return `Server connected · ${this.connectedPeers} player${this.connectedPeers === 1 ? "" : "s"}`;
    }
    if (this.role === "host") return `Room ${this.activeRoomCode ?? ""} · waiting for players`;
    return `Connected to ${this.activeRoomCode ?? "room"}`;
  }

  private endpoint(code: string, role: OnlineRole): string {
    const base = configuredMultiplayerServer(this.explicitServer);
    if (!base) {
      throw new Error("The free multiplayer server is not configured for this build yet.");
    }
    const url = new URL(`${base}/room/${code}`);
    url.searchParams.set("role", role);
    url.searchParams.set("playerId", this.playerId);
    url.searchParams.set("protocol", String(NETWORK_PROTOCOL_VERSION));
    return url.toString();
  }

  private applyCheckpoint(save: WorldSave, role: OnlineRole): void {
    if (role === "host") this.onMessage?.({ type: "host-transfer", save }, "room-server");
    else {
      this.onMessage?.(this.preserveGuestOnNextSnapshot
        ? { type: "resync", save }
        : { type: "snapshot", save }, "room-server");
      this.preserveGuestOnNextSnapshot = false;
    }
  }

  private receive(packet: ServerPacket): void {
    if (packet.kind === "welcome") {
      this.role = packet.role;
      this.desiredRole = packet.role;
      this.reconnectAttempt = 0;
      const nextPeers = new Set(packet.peers.filter((peerId) => peerId !== this.playerId));
      for (const peerId of this.roomPeers) {
        if (!nextPeers.has(peerId)) this.onMessage?.({ type: "peer-left", playerId: peerId }, peerId);
      }
      this.roomPeers.clear();
      for (const peerId of nextPeers) this.roomPeers.add(peerId);
      if (packet.checkpoint) this.applyCheckpoint(packet.checkpoint, packet.role);
      this.onStatus?.(this.roomStatus());
      return;
    }
    if (packet.kind === "game") {
      if (packet.message.type === "snapshot" && this.preserveGuestOnNextSnapshot) {
        this.preserveGuestOnNextSnapshot = false;
        this.onMessage?.({ type: "resync", save: packet.message.save }, packet.peerId);
      } else this.onMessage?.(packet.message, packet.peerId);
      return;
    }
    if (packet.kind === "peer-joined") {
      if (packet.peerId !== this.playerId) this.roomPeers.add(packet.peerId);
      this.onStatus?.(this.roomStatus());
      return;
    }
    if (packet.kind === "peer-left") {
      this.roomPeers.delete(packet.peerId);
      this.onMessage?.({ type: "peer-left", playerId: packet.peerId }, packet.peerId);
      this.onStatus?.(this.roomStatus());
      return;
    }
    if (packet.kind === "role") {
      this.role = packet.role;
      this.desiredRole = packet.role;
      if (packet.checkpoint) this.applyCheckpoint(packet.checkpoint, packet.role);
      this.onStatus?.(packet.role === "host"
        ? "Host disconnected · this browser now owns the room"
        : this.roomStatus());
      return;
    }
    if (packet.kind === "need-checkpoint" && this.role === "host") {
      this.onMessage?.({ type: "request-snapshot" }, packet.peerId ?? "room-server");
      return;
    }
    if (packet.kind === "error") this.onStatus?.(`Room server · ${packet.message}`);
  }

  private scheduleReconnect(generation: number): void {
    if (this.manuallyClosed || !this.activeRoomCode || !this.desiredRole || generation !== this.connectGeneration) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.onStatus?.(`Server connection interrupted · retrying in ${(delay / 1000).toFixed(delay < 1000 ? 1 : 0)}s…`);
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.activeRoomCode || !this.desiredRole || this.manuallyClosed) return;
      void this.openSocket(this.activeRoomCode, this.desiredRole, true).catch(() => undefined);
    }, delay);
  }

  private openSocket(code: string, role: OnlineRole, reconnecting: boolean): Promise<string> {
    const endpoint = this.endpoint(code, role);
    const generation = this.connectGeneration;
    return new Promise((resolve, reject) => {
      let welcomed = false;
      let settled = false;
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      const timeout = window.setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN || !welcomed) {
          socket.close(4000, "Connection timeout");
          if (!settled) {
            settled = true;
            reject(new Error("The multiplayer server did not answer. Please retry in a moment."));
          }
        }
      }, CONNECT_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        if (generation !== this.connectGeneration) return socket.close();
        this.onStatus?.(reconnecting ? "Reconnected · synchronizing room…" : "Connected to room server · synchronizing world…");
      });
      socket.addEventListener("message", (event) => {
        if (generation !== this.connectGeneration || typeof event.data !== "string") return;
        try {
          const packet = JSON.parse(event.data) as ServerPacket;
          if (packet.kind === "welcome" && reconnecting && packet.role === "guest") {
            this.preserveGuestOnNextSnapshot = true;
          }
          this.receive(packet);
          if (packet.kind === "welcome") {
            welcomed = true;
            window.clearTimeout(timeout);
            if (!settled) {
              settled = true;
              resolve(code);
            }
          } else if (packet.kind === "error" && !welcomed && !settled) {
            settled = true;
            reject(new Error(packet.message));
          }
        } catch {
          this.onStatus?.("Ignored a damaged server update");
        }
      });
      socket.addEventListener("error", () => {
        if (!welcomed && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error("Could not reach the multiplayer server. It may be restarting; try again shortly."));
        }
      });
      socket.addEventListener("close", () => {
        window.clearTimeout(timeout);
        if (this.socket === socket) this.socket = null;
        if (!welcomed && !settled) {
          settled = true;
          reject(new Error("The room was unavailable or the code was not found."));
        }
        if (welcomed || reconnecting) this.scheduleReconnect(generation);
        else if (generation === this.connectGeneration) {
          this.manuallyClosed = true;
          this.activeRoomCode = null;
          this.desiredRole = null;
          this.role = "offline";
          this.onStatus?.("Offline · room connection failed");
        }
      });
    });
  }

  private enterRoom(codeValue: string, role: OnlineRole): Promise<string> {
    const code = normalizeRoomCode(codeValue);
    if (code.length !== ROOM_CODE_LENGTH) throw new Error("Enter the complete six-character room code.");
    this.close(false);
    this.manuallyClosed = false;
    this.activeRoomCode = code;
    this.desiredRole = role;
    this.role = role;
    this.preserveGuestOnNextSnapshot = false;
    this.connectGeneration += 1;
    this.onStatus?.(role === "host" ? "Opening room on the multiplayer server…" : `Finding room ${code}…`);
    return this.openSocket(code, role, false);
  }

  hostRoom(code = generateRoomCode()): Promise<string> {
    return this.enterRoom(code, "host");
  }

  joinRoomCode(code: string): Promise<string> {
    return this.enterRoom(code, "guest");
  }

  send(message: NetworkMessage, targetPeerId?: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const packet: ClientPacket = { kind: "game", message, ...(targetPeerId ? { targetPeerId } : {}) };
    this.socket.send(JSON.stringify(packet));
  }

  checkpoint(save: WorldSave): void {
    if (this.role !== "host" || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const packet: ClientPacket = { kind: "checkpoint", save };
    this.socket.send(JSON.stringify(packet));
  }

  close(emitStatus = true): void {
    this.manuallyClosed = true;
    this.connectGeneration += 1;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.close(1000, "Left room");
    for (const peerId of this.roomPeers) this.onMessage?.({ type: "peer-left", playerId: peerId }, peerId);
    this.roomPeers.clear();
    this.activeRoomCode = null;
    this.desiredRole = null;
    this.reconnectAttempt = 0;
    this.preserveGuestOnNextSnapshot = false;
    this.role = "offline";
    if (emitStatus) this.onStatus?.("Offline");
  }
}
