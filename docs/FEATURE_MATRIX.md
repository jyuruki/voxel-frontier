# Feature matrix and roadmap

Voxel Frontier's **Highlands & Handshakes** release is Version 6. It is an original game inspired by voxel survival and factory-building genres; it does not claim one-to-one parity with Minecraft.

| System family | Highlands & Handshakes (Version 6) | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks across Y −64…319, six climates, broad lowlands, rolling hills, sharp Skybreak ridges, near-ceiling mountain summits, caves throughout the vertical span, aquifers, depth-sensitive anchored ore veins, deep-slate strata, ruins, spaced villages, and the Emberdeep | Rivers, larger dungeons, weather-shaped terrain |
| Water | Generated sources plus finite seven-level horizontal/falling flow, direct in-water block placement, source-reachability rebuilds that remove blocked downstream flow, saved levels, swimming, buoyancy, diving, and shore assist | Currents, breath, boats, pumps |
| Blocks and shapes | 115 original blocks and eighteen mesh families, including connected glass panes, shutters, planters, crossed flora, wire, plates, torches, directional funnels and observers, slabs, stairs, pistons, beds, portals, doors, and fences | Dyes, growable materials, more architecture |
| Mining and drops | Variable hardness and harvest tiers, seven crack stages, animated hand, physical item drops, coal/iron/gold/Fluxstone/diamond progression, and depleted-stack cleanup | Durability, repair, upgrade trees |
| Tools | Empty-handed start, then Emberwood, roughstone, copper, iron, diamond, and crystal mining tools | Equipment slots and specialized upgrades |
| Movement | Smooth acceleration, sprint, ledge-safe crouch, coyote time, buffered jump, partial-height collision, fall damage, mobile auto-jump, and collision-aware Creative flight with desktop/touch controls | Climbing, gliding, mounts |
| Swimming | Water drag, look-directed strokes, buoyancy, surface bobbing, shore assist, sprint stroke, ascent, and dive | Currents, breath, boats, diving gear |
| Creatures | Sheep, cows, pigs, and chickens with recognizable procedural calls and loot plus six Frontier creature types; procedural textures, detailed rigs, activity states, interpolation, walking/jump/idle animation, collision-safe swimming, combat, and loot | Breeding, taming, deeper pathfinding, bosses |
| Villages and trade | Rarer region-spaced cottage settlements, four visibly marked professions, profession-specific purchase stock, universal drag/tap selling of every item, deterministic value pricing, fractional-value carryover, currency-only sale proceeds, daily stock, home behavior, and Trade Posts | Reputation, village growth, dynamic prices |
| Survival cycle | Health, nutrition, stamina, food, medicine, brighter readable nights, night threats, and craftable beds that advance to dawn | Armor, effects, weather, farming |
| Smelting | Coal-fired Hearth Furnace for iron, gold, copper, glass, and fired brick; powered Arc Furnace remains an automation upgrade | Heat tiers, recipes, furnace upgrades |
| Dimensions | Craftable returnable Rift Gates and a volcanic Emberdeep with molten hazards, Riftwood, rare ores, glowstone, and distinct ambience | Structures, bosses, dimension-specific machinery |
| Logic circuits | 0–15 attenuation, repeaters with four configurable/visible delay positions, comparators, inverter torches, arrowed observers, buttons, plates, sensors, targets, gates, memory lamps, tone blocks, and unique component inventory art | Edge sequencers, bundled channels, programmable logic |
| Pistons and logistics | Six-block Linear Rams, Adhesive Rams, physical drops, conveyors, directionally spouted collector funnels, and crates | Filters, splitters, pipes, routing rules |
| Energy and machines | Thermal generation, storage cells, drills, Arc Furnaces, fabricators, visible state, and coal fuel items | Load priority, pumps, modular upgrades |
| Multiplayer | One human-readable room code, encrypted automatic relay discovery, reusable multi-peer rooms, host-owned WebRTC simulation, an 18-second transient-route grace period, validated combat/sleep/rift/drop state, snapshots, and manual signaling fallback | TURN fallback, permissions, hosted room directory |
| Persistence | 18-second autosave and compressed checksummed `VF1` keys containing generation, water levels, slot layout, value carryover, trade stock, and world state; legacy saves are elevated into the Version 6 terrain datum | IndexedDB scale-up and richer migrations |
| Inventory and crafting | Persistent 4×9 layout with bottom-row hotbar, unique item placement, drag/drop, touch tap-moving, shift-click transfer, detailed tooltips, Creative catalog, combined recipe screen, search, and craftable/all filters | Stack splitting, equipment slots, controller navigation |
| Mobile and UI | Touch move/look/actions and flight toggle, left-handed mode, auto-jump, scrollable nine-slot hotbar, held-item label, responsive 36-slot inventory and merchant tray, unique circuit icons, options, and audio controls | Remapping, controller, reduced motion |
| First-person presentation | Held hand/item, stronger swing on every press, mining/place/use motion, seven crack stages, and late transparent-pass rendering above leaves, flora, and water | More animation layers and item-specific poses |
| Original art/audio | Runtime-generated block atlas and item art, procedural creature skins/models, animal-like formant voices, synthesized effects/steps, and a seeded 72 BPM diatonic ambient arrangement with chord voicing, bass, arpeggios, and motifs | Biome arrangements and richer positional mixing |

## Release priorities

1. Stabilize Version 6 automatic room discovery and tall-world performance across mobile browsers and restrictive networks.
2. Add farming, armor/equipment, weather, larger structures, breeding, and dedicated aquatic wildlife.
3. Add traversal vehicles, bosses, deeper dimension progression, permissions, and an optional TURN-backed relay service.
