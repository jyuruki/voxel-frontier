# Version 6.1 — Highlands & Handshakes

Highlands & Handshakes is a connectivity, terrain, simulation, and quality release. It replaces the multiplayer signaling ritual with a single room code, makes water respond to dams, opens the full Y −64…320 building envelope, and turns the prior mountain uplift into unmistakable highland ranges. It also closes several interaction gaps in Creative, combat, crouching, trade, and circuit readability.

## Multiplayer: one code, one step

### 6.1 relay hotfix

- Room discovery could previously exchange SDP successfully and still fail when symmetric NAT, carrier NAT, a VPN, or a firewall rejected every direct ICE candidate.
- Every room now includes short-lived HMAC-authenticated TURN credentials for Open Relay's documented static-auth service.
- ICE still prefers direct transport. TURN carries traffic only when needed, with UDP on ports 80/443 plus TCP and TLS-on-443 alternatives for restrictive networks.
- TURN relays the existing encrypted WebRTC data channel and cannot read the host-authoritative game messages.
- The manual invite/answer workflow uses the same direct-first relay fallback, so it is now named **Manual signaling fallback**.

- **Create room code** opens an encrypted automatically discovered room with a readable code such as `EMBER-OTTER-4827`.
- Every guest enters that same code once. No answer key needs to travel back to the host.
- The host can reuse one room for multiple guests, and still owns terrain, machines, time, creatures, drops, combat validation, sleeping, and rift travel.
- A transient WebRTC `disconnected` state no longer destroys the peer immediately. Automatic and manual routes both receive an 18-second recovery window.
- The original invite → answer exchange remains under **Manual signaling fallback** for environments where relay discovery itself is unavailable.

## Water that respects construction

- Placement raycasts can select a water cell, including while the player is submerged, so a solid can replace liquid directly.
- Flow still travels at most seven horizontal levels and can fall downward.
- Replacing flowing water gathers the connected flow region, preserves the new block, clears stale flowing cells, and refills only cells still reachable from a source.
- A dam therefore cuts off its downstream branch while leaving the source-facing side wet.
- Water levels remain part of local saves, portable keys, and host snapshots.

## Y −64…320 and real mountain country

- The voxel index now offsets from `WORLD_MIN_Y = -64` through the exclusive `WORLD_MAX_Y = 320`, producing 384 vertical cells per column.
- Sea level moves to Y 64. Slate, caves, aquifers, bedrock, ores, ruins, villages, spawning, rift arrivals, drills, physics rescue, meshing, and mutations all use the new bounds.
- Continental lowlands, rolling hill fields, mountain-region masks, broad ridges, and sharp secondary ridges can produce Skybreak summits near Y 312.
- Coal and iron extend into high terrain; rare ores occupy tuned deep ranges and remain clustered rather than uniformly sprinkled.
- Chunk generation skips guaranteed air above each column, caches biome/ore-cell work, and border meshing no longer generates four neighboring chunks synchronously.
- Legacy VF1 saves without a generation marker are lifted 46 blocks, including player, mutations, machines, drops, mobs, homes, and water-level keys.

## Creative, movement, and combat

- Press **V**, double-tap **Space**, or use the mobile **FLY** button to toggle Creative flight. Space rises, Ctrl/C descends, Shift accelerates, and block collision stays active.
- Creative mining is press-triggered: one click instantly removes exactly one aimed block. Holding the button no longer sprays through a line.
- Middle-click picks the aimed block into the selected Creative slot.
- Crouching now probes for support before committing horizontal movement and holds a grounded player at a ledge.
- Descending airborne melee attacks deal **1.5×** damage, add stronger knockback/lift, play a distinct chord, and flash a visible **CRITICAL!** marker. Swimming, flight, grounded hits, rising hits, and ranged attacks cannot crit.

## Village economy

- Profession lists contain purchases only: the player pays Frontier Marks and receives the listed profession stock.
- A 4×9 merchant inventory mirrors the carried layout. Drag a stack to the sell tray or tap it and choose **Sell full stack**.
- Every block, tool, material, food, consumable, ammunition item, and Frontier Mark has a deterministic value.
- Selling removes only the offered stack and awards only Frontier Mark currency.
- One Mark equals twenty value points. Remainders persist on the player, so cheap materials never lose value to rounding.
- Profession purchase stock remains finite and refreshes by day.

## Circuit readability

- The generic gray cap above every inactive Flux component is removed. Only powered or signaled components show a small embedded active glow.
- Every automation component receives bespoke procedural inventory art: wire, switches, lamps, cells, drills, belts, furnaces, fabricators, rams, sensors, gates, repeaters, comparators, torches, observers, funnels, plates, targets, and note emitters no longer share a confusing cube thumbnail.
- Change Observers use a dedicated model with a front sensing plate, rear output nub, and raised top arrow.
- Collector Funnels have a horizontal spout aligned to their output facing.
- Pulse Repeater delay remains configurable from one to four beats by interaction or machine console; the movable post and delay notches now update in the world mesh.

## Verification gate

Version 6.1 runs ESLint, TypeScript validation, 38 deterministic simulation tests, and a production GitHub Pages export. New regressions cover the exact TURN REST HMAC, credential expiry, UDP/TCP/TLS relay presence, vertical bounds, dramatic terrain distribution, finite flow cutoff, water placement targeting, legacy elevation migration, one-code normalization, Creative flight/hover, crouch ledges, critical-hit eligibility, and positive sale values for every item. The full earlier suite for collision, swimming, animal water motion, mob penetration/jumps, caves, ore clustering, villages, recipes, smelting, circuits, rams, funnels, drops, dimensions, and save integrity remains active.
