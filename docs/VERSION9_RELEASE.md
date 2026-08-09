# Version 9 — Living Frontier

Version 9 makes exploration continue to produce life and danger instead of leaving the original spawn behind. It also replaces several browser-shaped interactions with game-shaped ones: inventories use click-to-pick/click-to-place, every chest cell is addressable, furnaces show their actual three-part process, chat is part of the room, and closing a menu returns control without sacrificing a block.

## Natural populations and light

- The host now evaluates natural spawns around the local player and every connected guest, so traveling farther continues to populate the world for the whole party.
- Spawn attempts use an 18–48 block annulus, per-category caps, floor/headroom checks, biome-weighted species, and a 72-block natural despawn boundary. Villagers, dungeon guardians, and other authored creatures are excluded from natural caps and despawning.
- Passive animals require bright Turf. Hostile creatures require both block light zero and dark sky or cave conditions; cave threats can remain active during the day.
- Trail Torches propagate a level-based gameplay field out to fourteen blocks and suppress hostile spawns throughout it. Their visual point-light reach increases from 11.5 to 18.5 blocks; Deep Lanterns reach 23 blocks, and the nearby light pool grows from eight to ten sources.
- The system adapts the readable relationship between darkness, torches, and danger while retaining original species, terrain, timings, caps, art, and implementation.

## Inventory, chests, and furnaces

- The HTML drag gesture is removed from the main inventory. One click picks up a stack and the next click chooses its destination; Shift-click transfer remains available.
- Frontier Chest grids no longer disable empty buttons. Players can deposit into any chosen empty cell, rearrange stacks within either half, move stacks across a linked double chest, and withdraw into a chosen inventory cell.
- Guest chest moves include explicit source and target cells and remain host-authoritative. Cross-half moves migrate both the slot record and its aggregate storage count.
- Hearth Furnaces now have a dedicated screen: upper raw-material input, lower Coal fuel, output on the right, a live progress/flame display, recipe cues, and the complete 4×9 player inventory underneath.
- Furnace inputs and fuel are validated in both local and multiplayer paths. Older free-form furnace contents surface through the output slot for safe recovery instead of becoming inaccessible.
- Wooden Pickaxes, Axes, Shovels, Clubs, and later tool handles accept Emberwood, Frostpine, or Riftwood. Names and progression text no longer imply that a single tree family is mandatory.

## Communication and controls

- `T` or `Enter` opens a compact room chat. Mobile has a Chat button. The Worker sanitizes text, binds messages to the last server-verified player name, and relays them to the room.
- Player defeats publish synchronized death messages with a sanitized cause. Offline worlds retain the same feed as a local expedition log.
- Sprint is toggle-on by default on desktop and mobile. Settings can restore hold-to-sprint behavior, and the effective state remains nutrition-gated.
- Closing a menu asks for pointer capture from that same user gesture. If a browser still requires a canvas click, that click is consumed before mining or placement, preventing instant Creative damage.
- The party locator now converts engine yaw to compass bearing correctly and maps signed yaw offsets to screen-left/screen-right without mirroring.

## Caves, delves, and automation

- Generation 4 keeps broad cave chambers while reducing the frequency and depth range of sheer vertical rifts, making aquifers less common, and preserving intermittent rock shelves every nine vertical blocks.
- Dungeon arrival and Return Beacon positions are now separated by at least six blocks. Every rift/dungeon teleport arms an input-release guard, so a held use/place action cannot immediately activate the destination portal.
- Conduits, gates, lamps, observers, rams, belts, sensors, repeaters, comparators, and similar powered Flux components operate directly in the world. Consoles remain only where fuel, ingredients, stored materials, or recipe selection require one.

## Multiplayer protocol and validation

- Room protocol 9 adds chat, death messages, targeted chest-cell operations, and explicit furnace transfers.
- The Worker validates every new guest intent, sanitizes social messages, continues to prevent guest authority spoofing, and preserves existing snapshot, reconnect, checkpoint, and host-handoff behavior.
- The two-client Miniflare lifecycle now verifies server-bound player identity, chat sanitization, death relay, arbitrary chest movement, furnace fuel transfer, snapshot/world state, authority rejection, large checkpoint storage, and host promotion.

## Test status

The deterministic suite contains 48 passing tests. New checks cover natural spawn distance and block-light rules, torch propagation and spawn suppression, targetable/movable chest cells, generic all-timber tool recipes, corrected locator bearings, protocol 9 routing, separated dungeon arrival/return positions, and explicit furnace migration/input/fuel/output behavior. The production GitHub Pages export and Cloudflare Worker type-check/bundle are included in the full release gate.
