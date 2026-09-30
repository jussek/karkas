import { screenToBoard, type Camera, type Point } from '../board/boardTransform';
import { posKey, type Board } from '../../game/types/state';
import type { TilePosition } from '../../game/types/geometry';

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type DropReason = 'outside-board' | 'occupied' | 'illegal';

export interface TileDropTarget {
  position: TilePosition | null;
  valid: boolean;
  reason: DropReason | null;
}

export interface ResolveTileDropInput {
  clientPoint: Point;
  viewport: ViewportRect;
  camera: Camera;
  cellSize: number;
  originOffset: number;
  legalPlacements: readonly TilePosition[];
  board: Board;
}

/** Resolve a pointer drop through the same camera transform used to render the board. */
export function resolveTileDrop(input: ResolveTileDropInput): TileDropTarget {
  const local = {
    x: input.clientPoint.x - input.viewport.left,
    y: input.clientPoint.y - input.viewport.top,
  };
  if (
    local.x < 0 ||
    local.y < 0 ||
    local.x >= input.viewport.width ||
    local.y >= input.viewport.height
  ) {
    return { position: null, valid: false, reason: 'outside-board' };
  }

  const world = screenToBoard(input.camera, local);
  const position = {
    x: Math.floor(world.x / input.cellSize) - input.originOffset,
    y: Math.floor(world.y / input.cellSize) - input.originOffset,
  };
  if (input.board[posKey(position)] !== undefined) {
    return { position, valid: false, reason: 'occupied' };
  }
  const valid = input.legalPlacements.some(
    (candidate) => candidate.x === position.x && candidate.y === position.y,
  );
  return { position, valid, reason: valid ? null : 'illegal' };
}

export function placementForTileDrop(
  target: TileDropTarget,
  cancelled: boolean,
): TilePosition | null {
  return !cancelled && target.valid ? target.position : null;
}

export function tileDragOwnsPointer(activePointerId: number, eventPointerId: number): boolean {
  return activePointerId === eventPointerId;
}
