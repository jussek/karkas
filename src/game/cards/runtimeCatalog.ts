import { GAME_CARD_CATALOG } from './canonicalCatalog';

/** Runtime gameplay catalog — one entry per physical card artwork. */
export const RUNTIME_CARD_CATALOG = GAME_CARD_CATALOG;

/** River set is derived from canonical card metadata; no duplicated magic count. */
export const RUNTIME_RIVER_CARDS = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
export const RIVER_CARD_COUNT = RUNTIME_RIVER_CARDS.length;
export const RIVER_SOURCE_CARD = RUNTIME_RIVER_CARDS.find((card) => card.riverKind === 'start') ?? null;
export const RIVER_END_CARD = RUNTIME_RIVER_CARDS.find((card) => card.riverKind === 'end') ?? null;

/**
 * The audited set contains one three-way fork (card-109). With one source and
 * one forced end, the sum of river half-edges is odd, so one exposed river edge
 * is mathematically unavoidable after every physical river tile has been used.
 * We minimize terminal open river edges to this parity lower bound instead of
 * falsifying card-109 artwork/topology.
 */
export const RIVER_TERMINAL_OPEN_EDGE_COUNT = RUNTIME_RIVER_CARDS.reduce(
  (sum, card) => sum + (card.topology.riverEdges?.length ?? 0),
  0,
) % 2;
