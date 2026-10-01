/**
 * Deterministic river planner.
 *
 * Product order:
 * - card-133 is already placed as the source;
 * - every middle river card is used exactly once in seeded priority order,
 *   with backtracking only when a priority choice cannot be completed;
 * - card-106 is reserved and is always the final river draw;
 * - river cards are never discarded.
 *
 * The real artwork contains card-109, a three-edge fork. Therefore a valid
 * river board may have more than one open river frontier. The planner groups
 * every exposed river edge by its target empty cell and checks candidates
 * against all required river edges for that cell plus the normal placement
 * rules. There is no separate or weakened edge-matching algorithm here.
 */

import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { areEdgesCompatible, edgeOffset, getTileEdges, oppositeEdge, rotateEdge } from '../engine/geometry';
import { getLegalTilePlacements } from '../rules/placement';
import { posKey, type Board } from '../types/state';
import type { EdgeIndex, EdgeType, Rotation, TilePosition } from '../types/geometry';
import { seededShuffle } from './seededShuffle';

export interface RiverPlanStep {
  cardId: string;
  rotation: Rotation;
  position: TilePosition;
}

export interface RiverFrontier {
  position: TilePosition;
  /** Sides the NEW tile must expose as river at this empty cell. */
  requiredEdges: EdgeIndex[];
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export function requiredEdgeForFrontier(exposedEdge: EdgeIndex): EdgeIndex {
  return oppositeEdge(exposedEdge);
}

function riverCardsByKind() {
  const cards = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
  const sources = cards.filter((card) => card.riverKind === 'start');
  const ends = cards.filter((card) => card.riverKind === 'end');
  const middle = cards.filter((card) => card.riverKind === 'middle').map((card) => card.id);
  if (sources.length !== 1 || ends.length !== 1) {
    throw new Error(`River requires exactly one source and one end; got source=${sources.length} end=${ends.length}.`);
  }
  return { source: sources[0], end: ends[0], middle, total: cards.length };
}

/**
 * Every open river boundary, grouped by the empty cell it points into.
 * Multiple exposed river edges can point into the same empty cell; in that
 * case a candidate placed there must satisfy every listed required edge.
 */
export function frontiersOf(board: Board): RiverFrontier[] {
  const grouped = new Map<string, { position: TilePosition; edges: Set<EdgeIndex> }>();
  for (const tile of Object.values(board)) {
    const card = getCardDefinition(tile.definitionId);
    if (!card.riverCard) continue;
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const exposed = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(exposed);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (board[posKey(position)] !== undefined) continue;
      const key = posKey(position);
      const entry = grouped.get(key) ?? { position, edges: new Set<EdgeIndex>() };
      entry.edges.add(requiredEdgeForFrontier(exposed));
      grouped.set(key, entry);
    }
  }
  return [...grouped.values()]
    .map(({ position, edges }) => ({ position, requiredEdges: [...edges].sort((a, b) => a - b) }))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
}

/** Compatibility helper retained for old diagnostics/tests. */
export function frontierOf(board: Board): { position: TilePosition; requiredEdge: EdgeIndex } | null {
  const frontiers = frontiersOf(board);
  if (frontiers.length !== 1 || frontiers[0].requiredEdges.length !== 1) return null;
  return { position: frontiers[0].position, requiredEdge: frontiers[0].requiredEdges[0] };
}

export function countOpenRiverEdges(board: Board): number {
  return frontiersOf(board).reduce((sum, frontier) => sum + frontier.requiredEdges.length, 0);
}

function edgesCompatibleWithOccupied(board: Board, cardId: string, rotation: Rotation, position: TilePosition): boolean {
  const mine = getTileEdges(getTileDefinition(cardId), rotation);
  for (const edge of [0, 1, 2, 3] as const) {
    const offset = edgeOffset(edge);
    const neighbor = board[posKey({ x: position.x + offset.x, y: position.y + offset.y })];
    if (!neighbor) continue;
    const theirs = getTileEdges(getTileDefinition(neighbor.definitionId), neighbor.rotation);
    if (!areEdgesCompatible(mine as readonly EdgeType[], edge, theirs, oppositeEdge(edge))) return false;
  }
  return true;
}

interface Candidate {
  rotation: Rotation;
  position: TilePosition;
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.position.x},${candidate.position.y}:${candidate.rotation}`;
}

/**
 * River candidate placements are normal legal tile placements restricted to
 * cells that currently receive at least one exposed river edge. If two river
 * branches meet the same empty cell, all their required sides must be river.
 */
function candidatesFor(board: Board, cardId: string): Candidate[] {
  const card = getCardDefinition(cardId);
  if (!card.riverCard) return [];
  const def = getTileDefinition(cardId);
  const out = new Map<string, Candidate>();
  for (const frontier of frontiersOf(board)) {
    for (const rotation of ROTATIONS) {
      const rotatedRiverEdges = (card.topology.riverEdges ?? []).map((edge) => rotateEdge(edge, rotation));
      if (!frontier.requiredEdges.every((edge) => rotatedRiverEdges.includes(edge))) continue;
      if (!edgesCompatibleWithOccupied(board, cardId, rotation, frontier.position)) continue;
      const legal = getLegalTilePlacements(
        { board, getDefinition: getTileDefinition },
        def,
        rotation,
      ).some((position) => position.x === frontier.position.x && position.y === frontier.position.y);
      if (!legal) continue;
      const candidate = { rotation, position: frontier.position };
      out.set(candidateKey(candidate), candidate);
    }
  }
  return [...out.values()].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.rotation - b.rotation,
  );
}

function withTile(board: Board, cardId: string, candidate: Candidate): Board {
  return {
    ...board,
    [posKey(candidate.position)]: {
      definitionId: cardId,
      rotation: candidate.rotation,
      position: { ...candidate.position },
    },
  };
}

export function boardSignature(board: Board): string {
  return Object.values(board)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((tile) => `${tile.position.x},${tile.position.y}:${tile.definitionId}:${tile.rotation}`)
    .join(';');
}

function solve(
  board: Board,
  remainingIds: readonly string[],
  endId: string,
  deadStates: Set<string>,
): RiverPlanStep[] | null {
  const stateKey = `${boardSignature(board)}|${[...remainingIds].sort().join(',')}|end:${endId}`;
  if (deadStates.has(stateKey)) return null;

  if (remainingIds.length === 0) {
    // The verified artwork contains one three-way fork but only one forced
    // final river-end tile. Consequently the graph can retain another open
    // river branch after the final tile. The product contract is sequencing
    // (106 is last), not an impossible "zero open edges" constraint.
    const endCandidate = candidatesFor(board, endId)[0];
    if (!endCandidate) {
      deadStates.add(stateKey);
      return null;
    }
    return [{ cardId: endId, rotation: endCandidate.rotation, position: endCandidate.position }];
  }

  if (frontiersOf(board).length === 0) {
    deadStates.add(stateKey);
    return null;
  }

  for (let index = 0; index < remainingIds.length; index += 1) {
    const cardId = remainingIds[index];
    const rest = [...remainingIds.slice(0, index), ...remainingIds.slice(index + 1)];
    for (const candidate of candidatesFor(board, cardId)) {
      const nextBoard = withTile(board, cardId, candidate);
      const continuation = solve(nextBoard, rest, endId, deadStates);
      if (continuation) return [{ cardId, rotation: candidate.rotation, position: candidate.position }, ...continuation];
    }
  }

  deadStates.add(stateKey);
  return null;
}

/** Full solved continuation after the already-placed source. */
export function planRiver(seed: number, board: Board): RiverPlanStep[] {
  const { source, end, middle, total } = riverCardsByKind();
  if (total !== middle.length + 2) {
    throw new Error(`River catalog is inconsistent: total=${total} middle=${middle.length}.`);
  }
  if (!Object.values(board).some((tile) => tile.definitionId === source.id)) {
    throw new Error(`River source ${source.id} must already be on the board.`);
  }
  const priority = seededShuffle(middle, seed);
  const plan = solve(board, priority, end.id, new Set<string>());
  if (!plan) {
    throw new Error(`River invariant violation: no solvable order. seed=${seed} remaining=[${priority.join(',')}]`);
  }
  return plan;
}

export function findSolvableRiverContinuation(options: {
  board: Board;
  remainingMiddleIds: readonly string[];
  seed: number;
}): string | null {
  const { board, remainingMiddleIds, seed } = options;
  const { end } = riverCardsByKind();
  if (remainingMiddleIds.length === 0) return candidatesFor(board, end.id).length > 0 ? end.id : null;
  const priority = seededShuffle([...remainingMiddleIds], seed);
  for (const cardId of priority) {
    const index = remainingMiddleIds.indexOf(cardId);
    const rest = [...remainingMiddleIds.slice(0, index), ...remainingMiddleIds.slice(index + 1)];
    for (const candidate of candidatesFor(board, cardId)) {
      if (solve(withTile(board, cardId, candidate), rest, end.id, new Set<string>()) !== null) return cardId;
    }
  }
  return null;
}

export function assertRiverSolvableFrom(
  seed: number,
  board: Board,
  remainingMiddleIds: readonly string[],
): void {
  const { end } = riverCardsByKind();
  const deduped = [...new Set(remainingMiddleIds)];
  if (!solve(board, deduped, end.id, new Set<string>())) {
    const frontiers = frontiersOf(board).map((frontier) => `${posKey(frontier.position)}[${frontier.requiredEdges.join(',')}]`);
    throw new Error(
      `River invariant violation: no completion path. seed=${seed} remaining=[${deduped.join(',')}] ` +
      `frontiers=[${frontiers.join(' ')}] board=[${Object.keys(board).join(' ')}]`,
    );
  }
}

export function replanRemainingRiver(seed: number, board: Board): string[] {
  const { end } = riverCardsByKind();
  const used = new Set(
    Object.values(board)
      .filter((tile) => getCardDefinition(tile.definitionId).riverCard)
      .map((tile) => tile.definitionId),
  );
  const remainingMiddle = RUNTIME_CARD_CATALOG
    .filter((card) => card.riverCard === true && card.riverKind === 'middle' && !used.has(card.id))
    .map((card) => card.id);
  const priority = seededShuffle(remainingMiddle, seed);
  const plan = solve(board, priority, end.id, new Set<string>());
  if (!plan) {
    const frontiers = frontiersOf(board).map((frontier) => `${posKey(frontier.position)}[${frontier.requiredEdges.join(',')}]`);
    throw new Error(
      `River invariant violation: no re-plan continuation. seed=${seed} remaining=[${priority.join(',')}] ` +
      `frontiers=[${frontiers.join(' ')}]`,
    );
  }
  // solve() already appends the single forced end exactly once.
  return plan.map((step) => step.cardId);
}

export function solvedRiverOrder(seed: number, boardWithSource: Board): string[] {
  const { source } = riverCardsByKind();
  return [source.id, ...planRiver(seed, boardWithSource).map((step) => step.cardId)];
}
