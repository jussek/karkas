import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { createCatalogDeck } from '../deck/catalogDeck';
import { seededShuffle } from '../deck/seededShuffle';
import type { GameState, Player } from '../types/state';
import { createGame } from './gameEngine';

export interface CreateCatalogGameOptions {
  gameId: string;
  players: Player[];
  startCardId: string;
  seed: number;
  includeReviewRequired?: boolean;
}

export function createCatalogGame(options: CreateCatalogGameOptions): GameState {
  const startCard = getCardDefinition(options.startCardId);
  if (startCard.reviewRequired === true && options.includeReviewRequired !== true) {
    throw new Error(`Start card requires review: ${options.startCardId}`);
  }

  const deck = createCatalogDeck({
    startCardId: options.startCardId,
    includeReviewRequired: options.includeReviewRequired,
  });
  const shuffledDeck = seededShuffle(deck, options.seed);

  return createGame({
    gameId: options.gameId,
    players: options.players,
    deck: shuffledDeck,
    getDefinition: getTileDefinition,
    startTile: {
      definitionId: options.startCardId,
      position: { x: 0, y: 0 },
    },
  });
}
