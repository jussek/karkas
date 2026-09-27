import { getAllNeighborhoodPositions, rotateEdge } from '../engine/geometry';
import type { TilePosition } from '../types/geometry';
import { EDGES } from '../types/geometry';
import { posKey } from '../types/state';
import {
  resolveGlobalFeature,
  type GlobalFeatureContext,
  type ResolvedGlobalFeature,
} from './globalFeatures';

export type FeatureScoreType = 'road' | 'city' | 'monastery';

export interface FeatureScoreAward {
  featureId: string;
  featureType: FeatureScoreType;
  points: number;
  winnerPlayerIds: string[];
  meepleIdsReturned: string[];
}

export interface TurnScoringResult {
  scoreDeltaByPlayerId: Record<string, number>;
  awards: FeatureScoreAward[];
  meepleIdsReturned: string[];
}

const FEATURE_ORDER: Record<FeatureScoreType, number> = {
  road: 0,
  city: 1,
  monastery: 2,
};

export function getCompletedFeaturePoints(feature: ResolvedGlobalFeature): number {
  if (!feature.completed) return 0;
  switch (feature.type) {
    case 'road':
      return feature.tileCount;
    case 'city':
      return feature.tileCount * 2;
    case 'monastery':
      return 9;
  }
}

function meeplesOnFeature(feature: ResolvedGlobalFeature, ctx: GlobalFeatureContext) {
  return ctx.meeples.filter((meeple) => {
    if (meeple.position === null || meeple.placement === null) return false;
    return resolveGlobalFeature(ctx, meeple.position, meeple.placement)?.id === feature.id;
  });
}

export function getFeatureMeepleCounts(
  feature: ResolvedGlobalFeature,
  ctx: GlobalFeatureContext,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const meeple of meeplesOnFeature(feature, ctx)) {
    counts[meeple.playerId] = (counts[meeple.playerId] ?? 0) + 1;
  }
  return counts;
}

export function getFeatureMajorityPlayers(
  feature: ResolvedGlobalFeature,
  ctx: GlobalFeatureContext,
): string[] {
  const counts = getFeatureMeepleCounts(feature, ctx);
  const maximum = Math.max(0, ...Object.values(counts));
  if (maximum === 0) return [];
  return Object.keys(counts)
    .filter((playerId) => counts[playerId] === maximum)
    .sort((a, b) => a.localeCompare(b));
}

function candidateFeatures(
  ctx: GlobalFeatureContext,
  currentTilePosition: TilePosition,
): ResolvedGlobalFeature[] {
  const candidates = new Map<string, ResolvedGlobalFeature>();
  const tile = ctx.board[posKey(currentTilePosition)];
  if (!tile) return [];
  const definition = ctx.getDefinition(tile.definitionId);

  for (const featureType of ['road', 'city'] as const) {
    const segments = featureType === 'road'
      ? definition.topology.roadEdgeSegments
      : definition.topology.cityEdgeSegments;
    for (const baseEdge of EDGES) {
      if (segments[baseEdge] === null) continue;
      const rotatedEdge = rotateEdge(baseEdge, tile.rotation);
      const feature = resolveGlobalFeature(ctx, currentTilePosition, {
        featureType,
        edge: rotatedEdge,
      });
      if (feature) candidates.set(feature.id, feature);
    }
  }

  const monasteryPositions = [currentTilePosition, ...getAllNeighborhoodPositions(currentTilePosition)];
  for (const position of monasteryPositions) {
    const feature = resolveGlobalFeature(ctx, position, {
      featureType: 'monastery',
      edge: null,
    });
    if (feature) candidates.set(feature.id, feature);
  }

  return [...candidates.values()];
}

export function scoreCompletedFeaturesForTurn(
  ctx: GlobalFeatureContext,
  currentTilePosition: TilePosition,
): TurnScoringResult {
  const scoreDeltaByPlayerId: Record<string, number> = {};
  const returnedIds = new Set<string>();
  const awards = candidateFeatures(ctx, currentTilePosition)
    .filter((feature) => feature.completed)
    .map((feature): FeatureScoreAward => {
      const points = getCompletedFeaturePoints(feature);
      const winnerPlayerIds = getFeatureMajorityPlayers(feature, ctx);
      const meepleIdsReturned = meeplesOnFeature(feature, ctx)
        .map((meeple) => meeple.id)
        .sort((a, b) => a.localeCompare(b));
      for (const playerId of winnerPlayerIds) {
        scoreDeltaByPlayerId[playerId] = (scoreDeltaByPlayerId[playerId] ?? 0) + points;
      }
      for (const id of meepleIdsReturned) returnedIds.add(id);
      return {
        featureId: feature.id,
        featureType: feature.type,
        points,
        winnerPlayerIds,
        meepleIdsReturned,
      };
    })
    .sort((a, b) =>
      FEATURE_ORDER[a.featureType] - FEATURE_ORDER[b.featureType] ||
      a.featureId.localeCompare(b.featureId),
    );

  return {
    scoreDeltaByPlayerId,
    awards,
    meepleIdsReturned: [...returnedIds].sort((a, b) => a.localeCompare(b)),
  };
}
