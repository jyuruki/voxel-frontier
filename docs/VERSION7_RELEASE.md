# Version 7 — Shared Horizons

Shared Horizons is the multiplayer and world-variety release. It replaces the fragile peer-to-peer connection layer with a stateful WebSocket room service, restores the upper vertical range to builders instead of natural terrain, and makes new worlds and villages meaningfully different.

## Reliable online rooms

- GitHub Pages remains the static game host. A separate Cloudflare Worker maps each six-character room code to one SQLite-backed Durable Object.
- Both host and guests use standard WebSockets. Trystero, SDP exchange, STUN/TURN routing, and the manual invite/answer workflow have been removed.
- The server owns room membership, roles, routing, connection identity, message policy, saved checkpoints, and host succession.
- Guests may publish player movement and request block, machine, combat, sleep, rift, or snapshot actions. The server rejects guest attempts to broadcast authoritative block or machine state.
- The selected host continues to simulate terrain, creatures, water, combat, and automation, validates guest reach-sensitive actions, and broadcasts results.
- A host sends a complete checkpoint every 12 seconds and whenever the local world is saved. Checkpoints are split into sub-96 KB rows so larger worlds do not exceed a Durable Object storage value limit.
- Interrupted clients retry with bounded exponential backoff. If a host disappears, the oldest connected guest is promoted and receives the most recent checkpoint. A returning former host rejoins as a guest so the room never has two authorities.
- Room codes use six characters from an ambiguity-safe alphabet, such as `F7K2P9`.

Cloudflare Durable Objects support a Free-plan allocation, and their WebSocket Hibernation API lets idle room objects sleep while sockets remain connected. Deployment still requires the repository owner's Cloudflare account and API authorization.

## Generation 3 terrain

- The build envelope remains Y −64 through 319.
- Natural overworld terrain is capped below Y 196 and statistically favors low country. In the regression survey, more than 95% of samples stay below Y 100 while rare ranges still clear Y 110.
- Continental noise is broader and calmer, rolling uplift is smaller, mountain regions are rarer, and ridge amplitude is substantially reduced.
- Rivers, shores, caves, aquifers, biomes, and the Emberdeep remain.
- World generation is versioned. Existing Version 6 saves retain Generation 2 terrain rather than silently regenerating against the new formula and creating chunk seams.

## Dynamic villages

- A settlement may use a crossroads, courtyard, or lane plan and can span multiple chunks.
- Each plan contains 3–7 structures selected and positioned deterministically from cottages, longhouses, forges, libraries, workshops, towers, and farms.
- Buildings rotate toward their settlement, follow local elevation with foundations, use biome-sensitive timber, contain template-specific furniture, and connect to a market plaza with terrain-following paths.
- Resident population and profession mix vary with the plan. Generated markets, furnaces, and storage receive real machine state rather than decorative-only blocks.
- Village plans remain deterministic for a seed while showing broad diversity across regions.

## Fresh worlds and corrected foliage

- The seed field starts blank. Beginning a blank-seed world generates a readable seed from cryptographic entropy, so returning to **New world** no longer repeats the same spawn.
- The random button reveals a generated seed for players who want to share or replay it, and typed phrases remain deterministic.
- Emberwood, Frostpine, and Riftwood foliage now renders in the alpha-tested solid depth pass. Texture holes remain, but water behind leaves no longer blends across the whole canopy.

## Validation

Version 7 passes:

- ESLint and production Next.js static export
- Cloudflare Worker TypeScript validation and Wrangler dry-run bundling
- 42 deterministic gameplay tests, including the Generation 3 terrain distribution, authoritative mutation draining, six-character codes, server authority policy, unique fresh seeds, leaf render layers, varied village plans, save-generator preservation, and the complete earlier movement, water, inventory, crafting, combat, cave, ore, mob, smelting, logic, piston, logistics, dimension, and save suite
- A Miniflare integration test with a real Durable Object and two WebSockets that verifies host and guest connection, snapshot transfer, guest authority rejection, guest request routing, a checkpoint larger than one storage row, host departure, guest promotion, and recovered state

## Hosting

The server definition is in `server/wrangler.jsonc`; the Pages build reads `NEXT_PUBLIC_MULTIPLAYER_URL`. The repository includes separate GitHub Actions workflows for the static site and the free multiplayer service. See the README for the two required Cloudflare secrets and the `MULTIPLAYER_URL` repository variable.
