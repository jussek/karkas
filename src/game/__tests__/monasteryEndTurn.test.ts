import { describe, expect, it } from 'vitest';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { applyActionWithResolution, createGame } from '../engine/gameEngine';
import { buildTurnResolution } from '../engine/turnResolution';
import { isLegalTilePlacement } from '../rules/placement';
import type { Rotation } from '../types/geometry';
import type { GameState, Player } from '../types/state';

/**
 * Stage 4A: монастырь завершается, когда все 8 соседних координат заняты.
 * Подсчёт происходит ТОЛЬКО на End Turn (COMPLETE_TURN) — единый
 * authoritative проход скоринга; события строятся из того же результата
 * (buildTurnResolution), повторного скоринга нет. Монастырский meeple
 * возвращается после завершения; повторный End Turn ничего не дублирует.
 */

const p1: Player = { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 };
const p2: Player = { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 };

const FILLER_ROTATIONS = new Map<string, Rotation>();

interface MonasterySetup {
  monasteryId: string;
  fillers: string[];
}

/**
 * Детерминированный поиск по canonical-каталогу (через engine legality,
 * без ручных предположений о топологии):
 * - monastery-плитка: ровно одно городское ребро и ноль дорог;
 * - fillers: НЕ river, без монастырей, с хотя бы одним городским ребром.
 *   Кандидат принимается, если существует ротация, легальная во ВСЕХ 8
 *   ортогональных соседях вокруг card-091 (тогда им можно заполнить любую
 *   позицию независимо от уже занятых соседей — все они тоже city-совместимы).
 */
function findMonasteryFixture(): MonasterySetup {
  let monasteryId: string | null = null;
  const fillers: string[] = [];
  const NEIGHBOR_OFFSETS = [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
    { x: -1, y: 0 }, { x: 2, y: 0 },
    { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
  ];
  const startBoard = { '0,0': { definitionId: 'card-091', rotation: 0 as Rotation, position: { x: 0, y: 0 } } };
  for (let i = 1; i <= 144 && (!monasteryId || fillers.length < 8); i += 1) {
    const id = `card-${String(i).padStart(3, '0')}`;
    let def;
    try {
      if (getCardDefinition(id).riverCard) continue;
      def = getTileDefinition(id);
    } catch {
      continue; // card-106 исключён
    }
    const cityCount = def.topology.cityEdgeSegments.filter((v) => v !== null).length;
    const roadCount = def.topology.roadEdgeSegments.filter((v) => v !== null).length;
    if (!monasteryId && def.topology.hasMonastery && cityCount === 1 && roadCount === 0) {
      monasteryId = id;
      continue;
    }
    if (def.topology.hasMonastery || cityCount === 0) continue;
    // filler: нужна ротация, легальная во всех 8 позициях вокруг старта
    for (let step = 0; step < 4; step += 1) {
      const rotation = (step * 90) as Rotation;
      const allLegal = NEIGHBOR_OFFSETS.every(
        (pos) => isLegalTilePlacement(
          { board: startBoard, getDefinition: getTileDefinition }, def, rotation, pos,
        ).legal,
      );
      if (allLegal) {
        FILLER_ROTATIONS.set(id, rotation);
        fillers.push(id);
        break;
      }
    }
  }
  if (!monasteryId || fillers.length < 8) {
    throw new Error('monastery fixture not found in canonical catalog');
  }
  return { monasteryId, fillers };
}

const FIXTURE = findMonasteryFixture();

/** Пустое игровое состояние: старт card-091 в (0,0), фаза drawTile. */
function freshGame(gameId: string, deck: string[]): GameState {
  return createGame({
    gameId,
    players: [p1, p2],
    deck,
    getDefinition: getTileDefinition,
    startTile: { definitionId: 'card-091', position: { x: 0, y: 0 } },
  });
}

/**
 * Размещает tile в позиции с первой легальной ротацией (engine legality —
 * никаких ручных правок доски).
 */
function placeAtAnyRotation(
  game: GameState,
  playerId: string,
  tileId: string,
  pos: { x: number; y: number },
): GameState {
  const preferred = FILLER_ROTATIONS.get(tileId);
  const order: Rotation[] = preferred != null ? [preferred, 0, 90, 180, 270] : [0, 90, 180, 270];
  for (const rotation of order) {
    const res = applyActionWithResolution(game, {
      type: 'PLACE_TILE', playerId, tileDefinitionId: tileId, position: pos, rotation,
    }, getTileDefinition);
    if (res.ok) return res.state;
  }
  throw new Error(`no legal rotation for ${tileId} at ${pos.x},${pos.y}`);
}

/** COMPLETE_TURN с построением TurnResolution из того же прохода скоринга. */
function playCompleteOnly(state: GameState, playerId: string) {
  const completed = applyActionWithResolution(state, { type: 'COMPLETE_TURN', playerId }, getTileDefinition);
  if (!completed.ok || !completed.resolution) throw new Error('complete turn failed');
  const nextPlayerId =
    completed.resolution.state.players[completed.resolution.state.currentPlayerIndex]?.id ?? playerId;
  return {
    state: completed.state,
    resolution: buildTurnResolution({
      previousPlayerId: playerId,
      nextPlayerId,
      gameOver: false,
      normal: completed.resolution.normal,
      final: completed.resolution.final ?? null,
      finalScores: null,
    }),
  };
}

/** Один полный ход: DRAW → PLACE → SKIP → COMPLETE_TURN. */
function playFullTurn(
  game: GameState,
  playerId: string,
  tileId: string,
  pos: { x: number; y: number },
): GameState {
  const drawn = applyActionWithResolution(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!drawn.ok) throw new Error(`draw failed: ${drawn.error.code}`);
  const placedState = placeAtAnyRotation(drawn.state, playerId, tileId, pos);
  const skipped = applyActionWithResolution(placedState, { type: 'SKIP_MEEPLE', playerId }, getTileDefinition);
  if (!skipped.ok) throw new Error('skip failed');
  return playCompleteOnly(skipped.state, playerId).state;
}

/** 7 соседей monastery в (1,0), кроме последнего (1,1). */
const SEVEN_NEIGHBORS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
  { x: -1, y: 0 }, { x: 2, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 },
];
const LAST_NEIGHBOR = { x: 1, y: 1 };

/** Готовит доску: 7 соседей заняты, monastery в (1,0) с meeple p1, его ход завершён. */
function boardWithIncompleteMonastery(gameId: string): GameState {
  let game = freshGame(gameId, [...FIXTURE.fillers]);
  for (let idx = 0; idx < 7; idx += 1) {
    game = playFullTurn(game, p1.id, FIXTURE.fillers[idx], SEVEN_NEIGHBORS[idx]);
  }
  const drawn = applyActionWithResolution(game, { type: 'DRAW_TILE', playerId: p1.id }, getTileDefinition);
  if (!drawn.ok) throw new Error('draw monastery failed');
  const placedState = placeAtAnyRotation(drawn.state, p1.id, FIXTURE.monasteryId, { x: 1, y: 0 });
  const withMeeple = applyActionWithResolution(placedState, {
    type: 'PLACE_MEEPLE', playerId: p1.id, position: { x: 1, y: 0 }, featureType: 'monastery', edge: null,
  }, getTileDefinition);
  if (!withMeeple.ok) throw new Error(`monastery meeple failed: ${withMeeple.error.code}`);
  return playCompleteOnly(withMeeple.state, p1.id).state;
}

describe('Stage 4A monastery completion scoring through End Turn', () => {
  it('scores the completed monastery only when End Turn is pressed', () => {
    const game = boardWithIncompleteMonastery('mono-live');
    // Монастырь незавершён (7 из 8 соседей) → 0 очков даже после End Turn.
    expect(game.scores[p1.id]).toBe(0);

    // Последний сосед: DRAW → PLACE (очков нет) → SKIP → COMPLETE_TURN (+9).
    const drawnLast = applyActionWithResolution(game, { type: 'DRAW_TILE', playerId: p1.id }, getTileDefinition);
    if (!drawnLast.ok) throw new Error('draw last failed');
    const placedLast = placeAtAnyRotation(drawnLast.state, p1.id, FIXTURE.fillers[7], LAST_NEIGHBOR);
    expect(placedLast.scores[p1.id]).toBe(0); // НЕ при placement
    const skippedLast = applyActionWithResolution(placedLast, { type: 'SKIP_MEEPLE', playerId: p1.id }, getTileDefinition);
    if (!skippedLast.ok) throw new Error('skip last failed');
    const endTurnResult = playCompleteOnly(skippedLast.state, p1.id);
    expect(endTurnResult.state.scores[p1.id]).toBeGreaterThanOrEqual(9);
    const monasteryEvent = endTurnResult.resolution.scoreEvents.find(
      (event) => event.featureType === 'monastery',
    );
    expect(monasteryEvent).toBeDefined();
    expect(monasteryEvent!.points).toBe(9);
    expect(monasteryEvent!.playerIds).toEqual([p1.id]);
    expect(endTurnResult.resolution.returnedMeepleIds.length).toBeGreaterThan(0);
  });

  it('repeated End Turn does not duplicate scoring or events', () => {
    const game = boardWithIncompleteMonastery('mono-idem');
    const drawnLast = applyActionWithResolution(game, { type: 'DRAW_TILE', playerId: p1.id }, getTileDefinition);
    if (!drawnLast.ok) throw new Error('draw last failed');
    const placedLast = placeAtAnyRotation(drawnLast.state, p1.id, FIXTURE.fillers[7], LAST_NEIGHBOR);
    const skippedLast = applyActionWithResolution(placedLast, { type: 'SKIP_MEEPLE', playerId: p1.id }, getTileDefinition);
    if (!skippedLast.ok) throw new Error('skip last failed');
    const once = playCompleteOnly(skippedLast.state, p1.id);
    expect(once.state.scores[p1.id]).toBeGreaterThanOrEqual(9);

    // Повторный COMPLETE_TURN вне фазы scoreFeatures — no-op или нулевой
    // результат: очки, meeples и события не меняются.
    const twiceRes = applyActionWithResolution(once.state, { type: 'COMPLETE_TURN', playerId: p1.id }, getTileDefinition);
    if (twiceRes.ok) {
      expect(twiceRes.state.scores).toEqual(once.state.scores);
      expect(twiceRes.state.meeples).toEqual(once.state.meeples);
      if (twiceRes.resolution) {
        expect(twiceRes.resolution.normal.awards).toEqual([]);
        expect(twiceRes.resolution.normal.meepleIdsReturned).toEqual([]);
      }
    }
  });
});
