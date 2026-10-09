import { describe, expect, it } from 'vitest';

import { CARD_CATALOG, MAPS_ASSET_NAME, getCardById } from '../cards/catalog';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import type { CardDefinition } from '../cards/types';

const SIDES = ['north', 'east', 'south', 'west'] as const;
const EDGE_TYPES = new Set(['field', 'road', 'city', 'river']);

function edgeType(card: CardDefinition, edge: number): string {
  return card.edges[SIDES[edge]];
}

function flattened(groups: readonly (readonly number[])[]): number[] {
  return groups.flatMap((group) => [...group]);
}

describe('public card catalog', () => {
  it('is the same audited catalog used by the game engine', () => {
    expect(CARD_CATALOG).toBe(GAME_CARD_CATALOG);
    expect(CARD_CATALOG).toHaveLength(143);
    expect(MAPS_ASSET_NAME).toBe('maps.png');
  });

  it('contains every playable asset exactly once and excludes card-109', () => {
    const ids = CARD_CATALOG.map((card) => card.id);
    const assets = CARD_CATALOG.map((card) => card.asset);
    expect(new Set(ids).size).toBe(143);
    expect(new Set(assets).size).toBe(143);
    for (let number = 1; number <= 144; number += 1) {
      if (number === 109) continue;
      const id = `card-${String(number).padStart(3, '0')}`;
      expect(ids).toContain(id);
      expect(CARD_CATALOG.find((card) => card.id === id)?.asset).toBe(
        `1 (${number}).jpg`,
      );
    }
    expect(ids).not.toContain('card-109');
  });

  it('covers every terrain edge exactly once in its structured topology', () => {
    for (const card of CARD_CATALOG) {
      expect(Object.keys(card.edges).sort()).toEqual([...SIDES].sort());
      const roads = flattened(card.topology.roads);
      const cities = flattened(card.topology.cities);
      const rivers = [...(card.topology.riverEdges ?? [])];

      for (let edge = 0; edge < 4; edge += 1) {
        const terrain = edgeType(card, edge);
        expect(EDGE_TYPES.has(terrain), `${card.id} edge ${edge}`).toBe(true);
        const count = (values: readonly number[]) =>
          values.filter((value) => value === edge).length;
        expect(count(roads), `${card.id} road edge ${edge}`).toBe(
          terrain === 'road' ? 1 : 0,
        );
        expect(count(cities), `${card.id} city edge ${edge}`).toBe(
          terrain === 'city' ? 1 : 0,
        );
        expect(count(rivers), `${card.id} river edge ${edge}`).toBe(
          terrain === 'river' ? 1 : 0,
        );
      }

      for (const group of [...card.topology.roads, ...card.topology.cities]) {
        expect(group.length, `${card.id} empty feature`).toBeGreaterThan(0);
        expect(new Set(group).size, `${card.id} duplicate feature edge`).toBe(
          group.length,
        );
      }
      expect(new Set(rivers).size, `${card.id} duplicate river edge`).toBe(
        rivers.length,
      );
      if (card.topology.cityShields !== undefined) {
        expect(card.topology.cityShields).toHaveLength(card.topology.cities.length);
      }
    }
  });

  it('keeps the complete river sequence and its endpoints in one source of truth', () => {
    const riverCards = CARD_CATALOG.filter((card) => card.riverCard === true);
    expect(riverCards).toHaveLength(19);
    expect(riverCards.filter((card) => card.riverKind === 'start').map((card) => card.id)).toEqual([
      'card-133',
    ]);
    expect(riverCards.filter((card) => card.riverKind === 'end').map((card) => card.id)).toEqual([
      'card-106',
    ]);
    expect(riverCards.filter((card) => card.riverKind === 'middle')).toHaveLength(17);

    for (const card of CARD_CATALOG) {
      const riverEdges = card.topology.riverEdges ?? [];
      expect(card.riverCard === true).toBe(riverEdges.length > 0);
      expect(card.riverCard === true).toBe(
        Object.values(card.edges).some((edge) => edge === 'river'),
      );
    }
  });

  it('resolves lookups from the audited definitions, including multi-feature cards', () => {
    expect(getCardById('card-015')?.topology.cities).toEqual([
      [0, 3],
      [1, 2],
    ]);
    expect(getCardById('card-093')?.topology.cities).toEqual([
      [0],
      [1, 2],
    ]);
    expect(getCardById('card-120')?.topology.roads).toEqual([
      [0],
      [2],
    ]);
    expect(getCardById('card-109')).toBeUndefined();
  });
});
