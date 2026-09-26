/**
 * Типы игрового состояния и действий.
 * UI только отображает GameState и отправляет GameAction —
 * правила живут исключительно в движке (src/game/engine, src/game/rules).
 */

import type {
  EdgeIndex,
  PlacedTile,
  Rotation,
  TilePosition,
} from './geometry';

/* ------------------------------------------------------------------ */
/* Игроки и meeple                                                     */
/* ------------------------------------------------------------------ */

export interface Player {
  id: string;
  name: string;
  /** Цвет используется только для UI-идентификации. */
  color: 'blue' | 'red' | 'green' | 'yellow' | 'black';
  score: number;
}

/** Тип элемента, на котором стоит meeple (Этап 1: без полей). */
export type FeatureType = 'road' | 'city' | 'monastery';

/** Meeple, размещённый на доске (или возвращённый игроку). */
export interface Meeple {
  id: string;
  playerId: string;
  /** null — meeple дома, у игрока. */
  placedAt: TilePosition | null;
  /** На какой стороне плитки стоит meeple (для дорог/городов). */
  edge: EdgeIndex | null;
  /** null, если meeple дома. */
  featureType: FeatureType | null;
}

/* ------------------------------------------------------------------ */
/* Доска                                                               */
/* ------------------------------------------------------------------ */

/** Ключ доски: "x,y". */
export function posKey(p: TilePosition): string {
  return `${p.x},${p.y}`;
}

/**
 * Доска — отображение ключа координаты в размещённую плитку.
 * Хранится как Record для простой сериализации (Supabase позже).
 */
export type Board = Record<string, PlacedTile>;

/* ------------------------------------------------------------------ */
/* Features (объединённые элементы ландшафта на доске)                 */
/*                                                                     */
/* Эти типы используются правилами/подсчётом на следующих этапах.      */
/* Определяются сейчас, чтобы архитектура была законченной.            */
/* ------------------------------------------------------------------ */

/** Общий базовый тип объединённого элемента. */
export interface BaseFeature {
  id: string;
  /** Все сегментные части, входящие в элемент (позиция + сторона + id сегмента). */
  parts: FeaturePart[];
  /** Id игроков с meeple на элементе. */
  occupantPlayerIds: string[];
  completed: boolean;
}

export interface FeaturePart {
  position: TilePosition;
  /** Сегмент внутри плитки ('center' для монастырей). */
  segmentId: string;
  /** Сторона, через которую часть соединяется с соседом (если применимо). */
  edge: EdgeIndex | null;
}

export interface Road extends BaseFeature {
  type: 'road';
}

export interface City extends BaseFeature {
  type: 'city';
  /** Количество тайловых «углов»/сегментов города. */
  tileCount: number;
  /** Shield-emblems учитываются при подсчёте — поле добавляется на этапе scoring. */
  shields: number;
}

export interface Monastery extends BaseFeature {
  type: 'monastery';
  /** Сколько из 8 соседних клеток занято. */
  surroundingTilesFilled: number;
}

export type Feature = Road | City | Monastery;

/* ------------------------------------------------------------------ */
/* Фаза хода и состояние игры                                          */
/* ------------------------------------------------------------------ */

/**
 * Фазы хода (Carcassonne 2019):
 * 1. drawTile     — игрок тянет плитку;
 * 2. placeTile    — игрок размещает плитку;
 * 3. placeMeeple  — игрок решает, ставить ли meeple (или SKIP_MEEPLE);
 * 4. scoreFeatures— подсчёт завершённых элементов (движок, автоматически);
 * 5. turnComplete — ход завершён (COMPLETE_TURN переходит к следующему).
 */
export type GamePhase =
  | 'drawTile'
  | 'placeTile'
  | 'placeMeeple'
  | 'scoreFeatures'
  | 'turnComplete';

export type GameStatus = 'setup' | 'playing' | 'finished';

/** Колода — упорядоченный список id шаблонов (детерминированный порядок). */
export interface TileDeck {
  /** Оставшиеся плитки (первый элемент — верх колоды). */
  remaining: string[];
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  players: Player[];
  board: Board;
  tileDeck: TileDeck;
  /** Индекс текущего игрока в массиве players. */
  currentPlayerIndex: number;
  turnNumber: number;
  scores: Record<string, number>;
  meeples: Meeple[];
  gamePhase: GamePhase;
  /** Плитка, которую текущий игрок вытянул и ещё не разместил. */
  drawnTileDefinitionId: string | null;
}

/* ------------------------------------------------------------------ */
/* Действия игрока                                                     */
/* ------------------------------------------------------------------ */

export type GameActionType =
  | 'PLACE_TILE'
  | 'PLACE_MEEPLE'
  | 'SKIP_MEEPLE'
  | 'COMPLETE_TURN';

export interface PlaceTileAction {
  type: 'PLACE_TILE';
  playerId: string;
  position: TilePosition;
  rotation: Rotation;
}

export interface PlaceMeepleAction {
  type: 'PLACE_MEEPLE';
  playerId: string;
  position: TilePosition;
  /** Сторона для дорог/городов; для монастыря — 'center' (null edge). */
  edge: EdgeIndex | null;
}

export interface SkipMeepleAction {
  type: 'SKIP_MEEPLE';
  playerId: string;
}

export interface CompleteTurnAction {
  type: 'COMPLETE_TURN';
  playerId: string;
}

export type GameAction =
  | PlaceTileAction
  | PlaceMeepleAction
  | SkipMeepleAction
  | CompleteTurnAction;

/** Результат применения действия: новое состояние или ошибка валидации. */
export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
