import { describe, expect, it } from 'vitest';
import { validateAction } from '../engine/gameEngine';
import {
  getGlobalFeatures,
  isGlobalFeatureOccupied,
  resolveGlobalFeature,
  type GlobalFeatureContext,
} from '../rules/globalFeatures';
import type { EdgeIndex, PlacedTile, Rotation, TileDefinition, TilePosition } from '../types/geometry';
import type { Board, GameState, Meeple, Player } from '../types/state';

const blank: TileDefinition = {
  id: 'blank',
  sides: ['field', 'field', 'field', 'field'],
  topology: {
    roadSegments: [], citySegments: [], hasMonastery: false,
    roadEdgeSegments: [null, null, null, null],
    cityEdgeSegments: [null, null, null, null],
  },
};
const roadNS: TileDefinition = {
  id: 'road-ns',
  sides: ['road', 'field', 'road', 'field'],
  topology: {
    roadSegments: ['r'], citySegments: [], hasMonastery: false,
    roadEdgeSegments: ['r', null, 'r', null],
    cityEdgeSegments: [null, null, null, null],
  },
};
const roadEW: TileDefinition = {
  ...roadNS,
  id: 'road-ew',
  sides: ['field', 'road', 'field', 'road'],
  topology: { ...roadNS.topology, roadEdgeSegments: [null, 'r', null, 'r'] },
};
const roadCorner: TileDefinition = {
  ...roadNS,
  id: 'road-corner',
  sides: ['road', 'road', 'field', 'field'],
  topology: { ...roadNS.topology, roadEdgeSegments: ['r', 'r', null, null] },
};
const cityEW: TileDefinition = {
  id: 'city-ew',
  sides: ['field', 'city', 'field', 'city'],
  topology: {
    roadSegments: [], citySegments: ['c'], hasMonastery: false,
    roadEdgeSegments: [null, null, null, null],
    cityEdgeSegments: [null, 'c', null, 'c'],
  },
};
const monastery: TileDefinition = {
  ...blank,
  id: 'monastery',
  topology: { ...blank.topology, hasMonastery: true },
};
const splitRoad: TileDefinition = {
  id: 'split-road',
  sides: ['road', 'road', 'road', 'road'],
  topology: {
    roadSegments: ['r0', 'r1'], citySegments: [], hasMonastery: false,
    roadEdgeSegments: ['r0', 'r1', 'r0', 'r1'],
    cityEdgeSegments: [null, null, null, null],
  },
};

const definitions = new Map(
  [blank, roadNS, roadEW, roadCorner, cityEW, monastery, splitRoad].map((tile) => [tile.id, tile]),
);
const getDefinition = (id: string): TileDefinition => {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`unknown: ${id}`);
  return definition;
};
const placed = (
  definitionId: string,
  x: number,
  y: number,
  rotation: Rotation = 0,
): PlacedTile => ({ definitionId, rotation, position: { x, y } });
const boardOf = (...tiles: PlacedTile[]): Board => Object.fromEntries(
  tiles.map((tile) => [`${tile.position.x},${tile.position.y}`, tile]),
);
const context = (board: Board, meeples: readonly Meeple[] = []): GlobalFeatureContext => ({
  board, meeples, getDefinition,
});
const placement = (featureType: 'road' | 'city' | 'monastery', edge: EdgeIndex | null) => ({
  featureType, edge,
});
const connectedBoard = boardOf(placed('road-ew', 0, 0), placed('road-ew', 1, 0));

describe('global road and city graph', () => {
  it('resolves a single open N-S road as one two-ended feature', () => {
    const feature = resolveGlobalFeature(context(boardOf(placed('road-ns', 0, 0))), { x: 0, y: 0 }, placement('road', 0))!;
    expect(feature).toMatchObject({ type: 'road', tileCount: 1, openEdges: 2, completed: false });
    expect(feature.parts.map((part) => part.edge)).toEqual([0, 2]);
    expect(getGlobalFeatures(context(boardOf(placed('road-ns', 0, 0))))).toHaveLength(1);
  });

  it('connects two road tiles and gives both ends the same deterministic id', () => {
    const ctx = context(boardOf(placed('road-ew', 0, 0), placed('road-ew', 1, 0)));
    const left = resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 1))!;
    const right = resolveGlobalFeature(ctx, { x: 1, y: 0 }, placement('road', 3))!;
    expect(left).toMatchObject({ tileCount: 2, openEdges: 2, completed: false });
    expect(left.id).toBe(right.id);
  });

  it('detects a closed four-corner road loop', () => {
    const ctx = context(boardOf(
      placed('road-corner', 0, 0, 90), placed('road-corner', 1, 0, 180),
      placed('road-corner', 1, 1, 270), placed('road-corner', 0, 1, 0),
    ));
    expect(resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 1))).toMatchObject({
      tileCount: 4, openEdges: 0, completed: true,
    });
  });

  it('keeps disconnected roads and distinct same-tile segments separate', () => {
    const disconnected = getGlobalFeatures(context(boardOf(
      placed('road-ns', 0, 0), placed('road-ns', 5, 5),
    ))).filter((feature) => feature.type === 'road');
    expect(disconnected).toHaveLength(2);
    expect(disconnected[0].id).not.toBe(disconnected[1].id);

    const split = getGlobalFeatures(context(boardOf(placed('split-road', 0, 0))));
    expect(split).toHaveLength(2);
    expect(split.every((feature) => feature.tileCount === 1 && feature.parts.length === 2)).toBe(true);
  });

  it('uses one graph node for a local segment touching multiple edges', () => {
    const feature = resolveGlobalFeature(
      context(boardOf(placed('split-road', 0, 0))), { x: 0, y: 0 }, placement('road', 0),
    )!;
    expect(feature.id).toBe('road|0,0|road|r0');
    expect(feature.parts.map((part) => part.edge)).toEqual([0, 2]);
    expect(feature.tileCount).toBe(1);
  });

  it('connects cities but never connects a road to a city', () => {
    const cities = context(boardOf(placed('city-ew', 0, 0), placed('city-ew', 1, 0)));
    const cityLeft = resolveGlobalFeature(cities, { x: 0, y: 0 }, placement('city', 1))!;
    const cityRight = resolveGlobalFeature(cities, { x: 1, y: 0 }, placement('city', 3))!;
    expect(cityLeft.id).toBe(cityRight.id);
    expect(cityLeft.tileCount).toBe(2);

    const mismatch = context(boardOf(placed('road-ew', 0, 0), placed('city-ew', 1, 0)));
    expect(resolveGlobalFeature(mismatch, { x: 0, y: 0 }, placement('road', 1))).toMatchObject({ openEdges: 2 });
    expect(resolveGlobalFeature(mismatch, { x: 1, y: 0 }, placement('city', 3))).toMatchObject({ openEdges: 2 });
  });

  it('resolves rotated topology through rotated edges', () => {
    const ctx = context(boardOf(placed('road-corner', 0, 0, 90)));
    const east = resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 1));
    const south = resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 2));
    expect(east?.id).toBe(south?.id);
    expect(east?.parts.map((part) => part.edge)).toEqual([1, 2]);
    expect(resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 0))).toBeNull();
  });
});

describe('monastery graph', () => {
  const monasteryWithNeighbors = (positions: TilePosition[]) => context(boardOf(
    placed('monastery', 0, 0),
    ...positions.map(({ x, y }) => placed('blank', x, y)),
  ));

  it('reports empty, partial, and complete monastery neighborhoods', () => {
    const empty = resolveGlobalFeature(monasteryWithNeighbors([]), { x: 0, y: 0 }, placement('monastery', null));
    expect(empty).toMatchObject({ surroundingTilesFilled: 0, openEdges: 8, completed: false, tileCount: 1 });
    expect(empty?.parts).toEqual([{ position: { x: 0, y: 0 }, segmentId: 'center', edge: null }]);

    const five = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    expect(resolveGlobalFeature(monasteryWithNeighbors(five), { x: 0, y: 0 }, placement('monastery', null))).toMatchObject({
      surroundingTilesFilled: 5, openEdges: 3, completed: false,
    });

    const all = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({ x, y }))).filter(({ x, y }) => x !== 0 || y !== 0);
    expect(resolveGlobalFeature(monasteryWithNeighbors(all), { x: 0, y: 0 }, placement('monastery', null))).toMatchObject({
      surroundingTilesFilled: 8, openEdges: 0, completed: true,
    });
  });
});

describe('global occupancy and determinism', () => {
  const onRoad = (id: string, playerId: string, x: number, edge: EdgeIndex): Meeple => ({
    id, playerId, position: { x, y: 0 }, placement: placement('road', edge),
  });

  it('finds and deduplicates occupants from the remote end', () => {
    const ctx = context(connectedBoard, [onRoad('m1', 'p1', 0, 1), onRoad('m2', 'p1', 1, 3)]);
    const feature = resolveGlobalFeature(ctx, { x: 1, y: 0 }, placement('road', 3))!;
    expect(feature.occupantPlayerIds).toEqual(['p1']);
    expect(isGlobalFeatureOccupied(ctx, { x: 1, y: 0 }, placement('road', 3))).toBe(true);
  });

  it('is identical for boards with different insertion order', () => {
    const first = context(boardOf(placed('road-ew', 0, 0), placed('road-ew', 1, 0)), [onRoad('m', 'p1', 0, 1)]);
    const second = context(boardOf(placed('road-ew', 1, 0), placed('road-ew', 0, 0)), [onRoad('m', 'p1', 0, 1)]);
    expect(getGlobalFeatures(first)).toEqual(getGlobalFeatures(second));
  });

  it('returns null for normal invalid feature queries', () => {
    const ctx = context(boardOf(placed('blank', 0, 0), placed('road-ns', 1, 0)));
    expect(resolveGlobalFeature(ctx, { x: 9, y: 9 }, placement('road', 0))).toBeNull();
    expect(resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('road', 0))).toBeNull();
    expect(resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('city', 0))).toBeNull();
    expect(resolveGlobalFeature(ctx, { x: 0, y: 0 }, placement('monastery', null))).toBeNull();
  });
});

describe('engine global occupancy validation', () => {
  const players: Player[] = [
    { id: 'p1', name: 'One', color: 'blue', score: 0 },
    { id: 'p2', name: 'Two', color: 'red', score: 0 },
  ];
  const makeState = (existingPlayer: string, existingPosition = { x: 0, y: 0 }): GameState => ({
    gameId: 'g', status: 'playing', players, board: connectedBoard,
    tileDeck: { remaining: [] }, currentPlayerIndex: 1, turnNumber: 2,
    scores: { p1: 0, p2: 0 }, gamePhase: 'placeMeeple', drawnTileDefinitionId: null,
    lastPlacedTile: { definitionId: 'road-ew', rotation: 0, position: { x: 1, y: 0 }, playerId: 'p2' },
    meeples: [
      { id: 'used', playerId: existingPlayer, position: existingPosition, placement: placement('road', 1) },
      { id: 'free', playerId: 'p2', position: null, placement: null },
    ],
  });
  const action = {
    type: 'PLACE_MEEPLE' as const, playerId: 'p2', position: { x: 1, y: 0 },
    featureType: 'road' as const, edge: 1 as EdgeIndex,
  };

  it('blocks an opponent meeple anywhere on the connected feature', () => {
    const error = validateAction(makeState('p1'), action, getDefinition);
    expect(error).toEqual({ code: 'FEATURE_OCCUPIED', message: 'This connected feature already contains a meeple.' });
  });

  it('blocks the current player own remote meeple', () => {
    expect(validateAction(makeState('p2'), action, getDefinition)?.code).toBe('FEATURE_OCCUPIED');
  });

  it('allows placement when the existing meeple is disconnected', () => {
    const state = makeState('p1', { x: 5, y: 5 });
    state.board['5,5'] = placed('road-ew', 5, 5);
    expect(validateAction(state, action, getDefinition)).toBeNull();
  });
});
