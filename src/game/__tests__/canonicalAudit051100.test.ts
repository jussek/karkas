import { describe, expect, it } from 'vitest';
import { AUDITED_051_100 } from '../cards/audited051100';

describe('Stage 3H canonical visual audit 051..100', () => {
  it('contains every card from 051 through 100 exactly once', () => {
    expect(AUDITED_051_100).toHaveLength(50);
    expect(new Set(AUDITED_051_100.map((card) => card.id)).toHaveLength(50);
    expect(AUDITED_051_100[0].id).toBe('card-051');
    expect(AUDITED_051_100[49].id).toBe('card-100');
  });

  it('records visually confirmed scoring shields and ignores expansion badges', () => {
    const shieldCounts = new Map(AUDITED_051_100.map((card) => [card.id, card.shields]));
    expect(shieldCounts.get('card-056')).toBe(1);
    expect(shieldCounts.get('card-064')).toBe(1);
    expect(shieldCounts.get('card-080')).toBe(1);
    expect(shieldCounts.get('card-082')).toBe(2);
    expect(shieldCounts.get('card-093')).toBe(1);
    expect(shieldCounts.get('card-098')).toBe(1);
    expect(shieldCounts.get('card-099')).toBe(1);
  });

  it('preserves bridges as independent road and river features', () => {
    for (const id of ['card-067', 'card-079']) {
      const card = AUDITED_051_100.find((item) => item.id === id)!;
      expect(card.topology.riverEdges).toEqual([0, 2]);
      expect(card.topology.roads).toEqual([[1, 3]]);
    }
  });

  it('marks monasteries visible in this block', () => {
    for (const id of ['card-063', 'card-073', 'card-081', 'card-097']) {
      expect(AUDITED_051_100.find((item) => item.id === id)?.topology.monastery).toBe(true);
    }
  });
});
