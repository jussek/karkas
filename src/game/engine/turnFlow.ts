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
  'AWAITING_DRAW', 'TILE_IN_HAND', 'TILE_PLACED', 'MEEPLE_SELECTION', 'GAME_OVER',
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
export const RIVER_CARD_COUNT = 19;

export interface TurnFlowState {
  game: GameState;
  phase: TurnPhase;
  rotation: Rotation;
  legalPlacements: TilePosition[];
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
  const board = state.game.board;
  const frontier = riverFrontier(board);
  if (!frontier) return [];
  const card = getCardDefinition(definitionId);
  const rotatedRiverEdges = (card.topology.riverEdges ?? []).map((edge) => rotateEdge(edge, rotation));
  if (!rotatedRiverEdges.includes(frontier.requiredEdge as 0 | 1 | 2 | 3)) return [];
  const positions = getLegalTilePlacements(
    { board, getDefinition: getTileDefinition },
    getTileDefinition(definitionId),
    rotation,
  ).filter((position) => position.x === frontier.position.x && position.y === frontier.position.y);
  if (positions.length === 0) return [];
  // Solvability filter: хотя бы один исходный порядок remaining middle+end
  // должен допускать завершение реки с этой ГИПОТЕТИЧЕСКОЙ доски.
  const remainingMiddle = state.riverDeck.filter((id) => id !== riverEndId());
  return positions.filter((position) => {
    const hypothetical: Board = {
      ...board,
      [posKey(position)]: { definitionId, rotation, position },
    };
    try {
      if (definitionId === riverEndId()) {
        // End placement должен ЗАМЫКАТЬ реку: единственный frontier закрыт,
        // новых открытых river endpoints не появилось.
        const nextFrontierEdges = countOpenRiverEdges(hypothetical);
        return nextFrontierEdges === 0;
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
    lastResolution,
  };
}

/**
 * Draw policy разделена явно: RIVER PHASE и LAND PHASE.
 * River: никаких discard, карта выбирается через pickRiverDraw от ФАКТИЧЕСКОЙ
 * доски так, чтобы гарантированно существовал completion path.
 * Land: прежняя discard-логика сохранена без изменений.
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
  const rotation = playableRotation(state, pickedId);
  if (rotation === null) {
    // pickRiverDraw гарантирует solvability; отсутствие river-safe placement
    // означает нарушение инварианта — диагностируем явно, не маскируем.
    throw new Error(
      `River invariant failure: no solvable placement for ${pickedId}; seed=${state.seed} riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
    );
  }
  const game = { ...state.game, tileDeck: { remaining: [pickedId] }, gamePhase: 'drawTile' as const };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...state,
    game: result.state,
    phase: 'TILE_IN_HAND',
    rotation,
    legalPlacements: legalPlacementsFor(state, pickedId, rotation),
    riverDeck: picked.riverDeck,
  };
}

function drawLandTile(state: TurnFlowState): TurnFlowState {
  const deck = state.landDeck;
  const discarded = [...state.discardedTileIds];
  let index = 0;
  let rotation: Rotation | null = null;
  while (index < deck.length && rotation === null) {
    rotation = playableRotation(state, deck[index]);
    if (rotation === null) discarded.push(deck[index]);
    else break;
    index += 1;
  }
  if (rotation === null) {
    const exhausted: TurnFlowState = {
      ...state,
      discardedTileIds: discarded,
      landDeck: [],
    };
    // Ложный GAME_OVER запрещён: если river ещё не достроена или другой deck
    // непуст — это blocked (non-terminal) состояние, а не конец игры.
    if (isTerminalDeckExhaustion(exhausted.riverPlaced, exhausted.riverDeck, exhausted.landDeck)) {
      return finalizeGame(exhausted);
    }
    return { ...exhausted, phase: 'AWAITING_DRAW' };
  }
  const id = deck[index];
  const game = { ...state.game, tileDeck: { remaining: [id] }, gamePhase: 'drawTile' as const };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...state,
    game: result.state,
    phase: 'TILE_IN_HAND',
    rotation,
    legalPlacements: legalPlacementsFor(state, id, rotation),
    discardedTileIds: discarded,
    landDeck: deck.slice(index + 1),
  };
}

export function rotateTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND' || !state.game.drawnTileDefinitionId) return state;
  const rotation = ((state.rotation + 90) % 360) as Rotation;
  return { ...state, rotation, legalPlacements: legalPlacementsFor(state, state.game.drawnTileDefinitionId, rotation) };
}

export function placeTurnTile(state: TurnFlowState, position: TilePosition): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND' || !state.game.drawnTileDefinitionId) return state;
  if (!state.legalPlacements.some((item) => item.x === position.x && item.y === position.y)) return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(state.game, {
    type: 'PLACE_TILE', playerId, tileDefinitionId: state.game.drawnTileDefinitionId,
    position, rotation: state.rotation,
  }, getTileDefinition);
  return result.ok ? { ...state, game: result.state, phase: 'TILE_PLACED', legalPlacements: [] } : state;
}

export function selectTurnMeeple(state: TurnFlowState, target: MeeplePlacement | null): TurnFlowState {
  if (state.phase !== 'TILE_PLACED' && state.phase !== 'MEEPLE_SELECTION') return state;
  // Отмена выбора: возвращаемся в TILE_PLACED.
  if (target === null) return { ...state, phase: 'TILE_PLACED', selectedMeepleTarget: null };
  // Authoritative проверка: цель берётся из того же источника, что и UI/engine.
  const legal = getLegalMeeplePlacements(state.game, getTileDefinition);
  const key = placementKey(target);
  if (!legal.some((placement) => placementKey(placement) === key)) {
    // Нелегальная цель — strict no-op: flow не зависает в MEEPLE_SELECTION.
    return state;
  }
  return { ...state, phase: 'MEEPLE_SELECTION', selectedMeepleTarget: target };
}

export function endTurn(state: TurnFlowState): TurnFlowState {
  if (!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(state.phase)) return state;
  const previousPlayerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const last = state.game.lastPlacedTile;
  if (!last) return state;
  let decisionState = state;
  if (state.selectedMeepleTarget) {
    // Defensive re-validation: stale/corrupted selection must not hang the flow
    // in MEEPLE_SELECTION forever via a silent PLACE_MEEPLE rejection.
    const legal = getLegalMeeplePlacements(state.game, getTileDefinition);
    const key = placementKey(state.selectedMeepleTarget);
    if (!legal.some((placement) => placementKey(placement) === key)) {
      decisionState = { ...state, selectedMeepleTarget: null, phase: 'TILE_PLACED' };
    }
  }
  const decision = decisionState.selectedMeepleTarget
    ? applyAction(decisionState.game, { type: 'PLACE_MEEPLE', playerId: previousPlayerId, position: last.position, ...decisionState.selectedMeepleTarget }, getTileDefinition)
    : applyAction(decisionState.game, { type: 'SKIP_MEEPLE', playerId: previousPlayerId }, getTileDefinition);
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
