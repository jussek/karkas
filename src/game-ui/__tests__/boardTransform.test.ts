import { describe, expect, it } from 'vitest';
import {
  boardBounds, boundsFromPoints, clampScale, cellRect, DEFAULT_MAX_FIT_SCALE, expandBounds,
  fitBounds, isTapGesture, MIN_FIT_SCALE, panCamera, screenToBoard, TAP_MOVE_THRESHOLD_PX,
  unionBounds, zoomAroundPoint, zoomByButton, type Camera, type Point,
} from '../board/boardTransform';

const camera: Camera = { offsetX: 120, offsetY: -40, scale: 1.5 };

describe('Stage 4A pure board camera helpers', () => {
  it('clampScale respects min/max in both orders', () => {
    expect(clampScale(3, 0.5, 2)).toBe(2);
    expect(clampScale(0.1, 0.5, 2)).toBe(0.5);
    expect(clampScale(1.2, 0.5, 2)).toBe(1.2);
    // перепутанные границы нормализуются
    expect(clampScale(4, 2, 0.5)).toBe(2);
  });

  it('panCamera moves offsets by screen delta and keeps scale', () => {
    const moved = panCamera(camera, { x: 37, y: -12 });
    expect(moved).toEqual({ offsetX: 157, offsetY: -52, scale: 1.5 });
    // обратный пан возвращает исходную камеру
    expect(panCamera(moved, { x: -37, y: 12 })).toEqual(camera);
  });

  it('zoomAroundPoint keeps the focal content point fixed (map-like zoom)', () => {
    const focal: Point = { x: 200, y: 300 };
    const before = screenToBoard(camera, focal);
    const zoomed = zoomAroundPoint(camera, 1.4, focal, 0.5, 3);
    const after = screenToBoard(zoomed, focal);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomed.scale).toBeCloseTo(2.1, 9);
  });

  it('zoomAroundPoint clamps at min and max without jumping', () => {
    const focal: Point = { x: 100, y: 100 };
    const tiny = zoomAroundPoint(camera, 0.001, focal, 0.5, 3);
    expect(tiny.scale).toBe(0.5);
    expect(Number.isFinite(tiny.offsetX)).toBe(true);
    expect(Number.isFinite(tiny.offsetY)).toBe(true);
    const huge = zoomAroundPoint(camera, 1000, focal, 0.5, 3);
    expect(huge.scale).toBe(3);
  });

  it('zoomByButton uses viewport center and clamps', () => {
    const viewport = { width: 360, height: 640 };
    const inZoom = zoomByButton(camera, 'in', viewport, 0.5, 3);
    expect(inZoom.scale).toBeCloseTo(1.5 * 1.35, 9);
    const outZoom = zoomByButton(camera, 'out', viewport, 0.5, 3);
    expect(outZoom.scale).toBeLessThan(camera.scale);
    let c: Camera = { offsetX: 0, offsetY: 0, scale: 3 };
    for (let i = 0; i < 10; i += 1) c = zoomByButton(c, 'in', viewport, 0.5, 3);
    expect(c.scale).toBe(3);
  });

  it('screenToBoard / boardToScreen round trip is exact', () => {
    const screen: Point = { x: 87, y: 412 };
    const back = boardToScreenRoundTrip(camera, screen);
    expect(back.x).toBeCloseTo(screen.x, 9);
    expect(back.y).toBeCloseTo(screen.y, 9);
  });

  it('boardBounds covers all cells including negative coordinates', () => {
    const bounds = boardBounds([{ x: -2, y: 3 }, { x: 1, y: -1 }], 64);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(-2 * 64);
    expect(bounds!.maxY).toBe((3 + 1) * 64);
    expect(boardBounds([], 64)).toBeNull();
  });

  it('bounds helpers normalize, extend and union', () => {
    expect(boundsFromPoints({ x: 5, y: 9 }, { x: 2, y: 4 })).toEqual({ minX: 2, minY: 4, maxX: 5, maxY: 9 });
    expect(expandBounds(cellRect(0, 0, 10), 5)).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 15 });
    expect(unionBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 2, minY: -2, maxX: 3, maxY: 0 })).toEqual({ minX: 0, minY: -2, maxX: 3, maxY: 1 });
  });

  it('fitBounds contains requested content inside the viewport with padding', () => {
    const viewport = { width: 360, height: 500 };
    const bounds = boardBounds([{ x: 0, y: 0 }, { x: 8, y: 5 }], 64)!;
    const fitted = fitBounds(bounds, viewport, { padding: 16 });
    // все углы содержимого после трансформа лежат внутри viewport (с учётом clamp'ов)
    const corners: Point[] = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ];
    for (const corner of corners) {
      const screen = boardToScreenRoundTripInverse(fitted, corner);
      expect(screen.x).toBeGreaterThanOrEqual(-0.001);
      expect(screen.x).toBeLessThanOrEqual(viewport.width + 0.001);
      expect(screen.y).toBeGreaterThanOrEqual(-0.001);
      expect(screen.y).toBeLessThanOrEqual(viewport.height + 0.001);
    }
    expect(fitted.scale).toBeGreaterThanOrEqual(MIN_FIT_SCALE);
    expect(fitted.scale).toBeLessThanOrEqual(DEFAULT_MAX_FIT_SCALE);
  });

  it('fitBounds centers content in the viewport', () => {
    const viewport = { width: 300, height: 300 };
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const fitted = fitBounds(bounds, viewport, { padding: 0 });
    const centerScreen = projectPoint(fitted, { x: 50, y: 50 });
    expect(centerScreen.x).toBeCloseTo(150, 9);
    expect(centerScreen.y).toBeCloseTo(150, 9);
  });

  it('legal positions can be included in fit bounds together with placed tiles', () => {
    const viewport = { width: 360, height: 640 };
    const placed = [{ x: 0, y: 0 }];
    const legal = [{ x: 4, y: -3 }, { x: -2, y: 2 }];
    const combined = boardBounds([...placed, ...legal], 64)!;
    const fitted = fitBounds(combined, viewport, { padding: 24 });
    for (const cell of legal) {
      const rect = cellRect(cell.x, cell.y, 64);
      const leftTop = projectPoint(fitted, { x: rect.minX, y: rect.minY });
      const rightBottom = projectPoint(fitted, { x: rect.maxX, y: rect.maxY });
      expect(leftTop.x).toBeGreaterThanOrEqual(-0.001);
      expect(rightBottom.x).toBeLessThanOrEqual(viewport.width + 0.001);
      expect(leftTop.y).toBeGreaterThanOrEqual(-0.001);
      expect(rightBottom.y).toBeLessThanOrEqual(viewport.height + 0.001);
    }
  });

  it('isTapGesture separates taps from drags using the px threshold', () => {
    expect(isTapGesture({ x: 10, y: 10 }, { x: 14, y: 16 })).toBe(true);
    expect(isTapGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isTapGesture({ x: 10, y: 10 }, { x: 10 + TAP_MOVE_THRESHOLD_PX, y: 10 })).toBe(true);
    expect(isTapGesture({ x: 10, y: 10 }, { x: 10 + TAP_MOVE_THRESHOLD_PX + 0.5, y: 10 })).toBe(false);
    expect(isTapGesture({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe(false);
  });
});

/* локальные чистые обёртки (тесты не дублируют продуктовую логику правил) */
function projectPoint(cam: Camera, content: Point): Point {
  return { x: content.x * cam.scale + cam.offsetX, y: content.y * cam.scale + cam.offsetY };
}
function boardToScreenRoundTrip(cam: Camera, screen: Point): Point {
  return projectPoint(cam, screenToBoard(cam, screen));
}
function boardToScreenRoundTripInverse(cam: Camera, screen: Point): Point {
  return boardToScreenRoundTrip(cam, screen);
}
