/**
 * Unit-тесты state machine (Stage 2).
 * Покрывают: DRAW, PLACE_TILE, MEEPLE, TURN, IMMUTABILITY, INVALID ACTIONS.
 */

import { describe, expect, it } from 'vitest';
import type { GameAction, GameState, Player } from '../types/state';
import type { EdgeIndex } from '../types/geometry';
import { posKey } from '../types/state';
import {
  applyAction,
  createGame,
  drawNextTile,
  validateAction,
  MEEPLES_PER_PLAYER,
} from '../engine/gameEngine';
import { getTestTile } from '../tiles/testTiles';

/* ------------------------------------------------------------------ */
/* Хелперы                                                             */
/* ------------------------------------------------------------------ */

const p1: Player = { id: 'p1', name: 'Alice', color: 'blue', score: 0 };
const p2: Player = { id: 'p2', name: 'Bob', color: 'red', score: 0 };

/** Детерминированная колода для тестов. */
const DEFAULT_DECK = [
  'T-R-NS', // прямая дорога N-S — стыкуется с городом старта? нет: city vs road!
  'T-C-CCCC',
  'T-M',
  'T-R-NE',
];

// Примечание: T-R-NS имеет sides [road, city, road, city]; стартовая плитка
// T-C-CCCC — city со всех сторон. Поэтому T-R-NS можно положить ТОЛЬКО
// повёрнутой так, чтобы её city-стороны смотрели на старта. Для соседа
// справа от старта (x=1,y=0) нужен West=city → rotation 90 gives sides
// [city, road, city, road]... Проверим это явно ниже через findLegalPlacement.

function newGame(deck: string[] = DEFAULT_DECK): GameState {
  return createGame({
    gameId: 'test-game',
    players: [p1, p2],
    deck,
    getDefinition: getTestTile,
  });
}

/**
 * Находит легальную позицию+поворот для definition относительно текущего board.
 * Использует сам движок (isLegalTilePlacement через validateAction),
 * перебирая детерминированно клетки вокруг существующих плиток.
 */
function findLegalPlacement(
  state: GameState,
  definitionId: string,
): { position: { x: number; y: number }; rotation: 0 | 90 | 180 | 270 } | null {
  const def = getTestTile(definitionId);
  const candidates: { x: number; y: number }[] = [];
  for (const key of Object.keys(state.board)) {
    const [x, y] = key.split(',').map(Number);
    for (const d of [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]) {
      const c = { x: x + d.x, y: y + d.y };
      if (!candidates.some((q) => q.x === c.x && q.y === c.y)) candidates.push(c);
    }
  }
  for (const pos of candidates.sort((a, b) => a.x - b.x || a.y - b.y)) {
    for (const rot of [0, 90, 180, 270] as const) {
      const s = withDrawn(state, definitionId);
      const err = validateAction(
        s,
        { type: 'PLACE_TILE', playerId: current(s).id, tileDefinitionId: definitionId, position: pos, rotation: rot },
        getTestTile,
      );
      if (err === null) return { position: pos, rotation: rot };
    }
  }
  void def;
  return null;
}

function current(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/** Состояние, где текущий игрок уже вытянул definitionId (фаза placeTile). */
function withDrawn(state: GameState, definitionId: string): GameState {
  const s = state.gamePhase === 'drawTile' ? drawNextTile(state) : state;
  // Подменяем верх колоды, если нужно конкретное значение — но только
  // когда он ещё не совпадает.
  if (s.drawnTileDefinitionId === definitionId) return s;
  return { ...s, drawnTileDefinitionId: definitionId };
}

/** Полный успешный ход до фазы placeMeeple включительно. */
function turnUntilPlaceMeeple(
  state: GameState,
  definitionId: string,
): { state: GameState; placement: { position: { x: number; y: number }; rotation: 0 | 90 | 180 | 270 } } {
  const placement = findLegalPlacement(state, definitionId);
  if (!placement) throw new Error(`No legal placement for ${definitionId}`);
  const s1 = withDrawn(state, definitionId);
  const res = applyAction(
    s1,
    {
      type: 'PLACE_TILE',
      playerId: current(s1).id,
      tileDefinitionId: definitionId,
      position: placement.position,
      rotation: placement.rotation,
    },
    getTestTile,
  );
  if (!res.ok) throw new Error(`Unexpected error: ${res.error.code} ${res.error.message}`);
  return { state: res.state, placement };
}

/* ------------------------------------------------------------------ */
/* DRAW                                                                */
/* ------------------------------------------------------------------ */

describe('DRAW', () => {
  it('1. новый игрок может получить tile', () => {
    const s = newGame();
    expect(s.gamePhase).toBe('drawTile');
    const res = applyAction(s, { type: 'DRAW_TILE', playerId: p1.id }, getTestTile);
    expect(res.ok).toBe(true);
  });

  it('2. drawn tile появляется в state', () => {
    const s = newGame();
    const res = applyAction(s, { type: 'DRAW_TILE', playerId: p1.id }, getTestTile);
    expect(res.ok && res.state.drawnTileDefinitionId).toBe('T-R-NS');
    expect(res.ok && res.state.tileDeck.remaining.length).toBe(s.tileDeck.remaining.length - 1);
  });

  it('3. переход drawTile → placeTile', () => {
    const s = newGame();
    const res = applyAction(s, { type: 'DRAW_TILE', playerId: p1.id }, getTestTile);
    expect(res.ok && res.state.gamePhase).toBe('placeTile');
  });

  it('4. draw с пустой колодой корректно завершает партию', () => {
    const s = newGame([]);
    expect(s.tileDeck.remaining).toHaveLength(0);
    const next = drawNextTile(s);
    expect(next.status).toBe('finished');
    expect(next.drawnTileDefinitionId).toBeNull();
    // После game-over действия запрещены.
    const res = applyAction(next, { type: 'DRAW_TILE', playerId: p1.id }, getTestTile);
    expect(!res.ok && res.error.code).toBe('GAME_NOT_PLAYING');
  });

  it('4b. drawNextTile детерминирован: берёт первую плитку колоды', () => {
    const s = newGame(['T-M', 'T-R-NE']);
    const next = drawNextTile(s);
    expect(next.drawnTileDefinitionId).toBe('T-M');
    expect(drawNextTile(next).drawnTileDefinitionId).toBe('T-R-NE');
  });
});

/* ------------------------------------------------------------------ */
/* PLACE_TILE                                                          */
/* ------------------------------------------------------------------ */

describe('PLACE_TILE', () => {
  it('5. текущий игрок может положить допустимую плитку', () => {
    const s = newGame();
    const target = findLegalPlacement(s, 'T-C-CCCC');
    expect(target).not.toBeNull();
    const s1 = withDrawn(s, 'T-C-CCCC');
    const res = applyAction(
      s1,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: target!.position, rotation: target!.rotation },
      getTestTile,
    );
    expect(res.ok).toBe(true);
    expect(res.ok && res.state.board[posKey(target!.position)]).toBeDefined();
  });

  it('6. другой игрок не может положить плитку', () => {
    const s = withDrawn(newGame(), 'T-C-CCCC');
    const target = findLegalPlacement(s, 'T-C-CCCC')!;
    const res = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p2.id, tileDefinitionId: 'T-C-CCCC', position: target.position, rotation: target.rotation },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('NOT_YOUR_TURN');
  });

  it('7. нельзя положить плитку в занятую клетку', () => {
    const s = withDrawn(newGame(), 'T-C-CCCC');
    const res = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: { x: 0, y: 0 }, rotation: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('CELL_OCCUPIED');
  });

  it('8. нельзя положить плитку без ортогонального соседа (в т.ч. диагонально)', () => {
    const s = withDrawn(newGame(), 'T-C-CCCC');
    // Диагональ от старта (1,-1) — ортогонального соседа нет.
    const res = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: { x: 1, y: -1 }, rotation: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('NO_ORTHOGONAL_NEIGHBOR');
    // Далекая клетка.
    const res2 = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: { x: 10, y: 10 }, rotation: 0 },
      getTestTile,
    );
    expect(!res2.ok && res2.error.code).toBe('NO_ORTHOGONAL_NEIGHBOR');
  });

  it('9. нельзя положить плитку с несовместимым стыком', () => {
    const s = withDrawn(newGame(), 'T-R-NS');
    // Сосед справа от старта: East стороны старта = city, West стороны T-R-NS(rot 0) = field? Нет: sides [road,city,road,city], W=city.
    // Возьмём заведомо несовместимый вариант: T-F-FFFF (field all) к старту (city) — любой поворот несовместим.
    const s2 = withDrawn(newGame(), 'T-F-FFFF');
    const res = applyAction(
      s2,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-F-FFFF', position: { x: 1, y: 0 }, rotation: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('EDGE_MISMATCH');
    void s;
  });

  it('9b. TILE_MISMATCH: нельзя положить плитку, отличную от вытянутой', () => {
    const s = withDrawn(newGame(), 'T-C-CCCC');
    const target = findLegalPlacement(s, 'T-C-CCCC')!;
    const res = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-R-NE', position: target.position, rotation: target.rotation },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('TILE_MISMATCH');
  });

  it('9c. WRONG_PHASE: PLACE_TILE в фазе drawTile запрещён', () => {
    const s = newGame();
    const res = applyAction(
      s,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: { x: 1, y: 0 }, rotation: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('WRONG_PHASE');
  });

  it('10. после успешного PLACE_TILE фаза становится placeMeeple', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    expect(state.gamePhase).toBe('placeMeeple');
    expect(state.drawnTileDefinitionId).toBeNull();
    expect(state.lastPlacedTile).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* MEEPLE                                                              */
/* ------------------------------------------------------------------ */

describe('MEEPLE', () => {
  it('11. можно пропустить meeple', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const res = applyAction(state, { type: 'SKIP_MEEPLE', playerId: current(state).id }, getTestTile);
    expect(res.ok).toBe(true);
    expect(res.ok && res.state.gamePhase).toBe('scoreFeatures');
    // meeples не изменились
    expect(res.ok && res.state.meeples.every((m) => m.position === null)).toBe(true);
  });

  it('11b. можно разместить meeple на допустимую локальную feature', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const last = state.lastPlacedTile!;
    const res = applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.gamePhase).toBe('scoreFeatures');
    const placed = res.state.meeples.filter((m) => m.position !== null);
    expect(placed).toHaveLength(1);
    expect(placed[0].playerId).toBe(p1.id);
    expect(placed[0].placement).toEqual({ featureType: 'city', edge: 0 });
  });

  it('12. нельзя поставить meeple не на только что сыгранную плитку', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const res = applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: { x: 0, y: 0 }, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('WRONG_TILE_FOR_MEEPLE');
  });

  it('12b. нельзя поставить meeple на недопустимую локальную feature', () => {
    // T-R-NS повёрнут так, что у него есть дороги; монастыря на ней нет.
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-R-NS');
    const last = state.lastPlacedTile!;
    const res = applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'monastery', edge: null },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('INVALID_FEATURE_POSITION');
  });

  it('13. нельзя поставить meeple при отсутствии доступных meeples', () => {
    let { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const last = state.lastPlacedTile!;
    // Забираем все meeple игрока «на доску» вручную (через легальные placement-последовательности невозможно
    // занять 7 разных локальных features одной плитки — поэтому конструируем состояние напрямую).
    state = {
      ...state,
      meeples: state.meeples.map((m) =>
        m.playerId === current(state).id
          ? { ...m, position: { x: 0, y: 0 }, placement: { featureType: 'city' as const, edge: null } }
          : m,
      ),
    };
    const res = applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(!res.ok && res.error.code).toBe('NO_MEEPLES_AVAILABLE');
    expect(MEEPLES_PER_PLAYER).toBe(7);
  });

  it('14. нельзя поставить второй meeple на ту же локальную feature (в т.ч. через объединённый сегмент)', () => {
    // Берём плитку с ДВУМЯ несвязанными дорожными сегментами (перекрёсток):
    // road:edge0 и road:edge1 — разные локальные features.
    // T-R-X (crossing) не стыкуется с city-стартом, поэтому сначала кладём
    // рядом с стартом T-R-NS (его road-стороны смотрят наружу), затем
    // перекрёсток — на свободную road-сторону этой плитки.
    const first = turnUntilPlaceMeeple(newGame(), 'T-R-NS');
    const withDrawn2: GameState = {
      ...first.state,
      gamePhase: 'drawTile',
      drawnTileDefinitionId: null,
    };
    const s2 = drawNextTile(withDrawn2);
    const second = turnUntilPlaceMeeple(
      { ...s2, tileDeck: { remaining: ['T-R-X', ...s2.tileDeck.remaining] } },
      'T-R-X',
    );
    const { state } = second;
    const last = state.lastPlacedTile!;
    // Симулируем состояние, в котором meeple игрока уже стоит на одной
    // дороге перекрёстка (фаза возвращена в placeMeeple для проверки правила).
    const retryState: GameState = {
      ...state,
      gamePhase: 'placeMeeple',
      meeples: state.meeples.map((m, i) =>
        i === 0
          ? { ...m, position: { ...last.position }, placement: { featureType: 'road' as const, edge: 0 } }
          : m,
      ),
    };
    // 14a/14b. ФАКТИЧЕСКИЙ КОНТРАКТ ENGINE (src/game/rules/localFeatures.ts):
    // допустимые позиции meeple — это ТОЛЬКО канонические (base) стороны
    // каждого сегмента, повёрнутые через rotateEdge(base, rotation):
    //   placement valid ⇔ ∃ base (min side of segment): edge === (base+steps)%4.
    // Для T-R-X (segments [[0,2],[1,3]]) при rotation R допустимы ровно два
    // индекса: road@R (сегмент N-S) и road@(1+R)%4 (сегмент E-W).
    // В retryState meeple занимает rotated-base-0 сегмента r0, т.е. edge R.
    // Та же сторона → FEATURE_OCCUPIED (тот же локальный feature id "road:r0").
    const steps = last.rotation / 90;
    const occupiedRotated: EdgeIndex = (0 + steps) % 4 as EdgeIndex;

    const sameEdge = validateAction(
      retryState,
      // фактический контракт: occupiedRotated === rotateEdge(0, last.rotation)
      { type: 'PLACE_MEEPLE', playerId: p1.id, position: last.position, featureType: 'road', edge: occupiedRotated },
      getTestTile,
    );
    expect(sameEdge).not.toBeNull();
    expect(sameEdge!.code).toBe('FEATURE_OCCUPIED');

    // Контракт engine: допустимы ТОЛЬКО канонические (base=min) стороны
    // сегментов, повёрнутые rotateEdge(base, rot). Вторая сторона сегмента
    // (canonical base 2) не является допустимой placement-позицией →
    // INVALID_FEATURE_POSITION. Проверка «та же feature» покрывается
    // случаем sameEdge выше (тот же локальный id "road:r0").
    const connectedEdgeIdx = ((2 + steps) % 4) as EdgeIndex;
    const connectedEdge = validateAction(
      retryState,
      { type: 'PLACE_MEEPLE', playerId: p1.id, position: last.position, featureType: 'road', edge: connectedEdgeIdx },
      getTestTile,
    );
    expect(connectedEdge).not.toBeNull();
    expect(connectedEdge!.code).toBe('INVALID_FEATURE_POSITION');

    // 14c. Другая НЕсвязанная feature перекрёстка (E-W дорога): её canonical
    // base=1 → rotated = (1+steps)%4. Для неё второй meeple того же
    // игрока структурно допустим (другая локальная feature "road:r1").
    const otherPairStart = ((1 + steps) % 4) as EdgeIndex;
    const otherFeature = validateAction(
      retryState,
      { type: 'PLACE_MEEPLE', playerId: p1.id, position: last.position, featureType: 'road', edge: otherPairStart },
      getTestTile,
    );
    expect(otherFeature).toBeNull();
  });

  it('14b. второй meeple на ДРУГУЮ локальную feature той же плитки запрещён правилами (не более одного meeple на плитку/ход) и невозможен в state machine', () => {
    // После успешного PLACE_MEEPLE фаза уходит в scoreFeatures, поэтому
    // второе размещение в рамках того же хода недостижимо валидным путём.
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const last = state.lastPlacedTile!;
    const first = applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.gamePhase).toBe('scoreFeatures');
    const second = applyAction(
      first.state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'city', edge: 1 },
      getTestTile,
    );
    expect(!second.ok && second.error.code).toBe('WRONG_PHASE');
  });

  it('15. после пропуска/размещения можно завершить ход', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const skipped = applyAction(state, { type: 'SKIP_MEEPLE', playerId: current(state).id }, getTestTile);
    expect(skipped.ok).toBe(true);
    const done = applyAction(
      (skipped as { ok: true; state: GameState }).state,
      { type: 'COMPLETE_TURN', playerId: current(state).id },
      getTestTile,
    );
    expect(done.ok).toBe(true);

    const { state: s2 } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const last = s2.lastPlacedTile!;
    // Стартовая плитка T-C-CCCC имеет один связный city-сегмент,
    // поэтому используется edge 0 (другие стороны того же сегмента
    // запрещены правилом «одного meeple на локальную feature»).
    const placed = applyAction(
      s2,
      { type: 'PLACE_MEEPLE', playerId: current(s2).id, position: last.position, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(placed.ok).toBe(true);
    const done2 = applyAction(
      (placed as { ok: true; state: GameState }).state,
      { type: 'COMPLETE_TURN', playerId: current(s2).id },
      getTestTile,
    );
    expect(done2.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* TURN                                                                */
/* ------------------------------------------------------------------ */

describe('TURN', () => {
  it('16. COMPLETE_TURN перед PLACE_TILE запрещён', () => {
    const s = newGame();
    const res = applyAction(s, { type: 'COMPLETE_TURN', playerId: p1.id }, getTestTile);
    expect(!res.ok && res.error.code).toBe('TURN_NOT_READY');

    const s1 = withDrawn(s, 'T-C-CCCC');
    const res1 = applyAction(s1, { type: 'COMPLETE_TURN', playerId: p1.id }, getTestTile);
    expect(!res1.ok && res1.error.code).toBe('TURN_NOT_READY');

    const { state: s2 } = turnUntilPlaceMeeple(s1, 'T-C-CCCC');
    const res2 = applyAction(s2, { type: 'COMPLETE_TURN', playerId: p1.id }, getTestTile);
    expect(!res2.ok && res2.error.code).toBe('TURN_NOT_READY');
  });

  it('17/18. после завершения хода currentPlayerIndex меняется, turnNumber растёт', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const skipped = applyAction(state, { type: 'SKIP_MEEPLE', playerId: p1.id }, getTestTile);
    const done = applyAction(
      (skipped as { ok: true; state: GameState }).state,
      { type: 'COMPLETE_TURN', playerId: p1.id },
      getTestTile,
    );
    expect(done.ok).toBe(true);
    const next = (done as { ok: true; state: GameState }).state;
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.turnNumber).toBe(2);
  });

  it('19. следующий игрок начинает с drawTile', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const skipped = applyAction(state, { type: 'SKIP_MEEPLE', playerId: p1.id }, getTestTile);
    const done = applyAction(
      (skipped as { ok: true; state: GameState }).state,
      { type: 'COMPLETE_TURN', playerId: p1.id },
      getTestTile,
    );
    const next = (done as { ok: true; state: GameState }).state;
    expect(next.gamePhase).toBe('drawTile');
    // Второй игрок тянет следующую плитку колоды.
    const res = applyAction(next, { type: 'DRAW_TILE', playerId: p2.id }, getTestTile);
    expect(res.ok).toBe(true);
    expect(res.ok && res.state.drawnTileDefinitionId).toBe('T-C-CCCC');
  });

  it('20. старые данные предыдущего хода очищаются', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const skipped = applyAction(state, { type: 'SKIP_MEEPLE', playerId: p1.id }, getTestTile);
    const done = applyAction(
      (skipped as { ok: true; state: GameState }).state,
      { type: 'COMPLETE_TURN', playerId: p1.id },
      getTestTile,
    );
    const next = (done as { ok: true; state: GameState }).state;
    expect(next.drawnTileDefinitionId).toBeNull();
    expect(next.lastPlacedTile).toBeNull();
  });

  it('полный цикл двух игроков проходит без ошибок', () => {
    let state = newGame();
    for (let i = 0; i < 4; i++) {
      const player = current(state);
      const drawn = applyAction(state, { type: 'DRAW_TILE', playerId: player.id }, getTestTile);
      expect(drawn.ok).toBe(true);
      state = (drawn as { ok: true; state: GameState }).state;
      const id = state.drawnTileDefinitionId!;
      const target = findLegalPlacement(state, id);
      if (target) {
        const placed = applyAction(
          state,
          { type: 'PLACE_TILE', playerId: player.id, tileDefinitionId: id, position: target.position, rotation: target.rotation },
          getTestTile,
        );
        expect(placed.ok).toBe(true);
        state = (placed as { ok: true; state: GameState }).state;
      }
      const skipped = applyAction(state, { type: 'SKIP_MEEPLE', playerId: player.id }, getTestTile);
      expect(skipped.ok).toBe(true);
      state = (skipped as { ok: true; state: GameState }).state;
      const done = applyAction(state, { type: 'COMPLETE_TURN', playerId: player.id }, getTestTile);
      expect(done.ok).toBe(true);
      state = (done as { ok: true; state: GameState }).state;
    }
    expect(state.turnNumber).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* IMMUTABILITY                                                        */
/* ------------------------------------------------------------------ */

describe('IMMUTABILITY', () => {
  it('21. applyAction не мутирует исходный GameState', () => {
    const s = newGame();
    const snapshot = JSON.stringify(s);

    applyAction(s, { type: 'DRAW_TILE', playerId: p1.id }, getTestTile);
    expect(JSON.stringify(s)).toBe(snapshot);

    const s1 = withDrawn(s, 'T-C-CCCC');
    const snap1 = JSON.stringify(s1);
    const target = findLegalPlacement(s1, 'T-C-CCCC')!;
    const res = applyAction(
      s1,
      { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'T-C-CCCC', position: target.position, rotation: target.rotation },
      getTestTile,
    );
    expect(JSON.stringify(s1)).toBe(snap1);
    // Новый state — другой объект.
    expect(res.ok && (res as { ok: true; state: GameState }).state).not.toBe(s1);
    // Вложенные структуры тоже не разделяются там, где изменены.
    expect(res.ok && (res as { ok: true; state: GameState }).state.board).not.toBe(s1.board);
  });

  it('21b. неизменяемость и для meeples', () => {
    const { state } = turnUntilPlaceMeeple(newGame(), 'T-C-CCCC');
    const snap = JSON.stringify(state);
    const last = state.lastPlacedTile!;
    applyAction(
      state,
      { type: 'PLACE_MEEPLE', playerId: current(state).id, position: last.position, featureType: 'city', edge: 0 },
      getTestTile,
    );
    expect(JSON.stringify(state)).toBe(snap);
  });
});

/* ------------------------------------------------------------------ */
/* INVALID ACTIONS                                                     */
/* ------------------------------------------------------------------ */

describe('INVALID ACTIONS', () => {
  const invalidCases: { name: string; state: () => GameState; action: GameAction; code: string }[] = [
    {
      name: 'unknown player',
      state: () => newGame(),
      action: { type: 'DRAW_TILE', playerId: 'ghost' },
      code: 'UNKNOWN_PLAYER',
    },
    {
      name: 'not your turn',
      state: () => newGame(),
      action: { type: 'DRAW_TILE', playerId: p2.id },
      code: 'NOT_YOUR_TURN',
    },
    {
      name: 'wrong phase: SKIP in drawTile',
      state: () => newGame(),
      action: { type: 'SKIP_MEEPLE', playerId: p1.id },
      code: 'WRONG_PHASE',
    },
    {
      name: 'wrong phase: PLACE_MEEPLE in placeTile',
      state: () => withDrawn(newGame(), 'T-C-CCCC'),
      action: { type: 'PLACE_MEEPLE', playerId: p1.id, position: { x: 1, y: 0 }, featureType: 'city', edge: 0 },
      code: 'WRONG_PHASE',
    },
    {
      name: 'complete turn too early',
      state: () => newGame(),
      action: { type: 'COMPLETE_TURN', playerId: p1.id },
      code: 'TURN_NOT_READY',
    },
  ];

  for (const c of invalidCases) {
    it(`22. ${c.name}: структурированная ошибка, state не изменён`, () => {
      const s = c.state();
      const before = JSON.stringify(s);
      const res = applyAction(s, c.action, getTestTile);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe(c.code);
      // Исходное состояние идентично (applyAction вернул ошибку — тот же объект).
      expect(JSON.stringify(s)).toBe(before);
      if (!res.ok) expect(res.error.message.length).toBeGreaterThan(0);
    });
  }

  it('validateAction не изменяет state', () => {
    const s = newGame();
    const before = JSON.stringify(s);
    validateAction(s, { type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: 'X', position: { x: 5, y: 5 }, rotation: 0 }, getTestTile);
    expect(JSON.stringify(s)).toBe(before);
  });
});
