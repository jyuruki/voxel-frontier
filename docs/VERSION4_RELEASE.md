# Version 4 — Living Worlds

Living Worlds focuses on creatures, survival progression, settlements, and a second realm while preserving Voxel Frontier's original visual and audio identity.

## Player-facing changes

- Forward swimming now rises gently from deep water, bobs at the surface, and uses collision-safe assistance to step onto nearby banks.
- All six creature species have distinct procedural skin patterns and detailed geometry such as eyes, muzzles, ears, horns, shells, tails, packs, and clothing.
- Creature locomotion is interpolated every frame. Legs and arms swing, bodies bob, tails move, idle heads look around, and one-block traversal uses a continuous jump arc instead of a position snap.
- Creatures switch between idle, wandering, curious, fleeing, and hostile activity and occasionally make original synthesized calls and footsteps.
- Night ambience is substantially brighter while keeping a cool moonlit palette.
- Frontier Beds can be crafted and used at night to advance an offline or shared world to dawn.
- Coal, iron, gold, Fluxstone, and diamond now form depth-sensitive cave seams. Coal and diamonds drop as usable resources; iron and gold are refined from raw ore.
- The coal-fired Hearth Furnace smelts iron, gold, copper, clay, and sand without requiring a power grid.
- Procedural Wayfarer villages include leveled paths, cottages, beds, bookshelves, roofs, market canopies, braziers, a Trade Post, and three residents.
- Five barter offers exchange common resources for refined metal, diamond, soft fiber, and the Rift Core used in dimensional travel.
- Rift Gates lead to and return from the Emberdeep, an original volcanic dimension with Emberflow hazards, Riftwood growth, Ember Glowstone, and rare ore deposits.
- Thirty-six new blocks bring the catalog to 111, including architectural variants, beds, gates, ores, storage blocks, village materials, doors, fences, and Emberdeep resources.
- Block icons now render from the same procedural texture function as their world counterparts and keep opaque surfaces at full opacity.

## Release checks

The release gate runs ESLint, TypeScript validation, 24 deterministic simulation tests, and a production GitHub Pages export. Version 4 tests cover deep-water shore exits, real creature jump arcs, stable aquatic collision, ore distribution, furnace fuel and output, deterministic villages and residents, Emberdeep terrain, saves, cave density, automation, and multiplayer-safe state primitives.
