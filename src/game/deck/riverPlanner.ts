/**
 * River planner (Stage 4A Repair 2B, OPTION_A).
 *
 * Гарантирует детерминированную, разрешимую последовательность river-карт:
 * - source card-091 всегда первой;
 * - ВСЕ 17 middle карт используются ровно один раз, без discard и skip;
 * - end card-133 всегда последняя (19-я river tile);
 * - порядок детерминирован от seed (тот же seed + та же доска => тот же план);
 * - legality проверяется существующими authoritative правилами
 *   (getLegalTilePlacements / isLegalTilePlacement) — правила НЕ ослабляются.
 *
 * Алгоритм: seededShuffle задаёт deterministic priority remaining-карт;
 * DFS с backtracking находит continuation, при котором для каждой следующей
 * карты существует legal placement у единственного river frontier И полный
 * completion оставшихся middle + end. Это НЕ reroll-until-success: один seed
 * порождает один конкретный solved plan.
 *
 * Прuned search space (защита от exponential disaster):
 * - frontier всегда ровно одна клетка (инвариант реки);
 * - проверяются только позиции на frontier (не board-wide перебор);
 * - максимум 4 ротации на карту;
 * - memoization dead-end состояний (frontier key + sorted remaining ids).
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

/**
 * Кандидат placement ДОЛЖЕН быть полностью совместим со всеми четырьмя
 * ортогональными соседями занятой доски (river + terrain) по той же
 * authoritative функции areEdgesCompatible, что использует general rules.
 * Planner никогда не планирует шаг, который позднее будет отбракован
 * legality filter'ом на фактической доске.
 */
function edgesCompatibleWithOccupied(board: Board, cardId: string, rotation: Rotation, position: TilePosition): boolean {
  const mine = getTileEdges(getTileDefinition(cardId), rotation);
  for (const edge of [0, 1, 2, 3] as const) {
    const offset = edgeOffset(edge);
    const neighbor = board[posKey({ x: position.x + offset.x, y: position.y + offset.y })];
    if (!neighbor) continue;
    const theirs = getTileEdges(getTileDefinition(neighbor.definitionId), neighbor.rotation);
    if (!areEdgesCompatible(mine as readonly EdgeType[], edge, theirs, ((edge + 2) % 4) as EdgeIndex)) return false;
  }
  return true;
}

/**
 * Required edge of the NEW tile on the shared boundary with an existing tile
 * whose exposed river edge is `exposedEdge` (convention 0=N,1=E,2=S,3=W):
 * N -> S, E -> W, S -> N, W -> E.
 */
export function requiredEdgeForFrontier(exposedEdge: EdgeIndex): EdgeIndex {
  return oppositeEdge(exposedEdge);
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

function riverCardsByKind() {
  const cards = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
  const source = cards.find((card) => card.riverKind === 'start');
  const end = cards.find((card) => card.riverKind === 'end');
  const middle = cards.filter((card) => card.riverKind === 'middle').map((card) => card.id);
  return { source, end, middle, total: cards.length };
}

/**
 * Единственный незакрытый river endpoint текущей доски (или null, если их
 * ноль или больше одного).
 *
 * Семантика: exposed river edge существующей river-плитки смотрит в пустую
 * клетку. Новая плитка на этой общей границе должна иметь реку на СВОЕЙ
 * стороне, то есть на opposite(exposedEdge). Инверсия выполняется РОВНО ОДИН
 * раз (см. requiredEdgeForFrontier + unit test).
 */
export function frontierOf(board: Board): { position: TilePosition; requiredEdge: EdgeIndex } | null {
  const open: { position: TilePosition; requiredEdge: EdgeIndex }[] = [];
  for (const tile of Object.values(board)) {
    const card = getCardDefinition(tile.definitionId);
    if (!card.riverCard) continue;
    for (const baseEdge of card.topology.riverEdges ?? []) {
      const edge = rotateEdge(baseEdge, tile.rotation);
      const offset = edgeOffset(edge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      if (board[posKey(position)] !== undefined) continue;
      open.push({ position, requiredEdge: requiredEdgeForFrontier(edge) });
    }
  }
  return open.length === 1 ? open[0] : null;
}

interface Candidate {
  rotation: Rotation;
  position: TilePosition;
}

/**
 * Canonical board serialization for memoization: sorted "x,y:defId:rot" keys.
 * Полностью описывает occupied geometry, поэтому одинаковый signature
 * гарантирует одинаковую задачу solvability.
 */
export function boardSignature(board: Board): string {
  return Object.values(board)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((tile) => `${tile.position.x},${tile.position.y}:${tile.definitionId}:${tile.rotation}`)
    .join(';');
}

/** Legal placements карты с учётом существующих правил + requirement стыковки с frontier. */
function candidatesFor(
  board: Board,
  cardId: string,
  frontier: NonNullable<ReturnType<typeof frontierOf>>,
): Candidate[] {
  const def = getTileDefinition(cardId);
  const out: Candidate[] = [];
  for (const rotation of ROTATIONS) {
    const rotatedRiverEdges = (getCardDefinition(cardId).topology.riverEdges ?? []).map(
      (edge) => rotateEdge(edge, rotation),
    );
    if (!rotatedRiverEdges.includes(frontier.requiredEdge)) continue;
    // Полная legality по всем занятым соседям (тот же стандарт, что у general
    // rules) — иначе planner планирует шаги, которые turnFlow позднее
    // отбраковывает, и река «заканчивается» без continuation.
    if (!edgesCompatibleWithOccupied(board, cardId, rotation, frontier.position)) continue;
    const positions = getLegalTilePlacements(
      { board, getDefinition: getTileDefinition },
      def,
      rotation,
    ).filter((position) => position.x === frontier.position.x && position.y === frontier.position.y);
    for (const position of positions) out.push({ rotation, position });
  }
  return out;
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

/**
 * Рекурсивный deterministic backtracking.
 * Возвращает solved continuation для remainingIds или null.
 */
function solve(
  board: Board,
  remainingIds: readonly string[],
  endId: string,
  deadStates: Set<string>,
): RiverPlanStep[] | null {
  if (remainingIds.length === 0) {
    // End проверяется ТОЛЬКО после всех middle.
    const frontier = frontierOf(board);
    if (!frontier) return null;
    for (const candidate of candidatesFor(board, endId, frontier)) {
      const next = withTile(board, endId, candidate);
      if (frontierOf(next) === null) {
        return [{ cardId: endId, rotation: candidate.rotation, position: candidate.position }];
      }
    }
    return null;
  }

  const frontier = frontierOf(board);
  if (!frontier) return null;

  // Memoization key обязан включать ДОСТАТОЧНОЕ состояние: legality будущих
  // river placement зависит от всей occupied board geometry (terrain-соседи),
  // поэтому ключ = полная каноническая сериализация доски + sorted remaining.
  // Ключ frontier+remaining был бы небезопасен: разные геометрии с одинаковым
  // frontier могут иметь разные continuation.
  const stateKey = boardSignature(board) + '|' + [...remainingIds].sort().join(',');
  if (deadStates.has(stateKey)) return null;

  // Deterministic card selection: the priority order is fixed by the seed,
  // but a card that cannot complete the river is NOT discarded — we try the
  // next remaining card by deterministic priority. Every used card is removed
  // from the set exactly once; nothing is skipped or dropped.
  for (let i = 0; i < remainingIds.length; i += 1) {
    const cardId = remainingIds[i];
    const rest = [...remainingIds.slice(0, i), ...remainingIds.slice(i + 1)];
    for (const candidate of candidatesFor(board, cardId, frontier)) {
      const nextBoard = withTile(board, cardId, candidate);
      const solution = solve(nextBoard, rest, endId, deadStates);
      if (solution) {
        return [{ cardId, rotation: candidate.rotation, position: candidate.position }, ...solution];
      }
    }
  }
  deadStates.add(stateKey);
  return null;
}

/**
 * Строит полный решаемый river plan: 18 middle+end шагов после source.
 * board должен содержать уже размещённый source (детерминированный старт @(0,0)).
 * Бросает invariant error, если canonical river set не может быть завершён
 * (для корректного canonical набора это недостижимо — покрыто 1000-seed тестом).
 */
export function planRiver(seed: number, board: Board): RiverPlanStep[] {
  const { source, end, middle, total } = riverCardsByKind();
  if (!source || !end || middle.length !== 17 || total !== 19) {
    throw new Error('River requires one source, one end, and 17 middle tiles.');
  }
  const priority = seededShuffle(middle, seed);
  const deadStates = new Set<string>();
  const plan = solve(board, priority, end.id, deadStates);
  if (!plan) {
    throw new Error(
      `River invariant violation: no solvable order. seed=${seed} remaining=[${priority.join(',')}]`,
    );
  }
  return plan;
}

/**
 * Инкрементальный выбор СЛЕДУЮЩЕЙ river карты от ФАКТИЧЕСКОЙ доски.
 *
 * Возвращает первую карту (по deterministic seeded-priority среди remaining),
 * для которой существует legal placement у frontier И полный completion path
 * оставшихся middle + end. Это гарантирует: любой разрешённый игроком safe
 * placement сохраняет решаемость реки (не только autoplay-first-path).
 *
 * Если ни одна карта не проходит — это НЕ throw и НЕ discard: возвращается
 * null, что означает «front-of-deck порядок больше не гарантирован». Вызывающий
 * код обязан переиграть plan для текущей фактической доски (planRiver с тем же
 * seed) — canonical набор всегда планораешем, поэтому такой fallback сам
 * находит решаемый порядок без потери карт.
 */
export function findSolvableRiverContinuation(options: {
  board: Board;
  remainingMiddleIds: readonly string[];
  seed: number;
}): string | null {
  const { board, remainingMiddleIds, seed } = options;
  const { end } = riverCardsByKind();
  if (!end) throw new Error('River requires one source and one end.');
  if (remainingMiddleIds.length === 0) return end.id;
  const frontier = frontierOf(board);
  if (!frontier) {
    throw new Error(`River invariant violation: no single frontier. seed=${seed}`);
  }
  // Deterministic priority: stable shuffle всех remaining карт от seed.
  const priority = seededShuffle([...remainingMiddleIds], seed);
  for (const cardId of priority) {
    const rest = remainingMiddleIds.filter((id) => id !== cardId);
    for (const candidate of candidatesFor(board, cardId, frontier)) {
      const nextBoard = withTile(board, cardId, candidate);
      const deadStates = new Set<string>();
      if (solve(nextBoard, rest, end.id, deadStates) !== null) {
        return cardId;
      }
    }
  }
  return null;
}

/**
 * Solvability check от ФАКТИЧЕСКОЙ доски с ЯВНЫМ списком оставшихся middle
 * (river-safe placement filter в turnFlow). Deterministic: тот же вход —
 * тот же результат. Бросает ошибку, если continuation не существует.
 */
export function assertRiverSolvableFrom(
  seed: number,
  board: Board,
  remainingMiddleIds: readonly string[],
): void {
  const { end } = riverCardsByKind();
  if (!end) throw new Error('River requires one source and one end.');
  const deduped = Array.from(new Set(remainingMiddleIds));
  const deadStates = new Set<string>();
  const plan = solve(board, deduped, end.id, deadStates);
  if (!plan) {
    const frontier = frontierOf(board);
    throw new Error(
      `River invariant violation: no completion path. seed=${seed} remaining=[${deduped.join(',')}]` +
        ` frontier=${frontier ? posKey(frontier.position) : 'none'} board=[${Object.keys(board).join(' ')}]`,
    );
  }
}

/**
 * Полный перепланинг реки от ФАКТИЧЕСКОЙ доски (fallback, когда прежний
 * front-order приоритет больше не решаем после выбора игрока).
 * Возвращает решаемый порядок ОСТАВШИХСЯ middle карт + end, ровно по одному
 * использованию каждой карты, без discard. Бросает invariant error, если
 * continuation объективно невозможен (для корректного canonical набора
 * недостижимо при любом river-safe выборе — покрыто тестами).
 */
export function replanRemainingRiver(seed: number, board: Board): string[] {
  const { end } = riverCardsByKind();
  if (!end) throw new Error('River requires one source and one end.');
  const used = new Set(
    Object.values(board).filter((tile) => getCardDefinition(tile.definitionId).riverCard).map((tile) => tile.definitionId),
  );
  const remainingMiddle = RUNTIME_CARD_CATALOG
    .filter((card) => card.riverCard === true && card.riverKind === 'middle' && !used.has(card.id))
    .map((card) => card.id);
  const priority = seededShuffle(remainingMiddle, seed);
  const deadStates = new Set<string>();
  const plan = solve(board, priority, end.id, deadStates);
  if (!plan) {
    const frontier = frontierOf(board);
    throw new Error(
      `River invariant violation: no re-plan continuation. seed=${seed} ` +
        `remaining=[${priority.join(',')}] frontier=${frontier ? posKey(frontier.position) : 'none'}`,
    );
  }
  return [...plan.map((step) => step.cardId), end.id];
}

/** Полный river order (source + 17 middle + end) для initial deck создания. */
export function solvedRiverOrder(seed: number, boardWithSource: Board): string[] {
  const { source, end } = riverCardsByKind();
  if (!source || !end) throw new Error('River requires one source and one end.');
  return [source.id, ...planRiver(seed, boardWithSource).map((step) => step.cardId), end.id];
}
