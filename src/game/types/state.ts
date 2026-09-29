/**
 * Типы игрового состояния и действий.
 * UI только отображает GameState и отправляет GameAction —
 * правила живут исключительно в движке (src/game/engine, src/game/rules).
 */

import type {
  EdgeIndex,
  LocalFeatureType,
  MeeplePlacement,
  PlacedTile,
  Rotation,
  TilePosition,
} from './geometry';
import { placementKey } from './geometry';
import type { GameError } from '../engine/errors';

/* ------------------------------------------------------------------ */
/* Игроки и meeple                                                     */
/* ------------------------------------------------------------------ */

export interface Player {
  id: string;
  name: string;
  /**
   * Стабильная строка CSS-цвета, используется ТОЛЬКО для UI-идентификации.
   * Игровые правила никогда не зависят от цвета (Stage 4A: 1–6 игроков).
   */
  color: string;
  score: number;
}

/** Тип элемента, на котором стоит meeple (пока без полей — Stage 3+). */
export type FeatureType = LocalFeatureType;

/**
 * Meeple на доске.
 * Stage 2: размещённый meeple однозначно описывается позицией плитки
 * и локальной feature-позицией (placement). Это позволяет в будущем
 * сопоставить meeple с глобальной объединённой feature (Stage 3)
 * и вернуть его при завершении элемента (Stage 4).
 */
export interface Meeple {
  id: string;
  playerId: string;
  /** null — meeple дома, у игрока. */
  position: TilePosition | null;
  /** Локальная позиция на плитке; null, если meeple дома. */
  placement: MeeplePlacement | null;
}

/** Позиция meeple как стабильный ключ ("x,y|featureType:edge"). */
export function meepleBoardKey(m: Meeple): string {
  if (!m.position || !m.placement) return '';
  return `${posKey(m.position)}|${placementKey(m.placement)}`;
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
  /**
   * Данные последнего хода (нужны для PLACE_MEEPLE / COMPLETE_TURN).
   * Очищаются при COMPLETE_TURN.
   */
  lastPlacedTile: LastPlacedTile | null;
}

/** Информация о плитке, размещённой текущим игроком на этом ходу. */
export interface LastPlacedTile {
  definitionId: string;
  rotation: Rotation;
  position: TilePosition;
  playerId: string;
}

/* ------------------------------------------------------------------ */
/* Действия игрока                                                     */
/* ------------------------------------------------------------------ */

export type GameActionType =
  | 'DRAW_TILE'
  | 'PLACE_TILE'
  | 'PLACE_MEEPLE'
  | 'SKIP_MEEPLE'
  | 'COMPLETE_TURN';

/**
 * DRAW_TILE — детерминированное «тянущее» действие фазы drawTile.
 * Является частью state machine (§1 Stage 2): переход
 * drawTile → placeTile происходит через отдельное действие,
 * а не скрыто внутри UI/движка.
 */
export interface DrawTileAction {
  type: 'DRAW_TILE';
  playerId: string;
}

export interface PlaceTileAction {
  type: 'PLACE_TILE';
  playerId: string;
  /**
   * Идентичность вытянутой плитки. Должна совпадать с
   * state.drawnTileDefinitionId — движок НЕ доверяет UI.
   */
  tileDefinitionId: string;
  position: TilePosition;
  rotation: Rotation;
}

export interface PlaceMeepleAction {
  type: 'PLACE_MEEPLE';
  playerId: string;
  /** Позиция только что размещённой плитки. */
  position: TilePosition;
  /**
   * Однозначная локальная feature-позиция подданного:
   * road/city + edge N/E/S/W, monastery + edge null.
   */
  featureType: LocalFeatureType;
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
  | DrawTileAction
  | PlaceTileAction
  | PlaceMeepleAction
  | SkipMeepleAction
  | CompleteTurnAction;

/** Результат применения действия: новое состояние или структурированная ошибка. */
export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: GameError };
