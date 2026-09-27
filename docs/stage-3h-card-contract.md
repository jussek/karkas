# Stage 3H — canonical card-data contract

This file records the project decisions that are authoritative while the old pixel-classified catalog is replaced by image-verified data.

## Set

- Physical image set after audit: **143 playable tiles**.
- `1 (105).jpg` / `card-105` is intentionally excluded from the game and removed from the repository.
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
- card 105: excluded entirely.

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

After excluding card 105, the current image audit identified these 19 river-image candidates:

`053, 054, 067, 079, 088, 090, 091, 099, 100, 101, 102, 106, 107, 108, 109, 110, 111, 121, 133`.

This list is the Stage 3H image-audit set. The previous catalog's river flags are not authoritative. No three-way river behavior is required after card 105 is removed.

## Acceptance gates

Stage 3H is not complete merely because TypeScript compiles. Completion requires:

- exactly 143 retained image-backed card records;
- no `card-105` record and no `1 (105).jpg` asset;
- exactly 19 river-opening records and 124 normal-deck records;
- catalog-wide validation of edge/topology consistency;
- no field/farmer, abbot, or garden meeple targets;
- shields represented in scoring data;
- all card images resolvable by the UI;
- typecheck, tests, and production build passing.
