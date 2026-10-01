import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import {
  RIVER_CARD_COUNT,
  RUNTIME_CARD_CATALOG,
} from '../cards/runtimeCatalog';
import { seededShuffle } from '../deck/seededShuffle';
import {
  findSolvableRiverContinuation,
  planRiver,
  replanRemainingRiver,
  safeRiverPlacements,
} from '../deck/riverPlanner';
import { applyAction, applyActionWithResolution, createGame } from './gameEngine';
import { buildTurnResolution, emptyTurnResolution, type TurnResolution } from './turnResolution';
import { getLegalTilePlacements } from '../rules/placement';
import { getLegalMeeplePlacements } from '../rules/localFeatures';
import { placementKey, type MeeplePlacement, type Rotation, type TilePosition } from '../types/geometry';
import type { GameState, Player } from '../types/state';
import { posKey, type Board } from '../types/state';

export { RIVER_CARD_COUNT };

export const TURN_PHASES = [
  'AWAITING_DRAW', 'TILE_IN_HAND', 'TILE_POSITIONED', 'TILE_PLACED', 'MEEPLE_SELECTION', 'GAME_OVER',
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

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

function riverSourceId(): string {
  const starts = getRiverCards().filter((card) => card.riverKind === 'start');
  const ends = getRiverCards().filter((card) => card.riverKind === 'end');
  if (starts.length !== 1 || ends.length !== 1 || getRiverCards().length !== RIVER_CARD_COUNT) {
    throw new Error(
      `River catalog invariant failed: cards=${getRiverCards().length} starts=${starts.length} ends=${ends.length}`,
    );
  }
  return starts[0].id;
}

function riverEndId(): string {
  const ends = getRiverCards().filter((card) => card.riverKind === 'end');
  if (ends.length !== 1) throw new Error(`River requires exactly one forced end tile; found ${ends.length}.`);
  return ends[0].id;
}

/** Source is already placed; planRiver returns every middle plus forced end exactly once. */
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

function removeFromOnce(ids: readonly string[], id: string): string[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  return [...ids.slice(0, index), ...ids.slice(index + 1)];
}

function isRiverTurn(state: TurnFlowState): boolean {
  return state.riverPlaced < RIVER_CARD_COUNT;
}

/**
 * Choose the next river card from deterministic seeded priority. A middle card
 * can move ahead of an earlier priority card only when that is necessary to
 * preserve a complete continuation. River cards are never discarded.
 */
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
  if (chosen !== null && remainingMiddle.includes(chosen)) {
    const nextDeck = removeFromOnce(state.riverDeck, chosen);
    if (nextDeck !== null) return { cardId: chosen, riverDeck: nextDeck };
  }

  const replanned = replanRemainingRiver(state.seed, state.game.board);
  const head = replanned.find((id) => id !== endId) ?? replanned[0];
  if (head === undefined) return null;
  const nextDeck = removeFromOnce(state.riverDeck, head);
  return nextDeck === null ? null : { cardId: head, riverDeck: nextDeck };
}

function riverSafePositions(
  state: TurnFlowState,
  definitionId: string,
  rotation: Rotation,
): TilePosition[] {
  const card = getCardDefinition(definitionId);
  if (!card.riverCard) return [];
  const remainingMiddle = state.riverDeck.filter((id) => id !== riverEndId());
  return safeRiverPlacements({
    board: state.game.board,
    cardId: definitionId,
    rotation,
    remainingMiddleIds: remainingMiddle,
    seed: state.seed,
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
    .map(([cellKey, rotations]) => {
      const [x, y] = cellKey.split(',').map(Number);
      return { position: { x, y }, rotations: rotations.sort((a, b) => a - b) };
    });
}

function anyRotationLegalPlacements(state: TurnFlowState, definitionId: string): TilePosition[] {
  return getLegalTilePlacementOptions(state, definitionId).map((option) => option.position);
}

export function hasAnyLegalTilePlacement(
  state: TurnFlowState,
  definitionId: string = state.game.drawnTileDefinitionId ?? '',
): boolean {
  return definitionId !== '' && getLegalTilePlacementOptions(state, definitionId).length > 0;
}

export function canEndTurn(state: TurnFlowState): boolean {
  return state.phase === 'TILE_PLACED' || state.phase === 'MEEPLE_SELECTION';
}

function isTerminalDeckExhaustion(riverPlaced: number, riverDeck: string[], landDeck: string[]): boolean {
  return riverPlaced >= RIVER_CARD_COUNT && riverDeck.length === 0 && landDeck.length === 0;
}

/**
 * One authoritative terminal path for exhaustion without a placed tile (for
 * example after discarding the final unplayable land card). The engine already
 * owns final scoring; flow only normalizes the no-placement state into its
 * scoring phase before COMPLETE_TURN.
 */
function finalizeGame(state: TurnFlowState): TurnFlowState {
  if (state.phase === 'GAME_OVER' || state.game.status === 'finished') return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const input: GameState = {
    ...state.game,
    tileDeck: { remaining: [] },
    drawnTileDefinitionId: null,
    lastPlacedTile: null,
    gamePhase: 'scoreFeatures',
  };
  const completed = applyActionWithResolution(
    input,
    { type: 'COMPLETE_TURN', playerId },
    getTileDefinition,
  );
  if (!completed.ok || !completed.resolution || !completed.resolution.final) {
    throw new Error('Terminal finalization invariant failed.');
  }
  const nextPlayerId = completed.resolution.state.players[completed.resolution.state.currentPlayerIndex]?.id ?? playerId;
  return {
    ...state,
    game: completed.state,
    phase: 'GAME_OVER',
    selectedMeepleTarget: null,
    legalPlacements: [],
    rotation: 0,
    positionedAt: null,
    positionedRotations: [],
    lastResolution: buildTurnResolution({
      previousPlayerId: playerId,
      nextPlayerId,
      gameOver: true,
      normal: completed.resolution.normal,
      final: completed.resolution.final,
      finalScores: completed.state.scores,
    }),
  };
}

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
 * Replace exactly one unplayable LAND tile per click. River tiles are never
 * replaceable or discarded. If this removes the final physical land tile, the
 * game is finalized immediately through the authoritative final-scoring path.
 */
export function replaceUnplayableTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_IN_HAND') return state;
  const definitionId = state.game.drawnTileDefinitionId;
  if (definitionId === null) return state;
  if (getCardDefinition(definitionId).riverCard) return state;
  if (isRiverTurn(state)) return state;
  if (hasAnyLegalTilePlacement(state, definitionId)) return state;
  if (state.discardedTileIds.includes(definitionId)) return state;

  const futureDeck = removeFromOnce(state.landDeck, definitionId) ?? state.landDeck;
  const nextId = futureDeck[0];
  if (nextId === undefined) {
    const exhausted: TurnFlowState = {
      ...state,
      game: {
        ...state.game,
        drawnTileDefinitionId: null,
        lastPlacedTile: null,
      },
      discardedTileIds: [...state.discardedTileIds, definitionId],
      landDeck: [],
    };
    return isTerminalDeckExhaustion(exhausted.riverPlaced, exhausted.riverDeck, exhausted.landDeck)
      ? finalizeGame(exhausted)
      : exhausted;
  }

  const game: GameState = {
    ...state.game,
    tileDeck: { remaining: [nextId] },
    gamePhase: 'drawTile',
    drawnTileDefinitionId: null,
  };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...afterDrawFlowFields(state, result.state, nextId),
    discardedTileIds: [...state.discardedTileIds, definitionId],
    landDeck: futureDeck.slice(1),
  };
}

export function drawTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'AWAITING_DRAW') return state;
  return isRiverTurn(state) ? drawRiverTile(state) : drawLandTile(state);
}

function drawRiverTile(state: TurnFlowState): TurnFlowState {
  const picked = pickRiverDraw(state);
  if (picked === null) {
    throw new Error(
      `River invariant failure: seed=${state.seed} riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
    );
  }
  const stateAfterPick = { ...state, riverDeck: picked.riverDeck };
  if (playableRotation(stateAfterPick, picked.cardId) === null) {
    throw new Error(
      `River invariant failure: no safe placement for ${picked.cardId}; seed=${state.seed} ` +
      `riverPlaced=${state.riverPlaced} remaining=[${state.riverDeck.join(',')}]`,
    );
  }

  const game: GameState = {
    ...stateAfterPick.game,
    tileDeck: { remaining: [picked.cardId] },
    gamePhase: 'drawTile',
    drawnTileDefinitionId: null,
  };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return afterDrawFlowFields(stateAfterPick, result.state, picked.cardId);
}

function drawLandTile(state: TurnFlowState): TurnFlowState {
  const id = state.landDeck[0];
  if (id === undefined) {
    return isTerminalDeckExhaustion(state.riverPlaced, state.riverDeck, state.landDeck)
      ? finalizeGame(state)
      : state;
  }
  const game: GameState = {
    ...state.game,
    tileDeck: { remaining: [id] },
    gamePhase: 'drawTile',
    drawnTileDefinitionId: null,
  };
  const playerId = game.players[game.currentPlayerIndex]?.id ?? '';
  const result = applyAction(game, { type: 'DRAW_TILE', playerId }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...afterDrawFlowFields(state, result.state, id),
    landDeck: state.landDeck.slice(1),
  };
}

export function rotatePositionedTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED' || state.positionedRotations.length < 2) return state;
  const index = state.positionedRotations.indexOf(state.rotation);
  const rotation = state.positionedRotations[(index + 1) % state.positionedRotations.length];
  return { ...state, rotation };
}

export function confirmTurnTilePlacement(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED' || !state.game.drawnTileDefinitionId) return state;
  if (!state.positionedAt || !state.positionedRotations.includes(state.rotation)) return state;
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

export function cancelPositionedTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'TILE_POSITIONED') return state;
  return {
    ...state,
    phase: 'TILE_IN_HAND',
    rotation: 0,
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
  const targetKey = placementKey(target);
  if (!legal.some((placement) => placementKey(placement) === targetKey)) return state;

  const last = state.game.lastPlacedTile;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  if (!last) return state;
  const result = applyAction(state.game, {
    type: 'PLACE_MEEPLE',
    playerId,
    position: last.position,
    ...target,
  }, getTileDefinition);
  if (!result.ok) return state;
  return {
    ...state,
    game: result.state,
    phase: 'MEEPLE_SELECTION',
    selectedMeepleTarget: target,
  };
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
  const scoringInput = { ...decision.state, tileDeck: { remaining: remainingCardIds } };
  const completed = applyActionWithResolution(
    scoringInput,
    { type: 'COMPLETE_TURN', playerId: previousPlayerId },
    getTileDefinition,
  );
  if (!completed.ok || !completed.resolution) return state;

  const riverPlaced = state.riverPlaced + (getCardDefinition(last.definitionId).riverCard ? 1 : 0);
  const decksEmpty = isTerminalDeckExhaustion(riverPlaced, state.riverDeck, state.landDeck);
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
    positionedAt: null,
    positionedRotations: [],
    riverPlaced,
    lastResolution,
  };
}
