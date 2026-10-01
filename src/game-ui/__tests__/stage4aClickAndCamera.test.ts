import { describe, expect, it } from 'vitest';

import { boardToScreen, fitBounds } from '../board/boardTransform';
import { createTurnFlow, drawTurnTile, placeTurnTile } from '../../game/engine/turnFlow';
import type { Player } from '../../game/types/state';

const onePlayer: Player[] = [{ id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 }];

describe('Stage 4A explicit legal-cell click seam (no camera gesture prerequisite)', () => {
  it('clicking a legal cell transitions TILE_IN_HAND -> TILE_POSITIONED without any camera state', () => {
    // Явный клик по кнопке "+" в GamePage вызывает placeTurnTile напрямую;
    // guard camera.wasTapAtEnd() убран из onClick. Seam-тест проверяет,
    // что transition происходит без какого-либо camera gesture setup.
    let flow = createTurnFlow({ gameId: 'click-1', players: onePlayer, seed: 4 });
    flow = drawTurnTile(flow);
    expect(flow.phase).toBe('TILE_IN_HAND');
    expect(flow.legalPlacements.length).toBeGreaterThan(0);

    const position = flow.legalPlacements[0];
    const next = placeTurnTile(flow, position); // ровно то, что делает onClick кнопки "+"

    expect(next.phase).toBe('TILE_POSITIONED');
    expect(next.positionedAt).toEqual(position);
    // board ещё НЕ мутирован до подтверждения: ровно одна карта (стартовая card-133)
    expect(Object.values(next.game.board)).toHaveLength(1);
    expect(next.game.lastPlacedTile).toBeNull();
  });

  it('non-legal cell click leaves the flow unchanged', () => {
    let flow = createTurnFlow({ gameId: 'click-2', players: onePlayer, seed: 4 });
    flow = drawTurnTile(flow);
    const far = { x: 50, y: 50 };
    expect(flow.legalPlacements.some((p) => p.x === far.x && p.y === far.y)).toBe(false);
    expect(placeTurnTile(flow, far)).toBe(flow);
  });
});

describe('Stage 4A initial camera fit centers the start tile (0,0)', () => {
  it('fitContent math via production helpers places occupied cell center at viewport center', () => {
    // Воспроизводит математику useBoardCamera.fitContent для одной занятой клетки
    // (card-133 в game-позиции (0,0)) через production-хелперы fitBounds/boardToScreen.
    const cellSize = 92; // CELL в GamePage
    const originOffset = 8; // ORIGIN в GamePage
    const viewport = { width: 360, height: 520 };
    const cell = { x: 0, y: 0 };

    const left = (cell.x + originOffset) * cellSize;
    const top = (cell.y + originOffset) * cellSize;
    const bounds = { minX: left, minY: top, maxX: left + cellSize, maxY: top + cellSize };

    const camera = fitBounds(bounds, viewport, { padding: 16, minScale: 0.3, maxScale: 2.5 });

    const cellCenterContent = { x: left + cellSize / 2, y: top + cellSize / 2 };
    const screen = boardToScreen(camera, cellCenterContent);

    expect(screen.x).toBeCloseTo(viewport.width / 2, 9);
    expect(screen.y).toBeCloseTo(viewport.height / 2, 9);
    expect(camera.scale).toBeGreaterThan(0);
  });
});
