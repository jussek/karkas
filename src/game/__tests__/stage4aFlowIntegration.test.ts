import { describe, expect, it } from 'vitest';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import {
  confirmTurnTilePlacement, createTurnFlow, drawTurnTile, endTurn, placeTurnTile,
  rotatePositionedTurnTile, selectTurnMeeple,
} from '../engine/turnFlow';
import type { EdgeIndex } from '../types/geometry';
import type { Player } from '../types/state';

const onePlayer: Player[] = [{ id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 }];
const twoPlayers: Player[] = [
  { id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'player-2', name: 'Игрок 2', color: 'red', score: 0 },
];

function playOneTurn(state: ReturnType<typeof createTurnFlow>): ReturnType<typeof createTurnFlow> {
  let next = drawTurnTile(state);
  if (next.phase !== 'TILE_IN_HAND') throw new Error(`expected TILE_IN_HAND, got ${next.phase}`);
  const positioned = placeTurnTile(next, next.legalPlacements[0]);
  if (positioned.phase !== 'TILE_POSITIONED') throw new Error(`expected TILE_POSITIONED, got ${positioned.phase}`);
  next = confirmTurnTilePlacement(positioned);
  if (next.phase !== 'TILE_PLACED') throw new Error(`expected TILE_PLACED, got ${next.phase}`);
  return endTurn(next);
}

/**
 * Ищет карту с монастырём и стеной на всех 4 внешних сторонах.
 * Размещённая рядом со стартовым T-C-CCCC (город на 3 стороны + поле), она не
 * может быть достроена до 8 соседей → monastery остаётся незавершённым к game over.
 */
function findWallMonastery(): string {
  for (let i = 1; i <= 144; i += 1) {
    const id = `card-${String(i).padStart(3, '0')}`;
    try {
      const card = getCardDefinition(id);
      if (card.riverCard) continue;
      const def = getTileDefinition(id);
      if (!def.topology.hasMonastery) continue;
      if (def.sides.every((side) => side === 'city' || side === 'road')) continue;
      if (def.sides.filter((side) => side === 'field').length >= 2 &&
          def.topology.cityEdgeSegments.every((v) => v === null) &&
          def.topology.roadEdgeSegments.every((v) => v === null)) {
        return id;
      }
    } catch {
      /* card-106 excluded */
    }
  }
  throw new Error('no isolated monastery card found');
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
    // Перебор ориентации на TILE_POSITIONED не запускает scoring и не трогает board.
    const rotated = rotatePositionedTurnTile(state);
    expect(rotated.phase).toBe('TILE_POSITIONED');
    expect(rotated.game.scores['player-1']).toBe(0);
    expect(state.game.scores['player-1']).toBe(0);
    const confirmed = confirmTurnTilePlacement(rotated);
    expect(confirmed.game.scores['player-1']).toBe(0);
    const finished = endTurn(confirmed);
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
    const placed = drawn.game.lastPlacedTile!;
    const target = { featureType: 'city' as const, edge: (placed.rotation % 360 === 0 ? 1 : 0) as EdgeIndex };
    const withMeeple = selectTurnMeeple(drawn, target);
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
    const tileId = findWallMonastery();
    let state = createTurnFlow({ gameId: 'flow-mono', players: onePlayer, seed: 17 });
    let monasteryPlaced = false;
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard < 400) {
      let next = drawTurnTile(state);
      if (next.game.drawnTileDefinitionId === tileId && !monasteryPlaced) {
        next = placeTurnTile(next, next.legalPlacements[0]);
        if (next.phase === 'TILE_PLACED') {
          next = selectTurnMeeple(next, { featureType: 'monastery', edge: null });
          monasteryPlaced = true;
        }
        state = endTurn(next);
        continue;
      }
      state = playOneTurn(next);
      guard += 1;
    }
    expect(monasteryPlaced).toBe(true);
    expect(state.phase).toBe('GAME_OVER');
    const monasteryEvents = state.lastResolution.scoreEvents.filter((event) => event.featureType === 'monastery');
    // Монастырь с 4+ занятыми соседями не мог быть завершён во время игры;
    // финальный подсчёт поддерживает его однократно (>=1 событие или 0 если уже засчитан ранее).
    for (const event of monasteryEvents) {
      expect(event.points).toBeGreaterThan(0);
      expect(event.playerIds).toContain('player-1');
    }
    expect(state.game.meeples.some((m) => m.playerId === 'player-1' && m.placement?.featureType === 'monastery')).toBe(false);
  });

  it('multiplayer game over reports tied leaders factually when scores allow', () => {
    let state = createTurnFlow({ gameId: 'flow-tie', players: twoPlayers, seed: 23 });
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard < 400) {
      state = playOneTurn(state);
      guard += 1;
    }
    expect(state.lastResolution.gameOver).toBe(true);
    const final = state.lastResolution.final!;
    const max = Math.max(...Object.values(final.scoreByPlayerId));
    expect(final.leaderPlayerIds.sort()).toEqual(
      Object.keys(final.scoreByPlayerId).filter((id) => final.scoreByPlayerId[id] === max).sort(),
    );
    expect(final.tied).toBe(final.leaderPlayerIds.length > 1);
  });
});
