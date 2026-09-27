import { describe, expect, it } from 'vitest';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { applyActionWithResolution, createGame } from '../engine/gameEngine';
import { buildTurnResolution } from '../engine/turnResolution';
import { isLegalTilePlacement } from '../rules/placement';
import type { Rotation } from '../types/geometry';
import type { Board, GameState, Player } from '../types/state';

/**
 * Stage 4A: монастырь завершается, когда все 8 соседних координат заняты.
 * Подсчёт происходит ТОЛЬКО на End Turn (COMPLETE_TURN) — единый
 * authoritative проход скоринга; события строятся из того же результата
 * (buildTurnResolution), повторного скоринга нет. Монастырский meeple
 * возвращается после завершения; повторный End Turn ничего не дублирует.
 */

const p1: Player = { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 };
const p2: Player = { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 };

/** Позиция → выбранная ротация fillera (фиксируется DFS-поиском фикстуры). */
type PlacementChoice = { tileId: string; rotation: Rotation; pos: { x: number; y: number } };

interface MonasteryFixture {
  monasteryId: string;
  /** 8 соседей в порядке заполнения DFS (7 первых — до monastery, последний — завершающий). */
  neighbors: PlacementChoice[];
}

const NEIGHBOR_OFFSETS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
  { x: -1, y: 0 }, { x: 2, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];

/**
 * Детерминированный поиск ЛЕГАЛЬНОЙ фикстуры через authoritative engine API.
 *
 * КЛЮЧЕВОЕ: легальность проверяется PER POSITION против ТЕКУЩЕЙ доски после
 * каждого размещения (кандидат, легальный рядом с card-091, может стать
 * нелегальным после ортогонального соседа). Поэтому используется DFS с
 * backtracking по 8 позициям; следующим выбирается позиция с наименьшим
 * числом текущих легальных кандидатов (эвристика fail-first).
 *
 * Fillers — уникальные non-river карты без монастырей (deck uniqueness
 * соблюдается); monastery — первая canonical карта с монастырём и без дорог.
 */
function findMonasteryFixture(): MonasteryFixture {
  // 1) monastery candidate (engine topology, без ручных предположений)
  let monasteryId: string | null = null;
  const fillerIds: string[] = [];
  for (let i = 1; i <= 144 && fillerIds.length < 24; i += 1) {
    const id = `card-${String(i).padStart(3, '0')}`;
    let def;
    try {
      if (getCardDefinition(id).riverCard) continue;
      def = getTileDefinition(id);
    } catch {
      continue; // card-106 исключён из runtime
    }
    const roadCount = def.topology.roadEdgeSegments.filter((v) => v !== null).length;
    if (!monasteryId && def.topology.hasMonastery && roadCount === 0) {
      monasteryId = id;
      continue;
    }
    if (!def.topology.hasMonastery) fillerIds.push(id);
  }
  if (!monasteryId) throw new Error('monastery fixture not found in canonical catalog');

  // 2) DFS: заполняем 8 соседей вокруг старта (0,0), легальность — engine'ом.
  //    Диагональные позиции (например (1,-1)) не имеют ортогонального соседа,
  //    пока не заполнены их ортогональные соседи, — DFS это учитывает сам,
  //    т.к. легальность всегда проверяется против ТЕКУЩЕЙ доски.
  const board: Board = {
    '0,0': { definitionId: 'card-091', rotation: 0, position: { x: 0, y: 0 } },
  };
  const used = new Set<string>();
  const chosen: PlacementChoice[] = [];

  const legalChoicesFor = (pos: { x: number; y: number }): PlacementChoice[] => {
    const out: PlacementChoice[] = [];
    for (const tileId of fillerIds) {
      if (used.has(tileId)) continue;
      const def = getTileDefinition(tileId);
      for (const step of [0, 1, 2, 3]) {
        const rotation = (step * 90) as Rotation;
        if (isLegalTilePlacement(
          { board, getDefinition: getTileDefinition }, def, rotation, pos,
        ).legal) {
          out.push({ tileId, rotation, pos: { x: pos.x, y: pos.y } });
        }
      }
    }
    return out;
  };

  const unfilled = () =>
    NEIGHBOR_OFFSETS.map((_, idx) => idx).filter((idx) => !chosen[idx]);

  const solve = (): boolean => {
    const remaining = unfilled();
    if (remaining.length === 0) return true;
    // fail-first: позиция с минимумом текущих легальных кандидатов
    let bestIdx = remaining[0];
    let bestChoices = legalChoicesFor(NEIGHBOR_OFFSETS[bestIdx]);
    for (const idx of remaining.slice(1)) {
      const choices = legalChoicesFor(NEIGHBOR_OFFSETS[idx]);
      if (choices.length < bestChoices.length) {
        bestIdx = idx;
        bestChoices = choices;
        if (choices.length === 0) break;
      }
    }
    for (const choice of bestChoices) {
      const pos = NEIGHBOR_OFFSETS[bestIdx];
      board[`${pos.x},${pos.y}`] = { definitionId: choice.tileId, rotation: choice.rotation, position: pos };
      used.add(choice.tileId);
      chosen[bestIdx] = { ...choice, pos };
      if (solve()) return true;
      delete board[`${pos.x},${pos.y}`];
      used.delete(choice.tileId);
      delete chosen[bestIdx];
    }
    return false;
  };

  if (!solve()) {
    throw new Error('no legal monastery neighbor arrangement found via engine DFS');
  }
  return { monasteryId, neighbors: chosen };
}

const FIXTURE = findMonasteryFixture();
const FILLER_ROTATIONS = new Map<string, Rotation>(
  FIXTURE.neighbors.map((c) => [c.tileId, c.rotation]),
);

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

/**
 * Порядок заполнения соседей monastery (1,0): все 8 ортогональных соседей
 * фикстуры, кроме последнего — его кладём завершающим ходом. Позиции и
 * карты берутся из DFS-результата, поэтому каждая placement легальна против
 * доски, построенной предыдущими ходами (порядок fill-first сохранён).
 */
const MONASTERY_POS = { x: 1, y: 0 };
const SEVEN_STEPS = FIXTURE.neighbors.slice(0, 7).map((c) => ({ ...c }));
const LAST_STEP = FIXTURE.neighbors[7];

/** Готовит доску: 7 соседей заняты, monastery в (1,0) с meeple p1, его ход завершён. */
function boardWithIncompleteMonastery(gameId: string): GameState {
  const deckIds = SEVEN_STEPS.map((s) => s.tileId).concat([FIXTURE.monasteryId, LAST_STEP.tileId]);
  let game = freshGame(gameId, deckIds);
  for (const step of SEVEN_STEPS) {
    game = playFullTurn(game, p1.id, step.tileId, step.pos);
  }
  const drawn = applyActionWithResolution(game, { type: 'DRAW_TILE', playerId: p1.id }, getTileDefinition);
  if (!drawn.ok) throw new Error('draw monastery failed');
  const placedState = placeAtAnyRotation(drawn.state, p1.id, FIXTURE.monasteryId, MONASTERY_POS);
  const withMeeple = applyActionWithResolution(placedState, {
    type: 'PLACE_MEEPLE', playerId: p1.id, position: MONASTERY_POS, featureType: 'monastery', edge: null,
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
    const placedLast = placeAtAnyRotation(drawnLast.state, p1.id, LAST_STEP.tileId, LAST_STEP.pos);
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
    const placedLast = placeAtAnyRotation(drawnLast.state, p1.id, LAST_STEP.tileId, LAST_STEP.pos);
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
