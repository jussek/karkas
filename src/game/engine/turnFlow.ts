import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { seededShuffle } from '../deck/seededShuffle';
import { edgeOffset, rotateEdge } from './geometry';
import { applyAction, createGame } from './gameEngine';
import { getLegalTilePlacements } from '../rules/placement';
import type { MeeplePlacement, Rotation, TilePosition } from '../types/geometry';
import type { GameState, Player } from '../types/state';
import { posKey } from '../types/state';

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
}

export interface CreateTurnFlowOptions {
  gameId: string;
  players: Player[];
  seed: number;
}

export function getRiverCards() {
  return RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
}

function riverOrder(seed: number): string[] {
  const cards = getRiverCards();
  const source = cards.find((card) => card.riverKind === 'start');
  const end = cards.find((card) => card.riverKind === 'end');
  if (!source || !end || cards.length !== RIVER_CARD_COUNT) throw new Error('River requires one source, one end, and 17 middle tiles.');
  const middle = seededShuffle(cards.filter((card) => card.riverKind === 'middle').map((card) => card.id), seed);
  if (middle.length !== 17) throw new Error('River requires exactly 17 middle tiles.');
  return [source.id, ...middle, end.id];
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
  };
}

function isRiverTurn(state: TurnFlowState): boolean {
  return state.riverPlaced < RIVER_CARD_COUNT;
}

function openRiverPlacement(state: TurnFlowState, definitionId: string, rotation: Rotation): TilePosition[] {
  const riverTiles = Object.values(state.game.board).filter((tile) => getCardDefinition(tile.definitionId).riverCard);
  const open: { position: TilePosition; requiredEdge: number }[] = [];
  for (const tile of riverTiles) {
    const card = getCardDefinition(tile.definitionId);
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const edge = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(edge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (!state.game.board[posKey(position)]) open.push({ position, requiredEdge: (edge + 2) % 4 });
    }
  }
  if (open.length !== 1) return [];
  const card = getCardDefinition(definitionId);
  const rotatedRiverEdges = (card.topology.riverEdges ?? []).map((edge) => rotateEdge(edge, rotation));
  if (!rotatedRiverEdges.includes(open[0].requiredEdge as 0 | 1 | 2 | 3)) return [];
  return getLegalTilePlacements(
    { board: state.game.board, getDefinition: getTileDefinition },
    getTileDefinition(definitionId),
    rotation,
  ).filter((position) => position.x === open[0].position.x && position.y === open[0].position.y);
}

export function legalPlacementsFor(state: TurnFlowState, definitionId: string, rotation: Rotation): TilePosition[] {
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

export function drawTurnTile(state: TurnFlowState): TurnFlowState {
  if (state.phase !== 'AWAITING_DRAW') return state;
  const deckKey = isRiverTurn(state) ? 'riverDeck' : 'landDeck';
  const deck = state[deckKey];
  const discarded = [...state.discardedTileIds];
  let index = 0;
  let rotation: Rotation | null = null;
  while (index < deck.length && rotation === null) {
    rotation = playableRotation(state, deck[index]);
    if (rotation === null) discarded.push(deck[index]);
    else break;
    index += 1;
  }
  if (rotation === null) return { ...state, phase: 'GAME_OVER', discardedTileIds: discarded, [deckKey]: [] };
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
    [deckKey]: deck.slice(index + 1),
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
  return { ...state, phase: target ? 'MEEPLE_SELECTION' : 'TILE_PLACED', selectedMeepleTarget: target };
}

export function endTurn(state: TurnFlowState): TurnFlowState {
  if (!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(state.phase)) return state;
  const playerId = state.game.players[state.game.currentPlayerIndex]?.id ?? '';
  const last = state.game.lastPlacedTile;
  if (!last) return state;
  const decision = state.selectedMeepleTarget
    ? applyAction(state.game, { type: 'PLACE_MEEPLE', playerId, position: last.position, ...state.selectedMeepleTarget }, getTileDefinition)
    : applyAction(state.game, { type: 'SKIP_MEEPLE', playerId }, getTileDefinition);
  if (!decision.ok) return state;

  const remainingCardIds = [...state.riverDeck, ...state.landDeck];
  const scoringInput = { ...decision.state, tileDeck: { remaining: remainingCardIds } };
  const completed = applyAction(scoringInput, { type: 'COMPLETE_TURN', playerId }, getTileDefinition);
  if (!completed.ok) return state;
  const riverPlaced = state.riverPlaced + (getCardDefinition(last.definitionId).riverCard ? 1 : 0);
  const decksEmpty = riverPlaced >= RIVER_CARD_COUNT && state.landDeck.length === 0;
  return {
    ...state,
    game: { ...completed.state, tileDeck: { remaining: [] } },
    phase: decksEmpty ? 'GAME_OVER' : 'AWAITING_DRAW',
    selectedMeepleTarget: null,
    legalPlacements: [],
    rotation: 0,
    riverPlaced,
  };
}
