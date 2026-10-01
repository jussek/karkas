import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { seededShuffle } from '../deck/seededShuffle';
import {
  assertRiverSolvableFrom,
  findSolvableRiverContinuation,
  planRiver,
  replanRemainingRiver,
  requiredEdgeForFrontier,
} from '../deck/riverPlanner';
import { edgeOffset, rotateEdge } from './geometry';
import { applyAction, applyActionWithResolution, createGame } from './gameEngine';
import { buildTurnResolution, emptyTurnResolution, type TurnResolution } from './turnResolution';
import { getLegalTilePlacements } from '../rules/placement';
import { getLegalMeeplePlacements } from '../rules/localFeatures';
import { placementKey, type MeeplePlacement, type Rotation, type TilePosition } from '../types/geometry';
import type { GameState, Player } from '../types/state';
import { posKey, type Board } from '../types/state';

export const TURN_PHASES = [
  'AWAITING_DRAW', 'TILE_IN_HAND', 'TILE_POSITIONED', 'TILE_PLACED', 'MEEPLE_SELECTION', 'GAME_OVER',
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
export const RIVER_CARD_COUNT = 19;

/**
 * Authoritative placement options: для каждой клетки — ВСЕ rotation'ы
 * данной карты, legal именно в этой клетке. Rotations уникальны,
 * отсортированы стабильно (0,90,180,270), содержат только реально legal
 * значения. В river-фазе список river-safe (openRiverPlacement): обычная
 * edge-legality + стыковка с frontier + solvability оставшейся реки —
 * ничего не ослабляется и не обходится.
 */
export interface TilePlacementOption {
  position: TilePosition;
  rotations: Rotation[];
}

export interface TurnFlowState {
  game: GameState;
  phase: TurnPhase;
  /**
   * Ожидаемый поворот hand-tile. В TILE_IN_HAND всегда 0: игрок больше
   * НЕ выбирает rotation до размещения — ориентация выбирается на клетке
   * из authoritative legal-списка (getLegalTilePlacementOptions).
   */
  rotation: Rotation;
  /**
   * Клетки, где существует >=1 legal rotation (объединение по всем
   * rotation'ам). Авторитетный источник белых подсветок для UI.
   */
  legalPlacements: TilePosition[];
  /**
   * Позиция tile, ожидающая подтверждения ориентации (после выбора клетки).
   * Null вне TILE_POSITIONED.
   */
  positionedAt: TilePosition | null;
  /** Authoritative legal rotation'ы для positionedAt (стабильно отсортированы). */
  positionedRotations: Rotation[];
  selectedMeepleTarget: MeeplePlacement | null;
  riverPlaced: number;
  riverDeck: string[];
  landDeck: string[];
  discardedTileIds: string[];
  /**
   * Seed игры — детерминированный источник приоритета для incremental
   * river draw policy (findSolvableRiverContinuation).
   */
  seed: number;
  /**
   * Авторитетное разрешение последнего завершённого хода (End Turn).
   * Пустое до первого End Turn; сохраняется при повторных no-op вызовах,
   * поэтому duplicate events невозможны.
   */
  lastResolution: TurnResolution;
}

export interface CreateTurnFlowOptions {
  gameId: string;
  players: Player[];
  seed: number;
}

export function getRiverCards() {
  return RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
}

function riverSourceId(): string {
  const source = getRiverCards().find((card) => card.riverKind === 'start');
  if (!source || getRiverCards().length !== RIVER_CARD_COUNT) {
    throw new Error('River requires one source, one end, and 17 middle tiles.');
  }
  return source.id;
}

function riverEndId(): string {
  const end = getRiverCards().find((card) => card.riverKind === 'end');
  if (!end) throw new Error('River requires an end tile.');
  return end.id;
}

/**
 * Deterministic solvable river order (Repair 2B / OPTION_A).
 *
 * Вместо greedy seededShuffle(middle), который мог завести реку в тупик:
 * planRiver строит полный решаемый порядок всех 17 middle + end от
 * детерминированной стартовой доски (source @(0,0), rotation 0).
 * Тот же seed => тот же план. End всегда 19-я карта.
 */
function riverOrder(seed: number): string[] {
  const sourceId = riverSourceId();
  const startBoard: Board = {
    [posKey({ x: 0, y: 0 })]: { definitionId: sourceId, rotation: 0 as const, position: { x: 0, y: 0 } },
  };
  const plan = planRiver(seed, startBoard);
  return [sourceId, ...plan.map((step) => step.cardId)];
}

export function createTurnFlow(options: CreateTurnFlowOptions): TurnFlowState {
  const river = riverOrder(options.seed);
  const sourceId = river[0];
  const land = seededShuffle(
    RUNTIME_CARD_CATALOG.filter((card) => !card.riverCard).map((card) => card.id),
    options.seed ^ 0x3f3f3f3f,
  );
  const game = createGame({
    gameId: options.gameId,
    players: options.players,
    deck: [],
    getDefinition: getTileDefinition,
    startTile: { definitionId: sourceId, position: { x: 0, y: 0 } },
  });
  return {
    game,
    phase: 'AWAITING_DRAW',
    rotation: 0,
    legalPlacements: [],
    positionedAt: null,
    positionedRotations: [],
    selectedMeepleTarget: null,
    riverPlaced: 1,
    riverDeck: river.slice(1),
    landDeck: land,
    discardedTileIds: [],
    seed: options.seed,
    lastResolution: emptyTurnResolution(game.players[0]?.id ?? ''),
  };
}

/**
 * Инкрементальный river draw policy (Repair 2B, production design):
 * следующая карта выбирается от ФАКТИЧЕСКОЙ доски среди remaining middle
 * по deterministic seeded priority так, чтобы существовал полный completion
 * path оставшихся middle + end. End card выдаётся ТОЛЬКО когда всех 17
 * middle уже размещены/израсходованы. Никаких discard.
 */
function pickRiverDraw(state: TurnFlowState): { cardId: string; riverDeck: string[] } | null {
  const endId = riverEndId();
  const remainingMiddle = state.riverDeck.filter((id) => id !== endId);
  if (remainingMiddle.length === 0) {
    // Все middle израсходованы — end может быть выдан, только если он ещё в
    // river deck. Иначе river-фаза некорректна (invariant failure у вызывающего).
    return state.riverDeck.includes(endId) ? { cardId: endId, riverDeck: [] } : null;
  }
  const chosen = findSolvableRiverContinuation({
    board: state.game.board,
    remainingMiddleIds: remainingMiddle,
    seed: state.seed,
  });
  if (chosen !== null && remainingMiddle.includes(chosen)) {
    const nextDeck = removeFromOnce(state.riverDeck, chosen);
    if (nextDeck !== null) return { cardId: chosen, riverDeck: nextDeck };
  }
  // Fallback: прежний front-order приоритет больше не решаем после выбора
  // игрока. Полностью перепланируем оставшихся middle + end от ФАКТИЧЕСКОЙ
  // доски (тот же seed, без discard, без потери карт).
  const order = replanRemainingRiver(state.seed, state.game.board);
  const head = order[0];
  const nextDeck = removeFromOnce(state.riverDeck, head);
  if (head === undefined || nextDeck === null) return null;
  return { cardId: head, riverDeck: nextDeck };
}

/** Удалить элемент ровно один раз; null если элемента нет. */
function removeFromOnce(ids: readonly string[], id: string): string[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  return [...ids.slice(0, index), ...ids.slice(index + 1)];
}

function isRiverTurn(state: TurnFlowState): boolean {
  return state.riverPlaced < RIVER_CARD_COUNT;
}

/**
 * Единственный незакрытый river endpoint фактической доски.
 * requiredEdge = сторона НОВОЙ плитки на общей границе = opposite(exposed).
 * Инверсия выполняется ровно один раз (requiredEdgeForFrontier).
 */
function riverFrontier(board: Board): { position: TilePosition; requiredEdge: number } | null {
  const open: { position: TilePosition; requiredEdge: number }[] = [];
  for (const tile of Object.values(board)) {
    const card = getCardDefinition(tile.definitionId);
    if (!card.riverCard) continue;
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const edge = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(edge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (board[posKey(position)] !== undefined) continue;
      open.push({ position, requiredEdge: requiredEdgeForFrontier(edge as 0 | 1 | 2 | 3) });
    }
  }
  return open.length === 1 ? open[0] : null;
}

/**
 * Количество незакрытых river edges доски (0 = река замкнута).
 */
function countOpenRiverEdges(board: Board): number {
  let open = 0;
  for (const tile of Object.values(board)) {
    const card = getCardDefinition(tile.definitionId);
    if (!card.riverCard) continue;
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const edge = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(edge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (board[posKey(position)] === undefined) open += 1;
    }
  }
  return open;
}

/**
 * River-safe legal placements: обычная legality (getLegalTilePlacements,
 * правила НЕ ослабляются) + стыковка с единственным frontier + существование
 * completion path для оставшихся middle + end от ФАКТИЧЕСКОЙ гипотетической
 * доски после placement. Игрок не может выбрать placement, заводящий реку
 * в тупик. Для land phase ничего не меняется.
 */
function openRiverPlacement(state: TurnFlowState, definitionId: string, rotation: Rotation): TilePosition[] {
  return riverSafePositions(state, definitionId, rotation);
}

/**
 * Гипотетическая доска после размещения (definitionId, rotation, position).
 */
function hypotheticalBoard(board: Board, definitionId: string, rotation: Rotation, position: TilePosition): Board {
  return {
    ...board,
    [posKey(position)]: { definitionId, rotation, position },
  };
}

/**
 * Ядро river-safe фильтрации для конкретного rotation. Возвращает пустой
 * список, если карта не является выбранной river-картой текущего хода:
 * чужая/land карта никогда не размещается на river frontier (иначе
 * frontier закрывается и инвариант «единственный незакрытый endpoint»
 * нарушается).
 */
function riverSafePositions(state: TurnFlowState, definitionId: string, rotation: Rotation): TilePosition[] {
  const board = state.game.board;
  const frontier = riverFrontier(board);
  if (!frontier) return [];
  const card = getCardDefinition(definitionId);
  if (!card.riverCard) return [];
  // Frontier занят другой плиткой — обычная legality это уже отклоняет.
  const positions = getLegalTilePlacements(
    { board, getDefinition: getTileDefinition },
    getTileDefinition(definitionId),
    rotation,
  ).filter((position) => position.x === frontier.position.x && position.y === frontier.position.y);
  if (positions.length === 0) return [];
  // Если frontier закрыт НЕ этой картой (напр. land tile во время river-фазы),
  // река обязана замыкаться source↔end напрямую; иначе placement тупиковый.
  const drawnId = state.game.drawnTileDefinitionId;
  const closesFrontierWithForeignTile =
    drawnId !== null && drawnId !== definitionId;
  // Solvability filter: хотя бы один исходный порядок remaining middle+end
  // должен допускать завершение реки с этой ГИПОТЕТИЧЕСКОЙ доски.
  const remainingMiddle = state.riverDeck.filter((id) => id !== riverEndId() && id !== definitionId);
  return positions.filter((position) => {
    const hypothetical = hypotheticalBoard(board, definitionId, rotation, position);
    try {
      if (closesFrontierWithForeignTile || definitionId === riverEndId()) {
        // End placement (или foreign closure) должен ЗАМЫКАТЬ реку: ни одного
        // открытого river edge не должно остаться.
        const nextFrontierEdges = countOpenRiverEdges(hypothetical);
        if (nextFrontierEdges !== 0) return false;
        if (closesFrontierWithForeignTile) {
          // Foreign closure требует прямого source↔end стыка без middle карт.
          return riverEndId() !== null && state.riverDeck.includes(riverEndId()!)
            ? findSolvableRiverContinuation({ board: hypothetical, remainingMiddleIds: [], seed: state.seed }) !== null
            : true;
        }
        return true;
      }
      assertRiverSolvableFrom(state.seed, hypothetical, remainingMiddle);
      return true;
    } catch {
      return false;
    }
  });
}

export function legalPlacementsFor(
  state: TurnFlowState,
  definitionId: string,
  rotation: Rotation,
): TilePosition[] {
  return isRiverTurn(state)
    ? openRiverPlacement(state, definitionId, rotation)
    : getLegalTilePlacements(
      { board: state.game.board, getDefinition: getTileDefinition },
      getTileDefinition(definitionId),
      rotation,
    );
}

/**
 * Авторитетные варианты размещения вытянутой карты:
 * Map<boardPosition, Rotation[]> — для каждой клетки ВСЕ rotation'ы,
 * legal именно в этой клетке (river-фаза — river-safe). UI не вычисляет
 * edge-legality самостоятельно.
 */
export function getLegalTilePlacementOptions(
  state: TurnFlowState,
  definitionId: string = state.game.drawnTileDefinitionId ?? '',
): TilePlacementOption[] {
  if (!definitionId) return [];
  const rotationsByCell = new Map<string, Rotation[]>();
  for (const rotation of ROTATIONS) {
    for (const position of legalPlacementsFor(state, definitionId, rotation)) {
      const key = posKey(position);
      const list = rotationsByCell.get(key);
      if (list) {
        if (!list.includes(rotation)) list.push(rotation);
      } else {
        rotationsByCell.set(key, [rotation]);
      }
    }
  }
  return [...rotationsByCell.entries()]
    .sort(([a], [b]) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ax - bx || ay - by;
    })
    .map(([key, rotations]) => {
      const [x, y] = key.split(',').map(Number);
      return { position: { x, y }, rotations: rotations.sort((i, j) => i - j) };
    });
}

/** Клетки, где существует >=1 legal rotation (объединение по всем rotation'ам). */
function anyRotationLegalPlacements(state: TurnFlowState, definitionId: string): TilePosition[] {
  return getLegalTilePlacementOptions(state, definitionId).map((option) => option.position);
}

/**
 * Pure boolean query: существует ли хотя бы один legal placement хотя бы
 * для одной rotation. НЕ бросает исключений — безопасно для render-time
 * вызовов из UI. River invariant («river tile никогда не unplayable»)
 * проверяется в river draw lifecycle (drawRiverTile), где отсутствие
 * safe placement действительно является engine invariant failure.
 */
export function hasAnyLegalTilePlacement(
  state: TurnFlowState,
  definitionId: string = state.game.drawnTileDefinitionId ?? '',
): boolean {
  if (!definitionId) return false;
  return getLegalTilePlacementOptions(state, definitionId).length > 0;
}

/**
 * Совместимость с планом реки: выбранная pickRiverDraw карта обязана иметь
 * river-safe placement хотя бы при одном rotation. Если фактическая доска
 * diverгировала от плана, plan-based порядок может быть нерешаем — в этом
 * случае перепланируем remaining middle+end от ФАКТИЧЕСКОЙ доски (тот же
 * seed, без discard). Обычная edge-legality и solvability при этом НЕ
 * ослабляются: replan — тот же authoritative planner.
 */
function ensurePlanCompatibleDraw(state: TurnFlowState, cardId: string): TurnFlowState {
  if (!isRiverTurn(state)) return state;
  const playable = ROTATIONS.some(
    (rotation) => riverSafePositions(state, cardId, rotation).length > 0,
  );
  if (playable) return state;
  const order = replanRemainingRiver(state.seed, state.game.board);
  if (order.length === 0 || !state.riverDeck.includes(cardId)) return state;
  const index = order.indexOf(cardId);
  if (index < 0) return state;
  // Перестраиваем deck так, чтобы card стала первой; все карты сохраняются.
  const reordered = [cardId, ...order.filter((id) => id !== cardId)];
  const riverDeck = [...state.riverDeck];
  riverDeck.sort((a, b) => {
    const ia = reordered.indexOf(a);
    const ib = reordered.indexOf(b);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
  });
  return { ...state, riverDeck };
}

/**
 * Pure predicate: End Turn доступен только после успешного authoritative
 * placement (TILE_PLACED / MEEPLE_SELECTION). UI не дублирует phase-логику.
 */
export function canEndTurn(state: TurnFlowState): boolean {
  return state.phase === 'TILE_PLACED'
    || state.phase === 'MEEPLE_SELECTION';
}

/**
 * Замена неразмещаемой наземной карты ОДИН РАЗ на один пользовательский
 * клик: текущая карта уходит в discardedTileIds ровно один раз, берётся
 * РОВНО ОДНА следующая land-карта (без автоматического skip последующих
 * unplayable — если новая карта тоже неразмещаемая, она остаётся в руке
 * и требует нового клика «Заменить»). Фаза остаётся TILE_IN_HAND.
 *
 * STRICT no-op если:
 * 1. phase !== TILE_IN_HAND;
 * 2. drawnTileDefinitionId == null;
 * 3. текущая карта — river (river-карты никогда не заменяются/discarded);
 * 4. у карты есть хотя бы один legal placement;
 * 5. defensive idempotency: current id уже в discardedTileIds.
 *
 * Никаких очков, meeple, смены игрока или turnNumber при замене.
 */
export function replaceUnplayableTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND') return state;
  const definitionId = state.game.drawnTileDefinitionId;
  if (definitionId === null) return state;
  if (getCardDefinition(definitionId).riverCard) return state;
  if (isRiverTurn(state)) return state;
  if (hasAnyLegalTilePlacement(state, definitionId)) return state;
  if (state.discardedTileIds.includes(definitionId)) return state;
  // Нормализация: held-карта не должна оставаться в очереди будущих карт.
  const futureDeck = removeFromOnce(state.landDeck, definitionId) ?? state.landDeck;
  // РОВНО одна следующая карта — без auto-scan/auto-discard chain.
  const nextId = futureDeck[0];
  if (nextId === undefined) {
    // Land deck реально исчерпан — единый authoritative terminal path.
    const exhausted: TurnFlowState = {
      ...state,
      game: { ...state.game, drawnTileDefinitionId: null },
      discardedTileIds: [...state.discardedTileIds, definitionId],
      landDeck: [],
    };
    if (isTerminalDeckExhaustion(exhausted.riverPlaced, exhausted.riverDeck, exhausted.landDeck)) {
      return finalizeGame(exhausted);
    }
    return exhausted;
  }
  const game = { ...state.game, tileDeck: { remaining: [nextId] }, gamePhase: 'drawTile' as const };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  // Единый authoritative draw-lifecycle (тот же, что drawRiverTile/drawLandTile).
  return {
    ...afterDrawFlowFields(state, result.state, nextId),
    discardedTileIds: [...state.discardedTileIds, definitionId],
    landDeck: futureDeck.slice(1),
  };
}

/**
 * Общие post-draw поля TILE_IN_HAND. Единственная точка, где flow-состояние
 * синхронизируется с результатом authoritative DRAW_TILE (используется
 * drawRiverTile, drawLandTile и replaceUnplayableTurnTile).
 */
function afterDrawFlowFields(
  state: TurnFlowState,
  game: GameState,
  drawnId: string,
): TurnFlowState {
  return {
    ...state,
    game: { ...game, drawnTileDefinitionId: drawnId },
    phase: 'TILE_IN_HAND',
    rotation: 0,
    legalPlacements: anyRotationLegalPlacements(state, drawnId),
    positionedAt: null,
    positionedRotations: [],
    selectedMeepleTarget: null,
  };
}

function playableRotation(state: TurnFlowState, id: string): Rotation | null {
  return ROTATIONS.find((rotation) => legalPlacementsFor(state, id, rotation).length > 0) ?? null;
}

/**
 * Авторитетное терминальное условие: оба real deck исчерпаны.
 * "В этом проходе не нашли legal placement" НЕ равно "игра окончена".
 */
function isTerminalDeckExhaustion(riverPlaced: number, riverDeck: string[], landDeck: string[]): boolean {
  return riverPlaced >= RIVER_CARD_COUNT && riverDeck.length === 0 && landDeck.length === 0;
}

/**
 * Единый authoritative finalization path. Гарантирует:
 * phase=GAME_OVER, game.status=finished, lastResolution.gameOver=true,
 * lastResolution.final существует, final scoring применён ровно один раз
 * (COMPLETE_TURN при пустых decks выполняет финальный подсчёт).
 */
function finalizeGame(state: TurnFlowState): TurnFlowState {
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const input = { ...state.game, tileDeck: { remaining: [] }, drawnTileDefinitionId: null };
  const completed = applyActionWithResolution(input, { type: 'COMPLETE_TURN', playerId }, getTileDefinition);
  if (!completed.ok || !completed.resolution) {
    // Defensive fallback: никогда не оставлять незафинализированный GAME_OVER.
    return { ...state, phase: 'GAME_OVER' };
  }
  const nextPlayerId = completed.resolution.state.players[completed.resolution.state.currentPlayerIndex]?.id ?? playerId;
  const lastResolution = buildTurnResolution({
    previousPlayerId: playerId,
    nextPlayerId,
    gameOver: true,
    normal: completed.resolution.normal,
    final: completed.resolution.final ?? null,
    finalScores: completed.state.scores,
  });
  return {
    ...state,
    game: completed.state,
    phase: 'GAME_OVER',
    selectedMeepleTarget: null,
    legalPlacements: [],
    rotation: 0,
    positionedAt: null,
    positionedRotations: [],
    lastResolution,
  };
}

/**
 * Draw policy разделена явно: RIVER PHASE и LAND PHASE.
 * River: никаких discard, карта выбирается через pickRiverDraw от ФАКТИЧЕСКОЙ
 * доски так, чтобы гарантированно существовал completion path.
 * Land: берётся строго head колоды; unplayable-карта остаётся в руке до
 * отдельного пользовательского действия «Заменить».
 */
export function drawTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'AWAITING_DRAW') return state;
  if (isRiverTurn(state)) return drawRiverTile(state);
  return drawLandTile(state);
}

function drawRiverTile(state: TurnFlowState): TurnFlowState {
  const picked = pickRiverDraw(state);
  if (picked === null) {
    // Все river cards израсходованы, но riverPlaced < 19 — внутренняя ошибка
    // инварианта. НЕ GAME_OVER, НЕ land phase, НЕ discard.
    throw new Error(
      `River invariant failure: seed=${state.seed} riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
    );
  }
  const pickedId = picked.cardId;
  const stateAfterDraw = ensurePlanCompatibleDraw(
    { ...state, riverDeck: picked.riverDeck },
    pickedId,
  );
  const rotation = playableRotation(stateAfterDraw, pickedId);
  if (rotation === null) {
    // pickRiverDraw гарантирует solvability; отсутствие river-safe placement
    // означает нарушение инварианта — диагностируем явно, не маскируем.
    throw new Error(
      `River invariant failure: no solvable placement for ${pickedId}; seed=${state.seed} riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
    );
  }
  const game = { ...stateAfterDraw.game, tileDeck: { remaining: [pickedId] }, gamePhase: 'drawTile' as const };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  // Единый authoritative draw-lifecycle (общие post-draw поля flow-состояния).
  return afterDrawFlowFields(stateAfterDraw, result.state, pickedId);
}

function drawLandTile(state: TurnFlowState): TurnFlowState {
  const deck = state.landDeck;
  const id = deck[0];
  if (id === undefined) return isTerminalDeckExhaustion(state.riverPlaced, state.riverDeck, deck)
    ? finalizeGame(state)
    : state;
  const game = { ...state.game, tileDeck: { remaining: [id] }, gamePhase: 'drawTile' as const };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  // Единый authoritative draw-lifecycle (общие post-draw поля flow-состояния).
  return {
    ...afterDrawFlowFields(state, result.state, id),
    landDeck: deck.slice(1),
  };
}

/**
 * Ориентация preview из authoritative legal-списка клетки: следующий
 * rotation по циклу (детерминированный). Вне TILE_POSITIONED — no-op.
 * Board GameState НЕ мутируется: tile ещё не placed, скоринг не запускается.
 */
export function rotatePositionedTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED' || state.positionedRotations.length < 2) return state;
  const index = state.positionedRotations.indexOf(state.rotation);
  const rotation = state.positionedRotations[(index + 1) % state.positionedRotations.length];
  return { ...state, rotation };
}

/**
 * Подтверждение ориентации positioned tile → engine PLACE_TILE (authoritative
 * GameState становится placeMeeple). До подтверждения board не трогается.
 */
export function confirmTurnTilePlacement(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED' || !state.game.drawnTileDefinitionId) return state;
  if (!state.positionedAt) return state;
  if (!state.positionedRotations.includes(state.rotation)) return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(state.game, {
    type: 'PLACE_TILE', playerId, tileDefinitionId: state.game.drawnTileDefinitionId,
    position: state.positionedAt, rotation: state.rotation,
  }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...state,
    game: result.state,
    phase: 'TILE_PLACED',
    legalPlacements: [],
    positionedAt: null,
    positionedRotations: [],
  };
}

/**
 * Выбор клетки для карты. Клетка без legal rotations — строгий no-op
 * (engine state не меняется, карта остаётся в hand). Для legal клетки
 * выбирается deterministic first legal rotation (стабильный порядок 0,90,180,270).
 * Фаза TILE_POSITIONED: ориентацию можно.cycle'ить до подтверждения.
 */
export function placeTurnTile(state: TurnFlowState, position: TilePosition): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND' || !state.game.drawnTileDefinitionId) return state;
  const option = getLegalTilePlacementOptions(state, state.game.drawnTileDefinitionId)
    .find((item) => item.position.x === position.x && item.position.y === position.y);
  if (!option || option.rotations.length === 0) return state;
  return {
    ...state,
    phase: 'TILE_POSITIONED',
    rotation: option.rotations[0],
    positionedAt: position,
    positionedRotations: option.rotations,
  };
}

/**
 * Отмена неподтверждённого размещения: карта возвращается в hand, board не менялся.
 */
export function cancelPositionedTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED') return state;
  return { ...state, phase: 'TILE_IN_HAND', rotation: 0, positionedAt: null, positionedRotations: [] };
}

export function selectTurnMeeple(state: TurnFlowState, target: MeeplePlacement | null): TurnFlowState {
  if (state.phase !== 'TILE_PLACED' && state.phase !== 'MEEPLE_SELECTION') return state;
  // Отмена выбора: возвращаемся в TILE_PLACED.
  if (target === null) return state.game.gamePhase === 'placeMeeple'
    ? { ...state, phase: 'TILE_PLACED', selectedMeepleTarget: null }
    : state;
  // Authoritative проверка: цель берётся из того же источника, что и UI/engine.
  const legal = getLegalMeeplePlacements(state.game, getTileDefinition);
  const key = placementKey(target);
  if (!legal.some((placement) => placementKey(placement) === key)) {
    // Нелегальная цель — strict no-op: flow не зависает в MEEPLE_SELECTION.
    return state;
  }
  const last = state.game.lastPlacedTile;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  if (!last) return state;
  const result = applyAction(state.game, {
    type: 'PLACE_MEEPLE', playerId, position: last.position, ...target,
  }, getTileDefinition);
  if (!result.ok) return state;
  return { ...state, game: result.state, phase: 'MEEPLE_SELECTION', selectedMeepleTarget: target };
}

export function endTurn(state: TurnFlowState): TurnFlowState {
  if (!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(state.phase)) return state;
  const previousPlayerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const last = state.game.lastPlacedTile;
  if (!last) return state;
  // PLACE_MEEPLE уже выполнен при выборе authoritative target. Если игрок
  // никого не поставил, только тогда фиксируем SKIP_MEEPLE перед scoring.
  const decision = state.game.gamePhase === 'placeMeeple'
    ? applyAction(state.game, { type: 'SKIP_MEEPLE', playerId: previousPlayerId }, getTileDefinition)
    : { ok: true as const, state: state.game };
  if (!decision.ok) return state;

  // COMPLETE_TURN решает между обычным переходом и финальным подсчётом по
  // реальным оставшимся id карт. Sentinel-карты в GameState не допускаются.
  // Скоринг выполняется ЕДИНОЖДЫ: события строятся из того же прохода.
  const remainingCardIds = [...state.riverDeck, ...state.landDeck];
  const scoringInput = { ...decision.state, tileDeck: { remaining: remainingCardIds } };
  const completed = applyActionWithResolution(scoringInput, { type: 'COMPLETE_TURN', playerId: previousPlayerId }, getTileDefinition);
  if (!completed.ok || !completed.resolution) return state;
  const riverPlaced = state.riverPlaced + (getCardDefinition(last.definitionId).riverCard ? 1 : 0);
  const decksEmpty = riverPlaced >= RIVER_CARD_COUNT && state.landDeck.length === 0;
  const nextPlayerId = completed.resolution.state.players[completed.resolution.state.currentPlayerIndex]?.id ?? previousPlayerId;
  const lastResolution = buildTurnResolution({
    previousPlayerId,
    nextPlayerId,
    gameOver: decksEmpty,
    normal: completed.resolution.normal,
    final: completed.resolution.final ?? null,
    finalScores: decksEmpty ? completed.state.scores : null,
  });
  return {
    ...state,
    game: { ...completed.state, tileDeck: { remaining: [] } },
    phase: decksEmpty ? 'GAME_OVER' : 'AWAITING_DRAW',
    selectedMeepleTarget: null,
    legalPlacements: [],
    rotation: 0,
    riverPlaced,
    lastResolution,
  };
}
