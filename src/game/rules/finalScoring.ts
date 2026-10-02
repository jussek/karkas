import type { GlobalFeatureContext, ResolvedGlobalFeature } from './globalFeatures.js';
import { getGlobalFeatures, resolveGlobalFeature } from './globalFeatures.js';
import { getFeatureMajorityPlayers } from './scoring.js';

export interface FinalFeatureScoreAward {
  featureId: string;
  featureType: 'road' | 'city' | 'monastery';
  completed: false;
  points: number;
  winnerPlayerIds: string[];
  meepleIdsReturned: string[];
}

export interface FinalScoringResult {
  scoreDeltaByPlayerId: Record<string, number>;
  awards: FinalFeatureScoreAward[];
  meepleIdsReturned: string[];
}

const FEATURE_ORDER = { road: 0, city: 1, monastery: 2 } as const;

export function getFinalFeaturePoints(feature: ResolvedGlobalFeature): number {
  if (feature.completed) return 0;
  if (feature.type === 'monastery') {
    if (feature.surroundingTilesFilled === null) {
      throw new Error('Incomplete monastery must provide surroundingTilesFilled');
    }
    return 1 + feature.surroundingTilesFilled;
  }
  return feature.tileCount;
}

function meepleIdsOnFeature(feature: ResolvedGlobalFeature, ctx: GlobalFeatureContext): string[] {
  return ctx.meeples
    .filter((meeple) => {
      if (meeple.position === null || meeple.placement === null) return false;
      return resolveGlobalFeature(ctx, meeple.position, meeple.placement)?.id === feature.id;
    })
    .map((meeple) => meeple.id)
    .sort((a, b) => a.localeCompare(b));
}

export function scoreFinalFeatures(ctx: GlobalFeatureContext): FinalScoringResult {
  const scoreDeltaByPlayerId: Record<string, number> = {};
  const returned = new Set<string>();
  const awards = getGlobalFeatures(ctx)
    .filter((feature) => !feature.completed && feature.occupantPlayerIds.length > 0)
    .map((feature): FinalFeatureScoreAward => {
      const points = getFinalFeaturePoints(feature);
      const winnerPlayerIds = getFeatureMajorityPlayers(feature, ctx);
      const meepleIdsReturned = meepleIdsOnFeature(feature, ctx);
      for (const playerId of winnerPlayerIds) {
        scoreDeltaByPlayerId[playerId] = (scoreDeltaByPlayerId[playerId] ?? 0) + points;
      }
      for (const id of meepleIdsReturned) returned.add(id);
      return {
        featureId: feature.id,
        featureType: feature.type,
        completed: false,
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
    meepleIdsReturned: [...returned].sort((a, b) => a.localeCompare(b)),
  };
}
