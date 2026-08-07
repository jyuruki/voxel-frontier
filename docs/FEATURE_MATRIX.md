# Feature matrix and roadmap

Voxel Frontier's **Depths & Circuits** release is the Stage 3 vertical slice. It is an original game inspired by voxel survival and factory-building genres; it does not claim one-to-one parity with Minecraft.

| System family | Depths & Circuits (Stage 3) | Planned depth |
| --- | --- | --- |
| World generation | Seeded chunks, six climates, large caverns, winding tunnels, vertical rifts, aquifers, cave flora/crystals, limestone, marble, deep slate, ore strata, and deterministic ruins | Rivers, larger dungeons, settlements, alternate realms |
| Blocks and shapes | 75 original blocks and twelve mesh families, including crossed flowers/fungi, thin connected wire, plates, torches, rods, funnels, slabs, stairs, pistons, columns, and ladders | More architectural variants, dyes, growable materials |
| Mining and drops | Variable hardness/tool power, seven crack stages, animated hand, physical block drops with pickup, and depleted-stack hotbar cleanup | Durability, repair, enchantment-like upgrades |
| Tools | Empty-handed start, Emberwood pick/axe/spade/club tier, then roughstone, copper, and crystal progression | Equipment slots and upgrade trees |
| Movement | Smooth acceleration, sprint, crouch, step-up, partial-height collision, coyote time, buffered jump, fall damage, mobile auto-jump | Climbing, boats, gliding, mounts |
| Swimming | Immersion sampling, water drag, look-directed 3D strokes, buoyancy, surface handling, sprint strokes, ascend and dive controls | Currents, breath, diving gear |
| Creatures | Five species with combat/loot, solid and partial-block collision, separation, water immersion, stable buoyancy, swim drag, and recovery | Aquatic species, pathfinding, breeding, bosses |
| Logic circuits | 0–15 attenuation, directional repeaters, compare/subtract comparators, inverter torches, observers, buttons, plates, daylight/proximity sensors, targets, gates, memory lamps, and tone blocks | Edge sequencers, bundled channels, programmable logic |
| Pistons | Directional Linear Rams push up to six blocks; Adhesive Rams pull the nearest block on retraction | Slime-like multi-block structures and immovable tags |
| Logistics | Physical loose items, conveyors, collector funnels that gather and transfer, and crates | Filters, splitters, pipes, routing rules |
| Energy and machines | Thermal generation, buffering, drills, furnaces, fabricators and visible state | Load priority, pumps, modular upgrades |
| Survival and Creative | Empty-pack survival, health/nutrition/stamina, crafting, food, medicine, night threats; infinite Creative catalog | Armor, effects, weather, farming |
| Multiplayer | Direct WebRTC rooms with host-owned creature, combat, block-drop, loot, and snapshot state | Reconnection, TURN fallback, permissions |
| Persistence | 18-second autosave and compressed checksummed `VF1` keys; all Stage 2 keys remain importable because Stage 3 state fields are optional | IndexedDB scale-up and migrations |
| Mobile and UI | Touch move/look, mine/place/use/run/jump/dive, left-handed layout, fixed scrollable nine-slot hotbar, held-item label, options and audio | Remapping, controller, reduced motion |
| Original art/audio | Runtime-generated atlas, silhouette-specific item art, held models, creature models, synthesized effects and ambience | Spatial creature audio and richer animations |

## Release priorities

1. Stabilize Stage 3 circuit edge cases, mobile swim ergonomics, cave balance, and peer resynchronization.
2. Add flowing-fluid machinery, farming, armor/equipment, larger structures, and aquatic wildlife.
3. Add traversal vehicles, bosses, alternate realms, and server-assisted rooms.
