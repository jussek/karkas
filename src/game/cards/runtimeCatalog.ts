/** @deprecated Import GAME_CARD_CATALOG from canonicalCatalog in runtime code. */
export { GAME_CARD_CATALOG as RUNTIME_CARD_CATALOG } from './canonicalCatalog';
import { GAME_CARD_CATALOG as AUDITED_001_050_BASE } from './canonicalCatalog';
import { AUDITED_051_100 } from './audited051100';
import { AUDITED_101_144 } from './audited101144';
import type { CardDefinition } from './types';

const AUDITED_BY_ID = new Map<string, CardDefinition>([
  ...AUDITED_051_100,
  ...AUDITED_101_144,
].map((card) => [card.id, card]));

const RESTORED_CARD_105 = AUDITED_101_144.find((card) => card.id === 'card-105');
if (!RESTORED_CARD_105) throw new Error('Audited card-105 is missing');

/**
 * Runtime game catalog after the complete visual pass.
 * The earlier branch removed 105 by mistake; the user confirmed 106 is the deleted river tile.
 * 091 is the one-edge river source and 133 is the one-edge river end.
 * 096 contains an internal pond and is not a river card.
 */
export const RUNTIME_CARD_CATALOG: readonly CardDefinition[] = [
  ...AUDITED_001_050_BASE,
  RESTORED_CARD_105,
]
  .filter((card) => card.id !== 'card-106')
  .map((card) => AUDITED_BY_ID.get(card.id) ?? card)
  .map((card): CardDefinition => {
    if (card.id === 'card-091') return {
      ...card,
      edges: { north:'field', east:'field', south:'river', west:'field' },
      topology: { roads:[], cities:[], riverEdges:[2] },
      shields: 0,
      riverCard: true,
      riverKind: 'start',
    };
    if (card.id === 'card-096') return {
      ...card,
      edges: { north:'road', east:'field', south:'road', west:'field' },
      topology: { roads:[[0,2]], cities:[] },
      shields: 0,
      riverCard: undefined,
      riverKind: undefined,
    };
    return card;
  })
  .sort((a, b) => a.id.localeCompare(b.id));
