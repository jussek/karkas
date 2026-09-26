/**
 * Структурированные ошибки движка (Stage 2).
 * Ожидаемые пользовательские ошибки НЕ бросаются через throw —
 * они возвращаются как { ok: false, error } в ActionResult.
 */

export type GameErrorCode =
  /* Общие */
  | 'GAME_NOT_PLAYING'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  /* PLACE_TILE */
  | 'NO_DRAWN_TILE'
  | 'TILE_MISMATCH'
  | 'CELL_OCCUPIED'
  | 'NO_ORTHOGONAL_NEIGHBOR'
  | 'EDGE_MISMATCH'
  | 'UNKNOWN_TILE_DEFINITION'
  /* PLACE_MEEPLE */
  | 'NO_LAST_PLACED_TILE'
  | 'WRONG_TILE_FOR_MEEPLE'
  | 'INVALID_FEATURE_POSITION'
  | 'FEATURE_OCCUPIED'
  | 'NO_MEEPLES_AVAILABLE'
  /* COMPLETE_TURN */
  | 'TURN_NOT_READY';

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export function gameError(code: GameErrorCode, message: string): GameError {
  return { code, message };
}

/** Результат валидации: null — если ошибок нет. */
export type ValidationResult = GameError | null;
