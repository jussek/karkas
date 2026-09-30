import { describe, expect, it } from 'vitest';

import { getCardDefinition } from '../../game/cards/catalogApi';
import {
  createTurnFlow,
  drawTurnTile,
  legalPlacementsFor,
  placeTurnTile,
  rotateTurnTile,
} from '../../game/engine/turnFlow';
import type { Player } from '../../game/types/state';
import { boardToScreen } from '../board/boardTransform';
import { placementForTileDrop, resolveTileDrop, tileDragOwnsPointer } from '../game/tileDrag';

const player: Player = { id: 'p1', name: 'P1', color: 'blue', score: 0 };
const viewport = { left: 100, top: 50, width: 500, height: 400 };
const cellSize = 50;
const originOffset = 4;

function drawnFlow() {
  return drawTurnTile(createTurnFlow({ gameId: 'drag', players: [player], seed: 4 }));
}

function clientPointFor(
  position: { x: number; y: number },
  camera = { offsetX: 0, offsetY: 0, scale: 1 },
) {
  const world = {
    x: (position.x + originOffset + 0.5) * cellSize,
    y: (position.y + originOffset + 0.5) * cellSize,
  };
  const screen = boardToScreen(camera, world);
  return { x: screen.x + viewport.left, y: screen.y + viewport.top };
}

describe('authoritative tile drag targeting', () => {
  it('rotation 0 and rotation 90 use engine-recalculated legal sets', () => {
    let flow = drawnFlow();
    const cardId = flow.game.drawnTileDefinitionId!;
    while (flow.rotation !== 0) flow = rotateTurnTile(flow);
    expect(flow.legalPlacements).toEqual(legalPlacementsFor(flow, cardId, 0));

    flow = rotateTurnTile(flow);
    expect(flow.rotation).toBe(90);
    expect(flow.legalPlacements).toEqual(legalPlacementsFor(flow, cardId, 90));
  });

  it('turns a legal drop into an authoritative placement request', () => {
    const flow = drawnFlow();
    const position = flow.legalPlacements[0];
    const target = resolveTileDrop({
      clientPoint: clientPointFor(position), viewport, camera: { offsetX: 0, offsetY: 0, scale: 1 },
      cellSize, originOffset, legalPlacements: flow.legalPlacements, board: flow.game.board,
    });
    const placement = placementForTileDrop(target, false);
    const placed = placement ? placeTurnTile(flow, placement) : flow;
    expect(target).toEqual({ position, valid: true, reason: null });
    expect(placed.phase).toBe('TILE_PLACED');
  });

  it('rejects illegal and occupied coordinates without changing tile or rotation', () => {
    const flow = drawnFlow();
    const illegal = { x: 3, y: 3 };
    const illegalTarget = resolveTileDrop({
      clientPoint: clientPointFor(illegal), viewport, camera: { offsetX: 0, offsetY: 0, scale: 1 },
      cellSize, originOffset, legalPlacements: flow.legalPlacements, board: flow.game.board,
    });
    const occupiedTarget = resolveTileDrop({
      clientPoint: clientPointFor({ x: 0, y: 0 }), viewport, camera: { offsetX: 0, offsetY: 0, scale: 1 },
      cellSize, originOffset, legalPlacements: flow.legalPlacements, board: flow.game.board,
    });
    const illegalPlacement = placementForTileDrop(illegalTarget, false);
    const unchanged = illegalPlacement
      ? placeTurnTile(flow, illegalPlacement)
      : flow;

    expect(illegalTarget).toMatchObject({ position: illegal, valid: false, reason: 'illegal' });
    expect(occupiedTarget).toMatchObject({ position: { x: 0, y: 0 }, valid: false, reason: 'occupied' });
    expect(unchanged).toBe(flow);
    expect(unchanged.game.drawnTileDefinitionId).toBe(flow.game.drawnTileDefinitionId);
    expect(unchanged.rotation).toBe(flow.rotation);
    expect(getCardDefinition(unchanged.game.drawnTileDefinitionId!).riverCard).toBe(true);
  });

  it('resolves zoomed and panned screen coordinates to the same board cell', () => {
    const position = { x: 0, y: -1 };
    for (const camera of [
      { offsetX: 0, offsetY: 0, scale: 2 },
      { offsetX: -75, offsetY: 40, scale: 1 },
    ]) {
      const target = resolveTileDrop({
        clientPoint: clientPointFor(position, camera), viewport, camera,
        cellSize, originOffset, legalPlacements: [position], board: {},
      });
      expect(target).toEqual({ position, valid: true, reason: null });
    }
  });

  it('rejects drops outside the viewport and cancelled legal drops', () => {
    const flow = drawnFlow();
    const target = resolveTileDrop({
      clientPoint: { x: viewport.left - 1, y: viewport.top - 1 }, viewport,
      camera: { offsetX: 0, offsetY: 0, scale: 1 }, cellSize, originOffset,
      legalPlacements: flow.legalPlacements, board: flow.game.board,
    });
    expect(target).toEqual({ position: null, valid: false, reason: 'outside-board' });
    expect(placementForTileDrop({ position: { x: 1, y: 1 }, valid: true, reason: null }, true)).toBeNull();
    expect(flow.phase).toBe('TILE_IN_HAND');
  });

  it('keeps the tile drag pointer separate from unrelated board pointers', () => {
    expect(tileDragOwnsPointer(7, 7)).toBe(true);
    expect(tileDragOwnsPointer(7, 8)).toBe(false);
  });
});
