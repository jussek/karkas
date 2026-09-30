import { describe, expect, it } from 'vitest';
import { getCardDefinition } from '../cards/catalogApi';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import {
  canEndTurn,
  confirmTurnTilePlacement,
  createTurnFlow,
  drawTurnTile,
  endTurn,
  getLegalTilePlacementOptions,
  hasAnyLegalTilePlacement,
  legalPlacementsFor,
  placeTurnTile,
  replaceUnplayableTurnTile,
  ROTATIONS,
  RIVER_CARD_COUNT,
  type TurnFlowState,
} from '../engine/turnFlow';
import { emptyTurnResolution } from '../engine/turnResolution';
import { posKey, type Board, type Player } from '../types/state';
import type { Rotation } from '../types/geometry';

const players: Player[] = [
  { id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'player-2', name: 'Игрок 2', color: 'red', score: 0 },
];

/**
 * Fixture helper (только подготовка состояния; production code не меняется):
 * замкнутая доска 5x5 из РЕАЛЬНЫХ определений карты. Строится backtracking
 * поиском через сам authoritative legality (legalPlacementsFor), поэтому все
 * соседние стыки легальны по построению. Одна внешняя клетка остаётся
 * пустой — на ней замыкаются все открытые рёбра кольца. На этой доске
 * существуют реальные land-карты без единого legal placement ни для одной
 * rotation (проверяется в каждом тесте явно).
 */
const FIXTURE_OUTER: Rotation = 0;
const FIXTURE_START_ID = 'card-001';
const FIXTURE_CANDIDATES = ['card-001', 'card-002', 'card-003'];

function ringBoard(): Board {
  const cells: { x: number; y: number }[] = [];
  for (let x = -2; x <= 2; x += 1) for (let y = -2; y <= 2; y += 1) cells.push({ x, y });
  const inner = cells.filter((c) => Math.abs(c.x) + Math.abs(c.y) !== 4);
  const board: Board = { [posKey({ x: -2, y: -2 })]: { definitionId: FIXTURE_START_ID, rotation: FIXTURE_OUTER, position: { x: -2, y: -2 } } };
  const solve = (i: number): boolean => {
    if (i === inner.length) return true;
    const cell = inner[i];
    for (const id of FIXTURE_CANDIDATES) {
      for (const rot of [0, 90, 180, 270] as Rotation[]) {
        const probe = { game: { board } } as unknown as TurnFlowState;
        if (!legalPlacementsFor(probe, id, rot).some((p) => p.x === cell.x && p.y === cell.y)) continue;
        board[posKey(cell)] = { definitionId: id, rotation: rot, position: cell };
        if (solve(i + 1)) return true;
        delete board[posKey(cell)];
      }
    }
    return false;
  };
  if (!solve(0)) throw new Error('fixture: unable to build closed ring board');
  return board;
}

function unplayableLandIds(board: Board): string[] {
  const probe = { game: { board } } as unknown as TurnFlowState;
  return RUNTIME_CARD_CATALOG
    .filter((card) => !card.riverCard)
    .filter((card) => !ROTATIONS.some((rot) => legalPlacementsFor(probe, card.id, rot).length > 0))
    .map((card) => card.id);
}

function playableLandId(board: Board): string {
  const probe = { game: { board } } as unknown as TurnFlowState;
  const id = RUNTIME_CARD_CATALOG
    .filter((card) => !card.riverCard)
    .find((card) => ROTATIONS.some((rot) => legalPlacementsFor(probe, card.id, rot).length > 0));
  if (!id) throw new Error('fixture: no playable land card on ring board');
  return id.id;
}

/** TILE_IN_HAND state с указанной land-картой в руке на ring-доске. */
function handState(drawnId: string, overrides: Partial<TurnFlowState> = {}): TurnFlowState {
  const base = createTurnFlow({ gameId: 'stage4a', players, seed: 11 });
  const board = ringBoard();
  const game = { ...base.game, board, drawnTileDefinitionId: drawnId, tileDeck: { remaining: [] } };
  return {
    ...base,
    game,
    phase: 'TILE_IN_HAND',
    riverPlaced: RIVER_CARD_COUNT,
    riverDeck: [],
    discardedTileIds: [],
    lastResolution: emptyTurnResolution(players[0].id),
    ...overrides,
  };
}

describe('Stage 4A — authoritative legal options', () => {
  it('test 1: getLegalTilePlacementOptions equals union over all rotations via legalPlacementsFor', () => {
    const board = ringBoard();
    const playableId = playableLandId(board);
    const state = handState(playableId);

    const expected = new Map<string, Set<Rotation>>();
    for (const rotation of ROTATIONS) {
      for (const position of legalPlacementsFor(state, playableId, rotation)) {
        const set = expected.get(posKey(position)) ?? new Set<Rotation>();
        set.add(rotation);
        expected.set(posKey(position), set);
      }
    }
    expect(expected.size).toBeGreaterThan(0);

    const options = getLegalTilePlacementOptions(state, playableId);
    // одна запись на coordinate
    const keys = options.map((o) => posKey(o.position));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual([...expected.keys()].sort());
    for (const option of options) {
      const want = expected.get(posKey(option.position));
      expect(option.rotations).toEqual([...(want ?? [])].sort((a, b) => a - b));
      expect(new Set(option.rotations).size).toBe(option.rotations.length);
    }
    // deterministic position sort: x затем y
    for (let i = 1; i < options.length; i += 1) {
      const a = options[i - 1].position;
      const b = options[i].position;
      expect(a.x < b.x || (a.x === b.x && a.y <= b.y)).toBe(true);
    }
    // плоский union через тот же authoritative источник — то же множество
    let flatCount = 0;
    for (const rotation of ROTATIONS) {
      flatCount += legalPlacementsFor(state, playableId, rotation).length;
    }
    expect(options.reduce((n, o) => n + o.rotations.length, 0)).toBe(flatCount);
    // hasAnyLegalTilePlacement — pure query, без исключений
    expect(hasAnyLegalTilePlacement(state, playableId)).toBe(true);
  });
});

describe('Stage 4A — replaceUnplayableTurnTile', () => {
  it('test 2: playable land tile — strict no-op (identity)', () => {
    const board = ringBoard();
    const playableId = playableLandId(board);
    const state = handState(playableId);
    expect(replaceUnplayableTurnTile(state)).toBe(state);
    // и на других фазах — тоже strict no-op
    const awaiting = { ...state, phase: 'AWAITING_DRAW' as const };
    expect(replaceUnplayableTurnTile(awaiting)).toBe(awaiting);
    const over = { ...state, phase: 'GAME_OVER' as const };
    expect(replaceUnplayableTurnTile(over)).toBe(over);
  });

  it('test 3: unplayable land tile — exactly one discard, next tile drawn, everything else unchanged', () => {
    const board = ringBoard();
    const unplayable = unplayableLandIds(board);
    expect(unplayable.length).toBeGreaterThan(0);
    const [unplayableId] = unplayable;
    const playableId = playableLandId(board);
    const tail = unplayable.filter((id) => id !== unplayableId && id !== playableId);
    const landDeck = [unplayableId, playableId, ...tail];
    const before = handState(unplayableId, { landDeck });

    const snapshot = {
      board: before.game.board,
      scores: before.game.scores,
      meeples: before.game.meeples,
      currentPlayerIndex: before.game.currentPlayerIndex,
      turnNumber: before.game.turnNumber,
      riverPlaced: before.riverPlaced,
      riverDeck: before.riverDeck,
      lastResolution: before.lastResolution,
    };

    const after = replaceUnplayableTurnTile(before);
    expect(after).not.toBe(before);

    // discarded delta === ровно один новый id, встречается ровно один раз
    expect(after.discardedTileIds).toEqual([unplayableId]);
    expect(after.discardedTileIds.filter((id) => id === unplayableId)).toHaveLength(1);

    // следующая карта — ровно первая оставшаяся land-карта
    expect(after.game.drawnTileDefinitionId).toBe(playableId);
    expect(after.phase).toBe('TILE_IN_HAND');
    expect(after.landDeck).toEqual(tail);
    // before-очередь = [held, playable, ...tail] (2 карты покидают queue:
    // discarded held + drawn playable)
    expect(after.landDeck.length).toBe(before.landDeck.length - 2);
    // persistent queue содержит только будущие карты: ни снятая ранее,
    // ни только что взятая в ней не остаются (нет duplicate draw)
    expect(after.landDeck).not.toContain(unplayableId);
    expect(after.landDeck).not.toContain(playableId);

    // неизменные поля
    expect(after.game.board).toBe(snapshot.board);
    expect(after.game.scores).toBe(snapshot.scores);
    expect(after.game.meeples).toBe(snapshot.meeples);
    expect(after.game.currentPlayerIndex).toBe(snapshot.currentPlayerIndex);
    expect(after.game.turnNumber).toBe(snapshot.turnNumber);
    expect(after.riverPlaced).toBe(snapshot.riverPlaced);
    expect(after.riverDeck).toBe(snapshot.riverDeck);
    expect(after.lastResolution).toBe(snapshot.lastResolution);
    // новая карта играбельна — замены больше не требуется
    expect(hasAnyLegalTilePlacement(after, playableId)).toBe(true);
    expect(replaceUnplayableTurnTile(after)).toBe(after);
  });

  it('test 4: consecutive unplayable — ONE click discards ONLY the current card; next unplayable stays in hand', () => {
    const board = ringBoard();
    const unplayable = unplayableLandIds(board);
    expect(unplayable.length).toBeGreaterThanOrEqual(2);
    const [first, second] = unplayable;
    const before = handState(first, { landDeck: [first, second, ...unplayable.slice(2)] });

    const after = replaceUnplayableTurnTile(before);
    expect(after.game.drawnTileDefinitionId).toBe(second);
    expect(after.discardedTileIds).toEqual([first]);
    // ВТОРАЯ неразмещаемая карта НЕ discarded автоматически
    expect(after.discardedTileIds).not.toContain(second);
    expect(after.phase).toBe('TILE_IN_HAND');
    expect(hasAnyLegalTilePlacement(after, second)).toBe(false);

    // второй клик пользователя заменяет уже вторую карту
    const after2 = replaceUnplayableTurnTile(after);
    expect(after2).not.toBe(after);
    expect(after2.discardedTileIds).toEqual([first, second]);
    expect(after2.game.drawnTileDefinitionId).not.toBe(second);
    // после второго клика landDeck начинается с третьей карты; вторая не
    // возвращается в очередь (no duplicate draw)
    expect(after2.landDeck).toEqual(unplayable.slice(3));
    expect(after2.landDeck).not.toContain(second);
  });

  it('test 5: idempotency on returned state — old card is never discarded twice', () => {
    const board = ringBoard();
    const unplayable = unplayableLandIds(board);
    const [first, second] = unplayable;
    const before = handState(first, { landDeck: [...unplayable] });
    const after = replaceUnplayableTurnTile(before);
    // повторный вызов на УЖЕ заменённом state: current=second unplayable →
    // разрешён и касается именно новой карты, а не старой
    const after2 = replaceUnplayableTurnTile(after);
    expect(after2.discardedTileIds.filter((id) => id === first)).toHaveLength(1);
    expect(after2.discardedTileIds.filter((id) => id === second)).toHaveLength(1);
    // defensive stale protection: state, где current id уже в discard — no-op
    const stale: TurnFlowState = { ...after, discardedTileIds: [first, second] };
    expect(replaceUnplayableTurnTile(stale)).toBe(stale);
  });

  it('test 6: river tiles are never replaced/discarded — strict no-op', () => {
    let state = createTurnFlow({ gameId: 'stage4a-river', players, seed: 11 });
    state = drawTurnTile(state);
    expect(state.phase).toBe('TILE_IN_HAND');
    const riverId = state.game.drawnTileDefinitionId;
    expect(riverId).not.toBeNull();
    expect(getCardDefinition(riverId!).riverCard).toBe(true);
    expect(replaceUnplayableTurnTile(state)).toBe(state);
    expect(state.discardedTileIds).toHaveLength(0);
    // даже если искусственно объявить river-карту «без placements» — no-op
    const forced = handState(riverId!, { riverPlaced: 5, riverDeck: state.riverDeck });
    expect(replaceUnplayableTurnTile(forced)).toBe(forced);
  });
});

describe('Stage 4A — canEndTurn', () => {
  it('test 7: predicate matches existing TURN_PHASES', () => {
    const base = createTurnFlow({ gameId: 'stage4a-endturn', players, seed: 11 });
    expect(canEndTurn(base)).toBe(false); // AWAITING_DRAW
    const inHand = drawTurnTile(base);
    expect(inHand.phase).toBe('TILE_IN_HAND');
    expect(canEndTurn(inHand)).toBe(false);
    const placed = confirmTurnTilePlacement(placeTurnTile(inHand, inHand.legalPlacements[0]));
    expect(placed.phase).toBe('TILE_PLACED');
    expect(canEndTurn(placed)).toBe(true);
    const ended = endTurn(placed);
    expect(canEndTurn(ended)).toBe(false); // AWAITING_DRAW после хода
    // MEEPLE_SELECTION / GAME_OVER через прямые phase-overrides (тот же enum)
    expect(canEndTurn({ ...placed, phase: 'MEEPLE_SELECTION' })).toBe(true);
    expect(canEndTurn({ ...placed, phase: 'GAME_OVER' })).toBe(false);
  });
});
