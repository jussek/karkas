/**
 * Игровой движок (Stage 2): детерминированный reducer GameState.
 *
 * Принципы:
 * - Чистый TypeScript, без React / Supabase / DOM / Math.random().
 * - applyAction() сначала валидирует (validateAction), затем возвращает
 *   НОВЫЙ GameState; исходное состояние не мутируется.
 * - Ожидаемые ошибки пользователя возвращаются структурированно
 *   ({ ok: false, error }), без throw.
 *
 * State machine хода (Carcassonne 2019):
 *
 *   drawTile ──DRAW──▶ placeTile ──PLACE_TILE──▶ placeMeeple
 *        ▲                                          │
 *        │                        PLACE_MEEPLE / SKIP_MEEPLE
 *        │                                          ▼
 *   COMPLETE_TURN ◀── scoreFeatures ◀──(авто-переход фазы)
 *
 * scoreFeatures на Stage 2 — транзитная фаза: переход в неё выполняется
 * автоматически после размещения/пропуска meeple и завершается действием
 * COMPLETE_TURN. Реальный подсчёт — Stage 3/4.
 */

import type {
  ActionResult,
  CompleteTurnAction,
  DrawTileAction,
  GameAction,
  GameState,
  Meeple,
  PlaceMeepleAction,
  PlaceTileAction,
  Player,
} from '../types/state';
import { meepleBoardKey, posKey } from '../types/state';
import type { TileDefinition, TilePosition } from '../types/geometry';
import type { ValidationResult } from './errors';
import { gameError } from './errors';
import { isLegalTilePlacement, type PlacementCheckContext } from '../rules/placement';
import {
  isPlacementOnValidFeature,
} from '../rules/localFeatures';
import { isGlobalFeatureOccupied } from '../rules/globalFeatures';
import { scoreCompletedFeaturesForTurn } from '../rules/scoring';
import { scoreFinalFeatures } from '../rules/finalScoring';

/* ------------------------------------------------------------------ */
/* Мееплы на игрока (базовая игра: 7 подданных)                       */
/* ------------------------------------------------------------------ */

export const MEEPLES_PER_PLAYER = 7;

function makePlayerMeeples(player: Player): Meeple[] {
  return Array.from({ length: MEEPLES_PER_PLAYER }, (_, i) => ({
    id: `${player.id}-m${i}`,
    playerId: player.id,
    position: null,
    placement: null,
  }));
}

/* ------------------------------------------------------------------ */
/* Создание игры                                                       */
/* ------------------------------------------------------------------ */

export interface CreateGameOptions {
  gameId: string;
  players: Player[];
  /**
   * Порядок колоды (первый элемент — верх колоды).
   * Детерминированный: никакого random shuffle на Stage 2.
   */
  deck: string[];
  getDefinition: (definitionId: string) => TileDefinition;
  /**
   * Стартовая плитка (кладётся до первого хода, как в базовой игре).
   * По умолчанию — TILE_CITY_ALL из тестового набора.
   */
  startTile?: { definitionId: string; position: TilePosition };
}

export function createGame(options: CreateGameOptions): GameState {
  if (options.players.length < 2) {
    throw new Error('createGame: at least 2 players required');
  }
  const start = options.startTile ?? {
    definitionId: 'T-C-CCCC',
    position: { x: 0, y: 0 },
  };
  // Валидность стартового шаблона проверяем сразу (это программная ошибка, не игровая).
  options.getDefinition(start.definitionId);

  const scores: Record<string, number> = {};
  const meeples: Meeple[] = [];
  for (const p of options.players) {
    scores[p.id] = 0;
    meeples.push(...makePlayerMeeples(p));
  }

  return {
    gameId: options.gameId,
    status: 'playing',
    players: options.players.map((p) => ({ ...p })),
    board: {
      [posKey(start.position)]: {
        definitionId: start.definitionId,
        rotation: 0,
        position: { ...start.position },
      },
    },
    tileDeck: { remaining: [...options.deck] },
    currentPlayerIndex: 0,
    turnNumber: 1,
    scores,
    meeples,
    gamePhase: 'drawTile',
    drawnTileDefinitionId: null,
    lastPlacedTile: null,
  };
}

/* ------------------------------------------------------------------ */
/* Детерминированный draw                                              */
/* ------------------------------------------------------------------ */

/**
 * Чистая функция: «тянущая» половина фазы drawTile.
 * Берёт ПЕРВУЮ плитку из tileDeck.remaining (никакого Math.random()).
 * Если колода пуста — партия переходит в finished (финальный scoring — Stage 4).
 */
export function drawNextTile(state: GameState): GameState {
  const next = state.tileDeck.remaining[0];
  if (next === undefined) {
    return { ...state, status: 'finished', drawnTileDefinitionId: null };
  }
  return {
    ...state,
    tileDeck: { remaining: state.tileDeck.remaining.slice(1) },
    drawnTileDefinitionId: next,
    gamePhase: 'placeTile',
  };
}

/* ------------------------------------------------------------------ */
/* Вспомогательные проверки                                            */
/* ------------------------------------------------------------------ */

function currentPlayer(state: GameState): Player | null {
  return state.players[state.currentPlayerIndex] ?? null;
}

/** Общий преамбула-чек для всех действий. */
function checkCommon(state: GameState, playerId: string): ValidationResult {
  if (state.status !== 'playing') {
    return gameError('GAME_NOT_PLAYING', 'Game is not in playing state.');
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return gameError('UNKNOWN_PLAYER', `Unknown player: ${playerId}`);
  }
  const cur = currentPlayer(state);
  if (!cur || cur.id !== playerId) {
    return gameError('NOT_YOUR_TURN', `It is not ${playerId}'s turn.`);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* validateAction                                                      */
/* ------------------------------------------------------------------ */

/**
 * Валидация действия WITHOUT изменения состояния.
 * Возвращает GameError либо null (действие допустимо).
 */
export function validateAction(
  state: GameState,
  action: GameAction,
  getDefinition: (id: string) => TileDefinition,
): ValidationResult {
  const common = checkCommon(state, action.playerId);
  if (common) return common;

  switch (action.type) {
    case 'DRAW_TILE':
      return validateDrawTile(state, action);
    case 'PLACE_TILE':
      return validatePlaceTile(state, action, getDefinition);
    case 'PLACE_MEEPLE':
      return validatePlaceMeeple(state, action, getDefinition);
    case 'SKIP_MEEPLE':
      if (state.gamePhase !== 'placeMeeple') {
        return gameError('WRONG_PHASE', 'SKIP_MEEPLE is only allowed in placeMeeple phase.');
      }
      return null;
    case 'COMPLETE_TURN':
      return validateCompleteTurn(state, action);
  }
}

function validateDrawTile(
  state: GameState,
  action: DrawTileAction,
): ValidationResult {
  void action;
  if (state.gamePhase !== 'drawTile') {
    return gameError('WRONG_PHASE', 'DRAW_TILE is only allowed in drawTile phase.');
  }
  return null;
}

function validatePlaceTile(
  state: GameState,
  action: PlaceTileAction,
  getDefinition: (id: string) => TileDefinition,
): ValidationResult {
  if (state.gamePhase !== 'placeTile') {
    return gameError('WRONG_PHASE', 'PLACE_TILE is only allowed in placeTile phase.');
  }
  if (state.drawnTileDefinitionId === null) {
    return gameError('NO_DRAWN_TILE', 'Current player has no drawn tile.');
  }
  if (action.tileDefinitionId !== state.drawnTileDefinitionId) {
    return gameError(
      'TILE_MISMATCH',
      `Action tile '${action.tileDefinitionId}' does not match drawn tile '${state.drawnTileDefinitionId}'.`,
    );
  }
  let definition: TileDefinition;
  try {
    definition = getDefinition(action.tileDefinitionId);
  } catch {
    return gameError('UNKNOWN_TILE_DEFINITION', `Unknown tile definition: ${action.tileDefinitionId}`);
  }
  // Геометрию НЕ дублируем — используем готовую проверку Stage 1.
  const ctx: PlacementCheckContext = { board: state.board, getDefinition };
  const placement = isLegalTilePlacement(ctx, definition, action.rotation, action.position);
  if (!placement.legal) {
    switch (placement.error) {
      case 'CELL_OCCUPIED':
        return gameError('CELL_OCCUPIED', 'Target cell is already occupied.');
      case 'NO_ORTHOGONAL_NEIGHBOR':
        return gameError('NO_ORTHOGONAL_NEIGHBOR', 'Tile must touch an existing tile orthogonally.');
      case 'EDGE_MISMATCH':
        return gameError(
          'EDGE_MISMATCH',
          `Incompatible edges at side(s): ${placement.mismatchedEdges?.join(', ')}`,
        );
    }
  }
  return null;
}

function validatePlaceMeeple(
  state: GameState,
  action: PlaceMeepleAction,
  getDefinition: (id: string) => TileDefinition,
): ValidationResult {
  if (state.gamePhase !== 'placeMeeple') {
    return gameError('WRONG_PHASE', 'PLACE_MEEPLE is only allowed in placeMeeple phase.');
  }
  const last = state.lastPlacedTile;
  if (!last) {
    return gameError('NO_LAST_PLACED_TILE', 'No tile was placed this turn yet.');
  }
  // Meeple ставится только на ТОЛЬКО ЧТО сыгранную плитку текущего хода.
  if (
    action.position.x !== last.position.x ||
    action.position.y !== last.position.y
  ) {
    return gameError(
      'WRONG_TILE_FOR_MEEPLE',
      'Meeple must be placed on the tile played this turn.',
    );
  }
  // Позиция должна соответствовать допустимому локальному feature плитки.
  const definition = getDefinition(last.definitionId);
  const valid = isPlacementOnValidFeature(definition, last.rotation, {
    featureType: action.featureType,
    edge: action.edge,
  });
  if (!valid) {
    return gameError(
      'INVALID_FEATURE_POSITION',
      `No ${action.featureType}${action.edge !== null ? ` at edge ${action.edge}` : ''} on this tile.`,
    );
  }
  const featureCtx = {
    board: state.board,
    meeples: state.meeples,
    getDefinition,
  };
  if (
    isGlobalFeatureOccupied(featureCtx, last.position, {
      featureType: action.featureType,
      edge: action.edge,
    })
  ) {
    return gameError(
      'FEATURE_OCCUPIED',
      'This connected feature already contains a meeple.',
    );
  }
  // У игрока должен быть свободный meeple.
  const available = state.meeples.some(
    (m) => m.playerId === action.playerId && m.position === null,
  );
  if (!available) {
    return gameError('NO_MEEPLES_AVAILABLE', 'All your meeples are on the board.');
  }
  return null;
}

function validateCompleteTurn(
  state: GameState,
  action: CompleteTurnAction,
): ValidationResult {
  // Завершать ход можно только после того, как плитка размещена
  // и решение по meeple принято (placeMeeple/scoreFeatures).
  if (state.gamePhase === 'drawTile' || state.gamePhase === 'placeTile') {
    return gameError(
      'TURN_NOT_READY',
      'COMPLETE_TURN is only allowed after the tile is placed and the meeple decision is made.',
    );
  }
  // В фазе placeMeeple решение по meeple ещё не принято.
  if (state.gamePhase === 'placeMeeple') {
    return gameError(
      'TURN_NOT_READY',
      'Place or skip the meeple before completing the turn.',
    );
  }
  void action;
  return null;
}

/* ------------------------------------------------------------------ */
/* applyAction                                                         */
/* ------------------------------------------------------------------ */

/**
 * Единая точка входа редьюсера.
 * Не мутирует входное состояние; при ошибке возвращает структурированный
 * результат, состояние не меняется.
 */
export function applyAction(
  state: GameState,
  action: GameAction,
  getDefinition: (id: string) => TileDefinition,
): ActionResult {
  const error = validateAction(state, action, getDefinition);
  if (error) return { ok: false, error };

  switch (action.type) {
    case 'DRAW_TILE':
      return { ok: true, state: drawNextTile(state) };
    case 'PLACE_TILE':
      return { ok: true, state: applyPlaceTile(state, action) };
    case 'PLACE_MEEPLE':
      return { ok: true, state: applyPlaceMeeple(state, action) };
    case 'SKIP_MEEPLE':
      return { ok: true, state: advanceToScoringPhase(state) };
    case 'COMPLETE_TURN':
      return { ok: true, state: applyCompleteTurn(state, getDefinition) };
  }
}

function applyPlaceTile(state: GameState, action: PlaceTileAction): GameState {
  const key = posKey(action.position);
  return {
    ...state,
    board: {
      ...state.board,
      [key]: {
        definitionId: action.tileDefinitionId,
        rotation: action.rotation,
        position: { x: action.position.x, y: action.position.y },
      },
    },
    // Вытянутая плитка «сыграна»: очищаем руку, запоминаем последний тайл.
    drawnTileDefinitionId: null,
    lastPlacedTile: {
      definitionId: action.tileDefinitionId,
      rotation: action.rotation,
      position: { x: action.position.x, y: action.position.y },
      playerId: action.playerId,
    },
    // Пока НЕ начисляем очки и НЕ ищем завершённые элементы (Stage 3/4).
    gamePhase: 'placeMeeple',
  };
}

function applyPlaceMeeple(state: GameState, action: PlaceMeepleAction): GameState {
  // Первый свободный meeple игрока — детерминированный выбор (по id-порядку).
  const idx = state.meeples.findIndex(
    (m) => m.playerId === action.playerId && m.position === null,
  );
  const meeples = state.meeples.map((m, i) =>
    i === idx
      ? {
          ...m,
          position: { x: action.position.x, y: action.position.y },
          placement: { featureType: action.featureType, edge: action.edge },
        }
      : m,
  );
  return {
    ...state,
    meeples,
    gamePhase: 'scoreFeatures',
  };
}

/**
 * Транзит фазы scoreFeatures. На Stage 2 подсчёт не выполняется —
 * фаза сохраняется явно (см. header-комментарий state machine).
 */
function advanceToScoringPhase(state: GameState): GameState {
  return { ...state, gamePhase: 'scoreFeatures' };
}

function applyCompleteTurn(
  state: GameState,
  getDefinition: (id: string) => TileDefinition,
): GameState {
  const scoring = state.lastPlacedTile
    ? scoreCompletedFeaturesForTurn(
        { board: state.board, meeples: state.meeples, getDefinition },
        state.lastPlacedTile.position,
      )
    : { scoreDeltaByPlayerId: {}, awards: [], meepleIdsReturned: [] };
  const returned = new Set(scoring.meepleIdsReturned);
  const scores = { ...state.scores };
  for (const [playerId, delta] of Object.entries(scoring.scoreDeltaByPlayerId)) {
    scores[playerId] = (scores[playerId] ?? 0) + delta;
  }
  const meeplesAfterNormalScoring = state.meeples.map((meeple) =>
    returned.has(meeple.id)
      ? { ...meeple, position: null, placement: null }
      : meeple,
  );

  if (state.tileDeck.remaining.length === 0) {
    const finalScoring = scoreFinalFeatures({
      board: state.board,
      meeples: meeplesAfterNormalScoring,
      getDefinition,
    });
    for (const [playerId, delta] of Object.entries(finalScoring.scoreDeltaByPlayerId)) {
      scores[playerId] = (scores[playerId] ?? 0) + delta;
    }
    const finalReturned = new Set(finalScoring.meepleIdsReturned);
    return {
      ...state,
      status: 'finished',
      scores,
      meeples: meeplesAfterNormalScoring.map((meeple) =>
        finalReturned.has(meeple.id)
          ? { ...meeple, position: null, placement: null }
          : meeple,
      ),
      turnNumber: state.turnNumber + 1,
      drawnTileDefinitionId: null,
      lastPlacedTile: null,
      gamePhase: 'turnComplete',
    };
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    scores,
    meeples: meeplesAfterNormalScoring,
    meeples: state.meeples.map((meeple) =>
      returned.has(meeple.id)
        ? { ...meeple, position: null, placement: null }
        : meeple,
    ),
    currentPlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    drawnTileDefinitionId: null,
    lastPlacedTile: null,
    gamePhase: 'drawTile',
  };
}

/** Ключ занятых локальных позиций — экспорт для тестов/будущих этапов. */
export function occupiedLocalPositions(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const m of state.meeples) {
    if (m.position && m.placement) s.add(meepleBoardKey(m));
  }
  return s;
}
