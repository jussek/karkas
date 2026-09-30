import { describe, expect, it } from 'vitest';

import { getTileDefinition } from '../cards/catalogApi';
import { applyActionWithResolution } from '../engine/gameEngine';
import type { TilePosition } from '../types/geometry';
import { posKey, type Board, type GameState, type Player } from '../types/state';

const MONASTERY_CARD_ID = 'card-041';
const MONASTERY_POSITION: TilePosition = { x: 0, y: 0 };
const LAST_PLACED_POSITION: TilePosition = { x: 1, y: 1 };
const MONASTERY_MEEPLE_ID = 'p1-m1';
const COMPLETED_MONASTERY_SCORE = 9;

const p1: Player = { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 };
const p2: Player = { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 };

const NEIGHBOR_POSITIONS: readonly TilePosition[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  LAST_PLACED_POSITION,
];

/**
 * Direct pre-End-Turn state. Historical placement legality is deliberately
 * irrelevant here: these tests exercise authoritative completion scoring.
 */
function monasteryState(options: { incomplete?: boolean } = {}): GameState {
  const board: Board = {
    [posKey(MONASTERY_POSITION)]: {
      definitionId: MONASTERY_CARD_ID,
      rotation: 0,
      position: { ...MONASTERY_POSITION },
    },
  };
  const neighbors = options.incomplete ? NEIGHBOR_POSITIONS.slice(1) : NEIGHBOR_POSITIONS;
  for (const position of neighbors) {
    board[posKey(position)] = {
      definitionId: MONASTERY_CARD_ID,
      rotation: 0,
      position: { ...position },
    };
  }

  return {
    gameId: options.incomplete ? 'monastery-incomplete' : 'monastery-complete',
    status: 'playing',
    players: [p1, p2],
    board,
    tileDeck: { remaining: ['card-001'] },
    currentPlayerIndex: 0,
    turnNumber: 7,
    scores: { [p1.id]: 0, [p2.id]: 0 },
    meeples: [
      {
        id: MONASTERY_MEEPLE_ID,
        playerId: p1.id,
        position: { ...MONASTERY_POSITION },
        placement: { featureType: 'monastery', edge: null },
      },
      { id: 'p2-m1', playerId: p2.id, position: null, placement: null },
    ],
    gamePhase: 'scoreFeatures',
    drawnTileDefinitionId: null,
    lastPlacedTile: {
      definitionId: MONASTERY_CARD_ID,
      rotation: 0,
      position: { ...LAST_PLACED_POSITION },
      playerId: p1.id,
    },
  };
}

function completeTurn(state: GameState) {
  const result = applyActionWithResolution(
    state,
    { type: 'COMPLETE_TURN', playerId: p1.id },
    getTileDefinition,
  );
  if (!result.ok || !result.resolution) throw new Error('complete turn failed');
  return { state: result.state, resolution: result.resolution };
}

describe('Stage 4A monastery completion scoring through End Turn', () => {
  it('scores a completed monastery once, returns its meeple, and advances the turn', () => {
    const before = monasteryState();
    expect(before.scores[p1.id]).toBe(0);

    const completed = completeTurn(before);
    const award = completed.resolution.normal.awards.find(
      (candidate) => candidate.featureType === 'monastery',
    );

    expect(completed.state.scores[p1.id]).toBe(COMPLETED_MONASTERY_SCORE);
    expect(award).toMatchObject({
      featureId: 'monastery|0,0',
      featureType: 'monastery',
      points: COMPLETED_MONASTERY_SCORE,
      winnerPlayerIds: [p1.id],
      meepleIdsReturned: [MONASTERY_MEEPLE_ID],
    });
    expect(completed.resolution.normal.meepleIdsReturned).toEqual([MONASTERY_MEEPLE_ID]);
    expect(completed.state.meeples.find((meeple) => meeple.id === MONASTERY_MEEPLE_ID)).toMatchObject({
      position: null,
      placement: null,
    });
    expect(completed.state.currentPlayerIndex).toBe(1);
    expect(completed.state.gamePhase).toBe('drawTile');
    expect(completed.state.turnNumber).toBe(before.turnNumber + 1);
  });

  it('does not score or emit an event for a repeated End Turn', () => {
    const once = completeTurn(monasteryState());
    const twice = applyActionWithResolution(
      once.state,
      { type: 'COMPLETE_TURN', playerId: p2.id },
      getTileDefinition,
    );

    expect(twice.ok).toBe(false);
    expect(twice.resolution).toBeUndefined();
    if (!twice.ok) expect(twice.error.code).toBe('TURN_NOT_READY');
    expect(once.state.scores[p1.id]).toBe(COMPLETED_MONASTERY_SCORE);
  });

  it('does not score an incomplete monastery and leaves its meeple in place', () => {
    const completed = completeTurn(monasteryState({ incomplete: true }));

    expect(completed.state.scores[p1.id]).toBe(0);
    expect(completed.resolution.normal.awards).not.toContainEqual(
      expect.objectContaining({ featureType: 'monastery' }),
    );
    expect(completed.resolution.normal.meepleIdsReturned).not.toContain(MONASTERY_MEEPLE_ID);
    expect(completed.state.meeples.find((meeple) => meeple.id === MONASTERY_MEEPLE_ID)).toMatchObject({
      position: MONASTERY_POSITION,
      placement: { featureType: 'monastery', edge: null },
    });
  });

  it('awards the completed monastery only to its meeple owner', () => {
    const completed = completeTurn(monasteryState());

    expect(completed.state.scores).toEqual({ [p1.id]: COMPLETED_MONASTERY_SCORE, [p2.id]: 0 });
    expect(completed.resolution.normal.scoreDeltaByPlayerId).toEqual({
      [p1.id]: COMPLETED_MONASTERY_SCORE,
    });
  });
});
