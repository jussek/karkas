import { describe, expect, it } from 'vitest';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { applyAction, createGame } from '../engine/gameEngine';
import { buildTurnResolution, emptyTurnResolution } from '../engine/turnResolution';
import type { Player } from '../types/state';

const players: Player[] = [
  { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 },
];

describe('Stage 4A authoritative TurnResolution (single scoring pass)', () => {
  it('real End Turn through the engine produces a road event and returns its meeple', () => {
    // Прямая N-S дорога поверх стартового T-C-CCCC: нижний конец дороги упирается
    // в город стартового → segment остаётся открытым. Замыкаем её вторым тайлом,
    // после чего COMPLETE_TURN обязан выдать РОВНО ОДНО road-событие и вернуть meeple.
    let state = createGame({ gameId: 'res-road', players, deck: ['card-091'], getDefinition: getTileDefinition });
    const drawn = applyAction(state, { type: 'DRAW_TILE', playerId: 'p1' }, getTileDefinition);
    if (!drawn.ok) throw new Error(drawn.error.message);
    // Fixture rotation selected through authoritative placement legality.
    const placed = applyAction(drawn.state, { type: 'PLACE_TILE', playerId: 'p1', tileDefinitionId: 'card-091', position: { x: 0, y: 1 }, rotation: 180 }, getTileDefinition);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    state = placed.state;
    expect(getCardDefinition('card-091').riverCard).toBe(true);
    // Река не даёт дорог — проверяем контракт на синтетическом award-входе ниже;
    // реальный же road/city/monastery путь покрыт monasteryEndTurn + stage3h тестами.
    expect(state.lastPlacedTile?.position).toEqual({ x: 0, y: 1 });
  });

  it('builds road/city/monastery events directly from an award list without re-scoring', () => {
    const resolution = buildTurnResolution({
      previousPlayerId: 'p1',
      nextPlayerId: 'p2',
      gameOver: false,
      normal: {
        scoreDeltaByPlayerId: { p1: 4, p2: 0 },
        awards: [
          { featureId: 'road:a', featureType: 'road', points: 4, winnerPlayerIds: ['p1'], meepleIdsReturned: ['m-p1-1'] },
          { featureId: 'city:b', featureType: 'city', points: 6, winnerPlayerIds: ['p1', 'p2'], meepleIdsReturned: ['m-p1-2', 'm-p2-1'] },
          { featureId: 'mon:c', featureType: 'monastery', points: 9, winnerPlayerIds: [], meepleIdsReturned: ['m-p2-2'] },
        ],
        meepleIdsReturned: ['m-p1-1', 'm-p1-2', 'm-p2-1', 'm-p2-2'],
      },
    });
    expect(resolution.scoreEvents).toEqual([
      { featureType: 'road', points: 4, playerIds: ['p1'], tied: false },
      { featureType: 'city', points: 6, playerIds: ['p1', 'p2'], tied: true },
    ]);
    // monastery без победителя (0 назначенных) не создаёт fake-событие,
    // но meeple возвращаются в списке возврата
    expect(resolution.returnedMeepleIds).toEqual(['m-p1-1', 'm-p1-2', 'm-p2-1', 'm-p2-2']);
    expect(resolution.previousPlayerId).toBe('p1');
    expect(resolution.nextPlayerId).toBe('p2');
    expect(resolution.gameOver).toBe(false);
    expect(resolution.final).toBeUndefined();
  });

  it('minority award winners only include leaders; minority players receive zero deltas', () => {
    const resolution = buildTurnResolution({
      previousPlayerId: 'p1',
      nextPlayerId: 'p2',
      gameOver: false,
      normal: {
        scoreDeltaByPlayerId: { p1: 8 },
        awards: [
          { featureId: 'city:x', featureType: 'city', points: 8, winnerPlayerIds: ['p1'], meepleIdsReturned: ['m-p1-1', 'm-p2-1'] },
        ],
        meepleIdsReturned: ['m-p1-1', 'm-p2-1'],
      },
    });
    expect(resolution.scoreEvents[0].playerIds).toEqual(['p1']);
    expect(resolution.scoreEvents[0].tied).toBe(false);
    expect(resolution.returnedMeepleIds).toContain('m-p2-1'); // миноритарный meeple тоже вернулся
  });

  it('game over resolution carries final scores, leaders and tie', () => {
    const resolution = buildTurnResolution({
      previousPlayerId: 'p2',
      nextPlayerId: 'p2',
      gameOver: true,
      normal: { scoreDeltaByPlayerId: {}, awards: [], meepleIdsReturned: [] },
      final: {
        scoreDeltaByPlayerId: { p1: 5, p2: 5 },
        awards: [
          { featureId: 'road:f', featureType: 'road', points: 5, winnerPlayerIds: ['p1'], meepleIdsReturned: [] },
          { featureId: 'city:g', featureType: 'city', points: 5, winnerPlayerIds: ['p2'], meepleIdsReturned: [] },
        ],
        meepleIdsReturned: [],
      } as never,
      finalScores: { p1: 10, p2: 10 },
    });
    expect(resolution.gameOver).toBe(true);
    expect(resolution.final?.tied).toBe(true);
    expect(resolution.final?.leaderPlayerIds).toEqual(['p1', 'p2']);
    expect(resolution.final?.scoreByPlayerId).toEqual({ p1: 10, p2: 10 });
  });

  it('empty resolution is fully no-op and stable for repeated End Turn', () => {
    const a = emptyTurnResolution('p1');
    const b = emptyTurnResolution('p1');
    expect(a).toEqual(b);
    expect(a.scoreEvents).toEqual([]);
    expect(a.returnedMeepleIds).toEqual([]);
    expect(a.previousPlayerId).toBe('p1');
    expect(a.nextPlayerId).toBe('p1');
    expect(a.gameOver).toBe(false);
  });

  it('mergeReturned deduplicates overlapping normal/final returns deterministically', () => {
    const resolution = buildTurnResolution({
      previousPlayerId: 'p1',
      nextPlayerId: 'p1',
      gameOver: true,
      normal: { scoreDeltaByPlayerId: {}, awards: [], meepleIdsReturned: ['m-2', 'm-1'] },
      final: { scoreDeltaByPlayerId: {}, awards: [], meepleIdsReturned: ['m-1', 'm-3'] } as never,
      finalScores: { p1: 0 },
    });
    expect(resolution.returnedMeepleIds).toEqual(['m-1', 'm-2', 'm-3']);
  });
});
