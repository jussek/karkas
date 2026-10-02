import { edgeOffset, getAllNeighborhoodPositions, oppositeEdge, rotateEdge } from '../engine/geometry.js';
import type {
  EdgeIndex,
  MeeplePlacement,
  Rotation,
  TileDefinition,
  TilePosition,
} from '../types/geometry.js';
import { EDGES } from '../types/geometry.js';
import type { Board, FeaturePart, Meeple } from '../types/state.js';
import { posKey } from '../types/state.js';

export interface GlobalFeatureContext {
  board: Board;
  meeples: readonly Meeple[];
  getDefinition: (definitionId: string) => TileDefinition;
}

export interface ResolvedGlobalFeature {
  id: string;
  type: 'road' | 'city' | 'monastery';
  parts: FeaturePart[];
  occupantPlayerIds: string[];
  completed: boolean;
  openEdges: number;
  tileCount: number;
  surroundingTilesFilled: number | null;
}

type LinearFeatureType = 'road' | 'city';
type TopologyFeature = Omit<ResolvedGlobalFeature, 'occupantPlayerIds'>;

interface SegmentNode {
  position: TilePosition;
  type: LinearFeatureType;
  segmentId: string;
}

function segmentArray(
  definition: TileDefinition,
  featureType: LinearFeatureType,
): readonly (string | null)[] {
  return featureType === 'road'
    ? definition.topology.roadEdgeSegments
    : definition.topology.cityEdgeSegments;
}

function segmentIds(
  definition: TileDefinition,
  featureType: LinearFeatureType,
): readonly string[] {
  return featureType === 'road'
    ? definition.topology.roadSegments
    : definition.topology.citySegments;
}

function segmentIdAtRotatedEdge(
  definition: TileDefinition,
  rotation: Rotation,
  featureType: LinearFeatureType,
  rotatedEdge: EdgeIndex,
): string | null {
  const segments = segmentArray(definition, featureType);
  const baseEdge = EDGES.find((edge) => rotateEdge(edge, rotation) === rotatedEdge);
  return baseEdge === undefined ? null : (segments[baseEdge] ?? null);
}

function rotatedEdgesForSegment(
  definition: TileDefinition,
  rotation: Rotation,
  featureType: LinearFeatureType,
  segmentId: string,
): EdgeIndex[] {
  const segments = segmentArray(definition, featureType);
  return EDGES.filter((edge) => segments[edge] === segmentId)
    .map((edge) => rotateEdge(edge, rotation))
    .sort((a, b) => a - b);
}

function nodeKey(node: SegmentNode): string {
  return `${node.position.x},${node.position.y}|${node.type}|${node.segmentId}`;
}

function compareParts(a: FeaturePart, b: FeaturePart): number {
  return (
    a.position.x - b.position.x ||
    a.position.y - b.position.y ||
    a.segmentId.localeCompare(b.segmentId) ||
    (a.edge === null ? -1 : b.edge === null ? 1 : a.edge - b.edge)
  );
}

function resolveSegmentTopology(
  ctx: Pick<GlobalFeatureContext, 'board' | 'getDefinition'>,
  start: SegmentNode,
): TopologyFeature | null {
  const startTile = ctx.board[posKey(start.position)];
  if (!startTile) return null;
  const startDefinition = ctx.getDefinition(startTile.definitionId);
  if (!segmentIds(startDefinition, start.type).includes(start.segmentId)) return null;

  const queue: SegmentNode[] = [start];
  const visited = new Map<string, SegmentNode>();
  const parts: FeaturePart[] = [];
  let openEdges = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    const key = nodeKey(node);
    if (visited.has(key)) continue;
    visited.set(key, node);

    const tile = ctx.board[posKey(node.position)];
    if (!tile) continue;
    const definition = ctx.getDefinition(tile.definitionId);
    const edges = rotatedEdgesForSegment(
      definition,
      tile.rotation,
      node.type,
      node.segmentId,
    );

    for (const edge of edges) {
      parts.push({ position: { ...node.position }, segmentId: node.segmentId, edge });
      const offset = edgeOffset(edge);
      const neighborPosition = {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      };
      const neighborTile = ctx.board[posKey(neighborPosition)];
      if (!neighborTile) {
        openEdges += 1;
        continue;
      }
      const neighborDefinition = ctx.getDefinition(neighborTile.definitionId);
      const neighborSegment = segmentIdAtRotatedEdge(
        neighborDefinition,
        neighborTile.rotation,
        node.type,
        oppositeEdge(edge),
      );
      if (neighborSegment === null) {
        openEdges += 1;
        continue;
      }
      queue.push({ position: neighborPosition, type: node.type, segmentId: neighborSegment });
    }
  }

  const sortedNodeKeys = [...visited.keys()].sort();
  const tilePositions = new Set(
    [...visited.values()].map((node) => posKey(node.position)),
  );
  parts.sort(compareParts);

  return {
    id: `${start.type}|${sortedNodeKeys.join(';')}`,
    type: start.type,
    parts,
    completed: openEdges === 0,
    openEdges,
    tileCount: tilePositions.size,
    surroundingTilesFilled: null,
  };
}

function resolveFeatureTopology(
  ctx: Pick<GlobalFeatureContext, 'board' | 'getDefinition'>,
  position: TilePosition,
  placement: MeeplePlacement,
): TopologyFeature | null {
  const tile = ctx.board[posKey(position)];
  if (!tile) return null;
  const definition = ctx.getDefinition(tile.definitionId);

  if (placement.featureType === 'monastery') {
    if (placement.edge !== null || !definition.topology.hasMonastery) return null;
    const surroundingTilesFilled = getAllNeighborhoodPositions(position).filter(
      (neighbor) => ctx.board[posKey(neighbor)] !== undefined,
    ).length;
    return {
      id: `monastery|${position.x},${position.y}`,
      type: 'monastery',
      parts: [{ position: { ...position }, segmentId: 'center', edge: null }],
      completed: surroundingTilesFilled === 8,
      openEdges: 8 - surroundingTilesFilled,
      tileCount: 1,
      surroundingTilesFilled,
    };
  }

  if (placement.edge === null) return null;
  const segmentId = segmentIdAtRotatedEdge(
    definition,
    tile.rotation,
    placement.featureType,
    placement.edge,
  );
  if (segmentId === null) return null;
  return resolveSegmentTopology(ctx, { position, type: placement.featureType, segmentId });
}

function collectOccupantsForFeature(
  ctx: GlobalFeatureContext,
  featureId: string,
): string[] {
  const players = new Set<string>();
  for (const meeple of ctx.meeples) {
    if (meeple.position === null || meeple.placement === null) continue;
    const feature = resolveFeatureTopology(ctx, meeple.position, meeple.placement);
    if (feature?.id === featureId) players.add(meeple.playerId);
  }
  return [...players].sort((a, b) => a.localeCompare(b));
}

function enrichFeature(
  ctx: GlobalFeatureContext,
  feature: TopologyFeature,
): ResolvedGlobalFeature {
  return {
    ...feature,
    occupantPlayerIds: collectOccupantsForFeature(ctx, feature.id),
  };
}

export function resolveGlobalFeature(
  ctx: GlobalFeatureContext,
  position: TilePosition,
  placement: MeeplePlacement,
): ResolvedGlobalFeature | null {
  const feature = resolveFeatureTopology(ctx, position, placement);
  return feature === null ? null : enrichFeature(ctx, feature);
}

export function isGlobalFeatureOccupied(
  ctx: GlobalFeatureContext,
  position: TilePosition,
  placement: MeeplePlacement,
): boolean {
  const feature = resolveGlobalFeature(ctx, position, placement);
  return feature !== null && feature.occupantPlayerIds.length > 0;
}

export function getGlobalFeatures(ctx: GlobalFeatureContext): ResolvedGlobalFeature[] {
  const features = new Map<string, ResolvedGlobalFeature>();
  for (const key of Object.keys(ctx.board).sort()) {
    const tile = ctx.board[key];
    const definition = ctx.getDefinition(tile.definitionId);
    for (const type of ['road', 'city'] as const) {
      const distinctSegmentIds = [...new Set(segmentIds(definition, type))].sort();
      for (const segmentId of distinctSegmentIds) {
        const topology = resolveSegmentTopology(ctx, {
          position: tile.position,
          type,
          segmentId,
        });
        if (topology && !features.has(topology.id)) {
          features.set(topology.id, enrichFeature(ctx, topology));
        }
      }
    }
    if (definition.topology.hasMonastery) {
      const feature = resolveGlobalFeature(ctx, tile.position, {
        featureType: 'monastery',
        edge: null,
      });
      if (feature) features.set(feature.id, feature);
    }
  }
  return [...features.values()].sort((a, b) => a.id.localeCompare(b.id));
}
