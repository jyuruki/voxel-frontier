import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const WORKER_BUNDLE = "server/dist/server/index.js";
const ORIGIN = "http://localhost:3000";

function trackedSocket(socket) {
  const queued = [];
  const waiters = [];
  socket.accept();
  socket.addEventListener("message", (event) => {
    const packet = JSON.parse(String(event.data));
    const waiterIndex = waiters.findIndex(({ predicate }) => predicate(packet));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(packet);
    } else queued.push(packet);
  });
  return {
    raw: socket,
    send(packet) {
      socket.send(JSON.stringify(packet));
    },
    next(predicate, label) {
      const queuedIndex = queued.findIndex(predicate);
      if (queuedIndex >= 0) return Promise.resolve(queued.splice(queuedIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`Timed out waiting for ${label}. Received: ${JSON.stringify(queued)}`));
          }, 4_000),
        };
        waiters.push(waiter);
      });
    },
  };
}

async function connect(miniflare, roomCode, role, playerId) {
  const response = await miniflare.dispatchFetch(
    `http://localhost/room/${roomCode}?role=${role}&playerId=${playerId}&protocol=8`,
    { headers: { Upgrade: "websocket", Origin: ORIGIN } },
  );
  assert.equal(response.status, 101);
  assert.ok(response.webSocket);
  return trackedSocket(response.webSocket);
}

const miniflare = new Miniflare({
  modules: true,
  scriptPath: WORKER_BUNDLE,
  compatibilityDate: "2026-08-08",
  durableObjects: { ROOMS: { className: "FrontierRoom", useSQLite: true } },
  bindings: { ALLOWED_ORIGINS: ORIGIN },
});

try {
  const health = await miniflare.dispatchFetch("http://localhost/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).protocol, 8);

  const hostId = "traveler-host-12345678";
  const guestId = "traveler-guest-12345678";
  const room = "F7K2P9";
  const host = await connect(miniflare, room, "host", hostId);
  const hostWelcome = await host.next((packet) => packet.kind === "welcome", "host welcome");
  assert.equal(hostWelcome.role, "host");
  await host.next((packet) => packet.kind === "need-checkpoint", "initial checkpoint request");

  // This exceeds Durable Object KV's single-value ceiling and verifies the
  // server's chunked checkpoint storage path as well as handoff persistence.
  const checkpoint = { seed: "integration frontier", marker: "x".repeat(260_000) };
  host.send({ kind: "checkpoint", save: checkpoint });

  const guest = await connect(miniflare, room, "guest", guestId);
  const guestWelcome = await guest.next((packet) => packet.kind === "welcome", "guest welcome");
  assert.equal(guestWelcome.role, "guest");
  assert.deepEqual(guestWelcome.peers, [hostId]);
  await host.next((packet) => packet.kind === "peer-joined" && packet.peerId === guestId, "peer join");
  await host.next((packet) => packet.kind === "need-checkpoint" && packet.peerId === guestId, "live snapshot request");

  const liveSave = { seed: "integration frontier", marker: "live" };
  host.send({
    kind: "game",
    targetPeerId: guestId,
    message: { type: "snapshot", save: liveSave },
  });
  const snapshot = await guest.next((packet) => packet.kind === "game" && packet.message?.type === "snapshot", "guest snapshot");
  assert.equal(snapshot.peerId, hostId);
  assert.deepEqual(snapshot.message.save, liveSave);

  host.send({
    kind: "game",
    message: { type: "world-state", mutations: [[2, 72, -3, 18]], machines: [], waterLevels: [] },
  });
  const worldState = await guest.next((packet) => packet.kind === "game" && packet.message?.type === "world-state", "world delta");
  assert.deepEqual(worldState.message.mutations, [[2, 72, -3, 18]]);

  guest.send({ kind: "game", message: { type: "block", x: 0, y: 70, z: 0, id: 3 } });
  const authorityError = await guest.next((packet) => packet.kind === "error" && packet.code === "authority", "authority rejection");
  assert.match(authorityError.message, /host owns/i);

  guest.send({ kind: "game", message: { type: "request-block", x: 0, y: 70, z: 0, id: 0 } });
  const request = await host.next((packet) => packet.kind === "game" && packet.message?.type === "request-block", "guest block request");
  assert.equal(request.peerId, guestId);

  guest.send({ kind: "game", message: { type: "request-drop", item: "part:coal", count: 2 } });
  const dropRequest = await host.next((packet) => packet.kind === "game" && packet.message?.type === "request-drop", "guest item drop");
  assert.equal(dropRequest.peerId, guestId);
  assert.equal(dropRequest.message.count, 2);

  guest.send({ kind: "game", message: { type: "request-chest", key: "1,70,1", direction: "deposit", item: "part:coal", count: 2 } });
  const chestRequest = await host.next((packet) => packet.kind === "game" && packet.message?.type === "request-chest", "guest chest transfer");
  assert.equal(chestRequest.peerId, guestId);
  assert.equal(chestRequest.message.direction, "deposit");

  guest.send({ kind: "game", message: { type: "request-dungeon", origin: { x: 0, y: 70, z: 0 } } });
  const dungeonRequest = await host.next((packet) => packet.kind === "game" && packet.message?.type === "request-dungeon", "guest dungeon activation");
  assert.equal(dungeonRequest.peerId, guestId);

  host.raw.close(1000, "integration host handoff");
  await guest.next((packet) => packet.kind === "peer-left" && packet.peerId === hostId, "host departure");
  const promotion = await guest.next((packet) => packet.kind === "role" && packet.role === "host", "guest promotion");
  // The targeted live snapshot replaced the earlier large checkpoint.
  assert.deepEqual(promotion.checkpoint, liveSave);
  guest.raw.close(1000, "integration complete");

  console.log("multiplayer integration: host, guest, authority, snapshot, and handoff passed");
} finally {
  await miniflare.dispose();
}
