# Feature matrix and roadmap

Voxel Frontier's Frontiers & Nightfall release is a complete Stage 2 vertical slice, not a claim of one-to-one Minecraft parity. Minecraft has more than a decade of systems and content; this project keeps an explicit matrix so shipped behavior and planned work are easy to distinguish.

The reference horizon for this release was the official Minecraft release timeline and Java Edition 26.2 notes available in August 2026. Those sources inform categories and usability expectations only. Voxel Frontier's designs, names, rules, textures, sounds, and code are original.

| System family | Frontiers & Nightfall (Stage 2) | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks, six climate regions, caves, ore strata, flora, water, snow/ice, rare Moonshard seams, and deterministic Wayfarer ruins | Villages, alternate realms, richer rivers and aquifers, larger dungeons |
| Blocks and materials | 50 original terrain, ruin, decorative, logic, and machine blocks, each with distinct procedural pixel detailing | Larger architectural palette, stairs/slabs, dyes, growable materials |
| Mining and building | Variable hardness and tool power, drops, placement, seven crack stages, held-item/mining animation, machine orientation, Creative near-instant mining | Silk/fortune-like upgrades, durability, repair, scaffolding |
| Movement | Smooth acceleration, sprint, crouch, swim, step-up, coyote time, buffered jump, fall damage, optional mobile auto-jump | Climbing, boats, gliding, mounts |
| Survival | Empty-handed start, health, hunger, stamina, food, medicine, visible eight-minute day/night orbit, hostile night loop | Status effects, armor depth, weather, temperature, sleep |
| Creative | Infinite complete item catalog, no survival damage, no resource consumption, near-instant mining | Flight, reach controls, world rules, structure tools |
| Crafting and tools | Inventory/hotbar, recipe list, nine tools and weapons, hand/workbench recipes, machine parts, melee/ranged stats and ammo | Recipe discovery, equipment slots, upgrade trees, durability |
| Creatures | Five original species, night spawning, combat/loot, target health, collision volumes, gravity, step-up, separation, solid-block avoidance, embedded-save recovery | Breeding, taming, advanced pathfinding, bosses, richer ecosystems |
| Logic circuits | Signal level 0–15, one-step attenuation, toggle, AND/OR/NOT, pulse delay, light/night/player sensing | Comparators, edge detectors, bundled channels, programmable sequencer |
| Energy | Connected power networks, generation, consumption, buffering and visible state | Multiple voltages, load priority, transformers, network diagnostics |
| Machinery | Thermal dynamo, flux cell, bore drill, arc furnace, fabricator, linear ram | Quarry, pumps, farming machines, modular upgrades, machine wear |
| Logistics | Directional conveyors, loose-item transport, collector funnels, crates | Filters, splitters, inserters, pipes and routing rules |
| Fluids | Static generated water and swimming | Flow simulation, pumps, tanks, mixing and lava-like hazards |
| Farming and food | Hunger loop, harvestable Starfruit, Glowgrazer food drops, healing tonics | Soil hydration, crops, cooking chains and animal husbandry |
| Multiplayer | Direct WebRTC rooms with host-owned world, creature simulation, aim/range/occlusion-validated combat, player damage, loot pickup, and snapshot/block/machine/player synchronization | TURN fallback, reconnection, permissions, authentication, dedicated authority server |
| Persistence | 18-second local autosave, compressed checksummed `VF1` export/import preserving mode and day count; v1 keys remain importable | IndexedDB scale-up, save migration UI, optional cloud slots |
| Accessibility and options | Touch/desktop input, left-handed touch, auto-jump, sensitivity, invert Y, FOV, render distance, graphics and volume controls | Remapping, controller support, high-contrast and reduced-motion modes |
| Audio and art | Distinct UI artwork for every item, runtime-generated block atlas, held models, original crack overlays, creature models, synthesized effects and generative ambience | More biome layers, spatial creature audio and richer animation |

## Release priorities

1. Stabilize Stage 2 combat balance, creature spawning, mobile ergonomics, save migrations, and peer synchronization.
2. Add farming, fluid machinery, armor/equipment, larger structures, and richer creature behavior.
3. Add alternate realms, bosses, equipment upgrades, traversal systems, and server-assisted rooms.

## Reference sources

- [Minecraft: Java Edition 26.2 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)
- [Official Minecraft updates timeline](https://www.minecraft.net/en-us/updates/minecraft-updates-timeline-and-evolution)
