import { describe, expect, it } from 'vitest';
import { getCardDefinition } from '../cards/catalogApi';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { AUDITED_CARD_IDS_101_144 } from '../cards/audited101144';

describe('Stage 3H canonical visual audit 101-144', () => {
  it('audits every available source image in the final range (106 uses a runtime fallback)', () => {
    expect(AUDITED_CARD_IDS_101_144).toHaveLength(43);
    expect(AUDITED_CARD_IDS_101_144).toContain('card-105');
    expect(AUDITED_CARD_IDS_101_144).not.toContain('card-106');
    expect(AUDITED_CARD_IDS_101_144[AUDITED_CARD_IDS_101_144.length - 1]).toBe('card-144');
  });

  it('keeps exactly 143 playable cards and 19 river cards', () => {
    expect(GAME_CARD_CATALOG).toHaveLength(143);
    expect(GAME_CARD_CATALOG.filter((card) => card.riverCard)).toHaveLength(19);
    expect(GAME_CARD_CATALOG.some((card) => card.id === 'card-106')).toBe(true);
    expect(AUDITED_CARD_IDS_101_144[AUDITED_CARD_IDS_101_144.length - 1]).toBe('card-144');
  });

  it('keeps exactly 143 playable cards and 19 river cards', () => {
    expect(RUNTIME_CARD_CATALOG).toHaveLength(143);
    expect(RUNTIME_CARD_CATALOG.filter((card) => card.riverCard)).toHaveLength(19);
    expect(RUNTIME_CARD_CATALOG.some((card) => card.id === 'card-106')).toBe(true);
  });

  it('restores 105 as the road-to-city tile confirmed by the source image', () => {
    const card = getCardDefinition('card-105');
    expect(card.edges).toEqual({ north:'road', east:'field', south:'city', west:'field' });
    expect(card.topology.roads).toEqual([[0]]);
    expect(card.topology.cities).toEqual([[2]]);
    expect(card.riverCard).not.toBe(true);
  });

  it('records river bridges independently from their roads', () => {
    expect(getCardDefinition('card-108').topology.riverEdges).toEqual([1,3]);
    expect(getCardDefinition('card-108').topology.roads).toEqual([[0,2]]);
    expect(getCardDefinition('card-121').topology.riverEdges).toEqual([0,2]);
    expect(getCardDefinition('card-121').topology.roads).toEqual([[1,3]]);
  });

  it('does not treat internal ponds, gardens, or expansion badges as river/scoring features', () => {
    expect(getCardDefinition('card-096').riverCard).not.toBe(true);
    expect(getCardDefinition('card-114').riverCard).not.toBe(true);
    expect(getCardDefinition('card-117').riverCard).not.toBe(true);
    expect(getCardDefinition('card-126').topology.monastery).not.toBe(true);
    expect(getCardDefinition('card-134').shields).toBe(0);
  });

  it('records visible blue city shields on audited city features', () => {
    for (const id of ['card-117','card-118','card-136','card-144']) {
      const card = getCardDefinition(id);
      expect(card.shields).toBe(1);
      expect(card.topology.cityShields?.reduce((sum, n) => sum + n, 0)).toBe(1);
    }
  });

  it('keeps separate city and road features separate where artwork terminates them', () => {
    expect(getCardDefinition('card-120').topology.roads).toEqual([[0],[2]]);
    expect(getCardDefinition('card-130').topology.cities).toEqual([[1],[3]]);
    expect(getCardDefinition('card-137').topology.cities).toEqual([[0],[2]]);
  });
});
