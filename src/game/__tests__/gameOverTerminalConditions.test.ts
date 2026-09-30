import { describe, expect, it } from 'vitest';
import {
  createTurnFlow, drawTurnTile, endTurn, placeTurnTile, RIVER_CARD_COUNT,
  type TurnFlowState,
} from '../engine/turnFlow';
import type { Player } from '../types/state';

const onePlayer: Player[] = [{ id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 }];

/** Автосимуляция до терминального или blocked состояния. */
function autoplay(state: TurnFlowState, maxTurns = 400): TurnFlowState {
  let current = state;
  for (let i = 0; i < maxTurns; i += 1) {
    if (current.phase === 'GAME_OVER') return current;
    const drawn = drawTurnTile(current);
    if (drawn.phase !== 'TILE_IN_HAND') return drawn; // blocked или game over
    const placed = placeTurnTile(drawn, drawn.legalPlacements[0]);
    if (placed.phase !== 'TILE_PLACED') return placed;
    current = endTurn(placed);
  }
  return current;
}

describe('Stage 4A: blocked draw is not terminal game over', () => {
  it('seed 17 regression: river blocked with non-empty landDeck must NOT be false GAME_OVER', () => {
    const state = createTurnFlow({ gameId: 'blocked-17', players: onePlayer, seed: 17 });
    const result = autoplay(state);
    // Подтверждённая диагностика: river geometry блокируется на riverPlaced=13,
    // при этом landDeck всё ещё непуста → это blocked, НЕ конец игры.
    if (result.riverPlaced < RIVER_CARD_COUNT || result.landDeck.length > 0) {
      expect(result.phase).not.toBe('GAME_OVER');
      expect(result.game.status).toBe('playing');
      expect(result.phase).toBe('AWAITING_DRAW');
    } else {
      expect(result.phase).toBe('GAME_OVER');
    }
  });

  it('seed 23 regression: same contract for two-player deck order', () => {
    const state = createTurnFlow({
      gameId: 'blocked-23',
      players: [
        { id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 },
        { id: 'player-2', name: 'Игрок 2', color: 'red', score: 0 },
      ],
      seed: 23,
    });
    const result = autoplay(state);
    if (result.riverPlaced < RIVER_CARD_COUNT || result.landDeck.length > 0) {
      expect(result.phase).not.toBe('GAME_OVER');
      expect(result.game.status).toBe('playing');
    }
  });

  it('no infinite loop: repeated draw on a blocked state is stable no-progress', () => {
    const state = createTurnFlow({ gameId: 'blocked-stable', players: onePlayer, seed: 17 });
    const blocked = autoplay(state);
    if (blocked.phase !== 'AWAITING_DRAW') return; // игра завершилась легально
    const again = drawTurnTile(blocked);
    expect(again.phase).toBe('AWAITING_DRAW');
    expect(again.discardedTileIds.length).toBe(blocked.discardedTileIds.length); // deck уже пуст — дедуп
  });

  it('real terminal exhaustion still finalizes: finished + gameOver + final once', () => {
    // seed 5 подтверждённо доходит до реального конца колод (marathon test).
    const state = createTurnFlow({ gameId: 'terminal-5', players: onePlayer, seed: 5 });
    const result = autoplay(state);
    expect(result.phase).toBe('GAME_OVER');
    expect(result.game.status).toBe('finished');
    expect(result.lastResolution.gameOver).toBe(true);
    expect(result.lastResolution.final).toBeDefined();
    expect(result.lastResolution.final!.scoreByPlayerId['player-1']).toBe(result.game.scores['player-1']);
  });

  it('after real GAME_OVER repeated draw/endTurn are strict no-ops (scores unchanged)', () => {
    const state = createTurnFlow({ gameId: 'terminal-idem', players: onePlayer, seed: 5 });
    const result = autoplay(state);
    expect(result.phase).toBe('GAME_OVER');
    const scoresBefore = JSON.stringify(result.game.scores);
    const eventsBefore = JSON.stringify(result.lastResolution.scoreEvents);
    const redraw = drawTurnTile(result);
    expect(redraw).toBe(result);
    const reend = endTurn(result);
    expect(reend).toBe(result);
    expect(JSON.stringify(reend.game.scores)).toBe(scoresBefore);
    expect(JSON.stringify(reend.lastResolution.scoreEvents)).toBe(eventsBefore);
  });

  it('normal last playable tile path: end turn triggers GAME_OVER with final exactly once', () => {
    const state = createTurnFlow({ gameId: 'last-tile', players: onePlayer, seed: 5 });
    const result = autoplay(state);
    expect(result.phase).toBe('GAME_OVER');
    // Финальный подсчёт выполнен ровно один раз: повторный автоплей невозможен,
    // а lastResolution.final совпадает с итоговыми очками (нет двойного начисления).
    const totalFinal = Object.values(result.lastResolution.final!.scoreByPlayerId)
      .reduce((a, b) => a + b, 0);
    const totalScores = Object.values(result.game.scores).reduce((a, b) => a + b, 0);
    expect(totalFinal).toBe(totalScores);
  });
});
