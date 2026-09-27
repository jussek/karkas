export * from './types';
export * from './engine/geometry';
export * from './engine/errors';
export * from './engine/gameEngine';
export * from './rules/placement';
export * from './rules/localFeatures';
export {
  resolveGlobalFeature,
  isGlobalFeatureOccupied,
  getGlobalFeatures,
  type GlobalFeatureContext,
  type ResolvedGlobalFeature,
} from './rules/globalFeatures';
export {
  getCompletedFeaturePoints,
  getFeatureMeepleCounts,
  getFeatureMajorityPlayers,
  scoreCompletedFeaturesForTurn,
  type FeatureScoreType,
  type FeatureScoreAward,
  type TurnScoringResult,
} from './rules/scoring';
export * from './tiles/testTiles';
export { cardToTileDefinition } from './cards/toTileDefinition';
export { getCardDefinition, getTileDefinition, isVerifiedCard } from './cards/catalogApi';
export { createCatalogDeck, type CatalogDeckOptions } from './deck/catalogDeck';
export { seededShuffle } from './deck/seededShuffle';
export {
  createCatalogGame,
  type CreateCatalogGameOptions,
} from './engine/createCatalogGame';
