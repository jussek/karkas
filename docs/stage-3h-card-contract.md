# Canonical card-data contract

This document records the runtime card and river contract after re-auditing the user-supplied JPG artwork. `GAME_CARD_CATALOG` is the sole runtime card collection. The older `CARD_CATALOG` is only a historical/import layer and is not authoritative when it conflicts with the audited JPG data.

## Physical set

- Physical/runtime set: **144 image-backed tiles**, `card-001` through `card-144`.
- `card-105` is a normal road/city tile and is retained.
- `card-106` is retained and is the forced final river tile. Its real JPG is bundled as `src/game/cards/1 (106).jpg`.
- `card-091` is retained and is a middle river tile.
- The river set contains **20 tiles** total: one pre-placed source, 18 middle tiles, and one forced final tile.
- The normal land deck contains **124 tiles** and begins only after `card-106` has been played.
- Runtime counts are derived from the canonical catalog rather than repeated as magic constants.

## Gameplay features

Meeples may be placed only on roads, cities, and monasteries. Farmers/field ownership, abbots, and gardens are intentionally not implemented. `field` remains a terrain type for edge compatibility. River is placement topology and is not a meeple target.

## Scoring

Scoring is resolved when the active player presses **End turn**. Connected road/city majority is computed across the entire connected feature; every tied leader receives the full feature score, minority players receive zero, and all meeples on a completed feature return. Monasteries score from their surrounding tiles and return their meeple when completed.

The JPG artwork contains visible city shields and the catalog may preserve their visual association with city features. **Shield bonus scoring is not implemented because the project scoring rule for shields has not been confirmed.** Current city scoring remains the existing project rule; the catalog must not silently add shield points.

## Canonical river set

The visually audited runtime river cards are:

`053, 054, 055, 067, 079, 088, 090, 091, 099, 100, 101, 102, 106, 107, 108, 109, 110, 111, 121, 133`.

Roles and high-risk corrections:

- `card-133` — **source/start**, already placed at `(0,0)`, rotation `0`; N field, E field, S river, W field; `riverEdges:[2]`.
- `card-106` — **forced final river tile**; N/E/S field, W river; `riverEdges:[3]`.
- `card-091` — middle river tile; E+S river; `riverEdges:[1,2]`.
- `card-079` — N+S river, E road, W city; road `[[1]]`, city `[[3]]`, river `[0,2]`.
- `card-109` — three-edge river fork; N+E+W river, S field; `riverEdges:[0,1,3]`.
- `card-096` — normal land tile; the internal blue pond does **not** reach a border and is not river topology; road N↔S, field E/W.

### River draw order

1. `card-133` is already on the board.
2. All 18 middle river cards are consumed exactly once. A seeded shuffle defines deterministic random priority; the solver may choose the next usable priority card when a higher-priority choice would make completion impossible. River cards are never discarded.
3. `card-106` is reserved and is always the final river draw.
4. Only after the final river turn does the seeded land deck begin.

`card-109` means the river can have multiple open frontiers. The planner therefore operates on **all** exposed river frontiers, grouped by empty target cell, and normal authoritative edge matching still applies to every occupied neighbour.

Because the verified set contains one degree-3 fork (`109`) plus a degree-1 source (`133`) and only one degree-1 forced final tile (`106`), the physical river graph has odd total boundary degree. Requiring the final tile to reduce the number of open river edges to zero would therefore be mathematically incompatible with this audited set. The product invariant is sequencing and legal connectivity: `133 -> every middle once -> 106 -> land`.

## Edge/topology contract

Canonical side order is `N=0, E=1, S=2, W=3`. Every runtime tile must satisfy:

1. exactly four canonical edge terrains (`field | road | city | river`);
2. every road border edge appears in exactly one local road feature;
3. every city border edge appears in exactly one local city feature;
4. every river border edge appears exactly once in `topology.riverEdges`;
5. topology never assigns a border edge to a different terrain type;
6. non-river cards have neither `riverKind` nor river edges;
7. exactly one river source and exactly one river end exist;
8. rotation is engine-derived with `rotateEdge`; rotated duplicate card records are forbidden.

Placement legality remains authoritative in the pure engine: target cell must be empty, must touch at least one orthogonal neighbour, and **all** touching sides must have compatible terrain. River planning filters choices for future solvability but never weakens those normal placement rules.

## Assets

Every runtime card must resolve to its real project JPG through the standard tile asset manifest. Synthetic card artwork fallbacks are not part of the canonical contract. In particular `card-106` now resolves to `1 (106).jpg` like every other card.

## Acceptance gates

A card/river change is acceptable only when:

- runtime catalog contains exactly 144 unique IDs/assets;
- structural topology validation passes for every runtime tile;
- the high-risk cards `079, 091, 096, 106, 109, 133` match the audited sides above;
- source `133` starts pre-placed and `106` is always the last river draw;
- every river tile is used exactly once and none is discarded;
- land draw starts only after the river sequence completes;
- no field/farmer, abbot, or garden meeple target is introduced;
- all artwork resolves through the UI asset manifest;
- typecheck, full tests, and production build pass.

## Remaining board/UI work

The engine board is unbounded. UI projection must not impose a gameplay boundary. Camera pan/pinch/fit is presentation-only and must never change legality. Interactive board controls must keep their own pointer events rather than being captured by the camera gesture layer. The board view should initially frame the source tile and fit placed/legal cells on demand without resetting after rotation.
