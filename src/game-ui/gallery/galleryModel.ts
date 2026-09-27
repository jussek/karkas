/**
 * Stage 3E — Pure helpers for the tile gallery (semantic audit page).
 *
 * Filtering and example discovery derive ONLY from structured render
 * models — never from JPG assets. Keeping these functions pure makes the
 * gallery counts programmatically verifiable in tests.
 */

import type { EdgeIndex } from '../../game/types/geometry';
import { CARD_CATALOG } from '../../game/cards/catalog';
import { cardToTileDefinition } from '../../game/cards/toTileDefinition';
import { createTileRenderModel } from '../tiles/tileRenderModel';
import type { TileRenderModel } from '../tiles/tileRenderModel';

export type GalleryFilter = 'all' | 'road' | 'city' | 'river' | 'monastery';

export interface GalleryEntry {
  id: string;
  definition: ReturnType<typeof cardToTileDefinition>;
  model: TileRenderModel;
}

/** All catalog cards converted through the existing adapter + render model. */
export function buildGalleryEntries(): GalleryEntry[] {
  return CARD_CATALOG.map((card) => {
    const definition = cardToTileDefinition(card);
    return { id: card.id, definition, model: createTileRenderModel(definition) };
  });
}

/** Filter predicate derived strictly from the structured render model. */
export function matchesFilter(entry: GalleryEntry, filter: GalleryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'road':
      return entry.model.roads.length > 0;
    case 'city':
      return entry.model.cities.length > 0;
    case 'river':
      return entry.model.rivers.length > 0;
    case 'monastery':
      return entry.model.monastery === true;
  }
}

export function filterGalleryEntries(
  entries: readonly GalleryEntry[],
  filter: GalleryFilter,
): GalleryEntry[] {
  return entries.filter((e) => matchesFilter(e, filter));
}

/* ------------------------------------------------------------------ */
/* Real-example discovery (§28) — pure, structured-data only           */
/* ------------------------------------------------------------------ */

export interface ExampleReport {
  straightRoad: string | null;
  curvedRoad: string | null;
  roadJunction: string | null;
  disconnectedRoads: string | null;
  singleEdgeCity: string | null;
  connectedMultiEdgeCity: string | null;
  disconnectedCities: string | null;
  riverStraight: string | null;
  riverBend: string | null;
  riverSource: string | null;
  riverEnd: string | null;
  threeWayRiver: string | null;
  monastery: string | null;
}

function isOppositePair(edges: readonly EdgeIndex[]): boolean {
  return edges.length === 2 && Math.abs(edges[0] - edges[1]) === 2;
}

function isAdjacentPair(edges: readonly EdgeIndex[]): boolean {
  return edges.length === 2 && !isOppositePair(edges);
}

/** First catalog card matching a predicate over its render model. */
function findExample(
  entries: readonly GalleryEntry[],
  pred: (m: TileRenderModel) => boolean,
): string | null {
  const hit = entries.find((e) => pred(e.model));
  return hit ? hit.id : null;
}

export function discoverExamples(
  entries: readonly GalleryEntry[] = buildGalleryEntries(),
): ExampleReport {
  return {
    straightRoad: findExample(entries, (m) =>
      m.roads.some((r) => isOppositePair(r.edges)),
    ),
    curvedRoad: findExample(entries, (m) =>
      m.roads.some((r) => isAdjacentPair(r.edges)),
    ),
    roadJunction: findExample(entries, (m) =>
      m.roads.some((r) => r.edges.length >= 3),
    ),
    disconnectedRoads: findExample(entries, (m) => m.roads.length >= 2),
    singleEdgeCity: findExample(entries, (m) =>
      m.cities.some((c) => c.edges.length === 1),
    ),
    connectedMultiEdgeCity: findExample(entries, (m) =>
      m.cities.some((c) => c.edges.length >= 2),
    ),
    disconnectedCities: findExample(entries, (m) => m.cities.length >= 2),
    riverStraight: findExample(entries, (m) =>
      m.rivers.some((r) => isOppositePair(r.edges)),
    ),
    riverBend: findExample(entries, (m) =>
      m.rivers.some((r) => isAdjacentPair(r.edges)),
    ),
    riverSource: findExample(
      entries,
      (m) => m.rivers.some((r) => r.edges.length === 1) && m.monastery === false,
    ) ?? findExample(entries, (m) => m.rivers.some((r) => r.edges.length === 1)),
    riverEnd: null, // refined below using catalog riverKind (structured data)
    threeWayRiver: findExample(entries, (m) =>
      m.rivers.some((r) => r.edges.length === 3),
    ),
    monastery: findExample(entries, (m) => m.monastery),
  };
}

/**
 * River source/end by verified catalog metadata (`riverKind`), which is
 * structured game data (not JPG inference). Falls back to topology when
 * kind metadata is absent.
 */
export function discoverRiverKinds(
  entries: readonly GalleryEntry[] = buildGalleryEntries(),
): { source: string | null; end: string | null } {
  let source: string | null = null;
  let end: string | null = null;
  for (const card of CARD_CATALOG) {
    const edges = card.topology.riverEdges ?? [];
    if (edges.length !== 1) continue;
    if (card.riverKind === 'start' && !source) source = card.id;
    if (card.riverKind === 'end' && !end) end = card.id;
  }
  if (!source || !end) {
    // fallback: any single-edge river cards (kind unresolved)
    for (const e of entries) {
      const single = e.model.rivers.some((r) => r.edges.length === 1);
      if (!single) continue;
      if (!source) source = e.id;
      else if (!end) end = e.id;
    }
  }
  return { source, end };
}

/** Full report combining model-shape examples and verified river kinds. */
export function discoverAllExamples(): ExampleReport {
  const base = discoverExamples();
  const kinds = discoverRiverKinds();
  return { ...base, riverSource: kinds.source, riverEnd: kinds.end };
}

/** Badge set for one entry (derived from structured data only). */
export function badgesFor(entry: GalleryEntry): GalleryFilter[] {
  const badges: GalleryFilter[] = [];
  if (entry.model.roads.length > 0) badges.push('road');
  if (entry.model.cities.length > 0) badges.push('city');
  if (entry.model.rivers.length > 0) badges.push('river');
  if (entry.model.monastery) badges.push('monastery');
  return badges;
}
