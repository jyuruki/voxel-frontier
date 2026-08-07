# Stage 3 — Depths & Circuits

Stage 3 expands Voxel Frontier's movement, world generation, building vocabulary, and automation layer while keeping the game and its assets original.

## Player-facing changes

- Directional swimming with water drag, buoyancy, ascent, dive, and mobile controls.
- Water-aware creature movement and partial-block collision.
- Physical mining drops that must be collected, with multiplayer-authoritative pickups.
- Wooden starter tools and harvesting tiers for survival progression.
- Empty hotbar stacks clear automatically.
- A scrollable, touch-safe nine-slot hotbar and a held-item label.
- Shape-specific item icons, held models, and world geometry.
- Crossed plants, thin circuit wire, plates, torches, rods, hoppers, slabs, stairs, pistons, columns, and ladders.
- Deeper cave networks, aquifers, rifts, cave flora, crystals, new stone strata, and frostpine terrain content.
- Repeaters, comparators, inverter torches, observers, buttons, pressure plates, daylight sensors, targets, hoppers, sticky pistons, latching lamps, and note emitters.

## Release checks

The automated release gate runs:

1. ESLint across the project.
2. Eighteen deterministic simulation tests.
3. A production static-export build with the GitHub Pages base path.

The simulation suite covers terrain determinism, cave density, save-key integrity, land and water collision, stable aquatic creature motion, harvesting tiers, non-cube shapes, signal propagation, repeaters, pistons, hoppers, and machines.
