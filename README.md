# Voxel Frontier

Voxel Frontier is an original, mobile-friendly procedural voxel survival, exploration, combat, and automation game that runs entirely in the browser. Begin empty-handed or build freely, explore a seeded world of flowing water and sparse mineral veins, trade with village specialists, automate factories, cross into the Emberdeep, and carry the world between devices as a portable `VF1` save key.

**Play:** [jyuruki.github.io/voxel-frontier](https://jyuruki.github.io/voxel-frontier/)

> Highlands & Handshakes (Version 6.1) replaces the multiplayer answer-key exchange with one readable room code, adds automatic TURN fallback and reconnection grace, expands the world to Y −64…319, introduces dramatic Skybreak mountain ranges, lets placed dams cut downstream flow, adds Creative flight and exact one-click mining, makes crouching ledge-safe, adds falling critical hits, accepts every inventory item in a value-based villager sell tray, and gives circuits clearer direction and unique item art. See the [Version 6 release notes](docs/VERSION6_RELEASE.md) and [feature matrix](docs/FEATURE_MATRIX.md).

## Highlights

- Deterministic, endless-by-chunk terrain across Y −64…319 with six overworld climates, broad lowlands, hill country, sharp Skybreak ridges, near-ceiling summits, extensive caves, aquifers, sparse depth-sensitive ore veins, ruins, rarer villages, and finite water flow
- 115 original block types with individually generated textures and eighteen mesh families, including connected glass panes, doors, shutters, planters, beds, portals, fences, plants, wire, plates, directional observers/funnels, slabs, stairs, pistons, and logistics pieces
- Survival starts with an empty pack; Creative supplies the complete infinite catalog, free collision-aware flight, exact one-click instant mining, middle-click block picking, and immunity from survival damage
- A persistent 36-slot, four-row inventory with a dedicated hotbar row, unique tool placement, desktop drag-and-drop, touch-friendly tap moving, shift-click transfer, detailed item tooltips, and backward-compatible save migration
- Inventory and crafting share one responsive screen with recipe search plus Craftable now and All recipes filters; the Creative catalog remains searchable
- Smooth capsule-like controller with acceleration, coyote time, buffering, partial-height collision, step-up handling, crouch edge protection, and immersion-aware swimming with look steering, drag, surface bobbing, shore assist, ascend, dive, and sprint strokes
- Optional mobile auto-jump for full one-block rises
- Directional 0–15 logic with thin connected wire, toggles, buttons, plates, daylight/proximity sensors, gates, repeaters with four visible delay positions, comparators, inverter torches, arrowed observers, targets, memory lamps, and tone blocks
- Energy networks plus physical-item logistics: dynamos, cells, drills, conveyors, furnaces, fabricators, transferring collector funnels, crates, six-block rams, and adhesive retraction
- Animated first-person hand and held item with stronger unconditional swing motion, mining/attack/place/use animation, corrected transparent-world layering, and seven progressive block-crack textures
- Sheep, cows, pigs, and chickens with recognizable layered synthesized calls and fitting loot, plus the Frontier's original creatures; all use procedural skins, detailed rigs, activity states, walking/idle/jump animation, smooth interpolation, collision-safe swimming, combat, and drops
- A readable eight-minute day/night orbit with stars, sun, moon, twilight, brighter night ambience, a clock/day counter, and craftable beds that advance the shared world to dawn
- A coal-fired Hearth Furnace, discoverable sand-to-glass smelting, four mining tiers, raw ore refinement, metal/gem storage blocks, and returnable Rift Gates into the volcanic Emberdeep
- Rarer villages with Farmers, Blacksmiths, Builders, Riftwrights, a Market Clerk, daily limited purchase stock, a drag-and-drop sell tray accepting every carried item, value carryover for cheap materials, and spendable Frontier Mark currency; selling yields currency only
- Local autosave every 18 seconds plus compressed, checksummed, copyable world keys
- Host-authoritative WebRTC rooms with encrypted automatic discovery from one human-readable code, direct-first STUN plus authenticated TURN fallback over UDP/TCP/TLS, multi-peer room reuse, an 18-second transient-disconnect grace period, and a manual signaling fallback
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
| `V` or double-tap `Space` | Toggle Creative flight (`Space` rises, `Ctrl` descends) |
| Left mouse | Swing; mine or attack when aimed at a target |
| Middle mouse | Pick the aimed block in Creative |
| Right mouse | Place or use held food/medicine |
| `F` | Interact or configure |
| `R` | Rotate targeted machine |
| `E` | Open or close inventory and crafting |
| `G` | Engineering guide |
| `1`–`9` / wheel | Select hotbar slot |
| `Esc` | Pause |

### Start an online room

1. The host opens **Pause → Online room → Host this world** and creates a room code.
2. The host sends that short code to any friends who should join.
3. Each guest opens **Join a host**, enters the code once, and the host's world snapshot synchronizes automatically.

No player account or custom game server is required. Encrypted public discovery replaces the manual signaling exchange, while game state travels over WebRTC. ICE prefers a direct peer route; when symmetric NAT or a firewall prevents one, short-lived authenticated Open Relay TURN routes carry the same encrypted data over UDP, TCP, or TLS. The host owns terrain, machines, time, creature simulation, combat validation, damage, loot, sleeping, and validated rift travel. The previous two-way key workflow remains under **Manual signaling fallback**.

## Portable world keys

Open **Pause → Save & world key → Generate current key**. A `VF1` key includes the seed, generation, game mode, day and time, player state, changed blocks, flowing-water levels, the organized 36-slot inventory, value carryover, machine/trade stock, loose items, and creatures. It is compressed and protected by an integrity checksum. Version 5 and earlier keys migrate into the new slot layout and are lifted into Version 6's taller terrain datum when loaded.

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

The 38-test suite covers TURN credential/configuration validity; water distance, persistence and dam cutoff; liquid placement targeting; Y −64…320 bounds; deterministic mountain balance; legacy save migration; 36-slot uniqueness; collision; auto-jump; crouch ledges; Creative flight; critical-hit rules; sale values for every item; one-code normalization; sparse veins; caves; shore exits; continuous mob jumps; aquatic motion; livestock; recipes; furnaces; spaced profession villages; Emberdeep terrain; signals; pistons; and physical logistics. Every push to `main` reruns linting, tests, a production export, and GitHub Pages deployment.

## Architecture

- Next.js/React supplies the responsive shell and menus.
- Three.js renders face-culled terrain, eighteen shape families, unique world-matching circuit icons, and procedural articulated creature rigs from runtime-generated textures.
- The game simulation is framework-independent TypeScript under `app/game/`.
- Terrain stores only player mutations; untouched chunks regenerate from the seed.
- Multiplayer uses Trystero-assisted encrypted room discovery plus browser-native WebRTC data channels with the host as authority; STUN attempts direct transport first and expiring TURN credentials supply an encrypted relay fallback.

## Original-work notice

Voxel Frontier is an independent, clean-room project inspired by the voxel survival and factory-building genres. All names, code, visual textures, models, UI, and synthesized audio in this repository are original to this project. It is not affiliated with, endorsed by, or distributed by Mojang Studios or Microsoft, and it does not ship Minecraft assets.
