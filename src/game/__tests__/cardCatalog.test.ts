/**
 * Stage 2.5 — Card catalog integrity tests.
 * Проверяют каталог реальных ассетов проекта (1 (1).jpg … 1 (144).jpg):
 * полноту, уникальность, валидность edges/topology, отсутствие rotation-данных
 * и отсутствие maps.png в каталоге/деке.
 */
import { describe, it, expect } from 'vitest';
import { CARD_CATALOG, MAPS_ASSET_NAME } from '../cards/catalog';
import { MAPS_ASSET, CARD_SIDES } from '../cards/types';
import type { CardDefinition } from '../cards/types';
import type { EdgeType } from '../types/geometry';

const VALID_EDGE_TYPES: EdgeType[] = ['field', 'road', 'city', 'river'];

describe('card catalog completeness', () => {
  it('contains exactly 144 card definitions', () => {
    expect(CARD_CATALOG).toHaveLength(144);
  });

  it('ids are unique and follow card-001..card-144 without gaps', () => {
    const ids = CARD_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(144);
    for (let i = 1; i <= 144; i++) {
      expect(ids).toContain(`card-${String(i).padStart(3, '0')}`);
    }
  });

  it('assets are unique and match "1 (N).jpg" strictly in order 1..144', () => {
    const assets = CARD_CATALOG.map((c) => c.asset);
    expect(new Set(assets).size).toBe(144);
    CARD_CATALOG.forEach((c, idx) => {
      expect(c.asset).toBe(`1 (${idx + 1}).jpg`);
    });
  });

  it('maps.png is not a card and never appears in the catalog', () => {
    expect(CARD_CATALOG.some((c) => c.asset === MAPS_ASSET)).toBe(false);
    expect(MAPS_ASSET_NAME).toBe('maps.png');
    expect(CARD_CATALOG.some((c) => c.asset === MAPS_ASSET_NAME)).toBe(false);
  });
});

describe('card catalog structure', () => {
  it('every card has exactly four named edges with valid EdgeType values', () => {
    for (const c of CARD_CATALOG) {
      const keys = Object.keys(c.edges).sort();
      expect(keys).toEqual([...CARD_SIDES].sort());
      for (const side of CARD_SIDES) {
        expect(VALID_EDGE_TYPES).toContain(c.edges[side]);
      }
    }
  });

  it('topology references only valid EdgeIndex values (0..3)', () => {
    const checkGroup = (g: readonly number[]) => {
      for (const idx of g) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(3);
        expect(Number.isInteger(idx)).toBe(true);
      }
    };
    for (const c of CARD_CATALOG) {
      for (const road of c.topology.roads) checkGroup(road);
      for (const city of c.topology.cities) checkGroup(city);
      if (c.topology.riverEdges) checkGroup(c.topology.riverEdges);
    }
  });

  it('topology edge groups agree with declared edge types', () => {
    const byIndex = (c: CardDefinition, i: number): EdgeType =>
      [c.edges.north, c.edges.east, c.edges.south, c.edges.west][i] as EdgeType;
    for (const c of CARD_CATALOG) {
      for (const road of c.topology.roads) {
        for (const i of road) expect(byIndex(c, i)).toBe('road');
      }
      for (const city of c.topology.cities) {
        for (const i of city) expect(byIndex(c, i)).toBe('city');
      }
      for (const i of c.topology.riverEdges ?? []) {
        expect(byIndex(c, i)).toBe('river');
      }
    }
  });

  it('no rotation data is encoded in the catalog (canonical orientation only)', () => {
    const raw = JSON.stringify(CARD_CATALOG);
    expect(raw).not.toMatch(/rotation/i);
    // no rotated duplicate ids like card-001-90 / -180 / -270
    for (const c of CARD_CATALOG) {
      expect(c.id).toMatch(/^card-\d{3}$/);
      expect(c.asset).toMatch(/^1 \(\d{1,3}\)\.jpg$/);
    }
  });

  it('reviewRequired cards carry a reviewReason', () => {
    for (const c of CARD_CATALOG) {
      if (c.reviewRequired) {
        expect(typeof c.reviewReason).toBe('string');
        expect((c.reviewReason ?? '').length).toBeGreaterThan(0);
      }
    }
  });

  it('shields count is a non-negative integer when present', () => {
    for (const c of CARD_CATALOG) {
      if (c.shields !== undefined) {
        expect(Number.isInteger(c.shields)).toBe(true);
        expect(c.shields).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
