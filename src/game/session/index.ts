/**
 * Stage 4A — локальная сессия (без persistence).
 *
 * Чистый TypeScript: без React / DOM / Supabase / localStorage / Math.random().
 * Никакого сохранения/загрузки партий — только фабрика игроков и
 * конфигурация новой локальной партии. Случайный seed для реальных партий
 * генерируется browser-only bootstrap'ом (game-ui), вне домена.
 */

import type { Player } from '../types/state';

// MIN_PLAYERS / MAX_PLAYERS authoritative-экспортируются из движка (gameEngine).
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/gameEngine';
export { MAX_PLAYERS, MIN_PLAYERS };

/** Стабильные id игроков: player-1 … player-6. */
export function playerId(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > MAX_PLAYERS) {
    throw new RangeError(`playerId: index must be 1..${MAX_PLAYERS}, got ${index}`);
  }
  return `player-${index}`;
}

/** Имя по умолчанию: «Игрок N». */
export function defaultPlayerName(index: number): string {
  return `Игрок ${index}`;
}

/** UI-идентичность игрока (только презентация; правила от цвета не зависят). */
export const PLAYER_IDENTITIES = [
  { color: 'blue', hex: '#2f6fd6' },
  { color: 'red', hex: '#c8352e' },
  { color: 'green', hex: '#2f7f42' },
  { color: 'yellow', hex: '#d9a520' },
  { color: 'black', hex: '#2b2b2b' },
  { color: 'purple', hex: '#7b3fa0' },
] as const;

export type PlayerColor = Player['color'];

export function playerIdentity(index: number): { color: PlayerColor; hex: string } {
  if (!Number.isInteger(index) || index < 1 || index > MAX_PLAYERS) {
    throw new RangeError(`playerIdentity: index must be 1..${MAX_PLAYERS}, got ${index}`);
  }
  const identity = PLAYER_IDENTITIES[index - 1];
  return { color: identity.color, hex: identity.hex };
}

export interface BuildPlayersOptions {
  count: number;
  /** Необязательные переопределённые имена (по индексу 0..count-1). */
  names?: readonly (string | undefined)[];
}

/**
 * Строит массив игроков для createGame/createTurnFlow.
 * Бросает ошибку при count вне 1–6 — движок валидирует независимо.
 */
export function buildPlayers(options: BuildPlayersOptions): Player[] {
  const { count } = options;
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new RangeError(`buildPlayers: count must be ${MIN_PLAYERS}..${MAX_PLAYERS}, got ${count}`);
  }
  return Array.from({ length: count }, (_, i) => ({
    id: playerId(i + 1),
    name: options.names?.[i]?.trim() || defaultPlayerName(i + 1),
    color: playerIdentity(i + 1).color,
    score: 0,
  }));
}

export interface LocalGameConfig {
  gameId: string;
  seed: number;
  players: Player[];
}

/**
 * Детерминированная конфигурация новой локальной партии.
 * gameId/seed передаются явно (UI/bootstrap), чтобы домен оставался чистым.
 */
export function createLocalGameConfig(
  input: { gameId: string; seed: number; count: number; names?: readonly (string | undefined)[] },
): LocalGameConfig {
  return {
    gameId: input.gameId,
    seed: input.seed >>> 0,
    players: buildPlayers({ count: input.count, names: input.names }),
  };
}
