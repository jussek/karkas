import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { getCardDefinition } from '../cards/catalogApi';

export interface CatalogDeckOptions {
  startCardId: string;
  includeReviewRequired?: boolean;
}

export function createCatalogDeck(options: CatalogDeckOptions): string[] {
  getCardDefinition(options.startCardId);

  return RUNTIME_CARD_CATALOG.filter(
    (card) =>
      card.id !== options.startCardId &&
      (options.includeReviewRequired === true || card.reviewRequired !== true),
  ).map((card) => card.id);
}
