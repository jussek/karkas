/**
 * Небольшой набор тестовых плиток (Этап 1) — не все 72.
 * Плитки описываются структурированными данными, без изображений.
 *
 * Соглашение об id сегментов: 'r0','r1' — дороги; 'c0','c1' — города.
 * Одинаковый id у двух сторон = стороны соединены внутри плитки.
 */

import type { EdgeType, TileDefinition } from '../types/geometry';

/** Вспомогательный конструктор «простой» плитки из sides + пар связей. */
function makeTile(
  id: string,
  name: string,
  sidesStr: readonly ('R' | 'C')[],
  roadPairs: readonly (readonly [number, number])[] = [],
  cityPairs: readonly (readonly [number, number])[] = [],
  hasMonastery = false,
): TileDefinition {
  const sides: EdgeType[] = sidesStr.map((s) => (s === 'R' ? 'road' : 'city'));

  // union-find для склейки сторон в сегменты
  const parent = [0, 1, 2, 3];
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (const [a, b] of [...roadPairs, ...cityPairs]) union(a, b);

  const roadEdgeSegments: (string | null)[] = [];
  const cityEdgeSegments: (string | null)[] = [];
  const roadSegIds = new Map<number, string>();
  const citySegIds = new Map<number, string>();

  for (let e = 0; e < 4; e++) {
    if (sides[e] === 'road') {
      const root = find(e);
      let segId = roadSegIds.get(root);
      if (!segId) {
        segId = `r${roadSegIds.size}`;
        roadSegIds.set(root, segId);
      }
      roadEdgeSegments[e] = segId;
      cityEdgeSegments[e] = null;
    } else {
      const root = find(e);
      let segId = citySegIds.get(root);
      if (!segId) {
        segId = `c${citySegIds.size}`;
        citySegIds.set(root, segId);
      }
      cityEdgeSegments[e] = segId;
      roadEdgeSegments[e] = null;
    }
  }

  return {
    id,
    name,
    sides,
    topology: {
      roadSegments: [...roadSegIds.values()],
      citySegments: [...citySegIds.values()],
      hasMonastery,
      roadEdgeSegments,
      cityEdgeSegments,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Тестовые плитки                                                    */
/* ------------------------------------------------------------------ */

/** Стартовая: город на всех 4 сторонах, один связный сегмент. */
export const TILE_CITY_ALL = makeTile(
  'T-C-CCCC',
  'City, all four sides (start tile)',
  ['C', 'C', 'C', 'C'],
  [],
  [[0, 1], [1, 2], [2, 3]],
);

/** Дорога прямая N-S. */
export const TILE_ROAD_STRAIGHT_NS = makeTile(
  'T-R-NS',
  'Straight road N-S',
  ['R', 'C', 'R', 'C'],
  [[0, 2]],
);

/** Дорога с поворотом N-E. */
export const TILE_ROAD_CURVE_NE = makeTile(
  'T-R-NE',
  'Curve road N-E',
  ['R', 'R', 'C', 'C'],
  [[0, 1]],
);

/** Перекрёсток: дороги N-S и E-W, НЕ соединённые между собой. */
export const TILE_ROAD_CROSSING = makeTile(
  'T-R-X',
  'Road crossing (N-S and E-W not connected)',
  ['R', 'R', 'R', 'R'],
  [[0, 2], [1, 3]],
);

/** Город на двух соседних сторонах N-E (связан), остальные — дороги. */
export const TILE_CITY_CORNER_ROADS = makeTile(
  'T-C-CC-RR',
  'City corner N-E, roads S-W',
  ['C', 'C', 'R', 'R'],
  [[2, 3]],
  [[0, 1]],
);

/** Монастырь: все стороны город, монастырь в центре. */
export const TILE_MONASTERY = makeTile(
  'T-M',
  'Monastery surrounded by city edges',
  ['C', 'C', 'C', 'C'],
  [],
  [[0, 1], [1, 2], [2, 3]],
  true,
);

/** Все стороны — дороги, один связный сегмент. */
export const TILE_ROAD_ALL = makeTile(
  'T-R-RRRR',
  'Road on all four sides, connected',
  ['R', 'R', 'R', 'R'],
  [[0, 1], [1, 2], [2, 3]],
);

/** Реестр всех тестовых шаблонов. */
export const TEST_TILES: ReadonlyMap<string, TileDefinition> = new Map(
  [
    TILE_CITY_ALL,
    TILE_ROAD_STRAIGHT_NS,
    TILE_ROAD_CURVE_NE,
    TILE_ROAD_CROSSING,
    TILE_CITY_CORNER_ROADS,
    TILE_MONASTERY,
    TILE_ROAD_ALL,
  ].map((t) => [t.id, t]),
);

export function getTestTile(definitionId: string): TileDefinition {
  const def = TEST_TILES.get(definitionId);
  if (!def) {
    throw new Error(`Unknown tile definition: ${definitionId}`);
  }
  return def;
}
