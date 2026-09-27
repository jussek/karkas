import { createTurnFlow, type TurnFlowState } from '../../game/engine/turnFlow';
import type { Player } from '../../game/types/state';

export const DEFAULT_LOCAL_PLAYERS: readonly Player[] = [
  { id: 'blue', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'red', name: 'Игрок 2', color: 'red', score: 0 },
];

export interface LocalGameBootstrapOptions {
  gameId?: string;
  seed?: number;
  players?: readonly Player[];
}

function browserGameId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}`;
}

/**
 * Browser-only bootstrap for the current local game mode.
 * Random/session identity is deliberately kept outside the pure game domain and
 * callers/tests may provide deterministic values explicitly.
 */
export function createLocalGame(options: LocalGameBootstrapOptions = {}): TurnFlowState {
  return createTurnFlow({
    gameId: options.gameId ?? browserGameId(),
    seed: options.seed ?? (Date.now() >>> 0),
    players: (options.players ?? DEFAULT_LOCAL_PLAYERS).map((player) => ({ ...player })),
  });
}
