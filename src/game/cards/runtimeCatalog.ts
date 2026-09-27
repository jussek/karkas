import { GAME_CARD_CATALOG as AUDITED_001_050_BASE } from './canonicalCatalog';
import { AUDITED_051_100 } from './audited051100';
import type { CardDefinition } from './types';

const AUDITED_051_100_BY_ID = new Map<string, CardDefinition>(
  AUDITED_051_100.map((card) => [card.id, card]),
);

/**
 * Runtime game catalog.
 * 001..050 come from the first manual audit, 051..100 from the second.
 * 101..144 retain legacy definitions until their visual audit; card-105 remains excluded.
 */
export const RUNTIME_CARD_CATALOG: readonly CardDefinition[] = AUDITED_001_050_BASE.map(
  (card) => AUDITED_051_100_BY_ID.get(card.id) ?? card,
);
