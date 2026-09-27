# Karkas

Mobile-first Carcassonne-style game implemented with React, Vite and a pure TypeScript game domain.

## Development

```bash
npm ci
npm run dev
```

Quality gates:

```bash
npm run typecheck
npm test
npm run build
```

The tile audit/gallery is available at `/tiles`.

## Current game contract

- 143 playable JPG-backed tiles.
- 19-tile river opening: `card-091` is the source, 17 middle river tiles are shuffled, and `card-133` is the end.
- `card-105` is playable; removed `card-106` is not part of runtime gameplay or the production asset set.
- Meeples can occupy roads, cities and monasteries.
- Completed features are scored when the player ends the turn, then meeples on completed features return to their owners.
- Farmers/field ownership and field scoring are intentionally not implemented.
- Abbots and garden gameplay are intentionally not implemented.

## Architecture

- `src/game/**` — pure TypeScript domain: cards, deck, placement rules, connected features, scoring and turn flow. It must not depend on React, the DOM, Supabase or browser storage.
- `src/game-ui/**` — React rendering and interaction. UI consumes engine/rule APIs instead of reimplementing legality or scoring.
- `src/game/cards/canonicalCatalog.ts` — authoritative runtime card catalog assembled from the completed visual audit.
- Supplied local JPG files are authoritative gameplay artwork; gameplay does not use remote or procedural artwork fallbacks.

Randomness used to bootstrap a browser game stays outside the pure domain. Tests can supply deterministic game ids and seeds.
