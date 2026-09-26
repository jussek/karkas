import { describe, expect, it } from 'vitest';
import { areEdgesCompatible, getAdjacentPositions, getTileEdges } from '../engine/geometry';
import { isLegalTilePlacement } from '../rules/placement';
import type { PlacementCheckContext } from '../rules/placement';
import {
  TILE_CITY_ALL,
  TILE_MONASTERY,
  TILE_ROAD_CURVE_NE,
  TILE_ROAD_STRAIGHT_NS,
  getTestTile,
} from '../tiles/testTiles';
import type { Board } from '../types/state';
import { posKey } from '../types/state';
import type { PlacedTile } from '../types/geometry';
import type { TilePosition } from '../types/geometry';

const ctx: PlacementCheckContext = {
  board: {},
  getDefinition: getTestTile,
};

function boardWith(entries: [TilePosition, PlacedTile][]): Board {
  const b: Board = {};
  for (const [pos, tile] of entries) {
    b[posKey(pos)] = { ...tile, position: pos };
  }
  return b;
}

describe('areEdgesCompatible', () => {
  it('road matches road and city matches city', () => {
    const roads = getTileEdges(TILE_ROAD_STRAIGHT_NS, 0); // [R,C,R,C]
    const cities = getTileEdges(TILE_CITY_ALL, 0); // [C,C,C,C]
    expect(areEdgesCompatible(roads, 0, roads, 2)).toBe(true); // road-road
    expect(areEdgesCompatible(cities, 0, cities, 2)).toBe(true); // city-city
  });

  it('road does not match city', () => {
    const roads = getTileEdges(TILE_ROAD_STRAIGHT_NS, 0); // [R,C,R,C]
    const cities = getTileEdges(TILE_CITY_ALL, 0);
    expect(areEdgesCompatible(roads, 0, cities, 2)).toBe(false); // road vs city
  });
});

describe('getAdjacentPositions', () => {
  it('returns exactly 4 orthogonal neighbors in N,E,S,W order', () => {
    const adj = getAdjacentPositions({ x: 2, y: 3 });
    expect(adj).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
      { x: 1, y: 3 },
    ]);
  });

  it('never returns diagonal positions', () => {
    const adj = getAdjacentPositions({ x: 0, y: 0 });
    const diagonals = [
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ];
    for (const d of diagonals) {
      expect(adj.some((a) => a.x === d.x && a.y === d.y)).toBe(false);
    }
  });
});

describe('isLegalTilePlacement', () => {
  const startPos: TilePosition = { x: 0, y: 0 };
  const startBoard = boardWith([
    [startPos, { definitionId: TILE_CITY_ALL.id, rotation: 0, position: startPos }],
  ]);
  const startCtx: PlacementCheckContext = {
    board: startBoard,
    getDefinition: getTestTile,
  };

  it('rejects placement on an empty board with no neighbors (island)', () => {
    const res = isLegalTilePlacement(ctx, TILE_ROAD_STRAIGHT_NS, 0, { x: 5, y: 5 });
    expect(res.legal).toBe(false);
    expect(res.error).toBe('NO_ORTHOGONAL_NEIGHBOR');
  });

  it('rejects diagonal-only adjacency (no shared edge)', () => {
    // Стартовая плитка в (0,0);Attempting (1,1) — только диагональный контакт.
    const res = isLegalTilePlacement(startCtx, TILE_CITY_ALL, 0, { x: 1, y: 1 });
    expect(res.legal).toBe(false);
    expect(res.error).toBe('NO_ORTHOGONAL_NEIGHBOR');
  });

  it('allows compatible placement next to an existing tile', () => {
    // Сосед на север от старта: сторона S новой плитки должна быть city.
    // TILE_CITY_ALL имеет город на всех сторонах → законно.
    const res = isLegalTilePlacement(startCtx, TILE_CITY_ALL, 0, { x: 0, y: -1 });
    expect(res.legal).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('allows placement when rotated so that edges match', () => {
    // На восток от стартовой (город на W соседа). Новая плитка: дорога N-E,
    // повёрнутая так, чтобы её западная сторона была городом.
    // TILE_ROAD_CURVE_NE базово [R,R,C,C]; при rot 180 стороны [C,C,R,R] → W=C? 
    // Проверим: rot180 sides = base[(i+2)%4] → [C,C,R,R]: N=C,E=C,S=R,W=R — нет.
    // rot 90: sides=[C,R,R,C]? base[(i-1)%4] → i=0:base[3]=C, i=1:base[0]=R, i=2:base[1]=R, i=3:base[2]=C → [C,R,R,C]. W=C ✓
    const res = isLegalTilePlacement(startCtx, TILE_ROAD_CURVE_NE, 90, { x: 1, y: 0 });
    expect(res.legal).toBe(true);
  });

  it('rejects incompatible joint (road against city edge)', () => {
    // Восток от старта с дорогой на западной стороне: mismatch.
    // TILE_ROAD_STRAIGHT_NS rot 90 → sides [C,R,C,R]: E и S дороги, N/W города...
    // Нужна сторона W = road: rot 0 даёт [R,C,R,C] → W=C. Возьмём TILE_MONASTERY? все C.
    // Используем TILE_ROAD_CURVE_NE rot 0: [R,R,C,C] → W=C. rot 270: base[(i+1)%4] → [R,C,C,R]: W=R ✓ mismatch.
    const res = isLegalTilePlacement(startCtx, TILE_ROAD_CURVE_NE, 270, { x: 1, y: 0 });
    expect(res.legal).toBe(false);
    expect(res.error).toBe('EDGE_MISMATCH');
    expect(res.mismatchedEdges).toContain(3); // W
  });

  it('rejects occupied cell even if edges would match', () => {
    const res = isLegalTilePlacement(startCtx, TILE_CITY_ALL, 0, startPos);
    expect(res.legal).toBe(false);
    expect(res.error).toBe('CELL_OCCUPIED');
  });

  it('checks all neighbors: one matching and one mismatching neighbor rejects', () => {
    // Старт (0,0) city-all + плитка (0,-1) monastery (все стороны city).
    const board = boardWith([
      [startPos, { definitionId: TILE_CITY_ALL.id, rotation: 0, position: startPos }],
      [{ x: 0, y: -1 }, { definitionId: TILE_MONASTERY.id, rotation: 0, position: { x: 0, y: -1 } }],
    ]);
    const c: PlacementCheckContext = { board, getDefinition: getTestTile };
    // Клетка (1,0): соседи — (0,0) слева и (1,-1) сверху.
    // Плитка с дорогами на E/W и городами на N/S: TILE_ROAD_STRAIGHT_NS rot 90
    // → sides [C,R,C,R]: W=R → mismatch с городом (0,0); S=R → mismatch со стартом?
    // Нет: сторона S новой плитки смотрит на (1,1) — там пусто. Mismatch ровно один (W).
    const res = isLegalTilePlacement(c, TILE_ROAD_STRAIGHT_NS, 90, { x: 1, y: 0 });
    expect(res.legal).toBe(false);
    expect(res.error).toBe('EDGE_MISMATCH');
    expect(res.mismatchedEdges).toEqual([3]);

    // Та же клетка, но compatible-rot (города везде) → законно.
    const ok = isLegalTilePlacement(c, TILE_CITY_ALL, 0, { x: 1, y: 0 });
    expect(ok.legal).toBe(true);
  });
});
