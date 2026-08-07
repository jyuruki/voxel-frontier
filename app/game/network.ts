import { strFromU8, strToU8, zlibSync, unzlibSync } from "fflate";
import { BlockId, MachineState, PlayerSnapshot, WorldSave } from "./types";

export type NetworkMessage =
  | { type: "snapshot"; save: WorldSave }
  | { type: "request-snapshot" }
  | { type: "block"; x: number; y: number; z: number; id: BlockId }
  | { type: "request-block"; x: number; y: number; z: number; id: BlockId }
  | { type: "machine"; key: string; state: MachineState }
  | { type: "player"; player: PlayerSnapshot }
  | { type: "peer-left"; playerId: string }
  | { type: "toast"; text: string };

type PeerRecord = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  chunks: Map<string, { total: number; parts: string[] }>;
};

type InviteEnvelope = {
  kind: "offer" | "answer";
  sessionId: string;
  peerId: string;
  sdp: RTCSessionDescriptionInit;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

const NET_PREFIX = "VFNET1.";
const CHUNK_LENGTH = 12_000;

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

function waitForIce(pc: RTCPeerConnection, timeout = 8000): Promise<void> {
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
  private guestHostId: string | null = null;
  onMessage?: (message: NetworkMessage, peerId: string) => void;
  onStatus?: (status: string) => void;

  private configurePeer(peerId: string, pc: RTCPeerConnection): PeerRecord {
    const peer: PeerRecord = { pc, chunks: new Map() };
    this.peers.set(peerId, peer);
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") this.onStatus?.(`Connected · ${this.connectedPeers} peer${this.connectedPeers === 1 ? "" : "s"}`);
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        this.peers.delete(peerId);
        this.onMessage?.({ type: "peer-left", playerId: peerId }, peerId);
        this.onStatus?.(this.role === "host" ? `Hosting · ${this.connectedPeers} peers` : "Connection lost");
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
    channel.addEventListener("close", () => this.onStatus?.("Connection closed"));
  }

  get connectedPeers(): number {
    return Array.from(this.peers.values()).filter((peer) => peer.channel?.readyState === "open").length;
  }

  async createHostInvite(): Promise<string> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is unavailable in this browser.");
    this.role = "host";
    const peerId = randomId("guest");
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.configurePeer(peerId, pc);
    const channel = pc.createDataChannel("frontier", { ordered: true });
    this.attachChannel(peerId, channel);
    await pc.setLocalDescription(await pc.createOffer());
    this.onStatus?.("Gathering a direct route…");
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
    this.close();
    this.role = "guest";
    this.guestHostId = offer.peerId;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.configurePeer(offer.peerId, pc);
    pc.addEventListener("datachannel", (event) => this.attachChannel(offer.peerId, event.channel));
    await pc.setRemoteDescription(offer.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    this.onStatus?.("Gathering a direct route…");
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

  close(): void {
    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.pc.close();
    }
    this.peers.clear();
    this.role = "offline";
    this.guestHostId = null;
    this.onStatus?.("Offline");
  }
}

