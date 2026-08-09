# Version 11.2 — Crafting & Physics

Version 11.2 rebuilds crafting around a compact recipe book and fixes the movement-state bugs that made dungeons and boats unsafe. It preserves `VF2` world keys and protocol 10 rooms while extending player profiles with optional tool durability.

## Critical physics fixes

- Realm travel, dungeon entry/return, rifts, respawns, and boat exits now reset fall tracking through one teleport path. A dungeon jump can no longer inherit an overworld apex and report a lethal “Hard landing.”
- Ordinary jumps and small combat knock-ups are inside the safe fall distance; longer falls use a gentler bounded damage curve.
- Boat angular velocity is now measured and integrated per second, bounded, damped, reverse-aware, and tested at 30, 60, and 120 FPS. Hull-aligned velocity and lateral drag prevent uncontrolled spinning.

## Crafting overhaul

- The recipe book displays 25 icon-only entries per page instead of long description cards.
- Selecting an icon stages its ingredients in a visible grid; the output is crafted separately.
- Inventory crafting is 2 × 2. Interacting with a Tinker Bench opens 3 × 3 crafting and its larger recipe set.
- Every direct crafting recipe is validated to fit its station. Five-plank boats and eight-plank chests now correctly require a Tinker Bench.
- Equivalent Emberwood, Frostpine, and Riftwood recipes share one recipe-book entry.
- The late-game Aether Pick now has a shaped Tinker Bench recipe requiring Aether Crystal, a Flux Coil, diamond, and any native-timber handle.

## Equipment and quality of life

- Every tool and weapon has per-copy saved durability, with wooden gear lowest and roughstone, copper, iron, diamond, and crystal tiers increasing in order. Exact wear follows tools through drops, chests, hoppers, droppers, machines, multiplayer transfer, and reacquisition; fresh crafted copies begin at full durability. Slots and hotbars show a color-coded durability bar.
- Hovering an inventory item and pressing `1`–`9` swaps it with that numbered hotbar slot.
- Dropped items now follow full camera yaw and pitch rather than receiving a mostly horizontal launch.
- Remote player heads follow their transmitted look pitch.
- A full day lasts 12 minutes.
- Crossed flowers, mushrooms, thornvines, and crystal spikes render on both sides.

## Compatibility and validation

- Package version: `0.11.2`
- Save format remains `VF2`; durability is optional when loading Version 10 profiles.
- Multiplayer protocol remains 10.
- Unit and multiplayer coverage includes dungeon fall-state reset, fall-damage thresholds, frame-rate-independent boat steering, 2 × 2 / 3 × 3 recipe fit, 25-entry pagination, per-copy durability transfers, guest storage/drop validation, pitch-aware throws, double-sided plants, and the 12-minute day.
