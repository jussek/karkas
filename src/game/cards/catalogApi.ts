import { GAME_CARD_CATALOG } from './canonicalCatalog.js';
import type { CardDefinition } from './types.js';
import type { TileDefinition } from '../types/geometry.js';
import { cardToTileDefinition } from './toTileDefinition.js';

const CARD_BY_ID: ReadonlyMap<string, CardDefinition> = new Map(
  GAME_CARD_CATALOG.map((card) => [card.id, card]),
);

export function getCardDefinition(id: string): CardDefinition {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`Unknown card definition: ${id}`);
  return card;
}

export function getTileDefinition(id: string): TileDefinition {
  return cardToTileDefinition(getCardDefinition(id));
}

export function isVerifiedCard(id: string): boolean {
  return getCardDefinition(id).reviewRequired !== true;
}
