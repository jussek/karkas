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

- `PLAYABLE_CARDS=143`; `card-109` is the single removed card.
- `RIVER_CARDS=19`: `card-133` is the source, followed by 17 shuffled middle river tiles and `card-106` as the end; the 124-card land deck follows.
- Meeples can occupy roads, cities and monasteries.
- Completed features are scored when the player ends the turn, then meeples on completed features return to their owners.
- Farmers/field ownership and field scoring are intentionally not implemented.
- Abbots and garden gameplay are intentionally not implemented.

## Architecture

- `src/game/**` — pure TypeScript domain: cards, deck, placement rules, connected features, scoring and turn flow. It must not depend on React, the DOM, Supabase or browser storage.
- `src/game-ui/**` — React rendering and interaction. UI consumes engine/rule APIs instead of reimplementing legality or scoring.
- `src/game/cards/canonicalCatalog.ts` — authoritative runtime card catalog assembled from the completed visual audit.
- `src/a` is the authoritative gameplay artwork; gameplay does not use remote or procedural artwork fallbacks.

Randomness used to bootstrap a browser game stays outside the pure domain. Tests can supply deterministic game ids and seeds.
