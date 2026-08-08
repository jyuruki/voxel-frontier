# Version 5 — Flow & Foundations

Flow & Foundations is a systems-and-quality release. It replaces several Version 4 approximations with persistent simulation state, makes the inventory genuinely organizational, gives the soundscape musical and biological structure, and retunes exploration around readable terrain and scarce clustered resources.

## Water and world generation

- Breaking a block beside water now lets the source enter that opening. Water can fall and spread through seven progressively shallower horizontal levels—eight blocks including the source—then stops.
- Flow levels affect mesh height, dirty neighboring chunks correctly, travel deterministically across chunk edges, and are included in local saves, multiplayer snapshots, and portable `VF1` keys.
- Overworld ores now use sparse seeded ellipsoid anchors instead of broad noise fields with per-block sprinkling. Adjacent blocks form actual veins, while coal, iron, copper, Fluxstone, gold, diamond, Moonshard, Aether Crystal, and Riftstone retain useful depth ranges.
- Balance surveys keep common Roughstone near 83% of solid rock above the deep layer and Deep Slate near 96% below it. The complete surveyed ore family remains near 3% of underground solids, with rare ores far below 1%.
- Terrain combines broad lowlands, rolling hills, and regional ridges. Across the release benchmark seeds, hills occupy a balanced minority of terrain and tall mountains remain uncommon landmarks rather than constant obstacles.
- Villages now use one candidate in a large seeded generation region, followed by terrain suitability checks. Built villages are substantially less common than Version 4 candidates and cannot crowd a single region.

## Inventory and crafting

- The player now owns a persistent four-row, nine-column inventory. The separated bottom row is the live hotbar.
- An item type can occupy only one slot, so one pickaxe can no longer appear to be several pickaxes. Empty or depleted entries clear from the entire layout.
- Desktop players can drag and swap slots. Touch players can tap a source and destination. Shift-click moves hotbar items into the upper 27 slots from top-left to bottom-right, or upper items into the hotbar from left to right.
- New pickups prefer an existing stack, then an open hotbar slot, then upper storage. A full inventory leaves physical drops in the world instead of silently losing them.
- Inventory and crafting share one responsive screen. The recipe book includes text search and `Craftable now` / `All recipes` filters; furnace recipes appear in the full reference rather than masquerading as hand crafting.
- Every occupied inventory slot has a detailed hover/focus/tap tooltip explaining what that block, tool, resource, food, ammunition, or currency does.
- Creative retains its infinite catalog in a searchable drawer while using the same 36 organizational slots.
- Version 4 quantity maps and duplicated hotbar aliases migrate into a unique Version 5 layout when loaded.
- `E` now both opens and closes the inventory, while text fields retain normal typing behavior.

## Audio and creatures

- The ambient soundtrack is no longer a random-note loop. A seeded 72 BPM arrangement uses voiced diatonic progressions in D major, smooth four-part harmony, root/fifth bass motion, chord-tone arpeggios, and curated melodic motifs. Variation stays inside the harmonic language.
- New worlds feature plainly named Sheep, Cow, Pig, and Chicken livestock alongside the original hostile Frontier species.
- Animal calls use layered procedural synthesis designed around the target sound: low falling formants for cow moos, vibrato-rich buzz for sheep baas, short nasal calls and breath noise for pig oinks, and descending multi-part chirps for chicken clucks.
- Livestock have distinct procedural coats, anatomy, proportions, animation rigs, health, movement, swimming speed, and fitting drops.
- Village professionals wear color-coded apron and hat bands.

## Villages, currency, and homes

- Every generated village has a Farmer, Blacksmith, Builder, and Riftwright, plus its shared market counter.
- Villagers buy useful player goods and pay Frontier Marks. Marks purchase profession-specific materials, tools, architecture, rare crystals, and Rift technology.
- Every offer has limited stock and restocks at the next in-game day. Stock and restock state persist with the merchant or Trade Post.
- Four architectural blocks bring the catalog to 115: connecting Clearglass Panes, Timber Shutters, Terracotta Planters, and Carved Roughstone.
- Sand-to-Clearglass smelting is explicitly listed in the recipe reference. Glass panes, doors, shutters, planters, shelves, slabs, steps, fencing, fired roof tile, and carved masonry form a discoverable home-building path.
- Village cottages now use glass windows and interior planters.

## First-person and quality-of-life polish

- A left press always swings, even when the crosshair points into empty space.
- The swing arc has materially stronger translation and rotation, while sustained mining still drives timed impacts and crack stages.
- Held hands, tools, and blocks now render in the final transparent pass with a high render order. Leaves, flowers, glass, and water can no longer draw over the first-person model.
- Recipe, trade, inventory-full, and interaction copy now explains next actions more directly.

## Release gate

The Version 5 gate runs ESLint, TypeScript validation, 29 deterministic simulation tests, and a production GitHub Pages export. New regressions cover finite water distance and persistence, 36-slot uniqueness and transfer ordering, terrain range, sparse connected veins, livestock identity, sand/glass/home recipes, four village professions, and region-spaced village rarity. Existing collision, swimming, mob jumping, cave, automation, smelting, save-key, Emberdeep, and multiplayer state tests remain active.
