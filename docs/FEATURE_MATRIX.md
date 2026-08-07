# Feature matrix and roadmap

Voxel Frontier's Automation Alpha is a complete playable vertical slice, not a claim of one-to-one Minecraft parity. Minecraft has more than a decade of systems and content; this project keeps an explicit matrix so shipped behavior and planned work are easy to distinguish.

The reference horizon for this release was the official Minecraft release timeline and Java Edition 26.2 notes available in August 2026. Those sources inform categories and usability expectations only. Voxel Frontier's designs, names, rules, textures, sounds, and code are original.

| System family | Automation Alpha | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks, five climate regions, caves, ore strata, trees, cactus-like flora, water, snow and ice | Structures, villages, ruins, alternate realms, richer rivers and aquifers |
| Blocks and materials | 42 original terrain, decorative, logic and machine blocks | Larger architectural palette, stairs/slabs, dyes, growable materials |
| Mining and building | Variable block hardness, tool power, reach raycast, drops, placement, machine orientation | Silk/fortune-like upgrades, durability, repair, scaffolding |
| Movement | Smooth acceleration, sprint, crouch, swim, step-up, coyote time, buffered jump, fall damage | Climbing, boats, gliding, mounts |
| Survival | Health, hunger, stamina, day/night hazards | Status effects, armor depth, weather, temperature, sleep |
| Crafting and tools | Inventory, hotbar, recipe list, four tool types/two tiers, machine parts | Crafting stations, recipe discovery, equipment slots, upgrade trees |
| Creatures | Three original roaming species with simple day/night behavior and saved state | Breeding, taming, pathfinding depth, bosses, ecosystem spawning |
| Logic circuits | Signal level 0–15, one-step attenuation, toggle, AND/OR/NOT, pulse delay, light/night/player sensing | Comparators, edge detectors, bundled channels, programmable sequencer |
| Energy | Connected power networks, generation, consumption, buffering and visible state | Multiple voltages, load priority, transformers, network diagnostics |
| Machinery | Thermal dynamo, flux cell, bore drill, arc furnace, fabricator, linear ram | Quarry, pumps, farming machines, modular upgrades, machine wear |
| Logistics | Directional conveyors, loose-item transport, collector funnels, crates | Filters, splitters, inserters, pipes and routing rules |
| Fluids | Static generated water and swimming | Flow simulation, pumps, tanks, mixing and lava-like hazards |
| Farming and food | Hunger loop and collectible organic items | Soil hydration, crops, cooking chains and animal husbandry |
| Multiplayer | Direct WebRTC rooms, host-owned world, snapshot/block/machine/player synchronization | TURN fallback, reconnection, permissions, authentication, dedicated authority server |
| Persistence | 18-second local autosave, compressed checksummed `VF1` export/import | IndexedDB scale-up, save migration UI, optional cloud slots |
| Accessibility and options | Touch/desktop input, left-handed touch, sensitivity, invert Y, FOV, render distance, graphics and volume controls | Remapping, controller support, high-contrast and reduced-motion modes |
| Audio and art | Runtime-generated original pixel atlas, block models, synthesized effects and generative ambience | More biome layers, spatial creature audio and richer animation |

## Release priorities

1. Stabilize automation graphs, item routing, save migrations, and peer synchronization.
2. Add structures, farming, fluid machinery, expanded crafting, and creature behavior.
3. Add alternate realms, bosses, equipment upgrades, traversal systems, and server-assisted rooms.

## Reference sources

- [Minecraft: Java Edition 26.2 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)
- [Official Minecraft updates timeline](https://www.minecraft.net/en-us/updates/minecraft-updates-timeline-and-evolution)

