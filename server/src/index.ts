import { DurableObject } from "cloudflare:workers";
import {
  NETWORK_PROTOCOL_VERSION,
  type ClientRoomPacket,
  type OnlineRole,
  type ServerRoomPacket,
  isValidPlayerId,
  isValidRoomCode,
  routeGameMessage,
} from "../../shared/room-protocol";

interface Env {
  ROOMS: DurableObjectNamespace<FrontierRoom>;
  ALLOWED_ORIGINS?: string;
}

interface ConnectionAttachment {
  playerId: string;
  name: string;
  role: OnlineRole;
  joinedAt: number;
  roomCode: string;
}

type GameMessage = { type: string; [key: string]: unknown };
type ClientPacket = ClientRoomPacket<GameMessage, unknown>;
type ServerPacket = ServerRoomPacket<GameMessage, unknown>;

const MAX_CONNECTIONS = 12;
const MAX_MESSAGE_BYTES = 8_500_000;
const CHECKPOINT_CHUNK_BYTES = 96_000;
const CHECKPOINT_MANIFEST_KEY = "checkpoint-manifest";

interface CheckpointManifest {
  chunks: number;
  bytes: number;
  updatedAt: number;
}
const DEFAULT_ORIGINS = [
  "https://jyuruki.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function allowedOrigins(env: Env): Set<string> {
  return new Set([
    ...DEFAULT_ORIGINS,
    ...(env.ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  ]);
}

function safeAttachment(socket: WebSocket): ConnectionAttachment | null {
  try {
    return socket.deserializeAttachment() as ConnectionAttachment | null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, packet: ServerPacket): void {
  try {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet));
  } catch {
    // The close event performs membership cleanup.
  }
}

function finiteCoordinate(value: unknown, limit = 1_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function sanitizePlayerMessage(message: GameMessage, playerId: string): GameMessage | null {
  const player = message.player;
  if (!player || typeof player !== "object") return null;
  const data = player as Record<string, unknown>;
  const position = data.position;
  if (!position || typeof position !== "object") return null;
  const point = position as Record<string, unknown>;
  if (!finiteCoordinate(point.x) || !finiteCoordinate(point.y, 512) || !finiteCoordinate(point.z)) return null;
  if (!finiteCoordinate(data.yaw, 100) || !finiteCoordinate(data.pitch, 100)) return null;
  return {
    ...message,
    player: {
      ...data,
      id: playerId,
      name: typeof data.name === "string" ? data.name.trim().slice(0, 18) || "Traveler" : "Traveler",
      position: { x: point.x, y: point.y, z: point.z },
      yaw: data.yaw,
      pitch: data.pitch,
      color: typeof data.color === "string" && data.color.length <= 48 ? data.color : "#6eb8b4",
      velocityY: finiteCoordinate(data.velocityY, 128) ? data.velocityY : 0,
      grounded: Boolean(data.grounded),
      swimming: Boolean(data.swimming),
      flying: Boolean(data.flying),
      crouching: Boolean(data.crouching),
      heldItem: typeof data.heldItem === "string" && data.heldItem.length <= 80 ? data.heldItem : null,
      moveSpeed: finiteCoordinate(data.moveSpeed, 32) ? Math.max(0, data.moveSpeed) : 0,
      realm: typeof data.realm === "string" && data.realm.length <= 40 ? data.realm : "frontier",
      skinSeed: Number.isInteger(data.skinSeed) && typeof data.skinSeed === "number" ? data.skinSeed >>> 0 : 0,
      ridingBoatId: typeof data.ridingBoatId === "string" && data.ridingBoatId.length <= 120 ? data.ridingBoatId : undefined,
    },
  };
}

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
  return cleaned || null;
}

function sanitizeSocialMessage(message: GameMessage, attachment: ConnectionAttachment): GameMessage | null {
  if (message.type === "chat") {
    const text = cleanText(message.text, 180);
    return text ? {
      type: "chat",
      id: `chat-${attachment.playerId}-${Date.now().toString(36)}`,
      name: attachment.name,
      text,
      timestamp: Date.now(),
    } : null;
  }
  if (message.type === "death") {
    const source = cleanText(message.source, 80);
    return source ? {
      type: "death",
      id: `death-${attachment.playerId}-${Date.now().toString(36)}`,
      name: attachment.name,
      source,
      timestamp: Date.now(),
    } : null;
  }
  return null;
}

function validSlot(value: unknown, maximum: number): boolean {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < maximum;
}

function validItemSlot(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 80);
}

function validProfilePoint(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return finiteCoordinate(point.x) && finiteCoordinate(point.y, 512) && finiteCoordinate(point.z);
}

function validPlayerProfile(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!validProfilePoint(data.position)
    || !data.inventory || typeof data.inventory !== "object" || Array.isArray(data.inventory)
    || !Array.isArray(data.hotbar) || data.hotbar.length > 9 || !data.hotbar.every(validItemSlot)
    || !Number.isInteger(data.selectedSlot) || typeof data.selectedSlot !== "number" || data.selectedSlot < 0 || data.selectedSlot > 8
    || !finiteCoordinate(data.yaw, 10_000_000) || !finiteCoordinate(data.pitch, 10)
    || !finiteCoordinate(data.health, 100) || typeof data.health !== "number" || data.health < 0
    || !finiteCoordinate(data.hunger, 100) || typeof data.hunger !== "number" || data.hunger < 0
    || !finiteCoordinate(data.stamina, 100) || typeof data.stamina !== "number" || data.stamina < 0) return false;
  const inventory = data.inventory as Record<string, unknown>;
  if (Object.keys(inventory).length > 256 || Object.entries(inventory).some(([item, count]) => (
    !item || item.length > 80 || !Number.isInteger(count) || typeof count !== "number" || count < 0 || count > 1_000_000_000
  ))) return false;
  if (data.inventorySlots !== undefined && (
    !Array.isArray(data.inventorySlots)
    || data.inventorySlots.length > 36
    || !data.inventorySlots.every(validItemSlot)
  )) return false;
  if (data.spawnPoint !== undefined && !validProfilePoint(data.spawnPoint)) return false;
  if (data.tradeCredit !== undefined && (!finiteCoordinate(data.tradeCredit, 1_000_000_000) || typeof data.tradeCredit !== "number" || data.tradeCredit < 0)) return false;
  if (data.realm !== undefined && (typeof data.realm !== "string" || data.realm.length > 80)) return false;
  return data.skinSeed === undefined || (Number.isInteger(data.skinSeed) && typeof data.skinSeed === "number" && data.skinSeed >= 0 && data.skinSeed <= 0xffff_ffff);
}

function validGuestIntent(message: GameMessage): boolean {
  if (message.type === "player") return true;
  if (message.type === "chat" || message.type === "death") return true;
  if (message.type === "request-snapshot" || message.type === "request-sleep") return true;
  if (message.type === "request-block") {
    return Number.isInteger(message.x) && Number.isInteger(message.y) && Number.isInteger(message.z)
      && typeof message.y === "number" && message.y > -64 && message.y < 320
      && Number.isInteger(message.id) && typeof message.id === "number" && message.id >= 0 && message.id <= 255;
  }
  if (message.type === "request-machine") {
    return typeof message.key === "string" && /^-?\d+,-?\d+,-?\d+$/.test(message.key)
      && Boolean(message.state) && typeof message.state === "object";
  }
  if (message.type === "request-mob-hit") return typeof message.mobId === "string" && message.mobId.length <= 120;
  if (message.type === "player-profile") {
    return validPlayerProfile(message.profile);
  }
  if (message.type === "boat-input") {
    return typeof message.boatId === "string" && message.boatId.length <= 120
      && finiteCoordinate(message.forward, 1) && finiteCoordinate(message.turn, 1);
  }
  if (message.type === "request-boat") {
    if (message.action === "board" || message.action === "leave") {
      return typeof message.boatId === "string" && message.boatId.length <= 120;
    }
    if (message.action !== "place") return false;
    const position = message.position;
    return Boolean(position) && typeof position === "object"
      && finiteCoordinate((position as Record<string, unknown>).x)
      && finiteCoordinate((position as Record<string, unknown>).y, 512)
      && finiteCoordinate((position as Record<string, unknown>).z)
      && finiteCoordinate(message.yaw, 100)
      && (message.wood === "emberwood" || message.wood === "frostpine" || message.wood === "riftwood");
  }
  if (message.type === "request-drop") {
    return typeof message.item === "string" && message.item.length <= 80
      && Number.isInteger(message.count) && typeof message.count === "number" && message.count > 0 && message.count <= 999;
  }
  if (message.type === "request-chest") {
    const validKey = typeof message.key === "string" && /^-?\d+,-?\d+,-?\d+$/.test(message.key);
    if (!validKey) return false;
    if (message.direction === "move") return validSlot(message.sourceSlot, 54) && validSlot(message.targetSlot, 54);
    return (message.direction === "deposit" || message.direction === "withdraw")
      && typeof message.item === "string" && message.item.length <= 80
      && Number.isInteger(message.count) && typeof message.count === "number" && message.count > 0 && message.count <= 999
      && (message.sourceSlot === undefined || validSlot(message.sourceSlot, 54))
      && (message.targetSlot === undefined || validSlot(message.targetSlot, 54));
  }
  if (message.type === "request-furnace") {
    const validKey = typeof message.key === "string" && /^-?\d+,-?\d+,-?\d+$/.test(message.key);
    const validDirection = message.direction === "deposit" || message.direction === "withdraw";
    const validFurnaceSlot = message.slot === "input" || message.slot === "fuel" || message.slot === "output";
    if (!validKey || !validDirection || !validFurnaceSlot || !Number.isInteger(message.count) || typeof message.count !== "number" || message.count < 1 || message.count > 999) return false;
    if (message.direction === "deposit") return message.slot !== "output" && typeof message.item === "string" && message.item.length <= 80
      && (message.sourceSlot === undefined || validSlot(message.sourceSlot, 36));
    return message.targetSlot === undefined || validSlot(message.targetSlot, 36);
  }
  if (message.type === "request-cache" || message.type === "request-dungeon") {
    const origin = message.origin;
    return Boolean(origin) && typeof origin === "object"
      && finiteCoordinate((origin as Record<string, unknown>).x)
      && finiteCoordinate((origin as Record<string, unknown>).y, 512)
      && finiteCoordinate((origin as Record<string, unknown>).z);
  }
  if (message.type === "request-rift") {
    const origin = message.origin;
    return Boolean(origin) && typeof origin === "object"
      && finiteCoordinate((origin as Record<string, unknown>).x)
      && finiteCoordinate((origin as Record<string, unknown>).y, 512)
      && finiteCoordinate((origin as Record<string, unknown>).z);
  }
  return false;
}

export class FrontierRoom extends DurableObject<Env> {
  private connections(exclude?: WebSocket): Array<{ socket: WebSocket; attachment: ConnectionAttachment }> {
    return this.ctx.getWebSockets()
      .filter((socket) => socket !== exclude)
      .map((socket) => ({ socket, attachment: safeAttachment(socket) }))
      .filter((entry): entry is { socket: WebSocket; attachment: ConnectionAttachment } => Boolean(entry.attachment));
  }

  private host(exclude?: WebSocket): { socket: WebSocket; attachment: ConnectionAttachment } | null {
    return this.connections(exclude).find(({ attachment }) => attachment.role === "host") ?? null;
  }

  private broadcast(packet: ServerPacket, exclude?: WebSocket): void {
    for (const { socket } of this.connections(exclude)) send(socket, packet);
  }

  private socketFor(playerId: string, exclude?: WebSocket): WebSocket | null {
    return this.connections(exclude).find(({ attachment }) => attachment.playerId === playerId)?.socket ?? null;
  }

  private async checkpoint(): Promise<unknown | undefined> {
    const manifest = await this.ctx.storage.get<CheckpointManifest>(CHECKPOINT_MANIFEST_KEY);
    if (!manifest || manifest.chunks < 1 || manifest.chunks > 96) return undefined;
    const keys = Array.from({ length: manifest.chunks }, (_, index) => `checkpoint-${index}`);
    const chunks = await this.ctx.storage.get<Uint8Array>(keys);
    const bytes = new Uint8Array(manifest.bytes);
    let offset = 0;
    for (const key of keys) {
      const chunk = chunks.get(key);
      if (!(chunk instanceof Uint8Array)) return undefined;
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset !== manifest.bytes) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return undefined;
    }
  }

  private async saveCheckpoint(value: unknown): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error("World checkpoint is too large for this room.");
    const previous = await this.ctx.storage.get<CheckpointManifest>(CHECKPOINT_MANIFEST_KEY);
    const count = Math.ceil(bytes.byteLength / CHECKPOINT_CHUNK_BYTES);
    const values: Record<string, Uint8Array> = {};
    for (let index = 0; index < count; index += 1) {
      values[`checkpoint-${index}`] = bytes.slice(index * CHECKPOINT_CHUNK_BYTES, (index + 1) * CHECKPOINT_CHUNK_BYTES);
    }
    await this.ctx.storage.put(values);
    await this.ctx.storage.put<CheckpointManifest>(CHECKPOINT_MANIFEST_KEY, {
      chunks: count,
      bytes: bytes.byteLength,
      updatedAt: Date.now(),
    });
    if (previous && previous.chunks > count) {
      await this.ctx.storage.delete(Array.from(
        { length: previous.chunks - count },
        (_, index) => `checkpoint-${count + index}`,
      ));
    }
  }

  private async clearCheckpoint(): Promise<void> {
    const manifest = await this.ctx.storage.get<CheckpointManifest>(CHECKPOINT_MANIFEST_KEY);
    if (manifest) {
      await this.ctx.storage.delete([
        CHECKPOINT_MANIFEST_KEY,
        ...Array.from({ length: manifest.chunks }, (_, index) => `checkpoint-${index}`),
      ]);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade." }, { status: 426 });
    }
    const url = new URL(request.url);
    const roomCode = url.searchParams.get("room") ?? "";
    const playerId = url.searchParams.get("playerId") ?? "";
    const requestedRole = url.searchParams.get("role") as OnlineRole | null;
    const protocol = Number(url.searchParams.get("protocol"));
    if (!isValidRoomCode(roomCode) || !isValidPlayerId(playerId)) {
      return json({ error: "Invalid room or player identity." }, { status: 400 });
    }
    if (protocol !== NETWORK_PROTOCOL_VERSION) {
      return json({ error: `Protocol ${NETWORK_PROTOCOL_VERSION} is required.` }, { status: 426 });
    }
    if (requestedRole !== "host" && requestedRole !== "guest") {
      return json({ error: "A host or guest role is required." }, { status: 400 });
    }

    const existingConnections = this.connections();
    if (existingConnections.length >= MAX_CONNECTIONS) {
      return json({ error: "This room is full." }, { status: 429 });
    }
    for (const { socket, attachment } of existingConnections) {
      if (attachment.playerId === playerId) socket.close(4001, "Reconnected in another socket");
    }

    const activeHost = this.host();
    const storedHostId = await this.ctx.storage.get<string>("hostId");
    const storedCheckpoint = await this.checkpoint();
    let role: OnlineRole;
    let restoreCheckpoint: unknown | undefined;
    if (requestedRole === "host") {
      if (activeHost && activeHost.attachment.playerId !== playerId) {
        // A former host can reconnect after the room has already promoted a
        // successor. Rejoining as a guest avoids two authorities after a flap.
        role = "guest";
      } else {
        role = "host";
        if (storedHostId === playerId) restoreCheckpoint = storedCheckpoint;
        else {
          await this.clearCheckpoint();
        }
        await this.ctx.storage.put("hostId", playerId);
      }
    } else if (activeHost) {
      role = "guest";
    } else if (storedCheckpoint !== undefined) {
      role = "host";
      restoreCheckpoint = storedCheckpoint;
      await this.ctx.storage.put("hostId", playerId);
    } else {
      return json({ error: "Room not found. Ask the host to open it first." }, { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: ConnectionAttachment = { playerId, name: "Traveler", role, joinedAt: Date.now(), roomCode };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`room:${roomCode}`, `player:${playerId}`, `role:${role}`]);

    const peers = this.connections(server).map(({ attachment: peer }) => peer.playerId);
    send(server, {
      kind: "welcome",
      protocol: NETWORK_PROTOCOL_VERSION,
      roomCode,
      playerId,
      role,
      peers,
      ...(restoreCheckpoint !== undefined ? { checkpoint: restoreCheckpoint } : {}),
    });
    this.broadcast({ kind: "peer-joined", peerId: playerId, peerCount: peers.length }, server);
    if (role === "host" && restoreCheckpoint === undefined) send(server, { kind: "need-checkpoint" });
    if (role === "guest") {
      const host = this.host(server);
      if (host) send(host.socket, { kind: "need-checkpoint", peerId: playerId });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = safeAttachment(socket);
    if (!attachment) return;
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      send(socket, { kind: "error", code: "message-too-large", message: "That room update was too large." });
      return;
    }
    let packet: ClientPacket;
    try {
      packet = JSON.parse(raw) as ClientPacket;
    } catch {
      send(socket, { kind: "error", code: "bad-json", message: "Ignored a damaged room update." });
      return;
    }
    if (packet.kind === "ping") {
      send(socket, { kind: "pong", sentAt: packet.sentAt, serverAt: Date.now() });
      return;
    }
    if (packet.kind === "checkpoint") {
      if (attachment.role !== "host") return;
      try {
        await this.saveCheckpoint(packet.save);
      } catch (error) {
        send(socket, {
          kind: "error",
          code: "checkpoint-too-large",
          message: error instanceof Error ? error.message : "Could not preserve this room checkpoint.",
        });
      }
      return;
    }
    if (packet.kind !== "game" || !packet.message || typeof packet.message.type !== "string") return;

    if (packet.message.type === "player") {
      const sanitized = sanitizePlayerMessage(packet.message, attachment.playerId);
      if (!sanitized) {
        send(socket, { kind: "error", code: "bad-player", message: "Ignored an invalid player update." });
        return;
      }
      packet.message = sanitized;
      const player = sanitized.player as Record<string, unknown>;
      attachment.name = typeof player.name === "string" ? player.name : "Traveler";
      socket.serializeAttachment(attachment);
    } else if (packet.message.type === "chat" || packet.message.type === "death") {
      const sanitized = sanitizeSocialMessage(packet.message, attachment);
      if (!sanitized) {
        send(socket, { kind: "error", code: "bad-social", message: "Ignored an empty or invalid chat update." });
        return;
      }
      packet.message = sanitized;
    }
    const route = routeGameMessage(attachment.role, packet.message.type);
    if (route === "reject") {
      send(socket, { kind: "error", code: "authority", message: "The host owns that world action." });
      return;
    }
    if (attachment.role === "guest" && !validGuestIntent(packet.message)) {
      send(socket, { kind: "error", code: "bad-intent", message: "Ignored an invalid guest request." });
      return;
    }
    if (route === "host") {
      const host = this.host(socket);
      if (host) send(host.socket, { kind: "game", message: packet.message, peerId: attachment.playerId });
      return;
    }
    if (route === "snapshot") {
      try {
        if ("save" in packet.message) await this.saveCheckpoint(packet.message.save);
      } catch (error) {
        send(socket, {
          kind: "error",
          code: "checkpoint-too-large",
          message: error instanceof Error ? error.message : "Could not preserve this room checkpoint.",
        });
        return;
      }
      if (packet.targetPeerId) {
        const target = this.socketFor(packet.targetPeerId, socket);
        if (target) send(target, { kind: "game", message: packet.message, peerId: attachment.playerId });
      }
      return;
    }

    const outgoing: ServerPacket = { kind: "game", message: packet.message, peerId: attachment.playerId };
    if (packet.targetPeerId && attachment.role === "host") {
      const target = this.socketFor(packet.targetPeerId, socket);
      if (target) send(target, outgoing);
    } else this.broadcast(outgoing, socket);
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = safeAttachment(socket);
    try { socket.close(code, reason); } catch { /* already closed */ }
    if (!attachment) return;
    const remaining = this.connections(socket);
    this.broadcast({
      kind: "peer-left",
      peerId: attachment.playerId,
      peerCount: Math.max(0, remaining.length - 1),
    }, socket);
    if (attachment.role !== "host") return;
    const successor = remaining
      .filter(({ attachment: peer }) => peer.role === "guest")
      .sort((a, b) => a.attachment.joinedAt - b.attachment.joinedAt)[0];
    if (!successor) return;
    successor.attachment.role = "host";
    successor.socket.serializeAttachment(successor.attachment);
    await this.ctx.storage.put("hostId", successor.attachment.playerId);
    const checkpoint = await this.checkpoint();
    send(successor.socket, {
      kind: "role",
      role: "host",
      ...(checkpoint !== undefined ? { checkpoint } : {}),
    });
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, "Room socket error");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "voxel-frontier-multiplayer",
        protocol: NETWORK_PROTOCOL_VERSION,
        transport: "websocket",
      });
    }
    const match = url.pathname.match(/^\/room\/([A-Z2-9]{6})$/);
    if (!match || !isValidRoomCode(match[1])) return json({ error: "Room route not found." }, { status: 404 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade." }, { status: 426 });
    }
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins(env).has(origin)) return json({ error: "Origin is not allowed." }, { status: 403 });
    url.searchParams.set("room", match[1]);
    return env.ROOMS.getByName(match[1]).fetch(new Request(url, request));
  },
} satisfies ExportedHandler<Env>;
