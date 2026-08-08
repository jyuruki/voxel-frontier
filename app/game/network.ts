import { strFromU8, strToU8, zlibSync, unzlibSync } from "fflate";
import { joinRoom, type MessageAction, type Room } from "trystero";
import { createIceServers } from "./ice";
import { BlockId, DroppedItemState, ItemId, MachineState, MobState, PlayerSnapshot, Vec3Data, WorldSave } from "./types";

export type NetworkMessage =
  | { type: "snapshot"; save: WorldSave }
  | { type: "request-snapshot" }
  | { type: "block"; x: number; y: number; z: number; id: BlockId }
  | { type: "request-block"; x: number; y: number; z: number; id: BlockId; item?: ItemId | null }
  | { type: "machine"; key: string; state: MachineState }
  | { type: "player"; player: PlayerSnapshot }
  | { type: "mob-state"; mobs: MobState[]; drops: DroppedItemState[]; timeOfDay: number; dayCount: number }
  | { type: "request-mob-hit"; mobId: string; item: ItemId | null }
  | { type: "critical-hit"; mobId: string }
  | { type: "damage"; amount: number; source: string }
  | { type: "give-item"; item: ItemId; count: number }
  | { type: "request-sleep" }
  | { type: "request-rift"; origin: Vec3Data }
  | { type: "teleport"; position: Vec3Data; text: string }
  | { type: "peer-left"; playerId: string }
  | { type: "toast"; text: string };

type PeerRecord = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  chunks: Map<string, { total: number; parts: string[] }>;
  disconnectTimer?: number;
};

type InviteEnvelope = {
  kind: "offer" | "answer";
  sessionId: string;
  peerId: string;
  sdp: RTCSessionDescriptionInit;
};

const NET_PREFIX = "VFNET1.";
const CHUNK_LENGTH = 12_000;
const DISCONNECT_GRACE_MS = 18_000;
const ROOM_APP_ID = "io.github.jyuruki.voxel-frontier.v6";

type RoomPacket =
  | { kind: "hello"; role: "host" | "guest"; sessionId: string }
  | { kind: "game"; message: NetworkMessage };

const ROOM_ADJECTIVES = [
  "AMBER", "BRAVE", "BRIGHT", "CALM", "COPPER", "EMBER", "FROST", "GOLDEN",
  "HIDDEN", "LUNAR", "MISTY", "NIMBLE", "QUIET", "RED", "RIVER", "SOLAR",
  "STAR", "STILL", "STORM", "SWIFT", "VERDANT", "WILD", "WINDY", "WOVEN",
] as const;

const ROOM_NOUNS = [
  "BADGER", "BEACON", "BISON", "CEDAR", "COMET", "CRANE", "FALCON", "FOX",
  "GECKO", "HERON", "ISLAND", "LANTERN", "LYNX", "MANTA", "OTTER", "OWL",
  "PANDA", "PEAK", "PINE", "REEF", "RIVER", "SPARROW", "TIGER", "WHALE",
] as const;

export function normalizeRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function generateRoomCode(): string {
  const entropy = crypto.getRandomValues(new Uint32Array(3));
  const adjective = ROOM_ADJECTIVES[entropy[0] % ROOM_ADJECTIVES.length];
  const noun = ROOM_NOUNS[entropy[1] % ROOM_NOUNS.length];
  return `${adjective}-${noun}-${String(entropy[2] % 10_000).padStart(4, "0")}`;
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeEnvelope(envelope: InviteEnvelope): string {
  return NET_PREFIX + encodeBytes(zlibSync(strToU8(JSON.stringify(envelope)), { level: 9 }));
}

function decodeEnvelope(value: string): InviteEnvelope {
  const cleaned = value.trim();
  if (!cleaned.startsWith(NET_PREFIX)) throw new Error("That is not a Voxel Frontier connection key.");
  try {
    const parsed = JSON.parse(strFromU8(unzlibSync(decodeBytes(cleaned.slice(NET_PREFIX.length))))) as InviteEnvelope;
    if (!parsed.sdp || !parsed.peerId || !parsed.sessionId) throw new Error();
    return parsed;
  } catch {
    throw new Error("The connection key is incomplete or damaged.");
  }
}

function waitForIce(pc: RTCPeerConnection, timeout = 15_000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, timeout);
    function finish(): void {
      window.clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange(): void {
      if (pc.iceGatheringState === "complete") finish();
    }
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;
}

export class NetworkSession {
  role: "offline" | "host" | "guest" = "offline";
  readonly playerId = randomId("traveler");
  readonly sessionId = randomId("room");
  private readonly peers = new Map<string, PeerRecord>();
  private room: Room | null = null;
  private roomAction: MessageAction<string> | null = null;
  private readonly roomPeers = new Set<string>();
  private readonly acceptedRoomPeers = new Set<string>();
  private readonly roomLeaveTimers = new Map<string, number>();
  private guestHostId: string | null = null;
  private activeRoomCode: string | null = null;
  onMessage?: (message: NetworkMessage, peerId: string) => void;
  onStatus?: (status: string) => void;

  get roomCode(): string | null {
    return this.activeRoomCode;
  }

  private forgetManualPeer(peerId: string, status?: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.disconnectTimer !== undefined) window.clearTimeout(peer.disconnectTimer);
    this.peers.delete(peerId);
    this.onMessage?.({ type: "peer-left", playerId: peerId }, peerId);
    if (status) this.onStatus?.(status);
  }

  private configurePeer(peerId: string, pc: RTCPeerConnection): PeerRecord {
    const peer: PeerRecord = { pc, chunks: new Map() };
    this.peers.set(peerId, peer);
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        if (peer.disconnectTimer !== undefined) window.clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = undefined;
        this.onStatus?.(`Connected · ${this.connectedPeers} peer${this.connectedPeers === 1 ? "" : "s"}`);
      } else if (pc.connectionState === "disconnected") {
        if (peer.disconnectTimer !== undefined) return;
        this.onStatus?.("Route interrupted · recovering…");
        peer.disconnectTimer = window.setTimeout(() => {
          peer.pc.close();
          this.forgetManualPeer(
            peerId,
            this.role === "host" ? `Hosting · ${this.connectedPeers} peers` : "Connection lost",
          );
        }, DISCONNECT_GRACE_MS);
      } else if (pc.connectionState === "failed") {
        pc.restartIce();
        this.onStatus?.("Direct route failed · retrying ICE…");
        if (peer.disconnectTimer === undefined) {
          peer.disconnectTimer = window.setTimeout(() => {
            peer.pc.close();
            this.forgetManualPeer(
              peerId,
              this.role === "host" ? `Hosting · ${this.connectedPeers} peers` : "Connection lost",
            );
          }, DISCONNECT_GRACE_MS);
        }
      } else if (pc.connectionState === "closed") {
        this.forgetManualPeer(
          peerId,
          this.role === "host" ? `Hosting · ${this.connectedPeers} peers` : "Connection closed",
        );
      }
    });
    return peer;
  }

  private attachChannel(peerId: string, channel: RTCDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      this.onStatus?.(`Connected · ${this.connectedPeers} peer${this.connectedPeers === 1 ? "" : "s"}`);
      if (this.role === "guest") this.send({ type: "request-snapshot" });
    });
    channel.addEventListener("message", (event) => this.receive(peerId, String(event.data)));
    channel.addEventListener("close", () => {
      if (peer.pc.connectionState === "closed" || peer.pc.connectionState === "failed") {
        this.forgetManualPeer(
          peerId,
          this.role === "host" ? `Hosting · ${this.connectedPeers} peers` : "Connection closed",
        );
      }
    });
  }

  get connectedPeers(): number {
    return this.acceptedRoomPeers.size
      + Array.from(this.peers.values()).filter((peer) => peer.channel?.readyState === "open").length;
  }

  private roomStatus(): string {
    if (this.connectedPeers > 0) return `Connected · ${this.connectedPeers} peer${this.connectedPeers === 1 ? "" : "s"}`;
    if (this.role === "host") return `Room ${this.activeRoomCode ?? ""} · waiting for players`;
    return `Joining ${this.activeRoomCode ?? "room"}…`;
  }

  private getIceServers(): Promise<RTCIceServer[]> {
    // Refresh the time-limited credential for every new room attempt so a tab
    // left open overnight never retries with an expired TURN username.
    return createIceServers();
  }

  private sendRoomPacket(packet: RoomPacket, target: string | string[]): void {
    if (!this.roomAction || (Array.isArray(target) && target.length === 0)) return;
    void this.roomAction.send(JSON.stringify(packet), { target }).catch(() => {
      this.onStatus?.("Room route interrupted · reconnecting…");
    });
  }

  private receiveRoomPacket(raw: string, peerId: string): void {
    try {
      const packet = JSON.parse(raw) as RoomPacket;
      if (packet.kind === "hello") {
        if (this.role === "host" && packet.role === "guest") {
          this.acceptedRoomPeers.add(peerId);
          this.sendRoomPacket({ kind: "hello", role: "host", sessionId: this.sessionId }, peerId);
          this.onStatus?.(this.roomStatus());
        } else if (this.role === "guest" && packet.role === "host" && (!this.guestHostId || this.guestHostId === peerId)) {
          const firstConnection = !this.acceptedRoomPeers.has(peerId);
          this.guestHostId = peerId;
          this.acceptedRoomPeers.add(peerId);
          this.onStatus?.(this.roomStatus());
          if (firstConnection) this.sendRoomPacket({ kind: "game", message: { type: "request-snapshot" } }, peerId);
        }
        return;
      }
      if (packet.kind !== "game" || !this.acceptedRoomPeers.has(peerId)) return;
      this.onMessage?.(packet.message, peerId);
    } catch {
      this.onStatus?.("Ignored a damaged room packet");
    }
  }

  private async enterAutomaticRoom(codeValue: string, role: "host" | "guest"): Promise<string> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is unavailable in this browser.");
    const code = normalizeRoomCode(codeValue);
    if (code.length < 6) throw new Error("Enter the complete room code.");
    this.onStatus?.("Preparing direct and relay routes…");
    const iceServers = await this.getIceServers();
    this.close(false);
    this.role = role;
    this.activeRoomCode = code;
    const room = joinRoom({
      appId: ROOM_APP_ID,
      password: `voxel-frontier:${code}`,
      trickleIce: true,
      relayConfig: { redundancy: 3 },
      rtcConfig: { iceServers },
    }, `vf6-${code.toLowerCase()}`, {
      onJoinError: ({ error }) => {
        const routeFailure = /TURN|connect to peer|exchanging SDP/i.test(error);
        this.onStatus?.(routeFailure
          ? "Network relay could not open a route · retry once or disable a restrictive VPN"
          : `Room discovery failed · ${error}`);
      },
    });
    this.room = room;
    this.roomAction = room.makeAction<string>("frontier-v6");
    this.roomAction.onMessage = (data, { peerId }) => {
      if (this.room === room) this.receiveRoomPacket(data, peerId);
    };
    room.onPeerJoin = (peerId) => {
      if (this.room !== room) return;
      const leaveTimer = this.roomLeaveTimers.get(peerId);
      if (leaveTimer !== undefined) window.clearTimeout(leaveTimer);
      this.roomLeaveTimers.delete(peerId);
      this.roomPeers.add(peerId);
      this.sendRoomPacket({ kind: "hello", role, sessionId: this.sessionId }, peerId);
      this.onStatus?.(this.roomStatus());
    };
    room.onPeerLeave = (peerId) => {
      if (this.room !== room) return;
      this.roomPeers.delete(peerId);
      if (this.roomLeaveTimers.has(peerId)) return;
      this.onStatus?.("Peer route interrupted · allowing time to reconnect…");
      const timer = window.setTimeout(() => {
        this.roomLeaveTimers.delete(peerId);
        const wasAccepted = this.acceptedRoomPeers.delete(peerId);
        if (this.guestHostId === peerId) this.guestHostId = null;
        if (wasAccepted) this.onMessage?.({ type: "peer-left", playerId: peerId }, peerId);
        this.onStatus?.(this.roomStatus());
      }, DISCONNECT_GRACE_MS);
      this.roomLeaveTimers.set(peerId, timer);
    };
    this.onStatus?.(this.roomStatus());
    return code;
  }

  hostRoom(code = generateRoomCode()): Promise<string> {
    return this.enterAutomaticRoom(code, "host");
  }

  joinRoomCode(code: string): Promise<string> {
    return this.enterAutomaticRoom(code, "guest");
  }

  async createHostInvite(): Promise<string> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is unavailable in this browser.");
    this.onStatus?.("Preparing direct and relay routes…");
    const iceServers = await this.getIceServers();
    if (this.room || this.role === "guest") this.close(false);
    this.role = "host";
    const peerId = randomId("guest");
    const pc = new RTCPeerConnection({ iceServers });
    this.configurePeer(peerId, pc);
    const channel = pc.createDataChannel("frontier", { ordered: true });
    this.attachChannel(peerId, channel);
    await pc.setLocalDescription(await pc.createOffer());
    this.onStatus?.("Gathering direct and relay routes…");
    await waitForIce(pc);
    if (!pc.localDescription) throw new Error("The browser could not create an invite.");
    this.onStatus?.("Invite ready");
    return encodeEnvelope({
      kind: "offer",
      sessionId: this.sessionId,
      peerId,
      sdp: pc.localDescription.toJSON(),
    });
  }

  async joinInvite(invite: string): Promise<string> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is unavailable in this browser.");
    const offer = decodeEnvelope(invite);
    if (offer.kind !== "offer") throw new Error("Paste the host's invite key here.");
    this.onStatus?.("Preparing direct and relay routes…");
    const iceServers = await this.getIceServers();
    this.close(false);
    this.role = "guest";
    this.guestHostId = offer.peerId;
    const pc = new RTCPeerConnection({ iceServers });
    this.configurePeer(offer.peerId, pc);
    pc.addEventListener("datachannel", (event) => this.attachChannel(offer.peerId, event.channel));
    await pc.setRemoteDescription(offer.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    this.onStatus?.("Gathering direct and relay routes…");
    await waitForIce(pc);
    if (!pc.localDescription) throw new Error("The browser could not create an answer.");
    this.onStatus?.("Answer ready · send it to the host");
    return encodeEnvelope({
      kind: "answer",
      sessionId: offer.sessionId,
      peerId: offer.peerId,
      sdp: pc.localDescription.toJSON(),
    });
  }

  async acceptAnswer(answerKey: string): Promise<void> {
    const answer = decodeEnvelope(answerKey);
    if (answer.kind !== "answer") throw new Error("Paste the guest's answer key here.");
    if (answer.sessionId !== this.sessionId) throw new Error("That answer belongs to a different room session.");
    const peer = this.peers.get(answer.peerId);
    if (!peer) throw new Error("This answer belongs to an expired invite. Create a new invite.");
    await peer.pc.setRemoteDescription(answer.sdp);
    this.onStatus?.("Connecting directly…");
  }

  private sendRaw(peer: PeerRecord, serialized: string): void {
    if (!peer.channel || peer.channel.readyState !== "open") return;
    if (serialized.length <= CHUNK_LENGTH) {
      peer.channel.send(serialized);
      return;
    }
    const packetId = randomId("packet");
    const total = Math.ceil(serialized.length / CHUNK_LENGTH);
    for (let index = 0; index < total; index += 1) {
      peer.channel.send(JSON.stringify({
        __chunk: true,
        packetId,
        index,
        total,
        data: serialized.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH),
      }));
    }
  }

  send(message: NetworkMessage, targetPeerId?: string): void {
    if (this.roomAction) {
      const targets = targetPeerId
        ? this.acceptedRoomPeers.has(targetPeerId) ? [targetPeerId] : []
        : Array.from(this.acceptedRoomPeers);
      this.sendRoomPacket({ kind: "game", message }, targets);
    }
    const serialized = JSON.stringify(message);
    if (targetPeerId) {
      const peer = this.peers.get(targetPeerId);
      if (peer) this.sendRaw(peer, serialized);
      return;
    }
    for (const peer of this.peers.values()) this.sendRaw(peer, serialized);
  }

  private receive(peerId: string, raw: string): void {
    try {
      const parsed = JSON.parse(raw) as NetworkMessage | {
        __chunk: true;
        packetId: string;
        index: number;
        total: number;
        data: string;
      };
      if ("__chunk" in parsed) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        const packet = peer.chunks.get(parsed.packetId) ?? {
          total: parsed.total,
          parts: new Array<string>(parsed.total),
        };
        packet.parts[parsed.index] = parsed.data;
        peer.chunks.set(parsed.packetId, packet);
        if (packet.parts.filter(Boolean).length === packet.total) {
          peer.chunks.delete(parsed.packetId);
          this.receive(peerId, packet.parts.join(""));
        }
        return;
      }
      this.onMessage?.(parsed, peerId);
      if (this.role === "host" && parsed.type === "player") {
        for (const [otherId, other] of this.peers) {
          if (otherId !== peerId) this.sendRaw(other, raw);
        }
      }
    } catch {
      this.onStatus?.("Ignored a damaged network packet");
    }
  }

  close(emitStatus = true): void {
    const room = this.room;
    this.room = null;
    this.roomAction = null;
    this.roomPeers.clear();
    this.acceptedRoomPeers.clear();
    for (const timer of this.roomLeaveTimers.values()) window.clearTimeout(timer);
    this.roomLeaveTimers.clear();
    this.activeRoomCode = null;
    if (room) void room.leave();
    for (const peer of this.peers.values()) {
      if (peer.disconnectTimer !== undefined) window.clearTimeout(peer.disconnectTimer);
      peer.channel?.close();
      peer.pc.close();
    }
    this.peers.clear();
    this.role = "offline";
    this.guestHostId = null;
    if (emitStatus) this.onStatus?.("Offline");
  }
}
