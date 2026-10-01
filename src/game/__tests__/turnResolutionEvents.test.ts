import { describe, expect, it } from 'vitest';
import { buildTurnResolution, emptyTurnResolution } from '../engine/turnResolution';

describe('Stage 4A authoritative TurnResolution (single scoring pass)', () => {
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
