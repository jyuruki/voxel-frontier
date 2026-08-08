# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game that runs entirely in the browser. Begin empty-handed or build freely, explore a seeded world of flowing water and sparse mineral veins, trade with village specialists, automate factories, cross into the Emberdeep, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Flow & Foundations (Version 5) adds finite seven-level water flow, a draggable 4×9 inventory and combined searchable recipe book, a theory-led ambient score, recognizable livestock calls, sparse clustered ore veins, hill and mountain regions, profession trading with limited stock and Frontier Mark currency, rarer villages, stronger first-person swings, render-layer fixes, and four new architectural blocks. See the [Version 5 release notes](docs/VERSION5_RELEASE.md) and [feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain with six overworld climates, balanced lowlands/hills/mountain regions, extensive caves, aquifers, sparse depth-sensitive ore veins, ruins, rarer villages, and finite water flow
- 115 original block types with individually generated textures and seventeen mesh families, including connected glass panes, doors, shutters, planters, beds, portals, fences, plants, wire, plates, slabs, stairs, pistons, and logistics pieces
- Survival starts with an empty pack; Creative supplies the complete infinite catalog, near-instant mining, and immunity from survival damage
- A persistent 36-slot, four-row inventory with a dedicated hotbar row, unique tool placement, desktop drag-and-drop, touch-friendly tap moving, shift-click transfer, detailed item tooltips, and backward-compatible save migration
- Inventory and crafting share one responsive screen with recipe search plus Craftable now and All recipes filters; the Creative catalog remains searchable
- Smooth capsule-like controller with acceleration, coyote time, buffering, partial-height collision, step-up handling, and immersion-aware swimming with look steering, drag, surface bobbing, shore assist, ascend, dive, and sprint strokes
- Optional mobile auto-jump for full one-block rises
- Directional 0–15 logic with thin connected wire, toggles, buttons, plates, daylight/proximity sensors, gates, repeaters, comparators, inverter torches, observers, targets, memory lamps, and tone blocks
- Energy networks plus physical-item logistics: dynamos, cells, drills, conveyors, furnaces, fabricators, transferring collector funnels, crates, six-block rams, and adhesive retraction
- Animated first-person hand and held item with stronger unconditional swing motion, mining/attack/place/use animation, corrected transparent-world layering, and seven progressive block-crack textures
- Sheep, cows, pigs, and chickens with recognizable layered synthesized calls and fitting loot, plus the Frontier's original creatures; all use procedural skins, detailed rigs, activity states, walking/idle/jump animation, smooth interpolation, collision-safe swimming, combat, and drops
- A readable eight-minute day/night orbit with stars, sun, moon, twilight, brighter night ambience, a clock/day counter, and craftable beds that advance the shared world to dawn
- A coal-fired Hearth Furnace, discoverable sand-to-glass smelting, four mining tiers, raw ore refinement, metal/gem storage blocks, and returnable Rift Gates into the volcanic Emberdeep
- Rarer villages with Farmers, Blacksmiths, Builders, Riftwrights, a Market Clerk, daily limited stock, item selling, and spendable Frontier Mark currency
- Local autosave every 18 seconds plus compressed, checksummed, copyable world keys
- Host-authoritative WebRTC rooms that work from static GitHub Pages through an invite/answer-key handshake
- Responsive touch controls, left-handed layout, graphics presets, render distance, FOV, sensitivity, volume controls, animal-like procedural voices, and a seeded 72 BPM ambient score built from voiced diatonic progressions, bass, arpeggios, and melodic motifs

## Play and controls

The game needs a browser with WebGL and WebRTC. Current Chrome, Edge, Firefox, and Safari are recommended. On mobile, use the on-screen movement stick, look zone, and action buttons.

| Desktop input | Action |
| --- | --- |
| `W A S D` | Move; steer a swim in look direction |
| Mouse | Look |
| `Space` | Jump; ascend in water |
| `Shift` | Sprint |
| `Ctrl` or `C` | Crouch; dive in water |
| Left mouse | Swing; mine or attack when aimed at a target |
| Right mouse | Place or use held food/medicine |
| `F` | Interact or configure |
| `R` | Rotate targeted machine |
| `E` | Open or close inventory and crafting |
| `G` | Engineering guide |
| `1`–`9` / wheel | Select hotbar slot |
| `Esc` | Pause |

### Start a direct online room

1. The host opens **Pause → Online room → Host a world**, then generates an invite.
2. The guest pastes that invite under **Join a host** and sends the generated answer back.
3. The host pastes the answer and accepts it. The host's world snapshot synchronizes automatically.

The connection is peer-to-peer; no account or custom game server is required. The host owns terrain, machines, time, creature simulation, combat validation, damage, loot, sleeping, and validated rift travel. A restrictive corporate network may block direct WebRTC routes because this release uses public STUN but no paid TURN relay.

## Portable world keys

Open **Pause → Save & world key → Generate current key**. A `VF1` key includes the seed, game mode, day and time, player state, changed blocks, flowing-water levels, the organized 36-slot inventory, machine/trade stock, loose items, and creatures. It is compressed and protected by an integrity checksum. Version 4 keys migrate into the new slot layout when loaded.

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

The 29-test suite additionally covers finite water distance and persistence, 36-slot uniqueness/drag/shift primitives, mountain balance, sparse clustered veins, deep-water shore exits, continuous mob jump arcs, stable aquatic motion, livestock, home-building recipes, furnace fuel consumption, spaced profession villages, Emberdeep terrain, cave density, signals, pistons, physical logistics, saves, and tool progression. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled terrain, seventeen shape families, world-matching inventory icons, and procedural articulated creature rigs from runtime-generated textures.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses browser-native WebRTC data channels with the host as authority.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
