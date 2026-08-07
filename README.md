# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game that runs entirely in the browser. Begin empty-handed or build freely, explore a seeded world, survive the night, uncover ruins, automate factories, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Frontiers & Nightfall (Stage 2) expands the Automation Alpha foundation with full Survival and Creative starts, exploration, combat, ruins, hostile nights, animated first-person feedback, and collision-safe creatures. The broader roadmap is tracked in [the feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain with six climate regions, caves, water, trees, rare Moonshard seams, and ancient Wayfarer ruins
- 50 original block types with individually designed procedural pixel textures, plus bespoke illustrated inventory art for every block, tool, weapon, part, food, and consumable
- Survival starts with an empty pack; Creative supplies the complete infinite catalog, near-instant mining, and immunity from survival damage
- Smooth capsule-like player controller with acceleration, friction, coyote time, jump buffering, step-up handling, swimming, crouching, and sprinting
- Optional mobile auto-jump for full one-block rises
- Attenuating 0–15 logic network with toggle relays, AND/OR/NOT matrices, pulse delay, daylight/night/player sensors, and lamps
- Energy networks with thermal dynamos, flux cells, drills, conveyors, furnaces, fabricators, collector funnels, crates, and linear rams
- Animated first-person hand and held item, mining swings, attack/place/use motion, and seven progressive block-crack textures
- Five original creature species, melee and ranged combat, weapon reach/cooldowns/knockback/ammo, health targeting, loot, food, medicine, and night spawning
- A visible eight-minute day/night orbit with stars, sun, moon, twilight, lighting changes, clock, and day counter
- Real creature AABB collision, gravity, step-up, obstacle avoidance, crowd separation, and recovery for mobs embedded by an older save
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

The connection is peer-to-peer; no account or custom game server is required. The host owns terrain, machines, time, creature simulation, combat validation, damage, and loot so Stage 2 encounters stay synchronized. A restrictive corporate network may block direct WebRTC routes because this release uses public STUN but no paid TURN relay.

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

The 11-test suite covers deterministic terrain and ruin generation, negative chunk coordinates, save-key mode/day round trips and corruption detection, smooth player collision, mobile auto-jump, mob wall collision and embedded-save recovery, weapon differentiation, signal attenuation, gate behavior, and a powered drill production loop. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled per-chunk voxel surfaces from the runtime-generated atlas.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses browser-native WebRTC data channels with the host as authority.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
