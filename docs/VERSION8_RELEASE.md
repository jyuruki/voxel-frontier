# Version 8 — Expedition Exchange

Version 8 turns Voxel Frontier's reliable room server into a more cooperative survival game. Players can now exchange physical items, share persistent containers, find one another without filling the screen with waypoints, and enter deterministic procedural delves together. The release also revisits lighting, material readability, controls, crafting context, nutrition, vegetation, pickup feel, and village stock.

## Shared items and storage

- Press `Q` to throw one selected item or `Shift` + `Q` to throw the full selected stack. Mobile players receive a dedicated Drop control and inventory buttons expose both actions.
- Thrown items have a short owner-safe pickup delay, host-simulated motion, a restrained hover, steady rotation, and a 2.25-block collection radius.
- The host simulates and synchronizes drops for every player. A full guest inventory returns an item to the ground instead of deleting it.
- Frontier Chests expose a 9×3 grid. Two mutually adjacent chests form a deterministic 9×6 pair; ambiguous three-chest chains remain separate.
- Chest state lives in the saved machine state, participates in world keys and server checkpoints, and is broadcast from the host. Desktop drag/drop and touch-friendly tapping both move complete stacks.
- Rejected guest deposits are refunded, and withdrawals are checked against local inventory capacity before being requested.

## Party locator

- A compact locator sits between the held-item name and hotbar.
- It uses a 120-degree forward arc, colored player markers, distance-based marker scale, and above/below cues.
- Crouching hides a player from other locator bars.
- The implementation is deliberately original in visual design while following the useful spatial rules of modern player locators.

## Procedural cooperative delves

- Rare Expedition Gates create a seven-block staging area in suitable dry, moderate terrain.
- Activating a gate gathers every online player standing in the staging area and teleports the group into the same deterministic instance.
- Moss Crypts, Ember Foundries, and Moon Vaults select different floor/accent palettes and arrange three to five turning rooms with generated corridors.
- Each delve has a named, enlarged 145-health guardian with stronger attacks and a visible boss health readout.
- Guardian defeat creates shared currency, ingot, diamond, tonic, and creature drops and unseals a physical Relic Cache.
- Return Beacons retain a saved link to the originating staging ring. Cleared delves remain cleared after a save/load or multiplayer checkpoint.

## Crafting, trading, and controls

- Emberwood, Frostpine, and Riftwood can all craft Tinker Benches, Frontier Chests, and Trail Torches.
- `Craftable now` only includes workbench recipes while the player is actively using a placed Tinker Bench. `All recipes` still documents unavailable recipes and labels their station.
- Every villager profession and market now presents five limited daily offers instead of three.
- Desktop defaults are `R` to run, `Shift` to crouch/dive/descend, and `X` to rotate machinery. Existing alternate crouch keys remain available.
- The canvas and game shell suppress the browser context menu, so right-click use no longer opens the operating-system menu.
- Options now includes a real Fullscreen API toggle, with home-screen guidance when a mobile browser does not expose fullscreen.
- Merchant lists include bottom safe-area padding so the final offer can always scroll fully into view.

## Survival and world feel

- The stamina bar is gone. Running remains available indefinitely while nutrition is above 10.
- Baseline survival, active running, jumping, and natural healing consume nutrition at separate conservative rates. Natural healing only runs above 75 nutrition.
- New trees require dry terrain at the trunk and all four cardinal neighboring columns, preventing shoreline and river growth.
- Trail Torches use a partial torch mesh and warm local point light. Nearby emissive blocks share a capped eight-light pool for predictable performance.
- Directional face shading, subtle vertical gradients, filmic tone mapping, and brighter night ambient light give terrain depth without making exploration murky.
- Roughstone is now light gray. Clearglass uses a much lower interior alpha with stronger frame pixels.
- Leaves, thornvines, flowers, doors, fences, and logic parts use alpha-tested depth-writing geometry, preventing them from painting over the first-person hand or held block.
- Tinker Benches, chests, furnaces, cells, drills, conveyors, fabricators, rams, hoppers, observers, and delve blocks use low-noise, centered functional motifs rather than undirected texture noise.

## Validation

The deterministic suite now contains 47 tests. Version 8 coverage includes unique 27/54-slot storage layouts, locator field-of-view and privacy rules, all-timber utility recipes, torch light metadata, Roughstone color, foliage render layers, dry tree sites, dungeon density and layout variation, and protocol routing for drops, chests, and delves. The two-client Miniflare lifecycle additionally routes real Version 8 drop, chest, and dungeon requests before testing host handoff.

