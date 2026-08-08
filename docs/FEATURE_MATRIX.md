# Feature matrix and roadmap

Voxel Frontier's **Flow & Foundations** release is Version 5. It is an original game inspired by voxel survival and factory-building genres; it does not claim one-to-one parity with Minecraft.

| System family | Flow & Foundations (Version 5) | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks, six climates, broad lowlands, rolling hills, rare tall mountain regions, caves, aquifers, sparse anchored ore veins, deep-slate strata, ruins, spaced villages, and the Emberdeep | Rivers, larger dungeons, weather-shaped terrain |
| Water | Generated sources plus finite seven-level horizontal flow into opened cells, falling flow, saved levels, swimming, buoyancy, diving, and shore assist | Currents, breath, boats, pumps |
| Blocks and shapes | 115 original blocks and seventeen mesh families, including connected glass panes, shutters, planters, crossed flora, wire, plates, torches, funnels, slabs, stairs, pistons, beds, portals, doors, and fences | Dyes, growable materials, more architecture |
| Mining and drops | Variable hardness and harvest tiers, seven crack stages, animated hand, physical item drops, coal/iron/gold/Fluxstone/diamond progression, and depleted-stack cleanup | Durability, repair, upgrade trees |
| Tools | Empty-handed start, then Emberwood, roughstone, copper, iron, diamond, and crystal mining tools | Equipment slots and specialized upgrades |
| Movement | Smooth acceleration, sprint, crouch, coyote time, buffered jump, partial-height collision, fall damage, and mobile auto-jump | Climbing, gliding, mounts |
| Swimming | Water drag, look-directed strokes, buoyancy, surface bobbing, shore assist, sprint stroke, ascent, and dive | Currents, breath, boats, diving gear |
| Creatures | Sheep, cows, pigs, and chickens with recognizable procedural calls and loot plus six Frontier creature types; procedural textures, detailed rigs, activity states, interpolation, walking/jump/idle animation, collision-safe swimming, combat, and loot | Breeding, taming, deeper pathfinding, bosses |
| Villages and trade | Rarer region-spaced cottage settlements, four visibly marked professions, profession-specific buy/sell offers, limited daily stock, Frontier Mark currency, home behavior, and Trade Posts | Reputation, village growth, dynamic prices |
| Survival cycle | Health, nutrition, stamina, food, medicine, brighter readable nights, night threats, and craftable beds that advance to dawn | Armor, effects, weather, farming |
| Smelting | Coal-fired Hearth Furnace for iron, gold, copper, glass, and fired brick; powered Arc Furnace remains an automation upgrade | Heat tiers, recipes, furnace upgrades |
| Dimensions | Craftable returnable Rift Gates and a volcanic Emberdeep with molten hazards, Riftwood, rare ores, glowstone, and distinct ambience | Structures, bosses, dimension-specific machinery |
| Logic circuits | 0–15 attenuation, directional repeaters, comparators, inverter torches, observers, buttons, plates, sensors, targets, gates, memory lamps, and tone blocks | Edge sequencers, bundled channels, programmable logic |
| Pistons and logistics | Six-block Linear Rams, Adhesive Rams, physical drops, conveyors, collector funnels, and crates | Filters, splitters, pipes, routing rules |
| Energy and machines | Thermal generation, storage cells, drills, Arc Furnaces, fabricators, visible state, and coal fuel items | Load priority, pumps, modular upgrades |
| Multiplayer | Direct WebRTC rooms with host-owned world simulation, validated combat, sleeping, rift travel, drops, and snapshots | Reconnection, TURN fallback, permissions |
| Persistence | 18-second autosave and compressed checksummed `VF1` keys containing water levels, slot layout, trade stock, and world state; Version 4 keys migrate through optional fields | IndexedDB scale-up and richer migrations |
| Inventory and crafting | Persistent 4×9 layout with bottom-row hotbar, unique item placement, drag/drop, touch tap-moving, shift-click transfer, detailed tooltips, Creative catalog, combined recipe screen, search, and craftable/all filters | Stack splitting, equipment slots, controller navigation |
| Mobile and UI | Touch move/look/actions, left-handed mode, auto-jump, scrollable nine-slot hotbar, held-item label, responsive 36-slot inventory, exact world-texture block icons, options, and audio controls | Remapping, controller, reduced motion |
| First-person presentation | Held hand/item, stronger swing on every press, mining/place/use motion, seven crack stages, and late transparent-pass rendering above leaves, flora, and water | More animation layers and item-specific poses |
| Original art/audio | Runtime-generated block atlas and item art, procedural creature skins/models, animal-like formant voices, synthesized effects/steps, and a seeded 72 BPM diatonic ambient arrangement with chord voicing, bass, arpeggios, and motifs | Biome arrangements and richer positional mixing |

## Release priorities

1. Stabilize Version 5 water edge cases, touch inventory ergonomics, profession balance, and music mix across browsers.
2. Add farming, armor/equipment, weather, larger structures, breeding, and dedicated aquatic wildlife.
3. Add traversal vehicles, bosses, deeper dimension progression, and server-assisted rooms.
