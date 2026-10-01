import { describe, expect, it } from 'vitest';
import { AUDITED_051_100 } from '../cards/audited051100';

describe('canonical visual audit 051..100', () => {
  it('contains every card from 051 through 100 exactly once', () => {
    expect(AUDITED_051_100).toHaveLength(50);
    expect(new Set(AUDITED_051_100.map((card) => card.id)).size).toBe(50);
    expect(AUDITED_051_100[0].id).toBe('card-051');
    expect(AUDITED_051_100[49].id).toBe('card-100');
  });

  it('records visually confirmed shields as catalog data only', () => {
    const shieldCounts = new Map(AUDITED_051_100.map((card) => [card.id, card.shields]));
    expect(shieldCounts.get('card-056')).toBe(1);
    expect(shieldCounts.get('card-064')).toBe(1);
    expect(shieldCounts.get('card-080')).toBe(1);
    expect(shieldCounts.get('card-082')).toBe(2);
    expect(shieldCounts.get('card-093')).toBe(1);
    expect(shieldCounts.get('card-098')).toBe(1);
    expect(shieldCounts.get('card-099')).toBe(1);
  });

  it('preserves card-067 crossing road and corrected card-079 road/city independently of river', () => {
    const card067 = AUDITED_051_100.find((item) => item.id === 'card-067')!;
    expect(card067.topology.riverEdges).toEqual([0, 2]);
    expect(card067.topology.roads).toEqual([[1, 3]]);

    const card079 = AUDITED_051_100.find((item) => item.id === 'card-079')!;
    expect(card079.edges).toEqual({ north: 'river', east: 'road', south: 'river', west: 'city' });
    expect(card079.topology.riverEdges).toEqual([0, 2]);
    expect(card079.topology.roads).toEqual([[1]]);
    expect(card079.topology.cities).toEqual([[3]]);
  });

  it('keeps card-096 as land despite the decorative internal pond', () => {
    const card096 = AUDITED_051_100.find((item) => item.id === 'card-096')!;
    expect(card096.riverCard).not.toBe(true);
    expect(card096.edges).toEqual({ north: 'road', east: 'field', south: 'road', west: 'field' });
    expect(card096.topology.roads).toEqual([[0, 2]]);
  });

  it('marks monasteries visible in this block', () => {
    for (const id of ['card-063', 'card-073', 'card-081', 'card-097']) {
      expect(AUDITED_051_100.find((item) => item.id === id)?.topology.monastery).toBe(true);
    }
  });
});
