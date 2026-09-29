/**
 * Stage 4A — authoritative, engine-owned turn resolution events.
 *
 * Чистый TypeScript: без React / DOM / Supabase / Math.random().
 *
 * ВАЖНО: события НЕ пересчитывают очки заново. Они строятся из того же
 * единственного authoritative scoring pass (TurnScoringResult /
 * FinalScoringResult), который уже применил дельты к GameState.
 * React только рендерит результат endTurn(), ничего не вычисляя сам.
 */

import type { FeatureScoreType, TurnScoringResult } from '../rules/scoring';
import type { FinalScoringResult } from '../rules/finalScoring';

export interface TurnScoreEvent {
  featureType: FeatureScoreType;
  points: number;
  /**
   * Мажоритарные лидеры фичи. При ничьей список содержит ВСЕХ лидеров —
   * каждый получает полные `points`; игроки ниже максимума получают 0 и
   * в списке отсутствуют (их meeple всё равно возвращаются).
   */
  playerIds: string[];
  tied: boolean;
}

export interface TurnFinalScores {
  /** Итоговые очки всех игроков после финального подсчёта. */
  scoreByPlayerId: Record<string, number>;
  /** Фактические лидеры по очкам (при равенстве — все равные). */
  leaderPlayerIds: string[];
  /** true, если лидер больше одного (ничья допустима). */
  tied: boolean;
}

export interface TurnResolution {
  /** Пустой массив, если в этом ходу ничего не завершено/не засчитано. */
  scoreEvents: TurnScoreEvent[];
  /** Все возвращённые meeple (включая миноритарные) — детерминированный порядок. */
  returnedMeepleIds: string[];
  previousPlayerId: string;
  nextPlayerId: string;
  gameOver: boolean;
  /** Присутствует ровно на переходе game over (финальный подсчёт выполнен один раз). */
  final?: TurnFinalScores;
}

export interface BuildTurnResolutionInput {
  previousPlayerId: string;
  nextPlayerId: string;
  gameOver: boolean;
  normal: TurnScoringResult;
  final?: FinalScoringResult | null;
  /** Итоговые счета GameState (после применения обеих фаз) — для game over. */
  finalScores?: Record<string, number> | null;
}

function toScoreEvents(
  scoring: TurnScoringResult | FinalScoringResult,
): TurnScoreEvent[] {
  return scoring.awards
    .filter((award) => award.winnerPlayerIds.length > 0 && award.points > 0)
    .map((award) => ({
      featureType: award.featureType,
      points: award.points,
      playerIds: [...award.winnerPlayerIds],
      tied: award.winnerPlayerIds.length > 1,
    }));
}

function mergeReturned(...lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
}

function buildFinalScores(
  scores: Record<string, number>,
): TurnFinalScores {
  const maximum = Math.max(0, ...Object.values(scores));
  const leaderPlayerIds = Object.keys(scores)
    .filter((playerId) => scores[playerId] === maximum)
    .sort((a, b) => a.localeCompare(b));
  return {
    scoreByPlayerId: { ...scores },
    leaderPlayerIds,
    tied: leaderPlayerIds.length > 1,
  };
}

/**
 * Собирает authoritative событие одного End Turn из результатов ЕДИНОГО
 * scoring pass. Normal-назначения идут перед final (детерминированный
 * порядок road → city → monastery внутри каждой фазы сохранён rules).
 */
export function buildTurnResolution(input: BuildTurnResolutionInput): TurnResolution {
  const scoreEvents = [
    ...toScoreEvents(input.normal),
    ...(input.final ? toScoreEvents(input.final) : []),
  ];
  const resolution: TurnResolution = {
    scoreEvents,
    returnedMeepleIds: mergeReturned(
      input.normal.meepleIdsReturned,
      input.final?.meepleIdsReturned ?? [],
    ),
    previousPlayerId: input.previousPlayerId,
    nextPlayerId: input.nextPlayerId,
    gameOver: input.gameOver,
  };
  if (input.gameOver && input.finalScores) {
    resolution.final = buildFinalScores(input.finalScores);
  }
  return resolution;
}

/**
 * Разрешение «пустого» хода: endTurn вызван вне фазы размещения плитки.
 * Никаких очков, никаких возвратов, никакого перехода игрока — идемпотентно.
 */
export function emptyTurnResolution(playerId: string): TurnResolution {
  return {
    scoreEvents: [],
    returnedMeepleIds: [],
    previousPlayerId: playerId,
    nextPlayerId: playerId,
    gameOver: false,
  };
}
