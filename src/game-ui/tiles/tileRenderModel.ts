/**
 * Stage 3E — Pure tile render model.
 *
 * Transforms a (domain) TileDefinition into an intermediate, presentation
 * model that the SVG renderer consumes. This function is PURE: it never
 * mutates the definition and derives ALL geometry from structured
 * topology data (never from JPGs, never from card-ID special cases).
 *
 * Edge index contract preserved exactly from the engine:
 *   0 = NORTH, 1 = EAST, 2 = SOUTH, 3 = WEST.
 */

import type {
  EdgeIndex,
  EdgeType,
  Rotation,
  TileDefinition,
} from '../../game/types/geometry';
import { rotateTile } from '../../game/engine/geometry';
import { CARD_CATALOG } from '../../game/cards/catalog';
import {
  buildCityMassPath,
  buildCitySpine,
  buildRiverPath,
  buildRoadPath,
  edgeAnchor,
  hashString,
} from './tileGeometry';

/** One rendered feature derived from one topology group. */
export interface RenderFeature {
  /** Stable id within the model, e.g. 'road-0'. */
  id: string;
  /** Edges this feature touches (topology order preserved). */
  edges: readonly EdgeIndex[];
  /** SVG path `d` for the feature's semantic centerline / mass outline. */
  path: string;
  /**
   * Optional secondary semantic path (city spine): segments from each
   * declared edge anchor into the mass. Used for endpoint invariants
   * and decoration safety; not rendered as a visible line.
   */
  spine?: string;
}

/** Intermediate, pure render model for one tile orientation. */
export interface TileRenderModel {
  /** Edge terrain types [N,E,S,W] of the (possibly rotated) definition. */
  edges: readonly EdgeType[];
  /** Road features — one per topology road group; distinct groups stay distinct. */
  roads: readonly RenderFeature[];
  /** City features — one per topology city group. */
  cities: readonly RenderFeature[];
  /** River features from verified structured river data (0 or 1 group today). */
  rivers: readonly RenderFeature[];
  /** Monastery presence, preserved exactly. */
  monastery: boolean;
  /** Deterministic seed driving decoration + organic wobble (derived from base card id). */
  decorationSeed: string;
}

/** Base source id for decoration seeds ('card-049@90' → 'card-049'). */
export function baseSourceId(id: string): string {
  const at = id.indexOf('@');
  return at === -1 ? id : id.slice(0, at);
}

/** Canonical key of an edge group (sorted, comma-joined) — used by tests. */
export function groupKey(edges: readonly EdgeIndex[]): string {
  return [...edges].sort((a, b) => a - b).join(',');
}

/**
 * Verified structured river data (Stage 2.5 catalog): catalog cards may
 * declare `topology.riverEdges`. The generic domain TileTopology type
 * does not carry them, so we join by card id against a read-only index
 * built once from the catalog. The catalog itself is never modified.
 */
const RIVER_EDGES_BY_CARD: ReadonlyMap<string, readonly EdgeIndex[]> = new Map(
  CARD_CATALOG.filter(
    (c) => c.topology.riverEdges !== undefined && c.topology.riverEdges.length > 0,
  ).map((c) => [c.id, c.topology.riverEdges as readonly EdgeIndex[]]),
);

/** Structured river edges for a card id (rotation suffix allowed), if any. */
export function getRiverEdgesForCard(id: string): readonly EdgeIndex[] | undefined {
  return RIVER_EDGES_BY_CARD.get(baseSourceId(id));
}

/** Reconstruct ordered edge groups from a `[seg|null,null,...]` array. */
function groupsFromEdgeSegments(
  segments: readonly (string | null)[],
  orderedIds: readonly string[],
): EdgeIndex[][] {
  const bySeg = new Map<string, EdgeIndex[]>();
  segments.forEach((seg, edge) => {
    if (seg === null) return;
    const list = bySeg.get(seg);
    if (list) list.push(edge as EdgeIndex);
    else bySeg.set(seg, [edge as EdgeIndex]);
  });
  const result: EdgeIndex[][] = [];
  for (const seg of orderedIds) {
    const edges = bySeg.get(seg);
    if (edges && edges.length > 0) result.push(edges);
  }
  return result;
}

/**
 * Build the render model for a tile definition at rotation 0. When you
 * need a rotated tile, first derive the rotated definition with the
 * engine's public rotateTile() API, then call this function — do NOT
 * re-implement rotation here.
 */
export function createTileRenderModel(
  definition: TileDefinition,
): TileRenderModel {
  const sourceId = baseSourceId(definition.id);
  const decorationSeed = `seed:${hashString(sourceId).toString(36)}`;

  const roadGroups = groupsFromEdgeSegments(
    definition.topology.roadEdgeSegments,
    definition.topology.roadSegments,
  );
  const roads: RenderFeature[] = roadGroups.map((edges, slot) => ({
    id: `road-${slot}`,
    edges,
    path: buildRoadPath(edges, decorationSeed, slot),
  }));

  const cityGroups = groupsFromEdgeSegments(
    definition.topology.cityEdgeSegments,
    definition.topology.citySegments,
  );
  const cities: RenderFeature[] = cityGroups.map((edges, slot) => ({
    id: `city-${slot}`,
    edges,
    path: buildCityMassPath(edges),
    spine: buildCitySpine(edges),
  }));

  const riverEdges = getRiverEdgesForCard(definition.id);
  const rivers: RenderFeature[] =
    riverEdges && riverEdges.length > 0
      ? [
          {
            id: 'river-0',
            edges: [...riverEdges],
            path: buildRiverPath(riverEdges, decorationSeed),
          },
        ]
      : [];

  return {
    edges: definition.sides,
    roads,
    cities,
    rivers,
    monastery: definition.topology.hasMonastery === true,
    decorationSeed,
  };
}

/**
 * Convenience wrapper: derive the rotated definition via the existing
 * public engine API, then build its render model. Rotation logic is
 * NEVER duplicated in the UI layer.
 */
export function createRotatedTileRenderModel(
  definition: TileDefinition,
  rotation: Rotation,
): TileRenderModel {
  return createTileRenderModel(rotateTile(definition, rotation));
}

/** All anchor coordinates referenced by a feature's declared edges. */
export function featureAnchors(feature: RenderFeature) {
  return feature.edges.map(edgeAnchor);
}
