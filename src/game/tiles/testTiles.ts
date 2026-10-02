/**
 * Небольшой набор тестовых плиток — не все 72.
 * Плитки описываются структурированными данными, без изображений.
 *
 * Stage 1.5: каждая из четырёх сторон плитки ЯВНО описана одним из
 * EdgeType ('road' | 'city' | 'field'). Отсутствие типа не используется
 * для обозначения поля — поле указывается как 'field'.
 *
 * Соглашение об id сегментов: 'r0','r1' — дороги; 'c0','c1' — города.
 * Одинаковый id у двух сторон = стороны соединены внутри плитки.
 */

import type { EdgeType, TileDefinition } from '../types/geometry.js';

/** Вспомогательный конструктор «простой» плитки из sides + пар связей. */
function makeTile(
  id: string,
  name: string,
  sides: readonly EdgeType[],
  roadPairs: readonly (readonly [number, number])[] = [],
  cityPairs: readonly (readonly [number, number])[] = [],
  hasMonastery = false,
): TileDefinition {
  if (sides.length !== 4) {
    throw new Error(`Tile ${id}: exactly 4 sides must be described`);
  }

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
    } else if (sides[e] === 'city') {
      const root = find(e);
      let segId = citySegIds.get(root);
      if (!segId) {
        segId = `c${citySegIds.size}`;
        citySegIds.set(root, segId);
      }
      cityEdgeSegments[e] = segId;
      roadEdgeSegments[e] = null;
    } else {
      // field — только геометрия стороны; сегменты полей на Stage 1.5 не моделируются.
      roadEdgeSegments[e] = null;
      cityEdgeSegments[e] = null;
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
/* Все стороны описаны явно: 'road' | 'city' | 'field'.                */
/* ------------------------------------------------------------------ */

/** Стартовая (как в базовой игре): город на всех 4 сторонах, один связный сегмент. */
export const TILE_CITY_ALL = makeTile(
  'T-C-CCCC',
  'City, all four sides (start tile)',
  ['city', 'city', 'city', 'city'],
  [],
  [[0, 1], [1, 2], [2, 3]],
);

/** Дорога прямая N-S, города E/W. */
export const TILE_ROAD_STRAIGHT_NS = makeTile(
  'T-R-NS',
  'Straight road N-S, city E/W',
  ['road', 'city', 'road', 'city'],
  [[0, 2]],
);

/** Дорога с поворотом N-E, города S-W. */
export const TILE_ROAD_CURVE_NE = makeTile(
  'T-R-NE',
  'Curve road N-E, city S-W',
  ['road', 'road', 'city', 'city'],
  [[0, 1]],
);

/** Перекрёсток: дороги N-S и E-W, НЕ соединённые между собой. */
export const TILE_ROAD_CROSSING = makeTile(
  'T-R-X',
  'Road crossing (N-S and E-W not connected)',
  ['road', 'road', 'road', 'road'],
  [[0, 2], [1, 3]],
);

/** Город на двух соседних сторонах N-E (связан), дороги S-W. */
export const TILE_CITY_CORNER_ROADS = makeTile(
  'T-C-CC-RR',
  'City corner N-E, roads S-W',
  ['city', 'city', 'road', 'road'],
  [[2, 3]],
  [[0, 1]],
);

/** Монастырь: все стороны город, монастырь в центре. */
export const TILE_MONASTERY = makeTile(
  'T-M',
  'Monastery surrounded by city edges',
  ['city', 'city', 'city', 'city'],
  [],
  [[0, 1], [1, 2], [2, 3]],
  true,
);

/** Все стороны — дороги, один связный сегмент. */
export const TILE_ROAD_ALL = makeTile(
  'T-R-RRRR',
  'Road on all four sides, connected',
  ['road', 'road', 'road', 'road'],
  [[0, 1], [1, 2], [2, 3]],
);

/** Поле на всех четырёх сторонах (пустая плитка-луг). */
export const TILE_FIELD_ALL = makeTile(
  'T-F-FFFF',
  'Field on all four sides',
  ['field', 'field', 'field', 'field'],
);

/** Поле N-E-S, дорога W (тупик дороги в поле). */
export const TILE_FIELD_WITH_ROAD_END = makeTile(
  'T-F-RW',
  'Field N/E/S, dead-end road from W',
  ['field', 'field', 'field', 'road'],
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
    TILE_FIELD_ALL,
    TILE_FIELD_WITH_ROAD_END,
  ].map((t) => [t.id, t]),
);

export function getTestTile(definitionId: string): TileDefinition {
  const def = TEST_TILES.get(definitionId);
  if (!def) {
    throw new Error(`Unknown tile definition: ${definitionId}`);
  }
  return def;
}
