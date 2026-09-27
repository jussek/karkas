import { describe, expect, it } from 'vitest';
import { applyActionWithResolution, createGame } from '../engine/gameEngine';
import { buildTurnResolution } from '../engine/turnResolution';
import { resolveGlobalFeature } from '../rules/globalFeatures';
import { getTestTile, TILE_FIELD_ALL, TILE_MONASTERY } from '../tiles/testTiles';
import type { Board, GameState, Player } from '../types/state';

const player: Player = { id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 };
const center = { x: 0, y: 0 };
const neighbors = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 },                        { x: 1, y: 0 },
  { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 },
] as const;

function boardWithNeighborCount(count: number): Board {
  const board: Board = {
    '0,0': { definitionId: TILE_MONASTERY.id, rotation: 0, position: center },
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

function monasteryFeature(board: Board) {
  return resolveGlobalFeature(
    { board, meeples: [], getDefinition: getTestTile },
    center,
    { featureType: 'monastery', edge: null },
  );
}

function readyToEndState(): GameState {
  const initial = createGame({
    gameId: 'monastery-end-turn',
    players: [player],
    deck: ['sentinel'],
    getDefinition: getTestTile,
    startTile: { definitionId: TILE_MONASTERY.id, position: center },
  });
  const board = boardWithNeighborCount(8);
  const completingPosition = neighbors[7];
  return {
    ...initial,
    board,
    gamePhase: 'scoreFeatures',
    scores: { [player.id]: 0 },
    lastPlacedTile: {
      definitionId: TILE_FIELD_ALL.id,
      rotation: 0,
      position: completingPosition,
      playerId: player.id,
    },
    meeples: initial.meeples.map((meeple, index) => index === 0 ? {
      ...meeple,
      position: center,
      placement: { featureType: 'monastery', edge: null },
    } : meeple),
  };
}

describe('Stage 4A monastery completion and authoritative End Turn', () => {
  it('is incomplete with seven neighbors and complete with all eight', () => {
    const incomplete = monasteryFeature(boardWithNeighborCount(7));
    const complete = monasteryFeature(boardWithNeighborCount(8));
    expect(incomplete?.type).toBe('monastery');
    expect(incomplete?.completed).toBe(false);
    expect(incomplete?.surroundingTilesFilled).toBe(7);
    expect(complete?.type).toBe('monastery');
    expect(complete?.completed).toBe(true);
    expect(complete?.surroundingTilesFilled).toBe(8);
  });

  it('scores nine, emits one event, and returns the meeple only on End Turn', () => {
    const before = readyToEndState();
    const placedMeeple = before.meeples.find((meeple) => meeple.position !== null)!;
    expect(before.gamePhase).toBe('scoreFeatures');
    expect(before.scores[player.id]).toBe(0);
    expect(placedMeeple.position).toEqual(center);

    const completed = applyActionWithResolution(
      before,
      { type: 'COMPLETE_TURN', playerId: player.id },
      getTestTile,
    );
    if (!completed.ok || !completed.resolution) throw new Error('authoritative End Turn failed');
    const resolution = buildTurnResolution({
      previousPlayerId: player.id,
      nextPlayerId: completed.state.players[completed.state.currentPlayerIndex].id,
      gameOver: false,
      normal: completed.resolution.normal,
      final: completed.resolution.final ?? null,
      finalScores: null,
    });

    expect(completed.state.scores[player.id] - before.scores[player.id]).toBe(9);
    expect(resolution.scoreEvents).toHaveLength(1);
    expect(resolution.scoreEvents[0]).toMatchObject({
      featureType: 'monastery', points: 9, playerIds: [player.id],
    });
    expect(resolution.returnedMeepleIds).toEqual([placedMeeple.id]);
    expect(completed.state.meeples.find((meeple) => meeple.id === placedMeeple.id)?.position).toBeNull();

    const playerIndexAfterFirst = completed.state.currentPlayerIndex;
    const repeated = applyActionWithResolution(
      completed.state,
      { type: 'COMPLETE_TURN', playerId: player.id },
      getTestTile,
    );
    expect(repeated.ok).toBe(false);
    expect(completed.state.scores[player.id]).toBe(9);
    expect(completed.state.currentPlayerIndex).toBe(playerIndexAfterFirst);
    expect(completed.state.meeples.find((meeple) => meeple.id === placedMeeple.id)?.position).toBeNull();
    expect(resolution.scoreEvents).toHaveLength(1);
    expect(resolution.returnedMeepleIds).toHaveLength(1);
  });
});
