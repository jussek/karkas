/**
 * Deterministic river planner for the audited physical tile set.
 *
 * Product contract:
 * - card-133 is already placed at game start;
 * - every remaining middle river card is used exactly once, without discard;
 * - seededShuffle defines deterministic random card priority;
 * - card-106 is reserved and placed only after all middle cards;
 * - ordinary placement legality remains authoritative for every occupied edge;
 * - card-109 is a real three-edge river fork, therefore the planner supports
 *   multiple simultaneous open river frontiers.
 */

import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import {
  RIVER_END_CARD,
  RIVER_SOURCE_CARD,
  RIVER_TERMINAL_OPEN_EDGE_COUNT,
  RUNTIME_RIVER_CARDS,
} from '../cards/runtimeCatalog';
import { edgeOffset, oppositeEdge, rotateEdge } from '../engine/geometry';
import { getLegalTilePlacements } from '../rules/placement';
import { posKey, type Board } from '../types/state';
import type { EdgeIndex, Rotation, TilePosition } from '../types/geometry';
import { seededShuffle } from './seededShuffle';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export interface RiverPlanStep {
  cardId: string;
  rotation: Rotation;
  position: TilePosition;
}

export interface RiverFrontier {
  position: TilePosition;
  requiredEdges: EdgeIndex[];
}

interface Candidate {
  rotation: Rotation;
  position: TilePosition;
}

export function requiredEdgeForFrontier(exposedEdge: EdgeIndex): EdgeIndex {
  return oppositeEdge(exposedEdge);
}

function riverContract() {
  const starts = RUNTIME_RIVER_CARDS.filter((card) => card.riverKind === 'start');
  const ends = RUNTIME_RIVER_CARDS.filter((card) => card.riverKind === 'end');
  const middle = RUNTIME_RIVER_CARDS.filter((card) => card.riverKind === 'middle').map((card) => card.id);
  if (starts.length !== 1 || ends.length !== 1 || !RIVER_SOURCE_CARD || !RIVER_END_CARD) {
    throw new Error(
      `River catalog requires exactly one start and one end; starts=${starts.length} ends=${ends.length}`,
    );
  }
  return { source: RIVER_SOURCE_CARD, end: RIVER_END_CARD, middle };
}

/** All exposed river endpoints, grouped by the empty cell they enter. */
export function frontiersOf(board: Board): RiverFrontier[] {
  const grouped = new Map<string, { position: TilePosition; required: Set<EdgeIndex> }>();
  for (const tile of Object.values(board)) {
    const card = getCardDefinition(tile.definitionId);
    if (!card.riverCard) continue;
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const exposedEdge = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(exposedEdge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (board[posKey(position)] !== undefined) continue;
      const key = posKey(position);
      const item = grouped.get(key) ?? { position, required: new Set<EdgeIndex>() };
      item.required.add(requiredEdgeForFrontier(exposedEdge));
      grouped.set(key, item);
    }
  }
  return [...grouped.values()]
    .map(({ position, required }) => ({
      position,
      requiredEdges: [...required].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
}

/** Legacy helper retained for tests/callers that explicitly require one endpoint. */
export function frontierOf(board: Board): { position: TilePosition; requiredEdge: EdgeIndex } | null {
  const frontiers = frontiersOf(board);
  if (frontiers.length !== 1 || frontiers[0].requiredEdges.length !== 1) return null;
  return { position: frontiers[0].position, requiredEdge: frontiers[0].requiredEdges[0] };
}

export function countOpenRiverEdges(board: Board): number {
  return frontiersOf(board).reduce((sum, frontier) => sum + frontier.requiredEdges.length, 0);
}

export function boardSignature(board: Board): string {
  return Object.values(board)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((tile) => `${tile.position.x},${tile.position.y}:${tile.definitionId}:${tile.rotation}`)
    .join(';');
}

function withTile(board: Board, cardId: string, candidate: Candidate): Board {
  return {
    ...board,
    [posKey(candidate.position)]: {
      definitionId: cardId,
      rotation: candidate.rotation,
      position: candidate.position,
    },
  };
}

function samePosition(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * General placement rules stay authoritative. We only additionally require
 * the new river tile to satisfy every exposed river edge aimed at the chosen
 * frontier cell.
 */
function candidatesFor(board: Board, cardId: string): Candidate[] {
  const card = getCardDefinition(cardId);
  if (!card.riverCard) return [];
  const frontiers = frontiersOf(board);
  if (frontiers.length === 0) return [];
  const definition = getTileDefinition(cardId);
  const out: Candidate[] = [];

  for (const rotation of ROTATIONS) {
    const rotatedRiverEdges = (card.topology.riverEdges ?? []).map((edge) => rotateEdge(edge, rotation));
    const ordinaryLegal = getLegalTilePlacements(
      { board, getDefinition: getTileDefinition },
      definition,
      rotation,
    );
    for (const frontier of frontiers) {
      if (!frontier.requiredEdges.every((edge) => rotatedRiverEdges.includes(edge))) continue;
      if (!ordinaryLegal.some((position) => samePosition(position, frontier.position))) continue;
      out.push({ rotation, position: frontier.position });
    }
  }

  return out.sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.rotation - b.rotation,
  );
}

function stateKey(board: Board, remainingIds: readonly string[]): string {
  return `${boardSignature(board)}|${[...remainingIds].sort().join(',')}`;
}

/**
 * Fast feasibility solver. MRV card ordering is allowed here because this
 * function answers existence only; visible draw order is handled separately.
 */
function solveAny(
  board: Board,
  remainingIds: readonly string[],
  endId: string,
  deadStates: Set<string>,
): RiverPlanStep[] | null {
  if (remainingIds.length === 0) {
    for (const candidate of candidatesFor(board, endId)) {
      const next = withTile(board, endId, candidate);
      if (countOpenRiverEdges(next) === RIVER_TERMINAL_OPEN_EDGE_COUNT) {
        return [{ cardId: endId, rotation: candidate.rotation, position: candidate.position }];
      }
    }
    return null;
  }

  const key = stateKey(board, remainingIds);
  if (deadStates.has(key)) return null;

  const available = remainingIds
    .map((cardId) => ({ cardId, candidates: candidatesFor(board, cardId) }))
    .filter((entry) => entry.candidates.length > 0)
    .sort((a, b) => a.candidates.length - b.candidates.length || a.cardId.localeCompare(b.cardId));

  for (const entry of available) {
    const rest = remainingIds.filter((id) => id !== entry.cardId);
    for (const candidate of entry.candidates) {
      const next = withTile(board, entry.cardId, candidate);
      const tail = solveAny(next, rest, endId, deadStates);
      if (tail) {
        return [{ cardId: entry.cardId, rotation: candidate.rotation, position: candidate.position }, ...tail];
      }
    }
  }

  deadStates.add(key);
  return null;
}

function globalPriority(seed: number): string[] {
  return seededShuffle(riverContract().middle, seed);
}

function solvePreferred(
  seed: number,
  board: Board,
  remainingIds: readonly string[],
  endId: string,
): RiverPlanStep[] | null {
  if (remainingIds.length === 0) return solveAny(board, [], endId, new Set<string>());

  const remaining = new Set(remainingIds);
  const priority = globalPriority(seed).filter((id) => remaining.has(id));
  for (const id of remainingIds) if (!priority.includes(id)) priority.push(id);
  const feasibilityDead = new Set<string>();

  for (const cardId of priority) {
    const rest = remainingIds.filter((id) => id !== cardId);
    for (const candidate of candidatesFor(board, cardId)) {
      const next = withTile(board, cardId, candidate);
      if (solveAny(next, rest, endId, feasibilityDead) === null) continue;
      const tail = solvePreferred(seed, next, rest, endId);
      if (tail) {
        return [{ cardId, rotation: candidate.rotation, position: candidate.position }, ...tail];
      }
    }
  }
  return null;
}

export function planRiver(seed: number, board: Board): RiverPlanStep[] {
  const { source, end, middle } = riverContract();
  const sourceOnBoard = Object.values(board).some((tile) => tile.definitionId === source.id);
  if (!sourceOnBoard) throw new Error(`River plan requires pre-placed source ${source.id}.`);
  const plan = solvePreferred(seed, board, middle, end.id);
  if (!plan) {
    throw new Error(
      `River invariant violation: no solvable order. seed=${seed} remaining=[${middle.join(',')}] ` +
      `frontiers=${frontiersOf(board).length}`,
    );
  }
  return plan;
}

export function findSolvableRiverContinuation(options: {
  board: Board;
  remainingMiddleIds: readonly string[];
  seed: number;
}): string | null {
  const { board, remainingMiddleIds, seed } = options;
  const { end } = riverContract();
  if (remainingMiddleIds.length === 0) return end.id;

  const remaining = new Set(remainingMiddleIds);
  const priority = globalPriority(seed).filter((id) => remaining.has(id));
  for (const id of remainingMiddleIds) if (!priority.includes(id)) priority.push(id);
  const deadStates = new Set<string>();

  for (const cardId of priority) {
    const rest = remainingMiddleIds.filter((id) => id !== cardId);
    for (const candidate of candidatesFor(board, cardId)) {
      const next = withTile(board, cardId, candidate);
      if (solveAny(next, rest, end.id, deadStates) !== null) return cardId;
    }
  }
  return null;
}

/**
 * Every returned placement connects to an exposed river endpoint and preserves
 * a completion path for all unplayed middle cards plus the forced end.
 */
export function safeRiverPlacements(options: {
  board: Board;
  cardId: string;
  rotation: Rotation;
  remainingMiddleIds: readonly string[];
  seed: number;
}): TilePosition[] {
  const { board, cardId, rotation, remainingMiddleIds } = options;
  const { end } = riverContract();
  const card = getCardDefinition(cardId);
  if (!card.riverCard) return [];

  return candidatesFor(board, cardId)
    .filter((candidate) => candidate.rotation === rotation)
    .filter((candidate) => {
      const next = withTile(board, cardId, candidate);
      if (cardId === end.id) {
        return remainingMiddleIds.length === 0
          && countOpenRiverEdges(next) === RIVER_TERMINAL_OPEN_EDGE_COUNT;
      }
      const rest = remainingMiddleIds.filter((id) => id !== cardId);
      return solveAny(next, rest, end.id, new Set<string>()) !== null;
    })
    .map((candidate) => candidate.position);
}

export function assertRiverSolvableFrom(
  seed: number,
  board: Board,
  remainingMiddleIds: readonly string[],
): void {
  void seed;
  const { end } = riverContract();
  const deduped = [...new Set(remainingMiddleIds)];
  if (solveAny(board, deduped, end.id, new Set<string>()) === null) {
    throw new Error(
      `River invariant violation: no completion path. remaining=[${deduped.join(',')}] ` +
      `frontiers=${frontiersOf(board).map((frontier) => posKey(frontier.position)).join(' ')}`,
    );
  }
}

export function replanRemainingRiver(seed: number, board: Board): string[] {
  const { end, middle } = riverContract();
  const used = new Set(
    Object.values(board)
      .filter((tile) => getCardDefinition(tile.definitionId).riverCard === true)
      .map((tile) => tile.definitionId),
  );
  const remainingMiddle = middle.filter((id) => !used.has(id));
  const plan = solvePreferred(seed, board, remainingMiddle, end.id);
  if (!plan) {
    throw new Error(
      `River invariant violation: no re-plan continuation. seed=${seed} ` +
      `remaining=[${remainingMiddle.join(',')}] frontiers=${frontiersOf(board).length}`,
    );
  }
  return plan.map((step) => step.cardId);
}

export function solvedRiverOrder(seed: number, boardWithSource: Board): string[] {
  const { source } = riverContract();
  return [source.id, ...planRiver(seed, boardWithSource).map((step) => step.cardId)];
}
