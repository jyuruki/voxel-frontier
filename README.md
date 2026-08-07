# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game that runs entirely in the browser. Begin empty-handed or build freely, explore a seeded world, survive the night, uncover ruins, automate factories, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Depths & Circuits (Stage 3) adds true 3D swimming, buoyant creature movement, extensive connected caves and aquifers, physical block drops, a wooden tool tier, 25 new blocks, twelve world-mesh shapes, and a directional signal toolkit. The broader roadmap is tracked in [the feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain with six climate regions, large caverns, winding tunnels, vertical rifts, deep aquifers, cave flora, mineral strata, trees, rare Moonshard seams, and Wayfarer ruins
- 75 original block types with individually generated textures and twelve mesh families: cubes, crossed plants/crystals, thin wire, plates, torches, rods, funnels, slabs, stairs, pistons, columns, and ladders
- Survival starts with an empty pack; Creative supplies the complete infinite catalog, near-instant mining, and immunity from survival damage
- Smooth capsule-like controller with acceleration, coyote time, buffering, partial-height collision, step-up handling, and immersion-aware swimming with look steering, drag, buoyancy, ascend, dive, and sprint strokes
- Optional mobile auto-jump for full one-block rises
- Directional 0–15 logic with thin connected wire, toggles, buttons, plates, daylight/proximity sensors, gates, repeaters, comparators, inverter torches, observers, targets, memory lamps, and tone blocks
- Energy networks plus physical-item logistics: dynamos, cells, drills, conveyors, furnaces, fabricators, transferring collector funnels, crates, six-block rams, and adhesive retraction
- Animated first-person hand and held item, mining swings, attack/place/use motion, and seven progressive block-crack textures
- Five original creature species, melee and ranged combat, weapon reach/cooldowns/knockback/ammo, health targeting, loot, food, medicine, and night spawning
- A visible eight-minute day/night orbit with stars, sun, moon, twilight, lighting changes, clock, and day counter
- Creature AABB/partial-height collision, gravity, water immersion, stable buoyancy and swim drag, step-up, crowd separation, and embedded-save recovery
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

The connection is peer-to-peer; no account or custom game server is required. The host owns terrain, machines, time, creature simulation, combat validation, damage, and loot so Stage 3 encounters stay synchronized. A restrictive corporate network may block direct WebRTC routes because this release uses public STUN but no paid TURN relay.

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

The 18-test suite additionally covers swimming speed and ascent, stable aquatic creature motion, non-cube shape metadata, extensive deterministic cave voids, directional repeater delay, multi-block pistons, physical-drop funnel transfer, and the wooden-tool progression. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled cubes and shape-aware plants, wire, plates, lights, funnels, slabs, stairs, pistons, columns, and ladders from a runtime-generated atlas.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses browser-native WebRTC data channels with the host as authority.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
