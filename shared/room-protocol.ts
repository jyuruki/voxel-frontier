export const NETWORK_PROTOCOL_VERSION = 9;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type OnlineRole = "host" | "guest";

export type ClientRoomPacket<TMessage = unknown, TSave = unknown> =
  | { kind: "game"; message: TMessage; targetPeerId?: string }
  | { kind: "checkpoint"; save: TSave }
  | { kind: "ping"; sentAt: number };

export type ServerRoomPacket<TMessage = unknown, TSave = unknown> =
  | {
      kind: "welcome";
      protocol: number;
      roomCode: string;
      playerId: string;
      role: OnlineRole;
      peers: string[];
      checkpoint?: TSave;
    }
  | { kind: "game"; message: TMessage; peerId: string }
  | { kind: "peer-joined"; peerId: string; peerCount: number }
  | { kind: "peer-left"; peerId: string; peerCount: number }
  | { kind: "role"; role: OnlineRole; checkpoint?: TSave }
  | { kind: "need-checkpoint"; peerId?: string }
  | { kind: "pong"; sentAt: number; serverAt: number }
  | { kind: "error"; code: string; message: string };

const GUEST_REQUESTS = new Set([
  "request-snapshot",
  "request-block",
  "request-machine",
  "request-mob-hit",
  "request-sleep",
  "request-rift",
  "request-drop",
  "request-chest",
  "request-furnace",
  "request-cache",
  "request-dungeon",
]);

export type MessageRoute = "broadcast" | "host" | "snapshot" | "reject";

/** The relay owns routing policy so a guest cannot impersonate world authority. */
export function routeGameMessage(role: OnlineRole, type: string): MessageRoute {
  if (role === "guest") {
    if (type === "player" || type === "chat" || type === "death") return "broadcast";
    return GUEST_REQUESTS.has(type) ? "host" : "reject";
  }
  if (type === "snapshot") return "snapshot";
  if (type.startsWith("request-")) return "reject";
  return "broadcast";
}

export function normalizeSharedRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .split("")
    .filter((character) => ROOM_ALPHABET.includes(character))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(value: string): boolean {
  return value.length === ROOM_CODE_LENGTH
    && value.split("").every((character) => ROOM_ALPHABET.includes(character));
}

export function isValidPlayerId(value: string): boolean {
  return /^traveler-[a-zA-Z0-9_-]{8,80}$/.test(value);
}
