/**
 * Public card-catalog compatibility API.
 *
 * The visual audit lives in `canonicalCatalog.ts`. This module used to carry
 * a second, older copy of every card and could therefore disagree with the
 * catalog used by the game engine. Keep the historical exports, but expose
 * the exact same immutable definitions everywhere.
 */

import { GAME_CARD_CATALOG } from './canonicalCatalog.js';
import type { CardDefinition } from './types.js';

/** The 143 playable cards, in canonical asset order (card-109 is excluded). */
export const CARD_CATALOG: readonly CardDefinition[] = GAME_CARD_CATALOG;

/** Reference image only — never enters the deck. */
export const MAPS_ASSET_NAME = 'maps.png';

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_CATALOG.find((card) => card.id === id);
}

export function getReviewRequiredCards(): CardDefinition[] {
  return CARD_CATALOG.filter((card) => card.reviewRequired === true);
}
