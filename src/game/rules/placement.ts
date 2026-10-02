/**
 * Правила размещения плиток (Carcassonne 2019, Этап 1).
 *
 * Инварианты правил:
 * - Плитка ставится только на пустую клетку, ортогонально соседствующую
 *   с уже размещённой (диагональное размещение запрещено — оно не даёт
 *   общего края, поэтому исключается требованием ортогонального соседа).
 * - Каждая сторона новой плитки должна совпадать по типу ландшафта
 *   со стороной ортогонального соседа (road-road, city-city, field-field).
 *   Stage 1.5: field — только геометрия стыка; правила полей — позже.
 * - Первая плитка (стартовый тайл) кладётся без проверок стыков.
 */

import type { Board } from '../types/state.js';
import { posKey } from '../types/state.js';
import type { Rotation, TileDefinition, TilePosition } from '../types/geometry.js';
import { EDGES } from '../types/geometry.js';
import {
  areEdgesCompatible,
  edgeOffset,
  getTileEdges,
} from '../engine/geometry.js';

export interface PlacementCheckContext {
  board: Board;
  /** Реестр шаблонов: id -> TileDefinition. */
  getDefinition: (definitionId: string) => TileDefinition;
}

/** Причина, по которой размещение недопустимо. */
export type PlacementError =
  | 'CELL_OCCUPIED'
  | 'NO_ORTHOGONAL_NEIGHBOR'
  | 'EDGE_MISMATCH';

export interface PlacementResult {
  legal: boolean;
  error?: PlacementError;
  /** Сторона(ы), на которых произошёл mismatch (для диагностики/UI). */
  mismatchedEdges?: number[];
}

/** Есть ли у клетки хотя бы один ортогональный сосед с плиткой. */
export function hasOrthogonalNeighbor(board: Board, position: TilePosition): boolean {
  return EDGES.some((e) => {
    const off = edgeOffset(e);
    return board[posKey({ x: position.x + off.x, y: position.y + off.y })] !== undefined;
  });
}

/**
 * Основная проверка законности размещения плитки.
 */
export function isLegalTilePlacement(
  ctx: PlacementCheckContext,
  definition: TileDefinition,
  rotation: Rotation,
  position: TilePosition,
): PlacementResult {
  const key = posKey(position);

  // 1. Клетка должна быть свободна.
  if (ctx.board[key] !== undefined) {
    return { legal: false, error: 'CELL_OCCUPIED' };
  }

  const edges = getTileEdges(definition, rotation);
  const neighbors = EDGES.map((e) => {
    const off = edgeOffset(e);
    const nPos: TilePosition = { x: position.x + off.x, y: position.y + off.y };
    const placed = ctx.board[posKey(nPos)];
    if (!placed) return null;
    const neighborDef = ctx.getDefinition(placed.definitionId);
    const neighborEdges = getTileEdges(neighborDef, placed.rotation);
    // Сосед стоит на стороне e от нас → его сторона, обращённая к нам: (e+2)%4.
    const neighborEdge = ((e + 2) % 4) as 0 | 1 | 2 | 3;
    return { edge: e, compatible: areEdgesCompatible(edges, e, neighborEdges, neighborEdge) };
  }).filter((n): n is NonNullable<typeof n> => n !== null);

  // 2. Должен быть хотя бы один ортогональный сосед
  //    (иначе это отдельный «остров» — запрещено правилами).
  if (neighbors.length === 0) {
    return { legal: false, error: 'NO_ORTHOGONAL_NEIGHBOR' };
  }

  // 3. Все общие границы должны быть совместимы.
  const mismatches = neighbors.filter((n) => !n.compatible).map((n) => n.edge);
  if (mismatches.length > 0) {
    return { legal: false, error: 'EDGE_MISMATCH', mismatchedEdges: mismatches };
  }

  return { legal: true };
}

/** Empty orthogonal frontier of the current board, in stable display order. */
export function getPlacementFrontier(board: Board): TilePosition[] {
  const candidates = new Map<string, TilePosition>();
  for (const tile of Object.values(board)) {
    for (const edge of EDGES) {
      const offset = edgeOffset(edge);
      const position = { x: tile.position.x + offset.x, y: tile.position.y + offset.y };
      const key = posKey(position);
      if (board[key] === undefined) candidates.set(key, position);
    }
  }
  return [...candidates.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Authoritative highlight source. UI code deliberately receives coordinates,
 * rather than reproducing edge matching rules.
 */
export function getLegalTilePlacements(
  ctx: PlacementCheckContext,
  definition: TileDefinition,
  rotation: Rotation,
): TilePosition[] {
  return getPlacementFrontier(ctx.board).filter((position) =>
    isLegalTilePlacement(ctx, definition, rotation, position).legal,
  );
}
