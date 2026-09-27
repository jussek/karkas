import { describe, expect, it } from 'vitest';
import { getTileDefinition } from '../cards/catalogApi';
import { createGame, MAX_PLAYERS, MIN_PLAYERS } from '../engine/gameEngine';
import { buildPlayers, defaultPlayerName, playerId, playerIdentity, PLAYER_IDENTITIES } from '../session';
import type { Player } from '../types/state';

function p(id: string): Player {
  return { id, name: id, color: 'blue', score: 0 };
}

describe('Stage 4A player count validation (engine)', () => {
  it('accepts exactly 1..6 players and rejects 0 and 7', () => {
    expect(MIN_PLAYERS).toBe(1);
    expect(MAX_PLAYERS).toBe(6);
    for (let count = 1; count <= 6; count += 1) {
      const game = createGame({
        gameId: `g-${count}`,
        players: Array.from({ length: count }, (_, i) => p(`player-${i + 1}`)),
        deck: ['card-091'],
        getDefinition: getTileDefinition,
      });
      expect(game.players).toHaveLength(count);
    }
    expect(() =>
      createGame({ gameId: 'g-0', players: [], deck: ['card-091'], getDefinition: getTileDefinition }),
    ).toThrow(/at least 1/);
    expect(() =>
      createGame({
        gameId: 'g-7',
        players: Array.from({ length: 7 }, (_, i) => p(`player-${i + 1}`)),
        deck: ['card-091'],
        getDefinition: getTileDefinition,
      }),
    ).toThrow(/at most 6/);
  });

  it('rejects duplicate player ids', () => {
    expect(() =>
      createGame({
        gameId: 'g-dup',
        players: [p('a'), p('a')],
        deck: ['card-091'],
        getDefinition: getTileDefinition,
      }),
    ).toThrow(/duplicate player id/);
  });
});

describe('Stage 4A buildPlayers session factory', () => {
  it('builds stable ids player-1..player-6 with default Russian names', () => {
    const players = buildPlayers({ count: 6 });
    expect(players.map((player) => player.id)).toEqual([
      'player-1', 'player-2', 'player-3', 'player-4', 'player-5', 'player-6',
    ]);
    expect(players.map((player) => player.name)).toEqual([
      'Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4', 'Игрок 5', 'Игрок 6',
    ]);
    expect(defaultPlayerName(3)).toBe('Игрок 3');
    expect(playerId(1)).toBe('player-1');
    expect(() => playerId(0)).toThrow(RangeError);
    expect(() => playerId(7)).toThrow(RangeError);
  });

  it('assigns six visually distinct identities and no color-dependent rules', () => {
    const colors = new Set(PLAYER_IDENTITIES.map((identity) => identity.color));
    const hexes = new Set(PLAYER_IDENTITIES.map((identity) => identity.hex));
    expect(colors.size).toBe(6);
    expect(hexes.size).toBe(6);
    expect(playerIdentity(2).hex).not.toBe(playerIdentity(5).hex);
  });

  it('accepts custom names and rejects invalid counts', () => {
    const players = buildPlayers({ count: 2, names: ['Аня', ' ', undefined] });
    expect(players[0].name).toBe('Аня');
    expect(players[1].name).toBe('Игрок 2');
    expect(() => buildPlayers({ count: 0 })).toThrow(RangeError);
    expect(() => buildPlayers({ count: 7 })).toThrow(RangeError);
    expect(() => buildPlayers({ count: 1.5 })).toThrow(RangeError);
  });
});
