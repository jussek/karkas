/** Stage 3E/3H — Pure helpers for the semantic tile gallery. */
import type { EdgeIndex } from '../../game/types/geometry';
import { RUNTIME_CARD_CATALOG } from '../../game/cards/runtimeCatalog';
import { cardToTileDefinition } from '../../game/cards/toTileDefinition';
import { createTileRenderModel } from '../tiles/tileRenderModel';
import type { TileRenderModel } from '../tiles/tileRenderModel';

export type GalleryFilter = 'all' | 'road' | 'city' | 'river' | 'monastery';
export interface GalleryEntry { id: string; definition: ReturnType<typeof cardToTileDefinition>; model: TileRenderModel }

export function buildGalleryEntries(): GalleryEntry[] {
  return RUNTIME_CARD_CATALOG.map((card) => {
    const definition = cardToTileDefinition(card);
    return { id: card.id, definition, model: createTileRenderModel(definition) };
  });
}

export function matchesFilter(entry: GalleryEntry, filter: GalleryFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'road': return entry.model.roads.length > 0;
    case 'city': return entry.model.cities.length > 0;
    case 'river': return entry.model.rivers.length > 0;
    case 'monastery': return entry.model.monastery === true;
  }
}

export function filterGalleryEntries(entries: readonly GalleryEntry[], filter: GalleryFilter): GalleryEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filter));
}

export interface ExampleReport {
  straightRoad: string | null; curvedRoad: string | null; roadJunction: string | null;
  disconnectedRoads: string | null; singleEdgeCity: string | null;
  connectedMultiEdgeCity: string | null; disconnectedCities: string | null;
  riverStraight: string | null; riverBend: string | null; riverSource: string | null;
  riverEnd: string | null; threeWayRiver: string | null; monastery: string | null;
}

function isOppositePair(edges: readonly EdgeIndex[]): boolean {
  return edges.length === 2 && Math.abs(edges[0] - edges[1]) === 2;
}
function isAdjacentPair(edges: readonly EdgeIndex[]): boolean { return edges.length === 2 && !isOppositePair(edges); }
function findExample(entries: readonly GalleryEntry[], pred: (m: TileRenderModel) => boolean): string | null {
  return entries.find((entry) => pred(entry.model))?.id ?? null;
}

export function discoverExamples(entries: readonly GalleryEntry[] = buildGalleryEntries()): ExampleReport {
  return {
    straightRoad: findExample(entries, (m) => m.roads.some((r) => isOppositePair(r.edges))),
    curvedRoad: findExample(entries, (m) => m.roads.some((r) => isAdjacentPair(r.edges))),
    roadJunction: findExample(entries, (m) => m.roads.some((r) => r.edges.length >= 3)),
    disconnectedRoads: findExample(entries, (m) => m.roads.length >= 2),
    singleEdgeCity: findExample(entries, (m) => m.cities.some((c) => c.edges.length === 1)),
    connectedMultiEdgeCity: findExample(entries, (m) => m.cities.some((c) => c.edges.length >= 2)),
    disconnectedCities: findExample(entries, (m) => m.cities.length >= 2),
    riverStraight: findExample(entries, (m) => m.rivers.some((r) => isOppositePair(r.edges))),
    riverBend: findExample(entries, (m) => m.rivers.some((r) => isAdjacentPair(r.edges))),
    riverSource: null,
    riverEnd: null,
    threeWayRiver: findExample(entries, (m) => m.rivers.some((r) => r.edges.length === 3)),
    monastery: findExample(entries, (m) => m.monastery),
  };
}

export function discoverRiverKinds(): { source: string | null; end: string | null } {
  return {
    source: RUNTIME_CARD_CATALOG.find((card) => card.riverKind === 'start')?.id ?? null,
    end: RUNTIME_CARD_CATALOG.find((card) => card.riverKind === 'end')?.id ?? null,
  };
}

export function discoverAllExamples(): ExampleReport {
  const base = discoverExamples();
  const kinds = discoverRiverKinds();
  return { ...base, riverSource: kinds.source, riverEnd: kinds.end };
}

export function badgesFor(entry: GalleryEntry): GalleryFilter[] {
  const badges: GalleryFilter[] = [];
  if (entry.model.roads.length > 0) badges.push('road');
  if (entry.model.cities.length > 0) badges.push('city');
  if (entry.model.rivers.length > 0) badges.push('river');
  if (entry.model.monastery) badges.push('monastery');
  return badges;
}
