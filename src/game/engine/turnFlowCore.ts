import { getCardDefinition, getTileDefinition } from '../cards/catalogApi.js';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog.js';
import { seededShuffle } from '../deck/seededShuffle.js';
import {
  assertRiverSolvableFrom,
  countOpenRiverEdges,
  findSolvableRiverContinuation,
  frontiersOf,
  planRiver,
  replanRemainingRiver,
} from '../deck/riverPlanner.js';
import { rotateEdge } from './geometry.js';
import {
  applyAction,
  applyActionWithResolution,
  completeTurnWithResult,
  createGame,
} from './gameEngine.js';
import { buildTurnResolution, emptyTurnResolution, type TurnResolution } from './turnResolution.js';
import { getLegalTilePlacements } from '../rules/placement.js';
import { getLegalMeeplePlacements } from '../rules/localFeatures.js';
import { placementKey, type MeeplePlacement, type Rotation, type TilePosition } from '../types/geometry.js';
import type { GameState, Player } from '../types/state.js';
import { posKey, type Board } from '../types/state.js';

export const TURN_PHASES = [
  'AWAITING_DRAW',
  'TILE_IN_HAND',
  'TILE_POSITIONED',
  'TILE_PLACED',
  'MEEPLE_SELECTION',
  'GAME_OVER',
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Derived from the canonical runtime catalog; never duplicate 19/20 literals. */
export const RIVER_CARD_COUNT = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true).length;

export interface TilePlacementOption {
  position: TilePosition;
  rotations: Rotation[];
}

export interface TurnFlowState {
  game: GameState;
  phase: TurnPhase;
  rotation: Rotation;
  legalPlacements: TilePosition[];
  positionedAt: TilePosition | null;
  positionedRotations: Rotation[];
  selectedMeepleTarget: MeeplePlacement | null;
  riverPlaced: number;
  riverDeck: string[];
  landDeck: string[];
  discardedTileIds: string[];
  seed: number;
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

function riverKinds() {
  const cards = getRiverCards();
  const sources = cards.filter((card) => card.riverKind === 'start');
  const ends = cards.filter((card) => card.riverKind === 'end');
  if (sources.length !== 1 || ends.length !== 1) {
    throw new Error(`River requires exactly one source and one end; got source=${sources.length} end=${ends.length}.`);
  }
  return { source: sources[0], end: ends[0] };
}

function riverSourceId(): string {
  return riverKinds().source.id;
}

function riverEndId(): string {
  return riverKinds().end.id;
}

function riverOrder(seed: number): string[] {
  const sourceId = riverSourceId();
  const startBoard: Board = {
    [posKey({ x: 0, y: 0 })]: {
      definitionId: sourceId,
      rotation: 0,
      position: { x: 0, y: 0 },
    },
  };
  return [sourceId, ...planRiver(seed, startBoard).map((step) => step.cardId)];
}

export function createTurnFlow(options: CreateTurnFlowOptions): TurnFlowState {
  const river = riverOrder(options.seed);
  if (river.length !== RIVER_CARD_COUNT) {
    throw new Error(`River plan/catalog mismatch: plan=${river.length} catalog=${RIVER_CARD_COUNT}.`);
  }
  const sourceId = river[0];
  const landDeck = seededShuffle(
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
    landDeck,
    discardedTileIds: [],
    seed: options.seed,
    lastResolution: emptyTurnResolution(game.players[0]?.id ?? ''),
  };
}

function removeFromOnce(ids: readonly string[], id: string): string[] | null {
  const index = ids.indexOf(id);
  return index < 0 ? null : [...ids.slice(0, index), ...ids.slice(index + 1)];
}

function isRiverTurn(state: TurnFlowState): boolean {
  return state.riverPlaced < RIVER_CARD_COUNT;
}

function pickRiverDraw(state: TurnFlowState): { cardId: string; riverDeck: string[] } | null {
  const endId = riverEndId();
  const remainingMiddle = state.riverDeck.filter((id) => id !== endId);
  if (remainingMiddle.length === 0) {
    return state.riverDeck.includes(endId) ? { cardId: endId, riverDeck: [] } : null;
  }

  const chosen = findSolvableRiverContinuation({
    board: state.game.board,
    remainingMiddleIds: remainingMiddle,
    seed: state.seed,
  });
  if (chosen && remainingMiddle.includes(chosen)) {
    const riverDeck = removeFromOnce(state.riverDeck, chosen);
    if (riverDeck) return { cardId: chosen, riverDeck };
  }

  const replanned = replanRemainingRiver(state.seed, state.game.board);
  const head = replanned.find((id) => id !== endId);
  if (!head) return null;
  const riverDeck = removeFromOnce(state.riverDeck, head);
  return riverDeck ? { cardId: head, riverDeck } : null;
}

function hypotheticalBoard(
  board: Board,
  definitionId: string,
  rotation: Rotation,
  position: TilePosition,
): Board {
  return {
    ...board,
    [posKey(position)]: { definitionId, rotation, position: { ...position } },
  };
}

/**
 * Legal river placements on the single current frontier.
 */
function riverSafePositions(
  state: TurnFlowState,
  definitionId: string,
  rotation: Rotation,
): TilePosition[] {
  const card = getCardDefinition(definitionId);
  if (!card.riverCard) return [];
  const frontiers = frontiersOf(state.game.board);
  if (frontiers.length === 0) return [];
  const riverEdges = (card.topology.riverEdges ?? []).map((edge) => rotateEdge(edge, rotation));
  const frontierByPosition = new Map(frontiers.map((frontier) => [posKey(frontier.position), frontier]));
  const legal = getLegalTilePlacements(
    { board: state.game.board, getDefinition: getTileDefinition },
    getTileDefinition(definitionId),
    rotation,
  ).filter((position) => {
    const frontier = frontierByPosition.get(posKey(position));
    return frontier !== undefined && frontier.requiredEdges.every((edge) => riverEdges.includes(edge));
  });

  if (definitionId === riverEndId()) {
    if (state.riverDeck.some((id) => id !== riverEndId())) return [];
    return legal.filter((position) => countOpenRiverEdges(
      hypotheticalBoard(state.game.board, definitionId, rotation, position),
    ) === 0);
  }

  const remainingMiddle = state.riverDeck.filter(
    (id) => id !== riverEndId() && id !== definitionId,
  );
  return legal.filter((position) => {
    try {
      assertRiverSolvableFrom(
        state.seed,
        hypotheticalBoard(state.game.board, definitionId, rotation, position),
        remainingMiddle,
      );
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
    ? riverSafePositions(state, definitionId, rotation)
    : getLegalTilePlacements(
      { board: state.game.board, getDefinition: getTileDefinition },
      getTileDefinition(definitionId),
      rotation,
    );
}

export function getLegalTilePlacementOptions(
  state: TurnFlowState,
  definitionId: string = state.game.drawnTileDefinitionId ?? '',
): TilePlacementOption[] {
  if (!definitionId) return [];
  const rotationsByCell = new Map<string, Rotation[]>();
  for (const rotation of ROTATIONS) {
    for (const position of legalPlacementsFor(state, definitionId, rotation)) {
      const key = posKey(position);
      const rotations = rotationsByCell.get(key) ?? [];
      if (!rotations.includes(rotation)) rotations.push(rotation);
      rotationsByCell.set(key, rotations);
    }
  }
  return [...rotationsByCell.entries()]
    .map(([key, rotations]) => {
      const [x, y] = key.split(',').map(Number);
      return { position: { x, y }, rotations: rotations.sort((a, b) => a - b) };
    })
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
}

function anyRotationLegalPlacements(state: TurnFlowState, definitionId: string): TilePosition[] {
  return getLegalTilePlacementOptions(state, definitionId).map((option) => option.position);
}

export function hasAnyLegalTilePlacement(
  state: TurnFlowState,
  definitionId: string = state.game.drawnTileDefinitionId ?? '',
): boolean {
  return Boolean(definitionId) && getLegalTilePlacementOptions(state, definitionId).length > 0;
}

export function canEndTurn(state: TurnFlowState): boolean {
  return state.phase === 'TILE_PLACED' || state.phase === 'MEEPLE_SELECTION';
}

function afterDrawFlowFields(
  state: TurnFlowState,
  game: GameState,
  drawnId: string,
): TurnFlowState {
  const base: TurnFlowState = {
    ...state,
    game: { ...game, drawnTileDefinitionId: drawnId },
    phase: 'TILE_IN_HAND',
    rotation: 0,
    legalPlacements: [],
    positionedAt: null,
    positionedRotations: [],
    selectedMeepleTarget: null,
  };
  return { ...base, legalPlacements: anyRotationLegalPlacements(base, drawnId) };
}

function isTerminalDeckExhaustion(state: TurnFlowState): boolean {
  return state.riverPlaced >= RIVER_CARD_COUNT
    && state.riverDeck.length === 0
    && state.landDeck.length === 0;
}

/** Phase-independent final scoring for exhaustion after discarding an unplayable final land tile. */
function finalizeGame(state: TurnFlowState): TurnFlowState {
  if (state.game.status === 'finished' && state.lastResolution.gameOver) {
    return state.phase === 'GAME_OVER' ? state : { ...state, phase: 'GAME_OVER' };
  }
  const previousPlayerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const input: GameState = {
    ...state.game,
    tileDeck: { remaining: [] },
    drawnTileDefinitionId: null,
    // At TILE_IN_HAND there is no tile from this turn to normal-score.
    lastPlacedTile: null,
  };
  const completed = completeTurnWithResult(input, getTileDefinition);
  const nextPlayerId = completed.state.players[completed.state.currentPlayerIndex]?.id ?? previousPlayerId;
  const lastResolution = buildTurnResolution({
    previousPlayerId,
    nextPlayerId,
    gameOver: true,
    normal: completed.normal,
    final: completed.final ?? null,
    finalScores: completed.state.scores,
  });
  return {
    ...state,
    game: completed.state,
    phase: 'GAME_OVER',
    rotation: 0,
    legalPlacements: [],
    positionedAt: null,
    positionedRotations: [],
    selectedMeepleTarget: null,
    lastResolution,
  };
}

export function replaceUnplayableTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND') return state;
  const definitionId = state.game.drawnTileDefinitionId;
  if (!definitionId || getCardDefinition(definitionId).riverCard || isRiverTurn(state)) return state;
  if (hasAnyLegalTilePlacement(state, definitionId)) return state;
  if (state.discardedTileIds.includes(definitionId)) return state;

  const futureDeck = removeFromOnce(state.landDeck, definitionId) ?? state.landDeck;
  const discardedTileIds = [...state.discardedTileIds, definitionId];
  const nextId = futureDeck[0];
  if (!nextId) {
    const exhausted: TurnFlowState = {
      ...state,
      game: { ...state.game, drawnTileDefinitionId: null },
      landDeck: [],
      discardedTileIds,
    };
    return isTerminalDeckExhaustion(exhausted) ? finalizeGame(exhausted) : exhausted;
  }

  const drawInput: GameState = {
    ...state.game,
    tileDeck: { remaining: [nextId] },
    gamePhase: 'drawTile',
  };
  const playerId = drawInput.players[drawInput.currentPlayerIndex]?.id ?? '';
  const result = applyAction(drawInput, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...afterDrawFlowFields({ ...state, landDeck: futureDeck.slice(1) }, result.state, nextId),
    discardedTileIds,
  };
}

export function drawTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'AWAITING_DRAW') return state;
  if (isRiverTurn(state)) {
    const picked = pickRiverDraw(state);
    if (!picked) {
      throw new Error(
        `River invariant failure: seed=${state.seed} riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
      );
    }
    const staged = { ...state, riverDeck: picked.riverDeck };
    const playable = ROTATIONS.some((rotation) => riverSafePositions(staged, picked.cardId, rotation).length > 0);
    if (!playable) {
      throw new Error(`River invariant failure: no safe placement for ${picked.cardId}; seed=${state.seed}.`);
    }
    const drawInput: GameState = {
      ...staged.game,
      tileDeck: { remaining: [picked.cardId] },
      gamePhase: 'drawTile',
    };
    const playerId = drawInput.players[drawInput.currentPlayerIndex]?.id ?? '';
    const result = applyAction(drawInput, { type: 'DRAW_TILE', playerId }, getTileDefinition);
    return result.ok ? afterDrawFlowFields(staged, result.state, picked.cardId) : state;
  }

  const id = state.landDeck[0];
  if (!id) return isTerminalDeckExhaustion(state) ? finalizeGame(state) : state;
  const drawInput: GameState = {
    ...state.game,
    tileDeck: { remaining: [id] },
    gamePhase: 'drawTile',
  };
  const playerId = drawInput.players[drawInput.currentPlayerIndex]?.id ?? '';
  const result = applyAction(drawInput, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  return result.ok
    ? afterDrawFlowFields({ ...state, landDeck: state.landDeck.slice(1) }, result.state, id)
    : state;
}

export function placeTurnTile(state: TurnFlowState, position: TilePosition): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND' || !state.game.drawnTileDefinitionId) return state;
  const option = getLegalTilePlacementOptions(state, state.game.drawnTileDefinitionId)
    .find((item) => item.position.x === position.x && item.position.y === position.y);
  if (!option?.rotations.length) return state;
  return {
    ...state,
    phase: 'TILE_POSITIONED',
    rotation: option.rotations[0],
    positionedAt: { ...position },
    positionedRotations: [...option.rotations],
  };
}

export function rotatePositionedTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED' || state.positionedRotations.length < 2) return state;
  const index = state.positionedRotations.indexOf(state.rotation);
  return {
    ...state,
    rotation: state.positionedRotations[(index + 1) % state.positionedRotations.length],
  };
}

export function cancelPositionedTurnTile(state: TurnFlowState): TurnFlowState {
  return state.phase === 'TILE_POSITIONED'
    ? { ...state, phase: 'TILE_IN_HAND', rotation: 0, positionedAt: null, positionedRotations: [] }
    : state;
}

export function confirmTurnTilePlacement(state: TurnFlowState): TurnFlowState {
  if (
    state.phase !== 'TILE_POSITIONED'
    || !state.game.drawnTileDefinitionId
    || !state.positionedAt
    || !state.positionedRotations.includes(state.rotation)
  ) return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(state.game, {
    type: 'PLACE_TILE',
    playerId,
    tileDefinitionId: state.game.drawnTileDefinitionId,
    position: state.positionedAt,
    rotation: state.rotation,
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

export function selectTurnMeeple(state: TurnFlowState, target: MeeplePlacement | null): TurnFlowState {
  if (state.phase !== 'TILE_PLACED' && state.phase !== 'MEEPLE_SELECTION') return state;
  if (target === null) {
    return state.game.gamePhase === 'placeMeeple'
      ? { ...state, phase: 'TILE_PLACED', selectedMeepleTarget: null }
      : state;
  }
  const legal = getLegalMeeplePlacements(state.game, getTileDefinition);
  if (!legal.some((placement) => placementKey(placement) === placementKey(target))) return state;
  const last = state.game.lastPlacedTile;
  if (!last) return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(state.game, {
    type: 'PLACE_MEEPLE',
    playerId,
    position: last.position,
    ...target,
  }, getTileDefinition);
  return result.ok
    ? { ...state, game: result.state, phase: 'MEEPLE_SELECTION', selectedMeepleTarget: target }
    : state;
}

export function endTurn(state: TurnFlowState): TurnFlowState {
  if (!canEndTurn(state)) return state;
  const previousPlayerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const last = state.game.lastPlacedTile;
  if (!last) return state;

  const decision = state.game.gamePhase === 'placeMeeple'
    ? applyAction(state.game, { type: 'SKIP_MEEPLE', playerId: previousPlayerId }, getTileDefinition)
    : { ok: true as const, state: state.game };
  if (!decision.ok) return state;

  const remainingCardIds = [...state.riverDeck, ...state.landDeck];
  const scoringInput: GameState = { ...decision.state, tileDeck: { remaining: remainingCardIds } };
  const completed = applyActionWithResolution(
    scoringInput,
    { type: 'COMPLETE_TURN', playerId: previousPlayerId },
    getTileDefinition,
  );
  if (!completed.ok || !completed.resolution) return state;

  const riverPlaced = state.riverPlaced + (getCardDefinition(last.definitionId).riverCard ? 1 : 0);
  const decksEmpty = riverPlaced >= RIVER_CARD_COUNT
    && state.riverDeck.length === 0
    && state.landDeck.length === 0;
  const nextPlayerId = completed.resolution.state.players[completed.resolution.state.currentPlayerIndex]?.id
    ?? previousPlayerId;
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
    rotation: 0,
    legalPlacements: [],
    positionedAt: null,
    positionedRotations: [],
    selectedMeepleTarget: null,
    riverPlaced,
    lastResolution,
  };
}
