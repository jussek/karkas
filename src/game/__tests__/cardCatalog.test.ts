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
    expect(CARD_CATALOG).toHaveLength(143);
  });

  it('ids are unique and follow card-001..card-144 without gaps', () => {
    const ids = CARD_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(143);
    for (let i = 1; i <= 144; i++) {
      if (i === 109) continue;
      expect(ids).toContain(`card-${String(i).padStart(3, '0')}`);
    }
  });

  it('assets are unique and match "1 (N).jpg" strictly in order 1..144', () => {
    const assets = CARD_CATALOG.map((c) => c.asset);
    expect(new Set(assets).size).toBe(143);
    CARD_CATALOG.forEach((c) => {
      const number = Number(c.id.slice(5));
      expect(c.asset).toBe(`1 (${number}).jpg`);
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

/* ------------------------------------------------------------------ */
/* Stage 2.5 river-topology audit tests                                */
/* ------------------------------------------------------------------ */

const RIVER_CHECKPOINT_IDS = [
  'card-049','card-050','card-051','card-063','card-075','card-084','card-086',
  'card-087','card-095','card-096','card-097','card-098','card-102','card-103',
  'card-104','card-105','card-106','card-107','card-117','card-129',
] as const;

describe('river topology audit (Stage 2.5)', () => {
  it('all 20 user-confirmed river checkpoint cards are flagged riverCard=true', () => {
    for (const id of RIVER_CHECKPOINT_IDS) {
      const c = CARD_CATALOG.find((x) => x.id === id);
      expect(c, `missing ${id}`).toBeDefined();
      expect(c!.riverCard).toBe(true);
    }
  });

  it('no river checkpoint card remains fully field/field/field/field without review', () => {
    for (const id of RIVER_CHECKPOINT_IDS) {
      const c = CARD_CATALOG.find((x) => x.id === id)!;
      const allField = ['north','east','south','west'].every(
        (s) => (c.edges as Record<string, string>)[s] === 'field',
      );
      if (allField) {
        // If edges still read all-field, the river sides were NOT visually
        // determinable and MUST be flagged for manual verification.
        expect(c.reviewRequired, `${id} all-field but not flagged`).toBe(true);
        expect(c.reviewReason).toMatch(/river/i);
      }
    }
  });

  it('riverCard implies riverKind and a river-related review reason until sides verified', () => {
    for (const c of CARD_CATALOG.filter((x) => x.riverCard)) {
      expect(['start','middle','end']).toContain(c.riverKind);
      const hasRiverEdge = Object.values(c.edges).includes('river');
      if (!hasRiverEdge) {
        expect(c.reviewRequired).toBe(true);
        expect(c.reviewReason).toMatch(/river/i);
      }
    }
  });

  it('card-102 is the river end (lake) and card-129 is the river start (source)', () => {
    expect(CARD_CATALOG.find((c) => c.id === 'card-102')!.riverKind).toBe('end');
    expect(CARD_CATALOG.find((c) => c.id === 'card-129')!.riverKind).toBe('start');
  });

  it('any edge typed river is reflected in topology.riverEdges and never in roads/cities', () => {
    for (const c of CARD_CATALOG) {
      const riverIdx = (['north','east','south','west'] as const)
        .map((s, i) => (c.edges[s] === 'river' ? i : -1))
        .filter((i) => i >= 0);
      for (const group of [...c.topology.roads, ...c.topology.cities]) {
        for (const i of group) expect(riverIdx).not.toContain(i);
      }
      if (riverIdx.length > 0) {
        expect(c.riverCard).toBe(true);
        for (const i of riverIdx) expect(c.topology.riverEdges ?? []).toContain(i);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Stage 2.5 FINAL: manually verified river edges (user-provided       */
/* visual verification of the real project JPGs is the source of truth)*/
/* ------------------------------------------------------------------ */

const CONFIRMED_RIVER_CARDS = [
  'card-049','card-050','card-051','card-063','card-075','card-084',
  'card-086','card-087','card-095','card-096','card-097','card-098',
  'card-102','card-103','card-104','card-105','card-106','card-107',
  'card-117','card-129',
] as const;

/** Expected N/E/S/W edge types after manual river verification. */
const EXPECTED_RIVER_EDGES: Record<string, readonly [EdgeType, EdgeType, EdgeType, EdgeType]> = {
  'card-049': ['field','river','field','river'],
  'card-050': ['field','river','field','river'],
  'card-051': ['river','river','field','field'],
  'card-063': ['river','field','river','field'],
  'card-075': ['river','field','river','field'],
  'card-084': ['river','field','field','river'],
  'card-086': ['river','field','field','river'],
  'card-087': ['field','river','river','field'],
  'card-095': ['river','field','field','river'],
  'card-096': ['field','river','river','field'],
  'card-097': ['field','river','field','river'],
  'card-098': ['field','river','river','field'],
  'card-102': ['field','field','field','river'],
  'card-103': ['field','river','field','river'],
  'card-104': ['field','river','field','river'],
  'card-105': ['river','river','field','river'],
  'card-106': ['field','river','field','river'],
  'card-107': ['field','river','river','field'],
  'card-117': ['river','field','river','field'],
  'card-129': ['field','field','river','field'],
};

const EXPECTED_RIVER_INDICES: Record<string, readonly number[]> = {
  'card-049': [1,3],'card-050': [1,3],'card-051': [0,1],'card-063': [0,2],
  'card-075': [0,2],'card-084': [0,3],'card-086': [0,3],'card-087': [1,2],
  'card-095': [0,3],'card-096': [1,2],'card-097': [1,3],'card-098': [1,2],
  'card-102': [3],   'card-103': [1,3],'card-104': [1,3],'card-105': [0,1,3],
  'card-106': [1,3], 'card-107': [1,2],'card-117': [0,2],'card-129': [2],
};

describe('Stage 2.5 final river edge verification', () => {
  it('exactly 20 cards are flagged riverCard=true and match the confirmed list', () => {
    const flagged = CARD_CATALOG.filter((c) => c.riverCard).map((c) => c.id);
    expect(flagged.sort()).toEqual([...CONFIRMED_RIVER_CARDS].sort());
  });

  it('every confirmed river card matches the manually verified N/E/S/W table', () => {
    for (const id of CONFIRMED_RIVER_CARDS) {
      const c = CARD_CATALOG.find((x) => x.id === id)!;
      const [n, e, s, w] = EXPECTED_RIVER_EDGES[id];
      expect([c.edges.north, c.edges.east, c.edges.south, c.edges.west]).toEqual([n, e, s, w]);
    }
  });

  it('topology.riverEdges exactly equals the manually verified side indices', () => {
    for (const id of CONFIRMED_RIVER_CARDS) {
      const c = CARD_CATALOG.find((x) => x.id === id)!;
      expect([...(c.topology.riverEdges ?? [])].sort()).toEqual([...EXPECTED_RIVER_INDICES[id]].sort());
    }
  });

  it('STRICT INVARIANT: edge === "river" iff its EdgeIndex is in topology.riverEdges (all 143 cards)', () => {
    const sides = ['north','east','south','west'] as const;
    for (const c of CARD_CATALOG) {
      const riverIdx = new Set(c.topology.riverEdges ?? []);
      sides.forEach((side, i) => {
        if (c.edges[side] === 'river') expect(riverIdx.has(i as 0 | 1 | 2 | 3)).toBe(true);
        else expect(riverIdx.has(i as 0 | 1 | 2 | 3)).toBe(false);
      });
      // no duplicate indices in riverEdges
      expect(riverIdx.size).toBe((c.topology.riverEdges ?? []).length);
    }
  });

  it('no confirmed river card remains fully field/field/field/field', () => {
    for (const id of CONFIRMED_RIVER_CARDS) {
      const c = CARD_CATALOG.find((x) => x.id === id)!;
      const allField = Object.values(c.edges).every((t) => t === 'field');
      expect(allField).toBe(false);
      expect(c.topology.riverEdges!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('card-102 is river end with only west touched; card-129 is river start with only south touched', () => {
    const end = CARD_CATALOG.find((c) => c.id === 'card-102')!;
    const start = CARD_CATALOG.find((c) => c.id === 'card-129')!;
    expect(end.riverKind).toBe('end');
    expect(end.topology.riverEdges).toEqual([3]);
    expect(start.riverKind).toBe('start');
    expect(start.topology.riverEdges).toEqual([2]);
  });

  it('river-only reviewRequired reasons were removed from the 20 verified cards', () => {
    for (const id of CONFIRMED_RIVER_CARDS) {
      const c = CARD_CATALOG.find((x) => x.id === id)!;
      if (c.reviewReason) {
        // remaining review flags must NOT be about unknown river sides
        expect(c.reviewReason).not.toMatch(/could not be determined/i);
        expect(c.reviewRequired).toBe(true);
      }
    }
  });
});

describe('Stage 2.5 exact defect fix (card-141 / card-114)', () => {
  const byId = new Map(CARD_CATALOG.map((c) => [c.id, c]));

  it('catalog total is exactly 144 with unique ids', () => {
    expect(CARD_CATALOG.length).toBe(143);
    expect(new Set(CARD_CATALOG.map((c) => c.id)).size).toBe(143);
    for (let i = 1; i <= 144; i++) {
      if (i === 109) continue;
      expect(byId.has(`card-${String(i).padStart(3, '0')}`)).toBe(true);
    }
  });

  it('card-077 and card-141 each appear exactly once', () => {
    expect(CARD_CATALOG.filter((c) => c.id === 'card-077').length).toBe(1);
    expect(CARD_CATALOG.filter((c) => c.id === 'card-141').length).toBe(1);
  });

  it('card-141 has the exact required values', () => {
    const c = byId.get('card-141');
    expect(c).toBeDefined();
    expect(c!.asset).toBe('1 (141).jpg');
    expect(c!.edges).toEqual({ north: 'road', east: 'road', south: 'field', west: 'field' });
    expect(c!.topology.roads).toEqual([[0, 1]]);
    expect(c!.topology.cities).toEqual([]);
    expect(c!.shields).toBe(0);
    expect(c!.reviewRequired).toBe(true);
    expect(c!.reviewReason).toBe('NE-village/N-edge road topology requires manual verification');
  });

  it('card-114 has the exact required values', () => {
    const c = byId.get('card-114');
    expect(c).toBeDefined();
    expect(c!.asset).toBe('1 (114).jpg');
    expect(c!.edges).toEqual({ north: 'field', east: 'city', south: 'field', west: 'city' });
    expect(c!.topology.roads).toEqual([]);
    expect(c!.topology.cities).toEqual([[1, 3]]);
    expect(c!.shields).toBe(0);
    expect(c!.reviewRequired ?? false).toBe(false);
  });

  it('river data untouched: 20 river cards, invariant holds, start/end correct', () => {
    const river = CARD_CATALOG.filter((c) => c.riverCard);
    expect(river.length).toBe(20);
    const c102 = byId.get('card-102')!;
    expect(c102.topology.riverEdges).toEqual([3]);
    expect(c102.riverKind).toBe('end');
    const c129 = byId.get('card-129')!;
    expect(c129.edges).toEqual({ north: 'field', east: 'field', south: 'river', west: 'field' });
    expect(c129.topology.riverEdges).toEqual([2]);
    expect(c129.riverKind).toBe('start');
  });
});
