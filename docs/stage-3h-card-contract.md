# Stage 3H — canonical card-data contract

This file records the project decisions that are authoritative while the old pixel-classified catalog is replaced by image-verified data.

## Set

- Physical image set after audit: **143 playable tiles**.
- `1 (105).jpg` / `card-105` is a normal retained road/city tile.
- `card-106` is the only user-removed tile and is absent from runtime data and the runtime artwork manifest. Its legacy source JPG may remain in Git because this review channel cannot carry binary deletion patches.
- River opening: **19 tiles**.
- Normal deck after the river: **124 tiles**.
- Do not synthesize a replacement tile to restore the historical count of 144.

## Gameplay features

Meeples may be placed only on:

- roads;
- cities;
- monasteries.

The following are intentionally not gameplay/scoring features:

- farmers / fields;
- abbots;
- gardens.

A river is placement topology, not a meeple target.

## Scoring

Scoring is resolved when the active player presses **End turn**, not when the tile or meeple preview is selected.

For a completed connected road or city, count meeples across the whole connected feature. The player(s) with the greatest count receive the full feature score. A tie for first awards the full score to every tied player. Meeples on a completed feature return to their owners after scoring. Monasteries score according to their surrounding tiles and return their meeple when completed.

City shields printed on the supplied JPG artwork are real scoring data and must be associated with the city feature that contains the shield.

## Image data is authoritative

The legacy `catalog.ts` was generated from pixel classification and contains known semantic errors. It must not be treated as ground truth when it conflicts with the supplied JPG.

Confirmed corrections include:

- card 009: the visible path/road runs from the left side toward the bottom; the legacy north/south description is wrong;
- card 021: monastery plus a city/castle fragment; the legacy road description is wrong;
- card 105: retained as a normal road/city tile, backed by the local `1 (105).jpg` artwork;
- card 106: excluded entirely;
- card 091: the one-edge river source;
- card 133: the one-edge river end;
- card 096: a normal land tile whose blue pond is not river topology.

Each retained tile must ultimately be verified for:

1. canonical N/E/S/W terrain;
2. each independent road group;
3. each independent city group;
4. shield count per city group;
5. monastery presence;
6. river connectivity and river role where applicable;
7. a UI meeple anchor for each legal road/city/monastery target.

Rotation remains engine-derived; canonical card data must not duplicate rotated variants.

## River audit

After excluding card 106 and correcting the pond on card 096, the canonical audit identifies these 19 river tiles:

`053, 054, 055, 067, 079, 088, 090, 091, 099, 100, 101, 102, 107, 108, 109, 110, 111, 121, 133`.

`card-091` is the sole source, `card-133` is the sole end, and the other 17 cards are middle tiles. The previous catalog's river flags are not authoritative.

## Acceptance gates

Stage 3H is not complete merely because TypeScript compiles. Completion requires:

- exactly 143 retained image-backed card records;
- `card-105` and local `1 (105).jpg` artwork retained;
- no runtime `card-106` record and no `1 (106).jpg` entry in the runtime artwork manifest;
- exactly 19 river-opening records and 124 normal-deck records;
- catalog-wide validation of edge/topology consistency;
- no field/farmer, abbot, or garden meeple targets;
- shields represented in scoring data;
- all card images resolvable by the UI;
- typecheck, tests, and production build passing.

## Handoff after Stage 3H

The pure TypeScript engine owns placement validation, connected-feature resolution,
majority scoring, completed-feature meeple return, final scoring, seeded deck order,
and the explicit draw/rotate/place/end-turn state machine. React consumes legal
coordinates and legal meeple targets from those APIs; it does not infer rules from
JPG pixels. `GAME_CARD_CATALOG` is the sole runtime card collection, while
`CARD_CATALOG` remains only the historical import layer beneath audited overrides.

Implemented gameplay currently covers roads, cities, monasteries, river-first play,
normal tile placement, optional meeples, and end-turn scoring. Farmers/field ownership
and scoring, abbots, gardens, and expansion/edition badge behavior are intentionally
absent. Road and river topology may coexist independently on bridge tiles.

Logical next tasks, without adding unsupported rules, are:

1. persist and restore the canonical turn-flow state through the existing application boundary;
2. add end-to-end mobile interaction coverage for board pan, draw, rotate, placement, and end turn;
3. improve board camera framing so distant legal placements are easy to reach;
4. expose completed-feature scoring events as player-facing turn feedback;
5. add a migration guard for any serialized games that still reference removed `card-106`.
