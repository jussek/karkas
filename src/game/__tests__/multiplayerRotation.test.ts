import { describe, expect, it } from 'vitest';
import {
  createTurnFlow, drawTurnTile, endTurn, placeTurnTile, RIVER_CARD_COUNT,
} from '../engine/turnFlow';
import { buildPlayers } from '../session';

/**
 * Прогоняет ровно один полный ход: draw → place (первая legal клетка) → End Turn.
 * Возвращает active player id ПОСЛЕ End Turn.
 */
function playOneTurn(state: ReturnType<typeof createTurnFlow>): { state: ReturnType<typeof createTurnFlow>; endedWith: string } {
  let next = state;
  if (next.phase === 'GAME_OVER') throw new Error('unexpected game over');
  next = drawTurnTile(next);
  if (next.phase !== 'TILE_IN_HAND') throw new Error(`expected TILE_IN_HAND, got ${next.phase}`);
  next = placeTurnTile(next, next.legalPlacements[0]);
  if (next.phase !== 'TILE_PLACED') throw new Error(`expected TILE_PLACED, got ${next.phase}`);
  const before = next.game.players[next.game.currentPlayerIndex]?.id ?? '';
  next = endTurn(next);
  return { state: next, endedWith: before };
}

function activePlayerId(state: ReturnType<typeof createTurnFlow>): string {
  return state.game.players[state.game.currentPlayerIndex]?.id ?? '';
}

describe('Stage 4A cyclic active-player rotation for 1..6 players', () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    it(`${count} player(s): full cycle then wrap-around`, () => {
      const players = buildPlayers({ count });
      const expected = players.map((player) => player.id);
      let state = createTurnFlow({ gameId: `rot-${count}`, players, seed: 100 + count });

      // Река требует 18 ходов до перехода к обычным картам — цикл проверяется
      // на первых count ходах + оборот (wrap), всё ещё внутри реки.
      expect(activePlayerId(state)).toBe(expected[0]);
      const observed: string[] = [];
      for (let turn = 0; turn < expected.length + 1 && state.phase !== 'GAME_OVER'; turn += 1) {
        const result = playOneTurn(state);
        state = result.state;
        observed.push(activePlayerId(state));
      }
      // после хода игрока N активен игрок (N+1) % count
      const wanted = Array.from({ length: Math.min(observed.length, expected.length + 1) }, (_, i) => expected[(i + 1) % expected.length]);
      expect(observed.slice(0, wanted.length)).toEqual(wanted);
    });
  }

  it('1 player: the same player remains active after every End Turn', () => {
    let state = createTurnFlow({ gameId: 'rot-1', players: buildPlayers({ count: 1 }), seed: 7 });
    for (let turn = 0; turn < 6 && state.phase !== 'GAME_OVER'; turn += 1) {
      state = playOneTurn(state).state;
      expect(activePlayerId(state)).toBe('player-1');
    }
  });

  it('6 players: wrap from player-6 back to player-1', () => {
    const players = buildPlayers({ count: 6 });
    let state = createTurnFlow({ gameId: 'rot-6', players, seed: 42 });
    const sequence: string[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      state = playOneTurn(state).state;
      sequence.push(activePlayerId(state));
    }
    expect(sequence).toEqual(['player-2', 'player-3', 'player-4', 'player-5', 'player-6', 'player-1']);
  });

  it('river phase progresses one tile per End Turn regardless of player count', () => {
    let state = createTurnFlow({ gameId: 'rot-river', players: buildPlayers({ count: 3 }), seed: 5 });
    for (let turn = 0; turn < 3; turn += 1) state = playOneTurn(state).state;
    expect(state.riverPlaced).toBe(4);
    expect(state.riverDeck.length).toBe(RIVER_CARD_COUNT - 4);
  });
});
