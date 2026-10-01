/**
 * Stage 3E — Semantic tests for the pure tile render model.
 *
 * Synthetic TileDefinitions (never catalog edits) prove:
 *  - road/city group reconstruction from edge-segment arrays
 *  - distinct groups stay visually/logically distinct
 *  - monastery flag preserved exactly
 *  - rotation delegated to the engine's rotateTile()
 *  - deterministic decoration seeds
 */

import { describe, expect, it } from 'vitest';
import type {
  EdgeIndex,
  EdgeType,
  Rotation,
  TileDefinition,
} from '../../../game/types/geometry';
import { GAME_CARD_CATALOG } from '../../../game/cards/canonicalCatalog';
import { cardToTileDefinition } from '../../../game/cards/toTileDefinition';
import {
  createRotatedTileRenderModel,
  createTileRenderModel,
  getRiverEdgesForCard,
  groupKey,
} from '../tileRenderModel';

/* ------------------------------------------------------------------ */
/* Synthetic definition builder                                        */
/* ------------------------------------------------------------------ */

function makeDef(
  id: string,
  opts: {
    roads?: readonly (readonly EdgeIndex[])[];
    cities?: readonly (readonly EdgeIndex[])[];
    sides?: readonly EdgeType[];
    monastery?: boolean;
  },
): TileDefinition {
  const roads = opts.roads ?? [];
  const cities = opts.cities ?? [];
  const roadEdgeSegments: (string | null)[] = [null, null, null, null];
  roads.forEach((edges, i) => {
    for (const e of edges) roadEdgeSegments[e] = `road:${i}`;
  });
  const cityEdgeSegments: (string | null)[] = [null, null, null, null];
  cities.forEach((edges, i) => {
    for (const e of edges) cityEdgeSegments[e] = `city:${i}`;
  });
  return {
    id,
    name: id,
    sides: opts.sides ?? ['field', 'field', 'field', 'field'],
    topology: {
      roadSegments: roads.map((_, i) => `road:${i}`),
      citySegments: cities.map((_, i) => `city:${i}`),
      hasMonastery: opts.monastery === true,
      roadEdgeSegments,
      cityEdgeSegments,
    },
  };
}

const keysOf = (features: readonly { edges: readonly EdgeIndex[] }[]) =>
  features.map((f) => groupKey(f.edges));

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

describe('render model — road grouping', () => {
  it('[[0,2]] produces ONE road feature touching N and S', () => {
    const m = createTileRenderModel(makeDef('t-ns', { roads: [[0, 2]] }));
    expect(m.roads).toHaveLength(1);
    expect(groupKey(m.roads[0].edges)).toBe('0,2');
  });

  it('[[0,1]] produces ONE road feature touching N and E', () => {
    const m = createTileRenderModel(makeDef('t-ne', { roads: [[0, 1]] }));
    expect(m.roads).toHaveLength(1);
    expect(groupKey(m.roads[0].edges)).toBe('0,1');
  });

  it('[[0],[2]] produces TWO DISTINCT road features (N and S)', () => {
    const m = createTileRenderModel(makeDef('t-split', { roads: [[0], [2]] }));
    expect(m.roads).toHaveLength(2);
    expect(keysOf(m.roads)).toEqual(['0', '2']);
    // distinct ids AND distinct semantic paths
    expect(m.roads[0].id).not.toBe(m.roads[1].id);
    expect(m.roads[0].path).not.toBe(m.roads[1].path);
  });

  it('[[0,1,3]] produces ONE three-edge feature with exact membership', () => {
    const m = createTileRenderModel(makeDef('t-junction', { roads: [[0, 1, 3]] }));
    expect(m.roads).toHaveLength(1);
    expect([...m.roads[0].edges].sort()).toEqual([0, 1, 3]);
  });

  it('[[0,1],[2,3]] produces two independent features: A={N,E}, B={S,W}', () => {
    const m = createTileRenderModel(
      makeDef('t-disconnected', { roads: [[0, 1], [2, 3]] }),
    );
    expect(m.roads).toHaveLength(2);
    expect(groupKey(m.roads[0].edges)).toBe('0,1');
    expect(groupKey(m.roads[1].edges)).toBe('2,3');
  });
});

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

describe('render model — city grouping', () => {
  it('[[0,1]] produces ONE connected city feature', () => {
    const m = createTileRenderModel(makeDef('t-city-ne', { cities: [[0, 1]] }));
    expect(m.cities).toHaveLength(1);
    expect(groupKey(m.cities[0].edges)).toBe('0,1');
  });

  it('[[0],[2]] produces TWO independent cities', () => {
    const m = createTileRenderModel(makeDef('t-city-2', { cities: [[0], [2]] }));
    expect(m.cities).toHaveLength(2);
    expect(keysOf(m.cities)).toEqual(['0', '2']);
    expect(m.cities[0].id).not.toBe(m.cities[1].id);
  });
});

/* ------------------------------------------------------------------ */
/* Segment-group reconstruction contract                               */
/* ------------------------------------------------------------------ */

describe('render model — segment reconstruction', () => {
  it('same segment id on multiple edges => same RenderFeature', () => {
    const def = makeDef('t-same', { roads: [[0, 2]] });
    const m = createTileRenderModel(def);
    expect(m.roads).toHaveLength(1);
    expect([...m.roads[0].edges]).toEqual([0, 2]);
  });

  it('different segment ids => different RenderFeatures', () => {
    const def = makeDef('t-diff', { roads: [[0], [2]] });
    const m = createTileRenderModel(def);
    expect(m.roads).toHaveLength(2);
    expect(def.topology.roadEdgeSegments[0]).not.toBe(
      def.topology.roadEdgeSegments[2],
    );
  });

  it('group ordering is deterministic and follows roadSegments order', () => {
    const def = makeDef('t-order', { roads: [[2, 3], [0, 1]] });
    const first = createTileRenderModel(def);
    const second = createTileRenderModel(def);
    expect(keysOf(first.roads)).toEqual(['2,3', '0,1']);
    expect(second.roads.map((r) => r.id)).toEqual(['road-0', 'road-1']);
    expect(keysOf(second.roads)).toEqual(keysOf(first.roads));
  });

  it('edges within a group keep ascending edge order (N,E,S,W scan)', () => {
    const m = createTileRenderModel(makeDef('t-asc', { roads: [[0, 1, 3]] }));
    expect([...m.roads[0].edges]).toEqual([0, 1, 3]);
  });
});

/* ------------------------------------------------------------------ */
/* Monastery                                                           */
/* ------------------------------------------------------------------ */

describe('render model — monastery', () => {
  it('hasMonastery=false preserved', () => {
    const m = createTileRenderModel(makeDef('t-mono-off', {}));
    expect(m.monastery).toBe(false);
  });

  it('hasMonastery=true preserved', () => {
    const m = createTileRenderModel(
      makeDef('t-mono-on', { monastery: true }),
    );
    expect(m.monastery).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Deterministic seeds                                                 */
/* ------------------------------------------------------------------ */

describe('render model — determinism', () => {
  it('same id yields identical model (deep equal), repeated calls stable', () => {
    const def = makeDef('card-seed', { roads: [[0, 2]], cities: [[1]] });
    const a = createTileRenderModel(def);
    const b = createTileRenderModel(def);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('decoration seed derives from base id (rotation suffix stripped)', () => {
    const plain = createTileRenderModel(makeDef('card-x', {}));
    const suffixed = createTileRenderModel(makeDef('card-x@90', {}));
    expect(suffixed.decorationSeed).toBe(plain.decorationSeed);
  });

  it('definition is never mutated', () => {
    const def = makeDef('card-immutable', { roads: [[0, 1]], monastery: true });
    const snapshot = JSON.parse(JSON.stringify(def));
    createTileRenderModel(def);
    expect(def).toEqual(snapshot);
  });
});

/* ------------------------------------------------------------------ */
/* Rotation (delegated to engine rotateTile)                           */
/* ------------------------------------------------------------------ */

describe('render model — rotation contract', () => {
  const def = makeDef('rot-road', { roads: [[0]], sides: ['road', 'field', 'field', 'field'] });

  const rotatedRoadKeys = (rotation: Rotation) =>
    keysOf(createRotatedTileRenderModel(def, rotation).roads);

  it('N at rotation 0 stays N', () => expect(rotatedRoadKeys(0)).toEqual(['0']));
  it('N at rotation 90 becomes E', () => expect(rotatedRoadKeys(90)).toEqual(['1']));
  it('N at rotation 180 becomes S', () => expect(rotatedRoadKeys(180)).toEqual(['2']));
  it('N at rotation 270 becomes W', () => expect(rotatedRoadKeys(270)).toEqual(['3']));

  it('E becomes S under rotation 90', () => {
    const east = makeDef('rot-east', { roads: [[1]] });
    expect(keysOf(createRotatedTileRenderModel(east, 90).roads)).toEqual(['2']);
  });

  it('multi-edge group rotates as a unit (N+E -> E+S at 90)', () => {
    const corner = makeDef('rot-corner', { roads: [[0, 1]] });
    expect(keysOf(createRotatedTileRenderModel(corner, 90).roads)).toEqual(['1,2']);
  });

  it('city feature rotates consistently too (N -> E at 90)', () => {
    const city = makeDef('rot-city', { cities: [[0]] });
    expect(keysOf(createRotatedTileRenderModel(city, 90).cities)).toEqual(['1']);
  });
});

/* ------------------------------------------------------------------ */
/* River bridge (read-only join against catalog)                       */
/* ------------------------------------------------------------------ */

describe('render model — verified real river cards', () => {
  it('card-106 exposes its single closing river edge', () => {
    const def = cardToTileDefinition(GAME_CARD_CATALOG.find((c) => c.id === 'card-106')!);
    const m = createTileRenderModel(def);
    expect(m.rivers).toHaveLength(1);
    expect(groupKey(m.rivers[0].edges)).toBe('3');
    expect(getRiverEdgesForCard('card-106')).toEqual([3]);
  });

  it('card-133 exposes river edge [2] (source)', () => {
    const def = cardToTileDefinition(GAME_CARD_CATALOG.find((c) => c.id === 'card-133')!);
    const m = createTileRenderModel(def);
    expect(m.rivers).toHaveLength(1);
    expect(groupKey(m.rivers[0].edges)).toBe('2');
  });

  it('card-105 is a normal road/city tile, not a river tile', () => {
    const def = cardToTileDefinition(GAME_CARD_CATALOG.find((c) => c.id === 'card-105')!);
    const m = createTileRenderModel(def);
    expect(m.rivers).toHaveLength(0);
    expect(m.roads).toHaveLength(1);
    expect(m.cities).toHaveLength(1);
  });

  it('non-river definitions have no rivers and safe explicit test path exists via geometry helpers', () => {
    const m = createTileRenderModel(makeDef('no-river', {}));
    expect(m.rivers).toHaveLength(0);
    expect(getRiverEdgesForCard('no-river')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Catalog-wide audit                                                  */
/* ------------------------------------------------------------------ */

describe('render model — catalog-wide audit (all cards)', () => {
  it('every runtime catalog card renders without throwing; count is exactly 143', () => {
    expect(GAME_CARD_CATALOG).toHaveLength(143);
    for (const card of GAME_CARD_CATALOG) {
      const def = cardToTileDefinition(card);
      expect(() => createTileRenderModel(def)).not.toThrow();
    }
  });

  it('road grouping equals TileDefinition road grouping for every card', () => {
    for (const card of GAME_CARD_CATALOG) {
      const def = cardToTileDefinition(card);
      const m = createTileRenderModel(def);
      expect(keysOf(m.roads), card.id).toEqual(card.topology.roads.map(groupKey));
    }
  });

  it('city grouping equals TileDefinition city grouping for every card', () => {
    for (const card of GAME_CARD_CATALOG) {
      const def = cardToTileDefinition(card);
      const m = createTileRenderModel(def);
      expect(keysOf(m.cities), card.id).toEqual(card.topology.cities.map(groupKey));
    }
  });

  it('monastery flag preserved exactly for every card', () => {
    for (const card of GAME_CARD_CATALOG) {
      const def = cardToTileDefinition(card);
      const m = createTileRenderModel(def);
      expect(m.monastery, card.id).toBe(card.topology.monastery === true);
    }
  });

  it('river render endpoints equal catalog topology.riverEdges for every river card', () => {
    let riverCards = 0;
    for (const card of GAME_CARD_CATALOG) {
      const declared = card.topology.riverEdges ?? [];
      if (declared.length === 0) continue;
      riverCards++;
      const def = cardToTileDefinition(card);
      const m = createTileRenderModel(def);
      expect(m.rivers, card.id).toHaveLength(1);
      expect(groupKey(m.rivers[0].edges), card.id).toBe(groupKey(declared));
    }
    expect(riverCards).toBeGreaterThan(0);
  });
});
