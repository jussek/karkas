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
 * Runtime game catalog.
 * All surviving source images 001..144 are manually audited.
 * An earlier audit removed 105 by mistake; the user confirmed the intentionally removed
 * river tile is 106. We therefore restore audited 105 and exclude 106, leaving 143 cards.
 * card-096 is corrected here: its blue artwork is an internal pond, not a river edge.
 */
export const RUNTIME_CARD_CATALOG: readonly CardDefinition[] = [
  ...AUDITED_001_050_BASE,
  RESTORED_CARD_105,
]
  .filter((card) => card.id !== 'card-106')
  .map((card) => AUDITED_BY_ID.get(card.id) ?? card)
  .map((card) => card.id === 'card-096'
    ? {
        ...card,
        edges: { north:'road', east:'field', south:'road', west:'field' },
        topology: { roads:[[0,2]], cities:[] },
        riverCard: undefined,
        riverKind: undefined,
      }
    : card)
  .sort((a, b) => a.id.localeCompare(b.id));
