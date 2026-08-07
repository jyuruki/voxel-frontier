# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival and automation game that runs entirely in the browser. Mine a seeded world, build factories, route attenuating logic signals, power machines, craft tools, encounter creatures, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Automation Alpha — the first substantial release deliberately goes deepest on logic circuits, machinery, and logistics. The broader survival roadmap is tracked in [the feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain with five climate regions, caves, water, trees, ores, and underground strata
- 42 original block types rendered from a procedurally painted texture atlas—no borrowed textures, models, music, or sound effects
- Smooth capsule-like player controller with acceleration, friction, coyote time, jump buffering, step-up handling, swimming, crouching, and sprinting
- Attenuating 0–15 logic network with toggle relays, AND/OR/NOT matrices, pulse delay, daylight/night/player sensors, and lamps
- Energy networks with thermal dynamos, flux cells, drills, conveyors, furnaces, fabricators, collector funnels, crates, and linear rams
- Mining, building, tool tiers, recipes, inventory/hotbar, survival meters, day/night, drops, and original roaming creatures
- Local autosave every 18 seconds plus compressed, checksummed, copyable world keys
- Host-authoritative WebRTC rooms that work from static GitHub Pages through an invite/answer-key handshake
- Responsive touch controls, left-handed layout, graphics presets, render distance, FOV, sensitivity, volume controls, and synthesized audio

## Play and controls

The game needs a browser with WebGL and WebRTC. Current Chrome, Edge, Firefox, and Safari are recommended. On mobile, use the on-screen movement stick, look zone, and action buttons.

| Desktop input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `Ctrl` or `C` | Crouch |
| Left mouse | Mine |
| Right mouse | Place |
| `F` | Use or configure |
| `R` | Rotate targeted machine |
| `E` | Inventory and crafting |
| `G` | Engineering guide |
| `1`–`9` / wheel | Select hotbar slot |
| `Esc` | Pause |

### Start a direct online room

1. The host opens **Pause → Online room → Host a world**, then generates an invite.
2. The guest pastes that invite under **Join a host** and sends the generated answer back.
3. The host pastes the answer and accepts it. The host's world snapshot synchronizes automatically.

The connection is peer-to-peer; no account or custom game server is required. A restrictive corporate network may block direct WebRTC routes because this alpha uses public STUN but no paid TURN relay.

## Portable world keys

Open **Pause → Save & world key → Generate current key**. A `VF1` key includes the seed, player state, changed blocks, inventory, machines, loose items, creatures, and time of day. It is compressed and protected by an integrity checksum. Paste it on the title screen to reconstruct the world.

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

The test suite covers deterministic generation, negative chunk coordinates, save-key round trips and corruption detection, signal attenuation, gate behavior, and a powered drill production loop. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled per-chunk voxel surfaces from the runtime-generated atlas.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses browser-native WebRTC data channels with the host as authority.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
