# Feature matrix and roadmap

Voxel Frontier's **Shared Horizons** release is Version 7. It is an original game inspired by voxel survival and factory-building genres; it does not claim one-to-one parity with Minecraft.

| System family | Shared Horizons (Version 7) | Planned depth |
| --- | --- | --- |
| World generation | Fresh readable seed by default; replayable typed seeds; versioned chunks across Y −64…319; Generation 3 plains, rivers, rolling hills, rare bounded Skybreak ranges capped below Y 196; six climates; caves, aquifers, anchored ore veins, deep slate, ruins, settlements, and the Emberdeep; Version 6 terrain stays on its original generator | Larger dungeons, weather-shaped terrain |
| Water | Generated sources plus finite seven-level horizontal/falling flow, direct in-water block placement, source-reachability rebuilds that remove blocked downstream flow, saved levels, swimming, buoyancy, diving, and shore assist | Currents, breath, boats, pumps |
| Blocks and shapes | 115 original blocks and eighteen mesh families, including connected glass panes, shutters, planters, crossed flora, wire, plates, torches, directional funnels and observers, slabs, stairs, pistons, beds, portals, doors, and fences | Dyes, growable materials, more architecture |
| Mining and drops | Variable hardness and harvest tiers, seven crack stages, animated hand, physical item drops, coal/iron/gold/Fluxstone/diamond progression, and depleted-stack cleanup | Durability, repair, upgrade trees |
| Tools | Empty-handed start, then Emberwood, roughstone, copper, iron, diamond, and crystal mining tools | Equipment slots and specialized upgrades |
| Movement | Smooth acceleration, sprint, ledge-safe crouch, coyote time, buffered jump, partial-height collision, fall damage, mobile auto-jump, and collision-aware Creative flight with desktop/touch controls | Climbing, gliding, mounts |
| Swimming | Water drag, look-directed strokes, buoyancy, surface bobbing, shore assist, sprint stroke, ascent, and dive | Currents, breath, boats, diving gear |
| Creatures | Sheep, cows, pigs, and chickens with recognizable procedural calls and loot plus six Frontier creature types; procedural textures, detailed rigs, activity states, interpolation, walking/jump/idle animation, collision-safe swimming, combat, and loot | Breeding, taming, deeper pathfinding, bosses |
| Villages and trade | Rarer region-spaced multi-chunk settlements with crossroads/courtyard/lane layouts, 3–7 randomized structures from seven templates, varied populations and profession mixes, paths, biome timber, furnishings, markets, profession stock, universal drag/tap selling, deterministic pricing, fractional carryover, currency-only sale proceeds, daily stock, and home behavior | Reputation, village growth, dynamic prices |
| Survival cycle | Health, nutrition, stamina, food, medicine, brighter readable nights, night threats, and craftable beds that advance to dawn | Armor, effects, weather, farming |
| Smelting | Coal-fired Hearth Furnace for iron, gold, copper, glass, and fired brick; powered Arc Furnace remains an automation upgrade | Heat tiers, recipes, furnace upgrades |
| Dimensions | Craftable returnable Rift Gates and a volcanic Emberdeep with molten hazards, Riftwood, rare ores, glowstone, and distinct ambience | Structures, bosses, dimension-specific machinery |
| Logic circuits | 0–15 attenuation, repeaters with four configurable/visible delay positions, comparators, inverter torches, arrowed observers, buttons, plates, sensors, targets, gates, memory lamps, tone blocks, and unique component inventory art | Edge sequencers, bundled channels, programmable logic |
| Pistons and logistics | Six-block Linear Rams, Adhesive Rams, physical drops, conveyors, directionally spouted collector funnels, and crates | Filters, splitters, pipes, routing rules |
| Energy and machines | Thermal generation, storage cells, drills, Arc Furnaces, fabricators, visible state, and coal fuel items | Load priority, pumps, modular upgrades |
| Multiplayer | One six-character code; Cloudflare Durable Object WebSocket rooms; server-owned roles/routing policy; guest intent filtering; multi-peer player/state delivery; live snapshots; chunked checkpoints; reconnect backoff; host promotion and checkpoint recovery; host-simulated terrain, mobs, water, combat, and automation | Dedicated server-side simulation, permissions, persistent room browser |
| Persistence | 18-second local autosave, compressed checksummed `VF1` keys, generator-version preservation, 12-second online checkpoints split below storage row limits, and state recovery on host succession | IndexedDB scale-up, named server worlds, richer migrations |
| Inventory and crafting | Persistent 4×9 layout with bottom-row hotbar, unique item placement, drag/drop, touch tap-moving, shift-click transfer, detailed tooltips, Creative catalog, combined recipe screen, search, and craftable/all filters | Stack splitting, equipment slots, controller navigation |
| Mobile and UI | Touch move/look/actions and flight toggle, left-handed mode, auto-jump, scrollable nine-slot hotbar, held-item label, responsive 36-slot inventory and merchant tray, unique circuit icons, options, and audio controls | Remapping, controller, reduced motion |
| First-person presentation | Held hand/item, stronger swing on every press, mining/place/use motion, seven crack stages, late transparent-pass rendering for the viewmodel, and alpha-tested depth-writing foliage that no longer blends with water | More animation layers and item-specific poses |
| Original art/audio | Runtime-generated block atlas and item art, procedural creature skins/models, animal-like formant voices, synthesized effects/steps, and a seeded 72 BPM diatonic ambient arrangement with chord voicing, bass, arpeggios, and motifs | Biome arrangements and richer positional mixing |

## Release priorities

1. Deploy and observe the Version 7 Durable Object on the Free plan, then validate real-device reconnect, host handoff, and multi-peer load.
2. Move canonical blocks, inventories, water, mobs, and automation from host simulation into a dedicated authoritative room simulation.
3. Add farming, armor/equipment, weather, larger structures, breeding, aquatic wildlife, traversal, bosses, deeper dimension progression, and room permissions.
