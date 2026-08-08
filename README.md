# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game. Begin empty-handed or build freely, explore flowing water and sparse mineral veins, trade with village specialists, automate machines, cross into the Emberdeep, play together through a real room server, and carry a world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> **Shared Horizons (Version 7)** replaces WebRTC peer negotiation and manual answer keys with a free Cloudflare Durable Object WebSocket server. It also rebalances natural terrain, keeps Y 320 as build space instead of a routine summit, creates varied multi-chunk villages, generates a fresh seed for every blank-seed world, and fixes leaves blending with water. See the [Version 7 release notes](docs/VERSION7_RELEASE.md) and [feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Endless deterministic chunks across Y −64…319, with Generation 3 plains, rivers, rolling hills, rare bounded mountains, six climates, deep caves, aquifers, sparse ore veins, ruins, and the Emberdeep
- Dynamic settlements using crossroads, courtyards, or lanes; 3–7 randomized farms, cottages, longhouses, forges, libraries, workshops, and towers; varied residents and profession mixes; paths, markets, furnishings, and biome-aware timber
- 115 original block types with generated textures and eighteen mesh families, including alpha-tested foliage, glass panes, doors, fences, flora, thin wire, directional components, slabs, stairs, pistons, beds, and portals
- Survival with an empty starting inventory, physical drops, mining tiers, crafting, smelting, hunger, combat, beds, and trade; Creative with a searchable catalog, collision-aware flight, block picking, and exact one-click mining
- A persistent 4×9 inventory with the bottom row as the hotbar, unique tool placement, drag-and-drop, tap moving, shift-click transfer, recipe search, craftable/all filters, and detailed tooltips
- Smooth acceleration, partial-block collision, step-up motion, coyote time, jump buffering, ledge-safe crouching, mobile auto-jump, swimming drag, strokes, bobbing, buoyancy, diving, and shore assist
- Directional 0–15 circuits with connected wire, sources, gates, four-delay repeaters, comparators, inverter torches, observers, targets, memory lamps, tone blocks, pistons, hoppers, conveyors, storage, drills, furnaces, and fabricators
- Sheep, cows, pigs, chickens, villagers, and original creatures with procedural textures, articulated animation, recognizable synthesized voices, collision-safe water motion, combat, and loot
- Day/night lighting, a clock and day counter, brighter readable nights, craftable beds, a seeded diatonic ambient score, procedural effects, and original animal-like calls
- Universal villager sales priced by item value, Frontier Mark currency, daily limited profession stock, and drag/tap selling
- Local autosave plus compressed, checksummed, copyable world keys
- Six-character online rooms with server-owned membership and routing policy, host-authoritative simulation, snapshots, 12-second checkpoints, reconnection backoff, multi-peer updates, and automatic host handoff

All code, names, textures, models, UI, and synthesized audio are original to this project.

## Play and controls

The game needs a current browser with WebGL and WebSocket support. Chrome, Edge, Firefox, and Safari are recommended. Mobile browsers receive on-screen movement, look, action, inventory, and flight controls.

| Desktop input | Action |
| --- | --- |
| `W A S D` | Move; steer in water or flight |
| Mouse | Look |
| `Space` | Jump; ascend in water or flight |
| `Shift` | Sprint or swim stroke |
| `Ctrl` or `C` | Crouch; dive or descend |
| `V` or double-tap `Space` | Toggle Creative flight |
| Left mouse | Swing; mine or attack when aimed |
| Middle mouse | Pick the aimed block in Creative |
| Right mouse | Place or use the held item |
| `F` | Interact or configure |
| `R` | Rotate the targeted machine |
| `E` | Open or close inventory and crafting |
| `G` | Open the field guide |
| `1`–`9` / wheel | Select a hotbar slot |
| `Esc` | Pause |

### Start an online room

1. The host opens **Pause → Online room → Host this world** and creates a six-character code.
2. A friend opens **Join a host** and enters that code.
3. Both browsers connect to the same WebSocket room. The host's current snapshot synchronizes automatically.

There is no SDP copy/paste, WebRTC hole punching, or TURN dependency. The room server rejects guest attempts to publish authoritative block or machine state, routes guest intents to the host, preserves chunked world checkpoints, and promotes the oldest connected guest if the host leaves. Terrain, mobs, combat, water, and automation are currently simulated by the selected host; moving the full simulation into a dedicated server process remains future work.

## World creation and saves

Leave **World seed** blank to generate a different readable high-entropy seed every time. Enter a phrase when you intentionally want reproducible terrain.

Open **Pause → Save & world key → Generate current key** to create a `VF1` key containing the seed, generator version, mode, time, player state, changed blocks, water levels, inventory layout, machine/trade stock, drops, and creatures. Version 5 and older keys are lifted into Version 6's taller coordinate system; Version 6 terrain remains on its original generator so existing worlds do not develop seams.

## Development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Run the multiplayer service in a second terminal:

```bash
npm run dev:server
```

Localhost automatically uses `ws://127.0.0.1:8787`. To override it, copy `.env.example` to `.env.local` and change `NEXT_PUBLIC_MULTIPLAYER_URL`.

Full validation:

```bash
npm test
```

This runs linting, 42 deterministic simulation tests, Cloudflare Worker type-checking and bundling, a real two-client Miniflare room lifecycle test, and a production GitHub Pages export. The multiplayer integration opens a host and guest, transfers a snapshot and live world delta, verifies guest authority rejection and request routing, writes a checkpoint larger than one storage row, disconnects the host, and verifies promotion with recovered state.

## Free server deployment

[GitHub Pages serves static files only](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), so Version 7 keeps the game frontend there and deploys `server/` to a Cloudflare Durable Object. Cloudflare documents Durable Objects on its [Workers Free plan](https://developers.cloudflare.com/durable-objects/platform/pricing/) and recommends its [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) for multiplayer rooms that sleep without disconnecting clients.

For a manual deployment:

```bash
npx wrangler login
npx wrangler deploy --config server/wrangler.jsonc
```

Then set the GitHub repository variable `MULTIPLAYER_URL` to the returned secure Worker origin, for example `wss://voxel-frontier-multiplayer.<account>.workers.dev`. The Pages workflow injects that value at build time.

For automatic server deploys, add these repository Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Workers deployment permission

The `Deploy free multiplayer server` workflow then deploys changes under `server/` and `shared/` automatically. Cloudflare usage must remain within its published Free-plan quotas to stay at zero cost.

## Architecture

- Next.js and React provide the static responsive shell and menus on GitHub Pages.
- Three.js renders face-culled terrain, partial block shapes, original atlas textures, articulated creatures, and the first-person viewmodel.
- Framework-independent TypeScript under `app/game/` owns world generation and gameplay simulation.
- Untouched chunks regenerate from seed and generator version; saves store mutations and dynamic state.
- A Cloudflare Worker maps each code to one SQLite-backed Durable Object. The object owns sockets, role policy, routing, reconnect identity, chunked checkpoints, and host succession while hibernating when idle.
- The browser transport uses standard secure WebSockets; no WebRTC or Trystero dependency remains.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by voxel survival and factory-building genres. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
