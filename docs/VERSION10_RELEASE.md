# Version 10 — Realmworks

Version 10 makes combat readable, gives exploration new ways to move, and rebuilds the game's most confusing systems around visible cause and effect. Its critical fix prevents creatures from damaging a player through floors or from another vertical layer. The release also replaces the earlier Flux machinery core, adds boats and personal spawn points, opens caves to daylight, and turns delves into large procedural realms rather than distant hallway sets.

## Combat you can read

- Hostile melee now requires the attacker and player to occupy the same realm, overlap vertically, fall within true three-dimensional reach, and have a clear sampled voxel line of sight. Horizontal distance alone can no longer produce through-floor or through-wall damage.
- Incoming hits add directional knockback, a red vignette, and camera kick. A short damage immunity window prevents a single overlap from draining health every frame.
- Struck enemies recoil, flash red with a brief emissive lift, and trigger a central hit marker. Critical hits retain their stronger confirmation.
- The new Shardcaster keeps distance, strafes, and fires visible shards. It uses a conservative lead plus seeded spread and commits to a fixed projectile direction, so attentive players can dodge or use cover.
- The Aether Repeater now emits a visible fast tracer instead of applying an unexplained distant hit. Dispensers use the same projectile simulation when firing suitable contents.

## Rebuilt Fluxstone

- The signal core now resolves sources and propagation in two passes, allowing wire-fed components to power and—equally important—to clear correctly when input disappears.
- Familiar basics are available through survival recipes: Fluxstone Dust, Lever, Fluxstone Torch, Repeater, Comparator, Hopper, Piston, Sticky Piston, Observer, Dispenser, and Dropper.
- Buttons, pressure plates, daylight sensors, targets, lamps, logic gates, memory lamps, tone blocks, conveyors, drills, furnaces, and fabricators remain part of the larger system.
- Repeaters restore a signal with four delay settings; comparators compare or subtract; observers pulse on watched-block changes; dispensers and droppers fire only on a rising edge.
- Droppers eject one stored item. Dispensers place compatible blocks into open space or launch a visible projectile. Both expose nine storage cells.
- The Settings guidebook explains power sources, dust, directional parts, item movement, and how to rotate components.

## Boats, beds, caves, and realms

- A boat can be crafted from five planks of any native timber. Boat motion includes sampled water buoyancy, acceleration and reverse, speed-dependent turning, drag, a speed cap, solid shore/ground collision, multiplayer input authority, and safe side dismounts.
- Using a Frontier Bed now sets that player's personal respawn immediately. At night the same interaction also advances the world to dawn. Respawning verifies that the bed still exists before using it.
- Generation 5 creates deterministic regional cave shafts that occasionally break through natural terrain, so some cave networks can be discovered from the surface.
- Expedition Gates now target isolated, void-backed logical realms. Player-facing coordinates are local to the delve instead of exposing the internal realm address.
- Each seeded delve contains 8–11 substantial rooms with variable radii and heights, a branching/looping room graph, broad corridors, flora, pools, windows, pillars, lighting, and elevation detail.
- Four themes—Verdant Basilica, Ember Foundry, Moon Vault, and Sunken Archive—vary materials, room roles, flora, encounters, and the named 185-health guardian waiting in the final vault.

## Interface and player presentation

- Closed chat shows only the newest messages and fades them after 5.6 seconds. Reopening Chat reveals the latest 30-entry session archive, so conversation never permanently covers play.
- Mobile landscape removes the active-blueprint panel and reduces the action cluster to Attack, Place / Use, Jump, and Sneak. Chat moves to a separate top-edge control, and the locator, vitals, hotbar, crosshair, and combat text scale down for limited height.
- Place / Use now attempts the relevant interaction before placement. Sneaking still permits intentional adjacent placement where an interactable block would otherwise consume the action.
- Options contains a searchable Guidebook covering first-day progression, controls, Fluxstone, logistics, boats, beds, combat, delves, rooms, chat, saves, and acquisition guidance for every registered item.
- Network player models use a stable generated skin seed to vary skin, hair, clothing, trim, and face details. Their articulated pose reflects movement, crouching, and boat riding, and the selected item appears in hand.

## Shared persistence and migration

- Version 10 uses protocol 10, local key `voxel-frontier.save.v10`, and portable `VF2` world keys.
- `VF2` saves carry boats plus up to 32 player profiles. A stable browser identity lets a returning room member recover position, inventory/layout, selected slot, health, hunger, stamina, trade credit, bed spawn, realm, and generated skin.
- The host includes those profiles in the existing 12-second chunked Durable Object checkpoint. They therefore survive room host succession with the shared terrain, machines, water, drops, creatures, and boats.
- Imported saves and guest profile messages receive bounded shape, coordinate, inventory, layout, numeric, identity, and boat validation before use. The host also removes unknown item IDs and reconciles the submitted position with the last server-verified player snapshot.
- This is an intentional compatibility break: Version 10 does not import `VF1` keys. Earlier releases remain documented, but their keys must be retained with an older build.

## Release gate

The release gate runs ESLint, 55 deterministic simulation tests, client TypeScript checks through the production build, Cloudflare Worker type-checking and dry-run bundling, a real two-client Miniflare Durable Object lifecycle, and the static GitHub Pages export. New regression coverage includes three-dimensional/line-of-sight combat, directional hit bearings, Shardcaster cover rules, boat buoyancy/steering/collision/falling, surface cave mouths, deterministic grand delve plans and local realm coordinates, complete Fluxstone recipes, signal clearing, dispenser/dropper edge behavior, `VF2` profile/boat round trips, protocol 10 routing, invalid-profile rejection, boat intents, and checkpoint-backed host handoff.
