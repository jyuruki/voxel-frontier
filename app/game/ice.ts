const TURN_CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
const OPEN_RELAY_HOST = "staticauth.openrelay.metered.ca";

// Open Relay publishes this shared secret specifically for its public static-auth
// endpoint. It is not an application secret: it signs short-lived TURN credentials.
const OPEN_RELAY_SHARED_SECRET = "openrelayprojectsecret";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: `stun:${OPEN_RELAY_HOST}:80` },
];

const TURN_URLS = [
  `turn:${OPEN_RELAY_HOST}:80`,
  `turn:${OPEN_RELAY_HOST}:80?transport=tcp`,
  `turn:${OPEN_RELAY_HOST}:443`,
  `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
  `turns:${OPEN_RELAY_HOST}:443?transport=tcp`,
] as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type TurnCredentials = {
  username: string;
  credential: string;
  expiresAt: number;
};

/** Generate coturn REST-style credentials for Open Relay's documented static-auth service. */
export async function createTurnCredentials(now = Date.now()): Promise<TurnCredentials> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure TURN credentials are unavailable in this browser.");
  const expiresAt = Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:voxel-frontier`;
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(OPEN_RELAY_SHARED_SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(username));
  return {
    username,
    credential: bytesToBase64(new Uint8Array(signature)),
    expiresAt,
  };
}

/** STUN is tried first; TURN supplies UDP, TCP, and TLS routes only when direct ICE fails. */
export async function createIceServers(now = Date.now()): Promise<RTCIceServer[]> {
  const credentials = await createTurnCredentials(now);
  return [
    ...STUN_SERVERS.map((server) => ({ ...server })),
    {
      urls: [...TURN_URLS],
      username: credentials.username,
      credential: credentials.credential,
    },
  ];
}

export function hasTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });
}
