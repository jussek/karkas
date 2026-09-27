import { describe, expect, it } from 'vitest';
import { applyAction, drawNextTile } from '../engine/gameEngine';
import { getFinalFeaturePoints, scoreFinalFeatures } from '../rules/finalScoring';
import type { GlobalFeatureContext, ResolvedGlobalFeature } from '../rules/globalFeatures';
import type { EdgeIndex, MeeplePlacement, Rotation, TileDefinition } from '../types/geometry';
import type { Board, GameAction, GameState, Meeple, Player } from '../types/state';

const blank: TileDefinition = { id: 'blank', sides: ['field', 'field', 'field', 'field'], topology: { roadSegments: [], citySegments: [], hasMonastery: false, roadEdgeSegments: [null, null, null, null], cityEdgeSegments: [null, null, null, null] } };
const road: TileDefinition = { id: 'road', sides: ['field', 'road', 'field', 'road'], topology: { roadSegments: ['r'], citySegments: [], hasMonastery: false, roadEdgeSegments: [null, 'r', null, 'r'], cityEdgeSegments: [null, null, null, null] } };
const city: TileDefinition = { id: 'city', sides: ['field', 'city', 'field', 'city'], topology: { roadSegments: [], citySegments: ['c'], hasMonastery: false, roadEdgeSegments: [null, null, null, null], cityEdgeSegments: [null, 'c', null, 'c'] } };
const roadCorner: TileDefinition = { id: 'road-corner', sides: ['road', 'road', 'field', 'field'], topology: { roadSegments: ['r'], citySegments: [], hasMonastery: false, roadEdgeSegments: ['r', 'r', null, null], cityEdgeSegments: [null, null, null, null] } };
const cityCorner: TileDefinition = { id: 'city-corner', sides: ['city', 'city', 'field', 'field'], topology: { roadSegments: [], citySegments: ['c'], hasMonastery: false, roadEdgeSegments: [null, null, null, null], cityEdgeSegments: ['c', 'c', null, null] } };
const monastery: TileDefinition = { ...blank, id: 'monastery', topology: { ...blank.topology, hasMonastery: true } };
const defs = new Map([blank, road, city, roadCorner, cityCorner, monastery].map((d) => [d.id, d]));
const getDefinition = (id: string) => defs.get(id)!;
const tile = (definitionId: string, x: number, y: number, rotation: Rotation = 0) => ({ definitionId, rotation, position: { x, y } });
const board = (...tiles: ReturnType<typeof tile>[]): Board => Object.fromEntries(tiles.map((t) => [`${t.position.x},${t.position.y}`, t]));
const place = (featureType: 'road' | 'city' | 'monastery', edge: EdgeIndex | null): MeeplePlacement => ({ featureType, edge });
const meeple = (id: string, playerId: string, x: number, y: number, placement: MeeplePlacement): Meeple => ({ id, playerId, position: { x, y }, placement });
const context = (b: Board, meeples: Meeple[] = []): GlobalFeatureContext => ({ board: b, meeples, getDefinition });
const loop = (kind: 'road-corner' | 'city-corner', ox = 0, oy = 0): Board => board(tile(kind, ox, oy, 90), tile(kind, ox + 1, oy, 180), tile(kind, ox + 1, oy + 1, 270), tile(kind, ox, oy + 1));
const feature = (type: 'road' | 'city' | 'monastery', tileCount: number, neighbors: number | null, completed = false): ResolvedGlobalFeature => ({ id: `${type}|x`, type, parts: [], occupantPlayerIds: ['p1'], completed, openEdges: completed ? 0 : 1, tileCount, surroundingTilesFilled: neighbors });
const roadM = (id: string, player: string, x = 0, y = 0, edge: EdgeIndex = 1) => meeple(id, player, x, y, place('road', edge));
const cityM = (id: string, player: string, x = 0, y = 0, edge: EdgeIndex = 1) => meeple(id, player, x, y, place('city', edge));
const monasteryBoard = (neighbors: number): Board => {
  const positions = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({ x, y }))).filter(({ x, y }) => x !== 0 || y !== 0).slice(0, neighbors);
  return board(tile('monastery', 0, 0), ...positions.map(({ x, y }) => tile('blank', x, y)));
};

describe('pure final scoring', () => {
  it('FINAL_SCORE_01 scores an unfinished one-tile road', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('m', 'p1')])).scoreDeltaByPlayerId).toEqual({ p1: 1 }));
  it('FINAL_SCORE_02 scores an unfinished multi-tile road by tile count', () => {
    const b = board(tile('road', 0, 0), tile('road', 1, 0), tile('road', 2, 0));
    expect(scoreFinalFeatures(context(b, [roadM('m', 'p1')])).scoreDeltaByPlayerId.p1).toBe(3);
  });
  it('FINAL_SCORE_03 scores an unfinished city once per tile, not twice', () => {
    const b = board(tile('city', 0, 0), tile('city', 1, 0), tile('city', 2, 0));
    expect(scoreFinalFeatures(context(b, [cityM('m', 'p1')])).scoreDeltaByPlayerId.p1).toBe(3);
  });
  it('FINAL_SCORE_04 scores a monastery with zero neighbors as one', () => expect(scoreFinalFeatures(context(monasteryBoard(0), [meeple('m', 'p1', 0, 0, place('monastery', null))])).scoreDeltaByPlayerId.p1).toBe(1));
  it('FINAL_SCORE_05 scores a monastery with three neighbors as four', () => expect(scoreFinalFeatures(context(monasteryBoard(3), [meeple('m', 'p1', 0, 0, place('monastery', null))])).scoreDeltaByPlayerId.p1).toBe(4));
  it('FINAL_SCORE_06 scores a monastery with seven neighbors as eight', () => expect(scoreFinalFeatures(context(monasteryBoard(7), [meeple('m', 'p1', 0, 0, place('monastery', null))])).scoreDeltaByPlayerId.p1).toBe(8));
  it('FINAL_SCORE_07 excludes a completed road', () => expect(scoreFinalFeatures(context(loop('road-corner'), [roadM('m', 'p1')])).awards).toEqual([]));
  it('FINAL_SCORE_08 excludes a completed city', () => expect(scoreFinalFeatures(context(loop('city-corner'), [cityM('m', 'p1')])).awards).toEqual([]));
  it('FINAL_SCORE_09 excludes a completed monastery', () => expect(scoreFinalFeatures(context(monasteryBoard(8), [meeple('m', 'p1', 0, 0, place('monastery', null))])).awards).toEqual([]));
  it('FINAL_SCORE_10 omits an unoccupied incomplete road', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)))).awards).toEqual([]));
  it('FINAL_SCORE_11 omits an unoccupied incomplete city', () => expect(scoreFinalFeatures(context(board(tile('city', 0, 0)))).awards).toEqual([]));
  it('FINAL_SCORE_12 omits an unoccupied incomplete monastery', () => expect(scoreFinalFeatures(context(monasteryBoard(3))).awards).toEqual([]));
  it('FINAL_SCORE_13 applies majority two versus one', () => {
    const ms = [roadM('a1', 'a'), roadM('a2', 'a'), roadM('b', 'b')];
    expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), ms)).scoreDeltaByPlayerId).toEqual({ a: 1 });
  });
  it('FINAL_SCORE_14 gives full points to a one-one tie', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('a', 'a'), roadM('b', 'b')])).scoreDeltaByPlayerId).toEqual({ a: 1, b: 1 }));
  it('FINAL_SCORE_15 gives full points to tied leaders only', () => {
    const ms = [roadM('a1', 'a'), roadM('a2', 'a'), roadM('b1', 'b'), roadM('b2', 'b'), roadM('c', 'c')];
    expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), ms)).scoreDeltaByPlayerId).toEqual({ a: 1, b: 1 });
  });
  it('FINAL_SCORE_16 returns every meeple on the scored feature', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('z', 'a'), roadM('a', 'b')])).meepleIdsReturned).toEqual(['a', 'z']));
  it('FINAL_SCORE_17 returns losing-player meeples', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('a1', 'a'), roadM('a2', 'a'), roadM('loser', 'b')])).meepleIdsReturned).toContain('loser'));
  it('FINAL_SCORE_18 scores multiple unfinished occupied features once each', () => {
    const b = board(tile('road', 0, 0), tile('city', 5, 0));
    expect(scoreFinalFeatures(context(b, [roadM('r', 'p1'), cityM('c', 'p1', 5, 0)])).awards).toHaveLength(2);
  });
  it('FINAL_SCORE_19 orders road before city before monastery', () => {
    const result = scoreFinalFeatures(context(board(tile('road', 0, 0), tile('city', 5, 0), tile('monastery', 10, 0)), [roadM('r', 'p'), cityM('c', 'p', 5, 0), meeple('m', 'p', 10, 0, place('monastery', null))]));
    expect(result.awards.map((a) => a.featureType)).toEqual(['road', 'city', 'monastery']);
  });
  it('FINAL_SCORE_20 sorts winners', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('z', 'zoe'), roadM('a', 'amy')])).awards[0].winnerPlayerIds).toEqual(['amy', 'zoe']));
  it('FINAL_SCORE_21 sorts returned IDs', () => expect(scoreFinalFeatures(context(board(tile('road', 0, 0)), [roadM('z', 'p'), roadM('a', 'p')])).meepleIdsReturned).toEqual(['a', 'z']));
  it('FINAL_SCORE_22 keeps its context immutable', () => {
    const c = context(board(tile('road', 0, 0)), [roadM('m', 'p')]); const before = JSON.stringify(c); scoreFinalFeatures(c); expect(JSON.stringify(c)).toBe(before);
  });
  it('FINAL_SCORE_23 applies the five-neighbor monastery formula', () => expect(getFinalFeaturePoints(feature('monastery', 1, 5))).toBe(6));
});

const players: Player[] = [{ id: 'p1', name: 'One', color: 'blue', score: 0 }, { id: 'p2', name: 'Two', color: 'red', score: 0 }];
const stateFor = (b: Board, meeples: Meeple[], remaining: string[] = [], last = { x: 0, y: 0 }): GameState => ({ gameId: 'g', status: 'playing', players, board: b, tileDeck: { remaining }, currentPlayerIndex: 0, turnNumber: 3, scores: { p1: 0, p2: 0 }, meeples, gamePhase: 'scoreFeatures', drawnTileDefinitionId: null, lastPlacedTile: { definitionId: b[`${last.x},${last.y}`].definitionId, rotation: b[`${last.x},${last.y}`].rotation, position: last, playerId: 'p1' } });
const complete = (s: GameState) => applyAction(s, { type: 'COMPLETE_TURN', playerId: 'p1' }, getDefinition);

describe('engine game end', () => {
  it('GAME_END_01 continues normally when deck is nonempty', () => { const r = complete(stateFor(board(tile('blank', 0, 0)), [], ['next'])); expect(r.ok && [r.state.status, r.state.currentPlayerIndex, r.state.gamePhase]).toEqual(['playing', 1, 'drawTile']); });
  it('GAME_END_02 finishes after the final full turn', () => { const r = complete(stateFor(board(tile('blank', 0, 0)), [])); expect(r.ok && r.state.status).toBe('finished'); });
  it('GAME_END_03 does not advance the final player', () => { const r = complete(stateFor(board(tile('blank', 0, 0)), [])); expect(r.ok && r.state.currentPlayerIndex).toBe(0); });
  it('GAME_END_04 increments the final turn number once', () => { const r = complete(stateFor(board(tile('blank', 0, 0)), [])); expect(r.ok && r.state.turnNumber).toBe(4); });
  it('GAME_END_05 clears transient tile state', () => { const r = complete(stateFor(board(tile('blank', 0, 0)), [])); expect(r.ok && [r.state.drawnTileDefinitionId, r.state.lastPlacedTile]).toEqual([null, null]); });
  it('GAME_END_06 gives normal scoring to a completed final feature', () => { const r = complete(stateFor(loop('road-corner'), [roadM('m', 'p1')])); expect(r.ok && r.state.scores.p1).toBe(4); });
  it('GAME_END_07 returns completed-feature meeples before final scoring', () => { const r = complete(stateFor(loop('road-corner'), [roadM('m', 'p1')])); expect(r.ok && r.state.meeples[0].position).toBeNull(); });
  it('GAME_END_08 final-scores an unfinished road', () => { const r = complete(stateFor(board(tile('road', 0, 0)), [roadM('m', 'p1')])); expect(r.ok && r.state.scores.p1).toBe(1); });
  it('GAME_END_09 final-scores an unfinished city', () => { const r = complete(stateFor(board(tile('city', 0, 0)), [cityM('m', 'p1')])); expect(r.ok && r.state.scores.p1).toBe(1); });
  it('GAME_END_10 final-scores an unfinished monastery', () => { const r = complete(stateFor(monasteryBoard(3), [meeple('m', 'p1', 0, 0, place('monastery', null))])); expect(r.ok && r.state.scores.p1).toBe(4); });
  it('GAME_END_11 applies normal and final scoring on one final turn', () => { const b = { ...loop('road-corner'), '5,0': tile('city', 5, 0) }; const r = complete(stateFor(b, [roadM('r', 'p1'), cityM('c', 'p1', 5, 0)])); expect(r.ok && r.state.scores.p1).toBe(5); });
  it('GAME_END_12 returns remaining final-scored meeples', () => { const r = complete(stateFor(board(tile('road', 0, 0)), [roadM('m', 'p1')])); expect(r.ok && r.state.meeples[0].placement).toBeNull(); });
  const postGame = (type: GameAction['type']): { state: GameState; action: GameAction } => { const s = { ...stateFor(board(tile('blank', 0, 0)), []), status: 'finished' as const }; const actions: Record<GameAction['type'], GameAction> = { DRAW_TILE: { type: 'DRAW_TILE', playerId: 'p1' }, PLACE_TILE: { type: 'PLACE_TILE', playerId: 'p1', tileDefinitionId: 'blank', position: { x: 1, y: 0 }, rotation: 0 }, PLACE_MEEPLE: { type: 'PLACE_MEEPLE', playerId: 'p1', position: { x: 0, y: 0 }, featureType: 'monastery', edge: null }, SKIP_MEEPLE: { type: 'SKIP_MEEPLE', playerId: 'p1' }, COMPLETE_TURN: { type: 'COMPLETE_TURN', playerId: 'p1' } }; return { state: s, action: actions[type] }; };
  it('GAME_END_13 rejects PLACE_TILE after finish', () => { const x = postGame('PLACE_TILE'); expect(applyAction(x.state, x.action, getDefinition).ok).toBe(false); });
  it('GAME_END_14 rejects PLACE_MEEPLE after finish', () => { const x = postGame('PLACE_MEEPLE'); expect(applyAction(x.state, x.action, getDefinition).ok).toBe(false); });
  it('GAME_END_15 rejects SKIP_MEEPLE after finish', () => { const x = postGame('SKIP_MEEPLE'); expect(applyAction(x.state, x.action, getDefinition).ok).toBe(false); });
  it('GAME_END_16 rejects COMPLETE_TURN after finish', () => { const x = postGame('COMPLETE_TURN'); expect(applyAction(x.state, x.action, getDefinition).ok).toBe(false); });
  it('GAME_END_17 leaves state byte-equivalent after rejection', () => { const x = postGame('PLACE_TILE'); const before = JSON.stringify(x.state); applyAction(x.state, x.action, getDefinition); expect(JSON.stringify(x.state)).toBe(before); });
  it('GAME_END_18 cannot double-score with a second COMPLETE_TURN', () => { const first = complete(stateFor(board(tile('road', 0, 0)), [roadM('m', 'p1')])); if (!first.ok) throw new Error('first failed'); const second = applyAction(first.state, { type: 'COMPLETE_TURN', playerId: 'p1' }, getDefinition); expect(second.ok).toBe(false); expect(first.state.scores.p1).toBe(1); });
  it('GAME_END_19 rejects DRAW_TILE after finish', () => { const x = postGame('DRAW_TILE'); expect(applyAction(x.state, x.action, getDefinition).ok).toBe(false); });
  it('GAME_END_20 handles direct empty-deck draw defensively', () => { const s = { ...stateFor(board(tile('blank', 0, 0)), []), gamePhase: 'drawTile' as const }; const result = drawNextTile(s); expect([result.status, result.turnNumber, result.currentPlayerIndex]).toEqual(['finished', 3, 0]); });
});
