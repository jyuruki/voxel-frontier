# Feature matrix and roadmap

Voxel Frontier's **Living Worlds** release is Version 4. It is an original game inspired by voxel survival and factory-building genres; it does not claim one-to-one parity with Minecraft.

| System family | Living Worlds (Version 4) | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks, six climates, caves, aquifers, depth-sensitive ore seams, ruins, deterministic villages, and the Emberdeep dimension | Rivers, larger dungeons, more settlements |
| Blocks and shapes | 111 original blocks and sixteen mesh families, including crossed flora, wire, plates, torches, funnels, slabs, stairs, pistons, beds, portals, doors, and fences | Dyes, growable materials, more architecture |
| Mining and drops | Variable hardness and harvest tiers, seven crack stages, animated hand, physical item drops, coal/iron/gold/Fluxstone/diamond progression, and depleted-stack cleanup | Durability, repair, upgrade trees |
| Tools | Empty-handed start, then Emberwood, roughstone, copper, iron, diamond, and crystal mining tools | Equipment slots and specialized upgrades |
| Movement | Smooth acceleration, sprint, crouch, coyote time, buffered jump, partial-height collision, fall damage, and mobile auto-jump | Climbing, gliding, mounts |
| Swimming | Water drag, look-directed strokes, buoyancy, surface bobbing, shore assist, sprint stroke, ascent, and dive | Currents, breath, boats, diving gear |
| Creatures | Six species with procedural textures, detailed rigs, activity states, render interpolation, walking/jump/idle animation, synthesized calls/steps, collision, swimming, combat, and loot | Breeding, taming, pathfinding, bosses |
| Villages and trade | Deterministic cottage-and-market settlements, resident Wayfarers, home behavior, Trade Posts, and five barter offers | Professions, reputation, village growth |
| Survival cycle | Health, nutrition, stamina, food, medicine, brighter readable nights, night threats, and craftable beds that advance to dawn | Armor, effects, weather, farming |
| Smelting | Coal-fired Hearth Furnace for iron, gold, copper, glass, and fired brick; powered Arc Furnace remains an automation upgrade | Heat tiers, recipes, furnace upgrades |
| Dimensions | Craftable returnable Rift Gates and a volcanic Emberdeep with molten hazards, Riftwood, rare ores, glowstone, and distinct ambience | Structures, bosses, dimension-specific machinery |
| Logic circuits | 0–15 attenuation, directional repeaters, comparators, inverter torches, observers, buttons, plates, sensors, targets, gates, memory lamps, and tone blocks | Edge sequencers, bundled channels, programmable logic |
| Pistons and logistics | Six-block Linear Rams, Adhesive Rams, physical drops, conveyors, collector funnels, and crates | Filters, splitters, pipes, routing rules |
| Energy and machines | Thermal generation, storage cells, drills, Arc Furnaces, fabricators, visible state, and coal fuel items | Load priority, pumps, modular upgrades |
| Multiplayer | Direct WebRTC rooms with host-owned world simulation, validated combat, sleeping, rift travel, drops, and snapshots | Reconnection, TURN fallback, permissions |
| Persistence | 18-second autosave and compressed checksummed `VF1` keys; earlier keys remain importable through optional fields | IndexedDB scale-up and migrations |
| Mobile and UI | Touch move/look/actions, left-handed mode, auto-jump, scrollable nine-slot hotbar, held-item label, exact world-texture block icons, options, and audio controls | Remapping, controller, reduced motion |
| Original art/audio | Runtime-generated block atlas, world-matching item art, held models, procedural creature skins/models, synthesized effects, voices, footsteps, and ambience | More animation layers and positional mixing |

## Release priorities

1. Stabilize Version 4 village placement, creature behaviors, rift return routes, and mobile shore ergonomics.
2. Add farming, armor/equipment, weather, larger structures, and dedicated aquatic wildlife.
3. Add traversal vehicles, bosses, deeper dimension progression, and server-assisted rooms.
