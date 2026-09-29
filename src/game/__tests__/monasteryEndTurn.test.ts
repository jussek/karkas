import { describe, expect, it } from 'vitest';
import { applyActionWithResolution } from '../engine/gameEngine';
import { resolveGlobalFeature } from '../rules/globalFeatures';
import { getTestTile, TILE_FIELD_ALL, TILE_MONASTERY } from '../tiles/testTiles';
import type { Board, GameState, Meeple, Player } from '../types/state';

const players: Player[] = [
  { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 },
];

const neighbors = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];

function boardWithNeighborCount(count: number): Board {
  const board: Board = {
    '0,0': { definitionId: TILE_MONASTERY.id, rotation: 0, position: { x: 0, y: 0 } },
  };
  for (const position of neighbors.slice(0, count)) {
    board[`${position.x},${position.y}`] = {
      definitionId: TILE_FIELD_ALL.id,
      rotation: 0,
      position,
    };
  }
  return board;
}

function monasteryMeeples(): Meeple[] {
  return [
    {
      id: 'p1-m0',
      playerId: 'p1',
      position: { x: 0, y: 0 },
      placement: { featureType: 'monastery', edge: null },
    },
    { id: 'p2-m0', playerId: 'p2', position: null, placement: null },
  ];
}

function endTurnState(): GameState {
  const lastPosition = neighbors[7];
  return {
    gameId: 'monastery-end-turn',
    status: 'playing',
    players,
    board: boardWithNeighborCount(8),
    tileDeck: { remaining: [TILE_FIELD_ALL.id] },
    currentPlayerIndex: 0,
    turnNumber: 4,
    scores: { p1: 0, p2: 0 },
    meeples: monasteryMeeples(),
    gamePhase: 'scoreFeatures',
    drawnTileDefinitionId: null,
    lastPlacedTile: {
      definitionId: TILE_FIELD_ALL.id,
      rotation: 0,
      position: lastPosition,
      playerId: 'p1',
    },
  };
}

function monasteryFeature(board: Board) {
  return resolveGlobalFeature(
    { board, meeples: monasteryMeeples(), getDefinition: getTestTile },
    { x: 0, y: 0 },
    { featureType: 'monastery', edge: null },
  );
}

describe('Stage 4A monastery completion through authoritative End Turn', () => {
  it('is incomplete with seven surrounding cells and complete with eight', () => {
    expect(monasteryFeature(boardWithNeighborCount(7))).toMatchObject({
      completed: false,
      surroundingTilesFilled: 7,
    });
    expect(monasteryFeature(boardWithNeighborCount(8))).toMatchObject({
      completed: true,
      surroundingTilesFilled: 8,
    });
  });

  it('scores nine points and returns the meeple exactly once', () => {
    const before = endTurnState();
    expect(before.scores.p1).toBe(0);
    expect(before.meeples[0].position).toEqual({ x: 0, y: 0 });

    const once = applyActionWithResolution(
      before,
      { type: 'COMPLETE_TURN', playerId: 'p1' },
      getTestTile,
    );
    if (!once.ok || !once.resolution) throw new Error('authoritative End Turn failed');

    expect(once.state.scores.p1).toBe(9);
    expect(once.state.meeples[0]).toMatchObject({ position: null, placement: null });
    expect(once.resolution.normal.awards).toHaveLength(1);
    expect(once.resolution.normal.awards[0]).toMatchObject({
      featureType: 'monastery',
      points: 9,
      winnerPlayerIds: ['p1'],
    });
    expect(once.resolution.normal.meepleIdsReturned).toEqual(['p1-m0']);
    expect(once.state.currentPlayerIndex).toBe(1);

    const twice = applyActionWithResolution(
      once.state,
      { type: 'COMPLETE_TURN', playerId: 'p2' },
      getTestTile,
    );
    expect(twice.ok).toBe(false);
    expect(once.state.scores.p1).toBe(9);
    expect(once.state.meeples[0].position).toBeNull();
    expect(once.state.currentPlayerIndex).toBe(1);
  });
});
