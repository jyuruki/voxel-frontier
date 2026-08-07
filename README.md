# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game that runs entirely in the browser. Begin empty-handed or build freely, explore a seeded world, survive the night, meet Wayfarer villages, automate factories, cross into the Emberdeep, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Living Worlds (Version 4) adds soulful animated creatures with synthesized calls, reliable shore exits, brighter nights, beds, full ore progression, coal-fired smelting, procedural villages and trading, 36 new blocks, and the original Emberdeep dimension. See the [Version 4 release notes](docs/VERSION4_RELEASE.md) and [feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain with six overworld climates, extensive caves, aquifers, depth-sensitive coal/iron/gold/Fluxstone/diamond seams, ruins, and complete Wayfarer villages
- 111 original block types with individually generated textures and sixteen mesh families, including beds, portals, doors, fences, plants, wire, plates, slabs, stairs, pistons, and logistics pieces
- Survival starts with an empty pack; Creative supplies the complete infinite catalog, near-instant mining, and immunity from survival damage
- Smooth capsule-like controller with acceleration, coyote time, buffering, partial-height collision, step-up handling, and immersion-aware swimming with look steering, drag, surface bobbing, shore assist, ascend, dive, and sprint strokes
- Optional mobile auto-jump for full one-block rises
- Directional 0–15 logic with thin connected wire, toggles, buttons, plates, daylight/proximity sensors, gates, repeaters, comparators, inverter torches, observers, targets, memory lamps, and tone blocks
- Energy networks plus physical-item logistics: dynamos, cells, drills, conveyors, furnaces, fabricators, transferring collector funnels, crates, six-block rams, and adhesive retraction
- Animated first-person hand and held item, mining swings, attack/place/use motion, and seven progressive block-crack textures
- Six original creature species with procedural skin patterns, eyes and species details, activity states, walking/idle/jump animation, synthesized voices and footsteps, smooth render interpolation, combat, loot, and night spawning
- A readable eight-minute day/night orbit with stars, sun, moon, twilight, brighter night ambience, a clock/day counter, and craftable beds that advance the shared world to dawn
- A coal-fired Hearth Furnace, four mining tiers, raw ore refinement, metal/gem storage blocks, village markets, five barter routes, and returnable Rift Gates into the volcanic Emberdeep
- Local autosave every 18 seconds plus compressed, checksummed, copyable world keys
- Host-authoritative WebRTC rooms that work from static GitHub Pages through an invite/answer-key handshake
- Responsive touch controls, left-handed layout, graphics presets, render distance, FOV, sensitivity, volume controls, and synthesized audio

## Play and controls

The game needs a browser with WebGL and WebRTC. Current Chrome, Edge, Firefox, and Safari are recommended. On mobile, use the on-screen movement stick, look zone, and action buttons.

| Desktop input | Action |
| --- | --- |
| `W A S D` | Move; steer a swim in look direction |
| Mouse | Look |
| `Space` | Jump; ascend in water |
| `Shift` | Sprint |
| `Ctrl` or `C` | Crouch; dive in water |
| Left mouse | Mine or attack |
| Right mouse | Place or use held food/medicine |
| `F` | Interact or configure |
| `R` | Rotate targeted machine |
| `E` | Inventory and crafting |
| `G` | Engineering guide |
| `1`–`9` / wheel | Select hotbar slot |
| `Esc` | Pause |

### Start a direct online room

1. The host opens **Pause → Online room → Host a world**, then generates an invite.
2. The guest pastes that invite under **Join a host** and sends the generated answer back.
3. The host pastes the answer and accepts it. The host's world snapshot synchronizes automatically.

The connection is peer-to-peer; no account or custom game server is required. The host owns terrain, machines, time, creature simulation, combat validation, damage, loot, sleeping, and validated rift travel. A restrictive corporate network may block direct WebRTC routes because this release uses public STUN but no paid TURN relay.

## Portable world keys

Open **Pause → Save & world key → Generate current key**. A `VF1` key includes the seed, game mode, day and time, player state, changed blocks, inventory, machines, loose items, and creatures. It is compressed and protected by an integrity checksum. Paste it on the title screen to reconstruct the world.

Local saves use browser storage. Export a key before clearing site data or changing devices.

## Development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Validation and static export:

```bash
npm test
# GitHub Pages output is written to out/
```

The 24-test suite additionally covers deep-water shore exits, continuous mob jump arcs, stable aquatic motion, the complete ore family, furnace fuel consumption, deterministic villages, Emberdeep terrain, cave density, signals, pistons, physical logistics, saves, and tool progression. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled terrain, sixteen shape families, world-matching inventory icons, and procedural articulated creature rigs from runtime-generated textures.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses browser-native WebRTC data channels with the host as authority.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
