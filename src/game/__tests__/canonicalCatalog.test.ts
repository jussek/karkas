import { describe, expect, it } from 'vitest';
import { AUDITED_CARD_IDS_001_050, GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { getCardDefinition } from '../cards/catalogApi';

describe('canonical visual audit 001-050', () => {
  it('keeps all 143 playable physical cards in the canonical/runtime catalog', () => {
    expect(GAME_CARD_CATALOG).toHaveLength(143);
    expect(RUNTIME_CARD_CATALOG).toHaveLength(143);
    expect(GAME_CARD_CATALOG.some((card) => card.id === 'card-091')).toBe(true);
    expect(GAME_CARD_CATALOG.some((card) => card.id === 'card-105')).toBe(true);
    expect(GAME_CARD_CATALOG.some((card) => card.id === 'card-106')).toBe(true);
    expect(getCardDefinition('card-105').asset).toBe('1 (105).jpg');
    expect(getCardDefinition('card-106').riverKind).toBe('end');
  });

  it('marks the complete first audit batch', () => {
    expect(AUDITED_CARD_IDS_001_050).toHaveLength(50);
    expect(AUDITED_CARD_IDS_001_050[0]).toBe('card-001');
    expect(AUDITED_CARD_IDS_001_050[49]).toBe('card-050');
    for (const id of AUDITED_CARD_IDS_001_050) expect(getCardDefinition(id).reviewRequired).not.toBe(true);
  });

  it('encodes user-confirmed card 009 as a west-to-south road', () => {
    const card = getCardDefinition('card-009');
    expect(card.edges).toEqual({ north: 'field', east: 'field', south: 'road', west: 'road' });
    expect(card.topology.roads).toEqual([[2, 3]]);
  });

  it('encodes user-confirmed card 021 as monastery plus north city', () => {
    const card = getCardDefinition('card-021');
    expect(card.edges.north).toBe('city');
    expect(card.topology.cities).toEqual([[0]]);
    expect(card.topology.monastery).toBe(true);
    expect(card.topology.roads).toEqual([]);
  });

  it('keeps crossroads as independent road features', () => {
    expect(getCardDefinition('card-010').topology.roads).toEqual([[0], [1], [3]]);
    expect(getCardDefinition('card-018').topology.roads).toEqual([[0], [1], [2]]);
    expect(getCardDefinition('card-023').topology.roads).toEqual([[1, 3], [0]]);
    expect(getCardDefinition('card-026').topology.roads).toEqual([[2, 3]]);
  });

  it('keeps visually separate cities separate', () => {
    expect(getCardDefinition('card-015').topology.cities).toEqual([[0, 3], [1, 2]]);
    expect(getCardDefinition('card-034').topology.cities).toEqual([[1], [3]]);
    expect(getCardDefinition('card-037').topology.cities).toEqual([[0, 1], [2]]);
    expect(getCardDefinition('card-040').topology.cities).toEqual([[0], [1, 2]]);
  });

  it('records visual shields without changing the scoring rule', () => {
    const shieldCards = ['card-016', 'card-028', 'card-029', 'card-038', 'card-043', 'card-050'];
    for (const id of shieldCards) {
      const card = getCardDefinition(id);
      expect(card.shields).toBe(1);
      expect(card.topology.cityShields?.reduce((sum, count) => sum + count, 0)).toBe(1);
    }
  });

  it('records monasteries in the first 50 without treating decorative ruins as monasteries', () => {
    expect(getCardDefinition('card-021').topology.monastery).toBe(true);
    expect(getCardDefinition('card-041').topology.monastery).toBe(true);
    expect(getCardDefinition('card-018').topology.monastery).not.toBe(true);
  });
});
