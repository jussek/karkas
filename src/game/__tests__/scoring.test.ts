import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/gameEngine';
import type { GlobalFeatureContext, ResolvedGlobalFeature } from '../rules/globalFeatures';
import {
  getCompletedFeaturePoints,
  scoreCompletedFeaturesForTurn,
} from '../rules/scoring';
import type { EdgeIndex, MeeplePlacement, Rotation, TileDefinition } from '../types/geometry';
import type { Board, GameState, Meeple, Player } from '../types/state';

const blank: TileDefinition = {
  id: 'blank', sides: ['field', 'field', 'field', 'field'],
  topology: {
    roadSegments: [], citySegments: [], hasMonastery: false,
    roadEdgeSegments: [null, null, null, null], cityEdgeSegments: [null, null, null, null],
  },
};
const roadCorner: TileDefinition = {
  id: 'road-corner', sides: ['road', 'road', 'field', 'field'],
  topology: {
    roadSegments: ['r'], citySegments: [], hasMonastery: false,
    roadEdgeSegments: ['r', 'r', null, null], cityEdgeSegments: [null, null, null, null],
  },
};
const cityCorner: TileDefinition = {
  id: 'city-corner', sides: ['city', 'city', 'field', 'field'],
  topology: {
    roadSegments: [], citySegments: ['c'], hasMonastery: false,
    roadEdgeSegments: [null, null, null, null], cityEdgeSegments: ['c', 'c', null, null],
  },
};
const monastery: TileDefinition = {
  ...blank, id: 'monastery', topology: { ...blank.topology, hasMonastery: true },
};
const roadMonasteryCorner: TileDefinition = {
  ...roadCorner,
  id: 'road-monastery-corner',
  topology: { ...roadCorner.topology, hasMonastery: true },
};
const definitions = new Map(
  [blank, roadCorner, cityCorner, monastery, roadMonasteryCorner].map((d) => [d.id, d]),
);
const getDefinition = (id: string) => definitions.get(id)!;
const tile = (definitionId: string, x: number, y: number, rotation: Rotation = 0) => ({
  definitionId, rotation, position: { x, y },
});
const board = (...tiles: ReturnType<typeof tile>[]): Board => Object.fromEntries(
  tiles.map((placed) => [`${placed.position.x},${placed.position.y}`, placed]),
);
const loop = (definitionId: 'road-corner' | 'city-corner', ox = 0, oy = 0): Board => board(
  tile(definitionId, ox, oy, 90), tile(definitionId, ox + 1, oy, 180),
  tile(definitionId, ox + 1, oy + 1, 270), tile(definitionId, ox, oy + 1, 0),
);
const placement = (featureType: 'road' | 'city' | 'monastery', edge: EdgeIndex | null): MeeplePlacement => ({ featureType, edge });
const meeple = (id: string, playerId: string, x: number, y: number, p: MeeplePlacement): Meeple => ({
  id, playerId, position: { x, y }, placement: p,
});
const ctx = (b: Board, meeples: Meeple[] = []): GlobalFeatureContext => ({ board: b, meeples, getDefinition });
const roadMeeple = (id: string, playerId: string, x = 0, y = 0, edge: EdgeIndex = 1) =>
  meeple(id, playerId, x, y, placement('road', edge));
const completed = (type: 'road' | 'city' | 'monastery', tileCount: number): ResolvedGlobalFeature => ({
  id: `${type}|test`, type, parts: [], occupantPlayerIds: [], completed: true,
  openEdges: 0, tileCount, surroundingTilesFilled: type === 'monastery' ? 8 : null,
});
const fullMonasteryBoard = (): Board => board(
  tile('monastery', 0, 0),
  ...[-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({ x, y })))
    .filter(({ x, y }) => x !== 0 || y !== 0)
    .map(({ x, y }) => tile('blank', x, y)),
);

describe('pure completed feature scoring', () => {
  it('SCORING_01 scores a completed one-tile road as one point', () => {
    expect(getCompletedFeaturePoints(completed('road', 1))).toBe(1);
  });
  it('SCORING_02 scores a completed road by distinct tile count', () => {
    expect(getCompletedFeaturePoints(completed('road', 4))).toBe(4);
  });
  it('SCORING_03 scores a completed city at twice its tile count', () => {
    expect(getCompletedFeaturePoints(completed('city', 3))).toBe(6);
  });
  it('SCORING_04 scores a completed monastery as exactly nine points', () => {
    expect(getCompletedFeaturePoints(completed('monastery', 1))).toBe(9);
  });
  it('SCORING_05 gives an incomplete road no score or return', () => {
    const result = scoreCompletedFeaturesForTurn(ctx(board(tile('road-corner', 0, 0))), { x: 0, y: 0 });
    expect(result).toEqual({ scoreDeltaByPlayerId: {}, awards: [], meepleIdsReturned: [] });
  });
  it('SCORING_06 gives an incomplete city no score or return', () => {
    const result = scoreCompletedFeaturesForTurn(ctx(board(tile('city-corner', 0, 0))), { x: 0, y: 0 });
    expect(result.awards).toEqual([]);
  });
  it('SCORING_07 gives an incomplete monastery no score or return', () => {
    const result = scoreCompletedFeaturesForTurn(ctx(board(tile('monastery', 0, 0))), { x: 0, y: 0 });
    expect(result.awards).toEqual([]);
  });
  it('SCORING_08 records a completed unoccupied feature without a winner', () => {
    const result = scoreCompletedFeaturesForTurn(ctx(loop('road-corner')), { x: 0, y: 0 });
    expect(result.awards[0]).toMatchObject({ points: 4, winnerPlayerIds: [], meepleIdsReturned: [] });
    expect(result.scoreDeltaByPlayerId).toEqual({});
  });
  it('SCORING_09 awards a two-to-one majority only to the leader', () => {
    const c = ctx(loop('road-corner'), [roadMeeple('a1', 'alice'), roadMeeple('a2', 'alice', 1, 0, 2), roadMeeple('b1', 'bob', 1, 1, 0)]);
    expect(scoreCompletedFeaturesForTurn(c, { x: 0, y: 0 }).scoreDeltaByPlayerId).toEqual({ alice: 4 });
  });
  it('SCORING_10 awards full points to both players tied one-to-one', () => {
    const c = ctx(loop('road-corner'), [roadMeeple('a', 'alice'), roadMeeple('b', 'bob', 1, 0, 2)]);
    expect(scoreCompletedFeaturesForTurn(c, { x: 0, y: 0 }).scoreDeltaByPlayerId).toEqual({ alice: 4, bob: 4 });
  });
  it('SCORING_11 awards tied leaders and excludes the lower count', () => {
    const ms = [roadMeeple('a1', 'alice'), roadMeeple('a2', 'alice', 1, 0, 2), roadMeeple('b1', 'bob', 1, 1, 0), roadMeeple('b2', 'bob', 0, 1, 0), roadMeeple('c', 'carol')];
    expect(scoreCompletedFeaturesForTurn(ctx(loop('road-corner'), ms), { x: 0, y: 0 }).scoreDeltaByPlayerId).toEqual({ alice: 4, bob: 4 });
  });
  it('SCORING_12 returns all meeples on a completed feature', () => {
    const result = scoreCompletedFeaturesForTurn(ctx(loop('road-corner'), [roadMeeple('b', 'bob', 1, 0, 2), roadMeeple('a', 'alice')]), { x: 0, y: 0 });
    expect(result.meepleIdsReturned).toEqual(['a', 'b']);
  });
  it('SCORING_13 returns a losing player meeple too', () => {
    const ms = [roadMeeple('a1', 'alice'), roadMeeple('a2', 'alice', 1, 0, 2), roadMeeple('loser', 'bob', 1, 1, 0)];
    expect(scoreCompletedFeaturesForTurn(ctx(loop('road-corner'), ms), { x: 0, y: 0 }).meepleIdsReturned).toContain('loser');
  });
  it('SCORING_14 leaves unrelated meeples out of returned ids', () => {
    const b = { ...loop('road-corner'), ...loop('road-corner', 5, 5) };
    const result = scoreCompletedFeaturesForTurn(ctx(b, [roadMeeple('current', 'p1'), roadMeeple('other', 'p2', 5, 5)]), { x: 0, y: 0 });
    expect(result.meepleIdsReturned).toEqual(['current']);
  });
  it('SCORING_15 deduplicates one feature referenced by two current-tile edges', () => {
    expect(scoreCompletedFeaturesForTurn(ctx(loop('road-corner')), { x: 0, y: 0 }).awards).toHaveLength(1);
  });
  it('SCORING_16 scores two monasteries completed by one tile', () => {
    const b = board(tile('monastery', -1, 0), tile('monastery', 1, 0));
    for (const center of [-1, 1]) for (let x = center - 1; x <= center + 1; x++) for (let y = -1; y <= 1; y++) {
      if ((x === center && y === 0) || (x === 0 && y === 0)) continue;
      b[`${x},${y}`] ??= tile('blank', x, y);
    }
    b['0,0'] = tile('blank', 0, 0);
    const ms = [meeple('left', 'p1', -1, 0, placement('monastery', null)), meeple('right', 'p2', 1, 0, placement('monastery', null))];
    expect(scoreCompletedFeaturesForTurn(ctx(b, ms), { x: 0, y: 0 }).awards).toHaveLength(2);
  });
  it('SCORING_17 orders awards by road, city, then monastery', () => {
    const b = loop('road-corner');
    b['0,0'] = tile('road-monastery-corner', 0, 0, 90);
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      if (x !== 0 || y !== 0) b[`${x},${y}`] ??= tile('blank', x, y);
    }
    const result = scoreCompletedFeaturesForTurn(ctx(b), { x: 0, y: 0 });
    expect(result.awards.map((a) => a.featureType)).toEqual(['road', 'monastery']);
  });
  it('SCORING_18 sorts tied winners lexicographically', () => {
    const c = ctx(loop('road-corner'), [roadMeeple('z', 'zoe'), roadMeeple('a', 'amy', 1, 0, 2)]);
    expect(scoreCompletedFeaturesForTurn(c, { x: 0, y: 0 }).awards[0].winnerPlayerIds).toEqual(['amy', 'zoe']);
  });
  it('SCORING_19 sorts combined returned meeple ids', () => {
    const c = ctx(loop('road-corner'), [roadMeeple('z', 'p1'), roadMeeple('a', 'p2', 1, 0, 2)]);
    expect(scoreCompletedFeaturesForTurn(c, { x: 0, y: 0 }).meepleIdsReturned).toEqual(['a', 'z']);
  });
  it('SCORING_20 does not mutate board, meeples, or definitions', () => {
    const c = ctx(loop('road-corner'), [roadMeeple('m', 'p1')]);
    const before = JSON.stringify(c);
    scoreCompletedFeaturesForTurn(c, { x: 0, y: 0 });
    expect(JSON.stringify(c)).toBe(before);
  });
});

const players: Player[] = [
  { id: 'p1', name: 'One', color: 'blue', score: 0 },
  { id: 'p2', name: 'Two', color: 'red', score: 0 },
];
const stateFor = (b: Board, meeples: Meeple[], last = { x: 0, y: 0 }): GameState => ({
  gameId: 'g', status: 'playing', players, board: b, tileDeck: { remaining: [] },
  currentPlayerIndex: 0, turnNumber: 1, scores: { p1: 0, p2: 0 }, meeples,
  gamePhase: 'scoreFeatures', drawnTileDefinitionId: null,
  lastPlacedTile: { definitionId: b[`${last.x},${last.y}`].definitionId, rotation: b[`${last.x},${last.y}`].rotation, position: last, playerId: 'p1' },
});
const completeTurn = (state: GameState) => applyAction(state, { type: 'COMPLETE_TURN', playerId: 'p1' }, getDefinition);

describe('engine scoring transition', () => {
  it('ENGINE_SCORE_01 updates scores for a completed road', () => {
    const result = completeTurn(stateFor(loop('road-corner'), [roadMeeple('m', 'p1')]));
    expect(result.ok && result.state.scores.p1).toBe(4);
  });
  it('ENGINE_SCORE_02 returns a completed-feature meeple home', () => {
    const result = completeTurn(stateFor(loop('road-corner'), [roadMeeple('m', 'p1')]));
    expect(result.ok && result.state.meeples[0]).toMatchObject({ position: null, placement: null });
  });
  it('ENGINE_SCORE_03 preserves an incomplete-feature meeple and awards nothing', () => {
    const state = {
      ...stateFor(board(tile('road-corner', 0, 0)), [roadMeeple('m', 'p1')]),
      tileDeck: { remaining: ['next'] },
    };
    const state = stateFor(board(tile('road-corner', 0, 0)), [roadMeeple('m', 'p1')]);
    const result = completeTurn(state);
    expect(result.ok && result.state.scores.p1).toBe(0);
    expect(result.ok && result.state.meeples[0].position).toEqual({ x: 0, y: 0 });
  });
  it('ENGINE_SCORE_04 scores two features completed by one tile', () => {
    const b = board(tile('monastery', -1, 0), tile('monastery', 1, 0));
    for (const center of [-1, 1]) for (let x = center - 1; x <= center + 1; x++) for (let y = -1; y <= 1; y++) if (!(x === center && y === 0)) b[`${x},${y}`] ??= tile('blank', x, y);
    const state = stateFor(b, [meeple('l', 'p1', -1, 0, placement('monastery', null)), meeple('r', 'p2', 1, 0, placement('monastery', null))]);
    const result = completeTurn(state);
    expect(result.ok && result.state.scores).toEqual({ p1: 9, p2: 9 });
  });
  it('ENGINE_SCORE_05 awards full points to tied majority players', () => {
    const result = completeTurn(stateFor(loop('road-corner'), [roadMeeple('a', 'p1'), roadMeeple('b', 'p2', 1, 0, 2)]));
    expect(result.ok && result.state.scores).toEqual({ p1: 4, p2: 4 });
  });
  it('ENGINE_SCORE_06 leaves the input state immutable', () => {
    const state = stateFor(loop('road-corner'), [roadMeeple('m', 'p1')]);
    const before = JSON.stringify(state);
    const result = completeTurn(state);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('ENGINE_SCORE_07 does not rescore an old completed feature elsewhere', () => {
    const b = { ...loop('road-corner', 5, 5), '0,0': tile('blank', 0, 0) };
    const result = completeTurn(stateFor(b, [], { x: 0, y: 0 }));
    expect(result.ok && result.state.scores).toEqual({ p1: 0, p2: 0 });
  });
  it('ENGINE_SCORE_08 scores a neighboring monastery completed by the new tile', () => {
    const b = fullMonasteryBoard();
    const result = completeTurn(stateFor(b, [meeple('m', 'p1', 0, 0, placement('monastery', null))], { x: 1, y: 1 }));
    expect(result.ok && result.state.scores.p1).toBe(9);
  });
  it('ENGINE_SCORE_09 does not rescore a non-neighboring old monastery', () => {
    const b = { ...fullMonasteryBoard(), '10,10': tile('blank', 10, 10) };
    const result = completeTurn(stateFor(b, [], { x: 10, y: 10 }));
    expect(result.ok && result.state.scores).toEqual({ p1: 0, p2: 0 });
  });
});
