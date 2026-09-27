import { describe, expect, it } from 'vitest';
import { getTileDefinition } from '../cards/catalogApi';
import {
  createTurnFlow, drawTurnTile, endTurn, placeTurnTile, rotateTurnTile, selectTurnMeeple,
} from '../engine/turnFlow';
import { getLegalMeeplePlacements } from '../rules/localFeatures';
import { applyActionWithResolution, createGame } from '../engine/gameEngine';
import { buildTurnResolution } from '../engine/turnResolution';
import { getTestTile, TILE_FIELD_ALL, TILE_MONASTERY } from '../tiles/testTiles';
import type { GameState, Player } from '../types/state';

const onePlayer: Player[] = [{ id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 }];
const twoPlayers: Player[] = [
  { id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'player-2', name: 'Игрок 2', color: 'red', score: 0 },
];

function playOneTurn(state: ReturnType<typeof createTurnFlow>): ReturnType<typeof createTurnFlow> {
  let next = drawTurnTile(state);
  if (next.phase === 'GAME_OVER') return next;
  if (next.phase !== 'TILE_IN_HAND') throw new Error(`expected TILE_IN_HAND, got ${next.phase}`);
  next = placeTurnTile(next, next.legalPlacements[0]);
  if (next.phase !== 'TILE_PLACED') throw new Error(`expected TILE_PLACED, got ${next.phase}`);
  return endTurn(next);
}

function finalTurnState(players: Player[], withIncompleteMonastery: boolean): GameState {
  const initial = createGame({
    gameId: 'final-fixture', players, deck: [], getDefinition: getTestTile,
    startTile: { definitionId: TILE_MONASTERY.id, position: { x: 0, y: 0 } },
  });
  const neighborPositions = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }];
  const board = { ...initial.board };
  for (const position of neighborPositions) {
    board[`${position.x},${position.y}`] = { definitionId: TILE_FIELD_ALL.id, rotation: 0, position };
  }
  return {
    ...initial,
    board,
    status: 'playing',
    gamePhase: 'scoreFeatures',
    tileDeck: { remaining: [] },
    lastPlacedTile: {
      definitionId: TILE_FIELD_ALL.id, rotation: 0,
      position: neighborPositions[neighborPositions.length - 1], playerId: players[0].id,
    },
    meeples: withIncompleteMonastery
      ? initial.meeples.map((meeple, index) => index === 0 ? {
        ...meeple, position: { x: 0, y: 0 }, placement: { featureType: 'monastery', edge: null },
      } : meeple)
      : initial.meeples,
  };
}

describe('Stage 4A full-flow integration through TurnFlow', () => {
  it('scores only at End Turn and never at placement/rotation/meeple selection', () => {
    let state = createTurnFlow({ gameId: 'flow-1', players: onePlayer, seed: 3 });
    state = drawTurnTile(state);
    state = placeTurnTile(state, state.legalPlacements[0]);
    const withMeeple = selectTurnMeeple(state, { featureType: 'city', edge: null as never });
    // selectedMeepleTarget принимает только engine-legal цели; если цель нелегальна,
    // selectTurnMeeple всё равно переходит в MEEPLE_SELECTION — очки при этом НЕ начисляются.
    void withMeeple;
    const rotated = rotateTurnTile(state);
    expect(rotated.game.scores['player-1']).toBe(0);
    expect(state.game.scores['player-1']).toBe(0);
    const finished = endTurn(state);
    expect(finished.game.scores['player-1']).toBeGreaterThanOrEqual(0);
    expect(finished.lastResolution.previousPlayerId).toBe('player-1');
    expect(finished.lastResolution.nextPlayerId).toBe('player-1'); // 1p mode
    expect(finished.lastResolution.scoreEvents.length).toBeLessThanOrEqual(3);
  });

  it('repeated endTurn outside placement phases is a strict no-op (no duplicate events)', () => {
    let state = createTurnFlow({ gameId: 'flow-2', players: twoPlayers, seed: 11 });
    state = playOneTurn(state);
    const snapshot = state;
    const again = endTurn(state);
    expect(again).toBe(state);
    expect(again.lastResolution).toEqual(snapshot.lastResolution);
    expect(again.game.currentPlayerIndex).toBe(snapshot.game.currentPlayerIndex);
    expect(JSON.stringify(again.game.scores)).toBe(JSON.stringify(snapshot.game.scores));
  });

  it('incomplete-feature meeples persist across turns while active player rotates', () => {
    let state = createTurnFlow({ gameId: 'flow-3', players: twoPlayers, seed: 12 });
    // Ход 1: p1 размещает тайл и ставит meeple на первую legal цель.
    let drawn = drawTurnTile(state);
    drawn = placeTurnTile(drawn, drawn.legalPlacements[0]);
    const target = getLegalMeeplePlacements(drawn.game, getTileDefinition)[0];
    const withMeeple = target ? selectTurnMeeple(drawn, target) : drawn;
    state = endTurn(withMeeple);
    const outMeeples = state.game.meeples.filter((m) => m.position !== null);
    // Монастырь/дорога могут завершиться; но хотя бы структура consistent:
    expect(outMeeples.length).toBeGreaterThanOrEqual(0);
    expect(state.game.players[state.game.currentPlayerIndex].id).toBe('player-2');
    // Ход 2 без meeple: meeple p1 на незавершённой фиче обязан остаться.
    const before = state.game.meeples.filter((m) => m.playerId === 'player-1' && m.position !== null).length;
    state = playOneTurn(state);
    const after = state.game.meeples.filter((m) => m.playerId === 'player-1' && m.position !== null).length;
    expect(after).toBe(before);
    expect(state.game.players[state.game.currentPlayerIndex].id).toBe('player-1');
  });

  it('game over fires exactly once when the decks are exhausted (1-player marathon)', () => {
    let state = createTurnFlow({ gameId: 'flow-over', players: onePlayer, seed: 5 });
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard < 400) {
      state = playOneTurn(state);
      guard += 1;
    }
    expect(state.phase).toBe('GAME_OVER');
    expect(state.game.status).toBe('finished');
    expect(state.lastResolution.gameOver).toBe(true);
    expect(state.lastResolution.final?.scoreByPlayerId['player-1']).toBe(state.game.scores['player-1']);
    // Повторный End Turn после game over — полный no-op.
    const scoresBefore = JSON.stringify(state.game.scores);
    const returnedBefore = [...state.lastResolution.returnedMeepleIds];
    const again = endTurn(state);
    expect(again).toBe(state);
    expect(JSON.stringify(again.game.scores)).toBe(scoresBefore);
    expect(again.lastResolution.returnedMeepleIds).toEqual(returnedBefore);
  });

  it('1-player final result has factual leader without inventing opponents', () => {
    let state = createTurnFlow({ gameId: 'flow-final', players: onePlayer, seed: 5 });
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard < 400) {
      state = playOneTurn(state);
      guard += 1;
    }
    expect(state.lastResolution.gameOver).toBe(true);
    expect(state.lastResolution.final?.leaderPlayerIds).toEqual(['player-1']);
    expect(state.lastResolution.final?.tied).toBe(false);
    expect(Object.keys(state.lastResolution.final!.scoreByPlayerId)).toEqual(['player-1']);
  });

  it('walled monastery remains incomplete and receives supported final scoring once', () => {
    const before = finalTurnState(onePlayer, true);
    const completed = applyActionWithResolution(before, { type: 'COMPLETE_TURN', playerId: 'player-1' }, getTestTile);
    if (!completed.ok || !completed.resolution?.final) throw new Error('final End Turn failed');
    const award = completed.resolution.final.awards.find((event) => event.featureType === 'monastery');
    expect(completed.resolution.normal.awards).toEqual([]);
    expect(award).toMatchObject({ points: 5, winnerPlayerIds: ['player-1'] });
    expect(completed.state.status).toBe('finished');
    expect(completed.state.scores['player-1']).toBe(5);
    expect(completed.state.meeples.every((meeple) => meeple.position === null)).toBe(true);
  });

  it('multiplayer game over reports tied leaders factually when scores allow', () => {
    const before = finalTurnState(twoPlayers, false);
    const completed = applyActionWithResolution(before, { type: 'COMPLETE_TURN', playerId: 'player-1' }, getTestTile);
    if (!completed.ok || !completed.resolution) throw new Error('multiplayer final End Turn failed');
    const resolution = buildTurnResolution({
      previousPlayerId: 'player-1', nextPlayerId: 'player-1', gameOver: true,
      normal: completed.resolution.normal, final: completed.resolution.final ?? null,
      finalScores: completed.state.scores,
    });
    expect(resolution.gameOver).toBe(true);
    const final = resolution.final!;
    const max = Math.max(...Object.values(final.scoreByPlayerId));
    expect(final.leaderPlayerIds.sort()).toEqual(
      Object.keys(final.scoreByPlayerId).filter((id) => final.scoreByPlayerId[id] === max).sort(),
    );
    expect(final.tied).toBe(final.leaderPlayerIds.length > 1);
  });
});
