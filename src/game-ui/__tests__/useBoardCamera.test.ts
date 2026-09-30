import { describe, expect, it } from 'vitest';

import { screenToBoard, zoomAroundPoint } from '../board/boardTransform';
import { CameraGestureSession, clientPointToLocal } from '../game/useBoardCamera';

describe('Stage 4A camera pointer gesture session', () => {
  it('converts the client midpoint to element-local coordinates', () => {
    expect(clientPointToLocal({ x: 220, y: 170 }, { left: 100, top: 50 })).toEqual({
      x: 120,
      y: 120,
    });
  });

  it('pinch zoom preserves the board point under the local focal point', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 180, y: 170 });
    gesture.pointerDown(2, { x: 260, y: 170 });
    const beforePinch = gesture.twoPointerState({ left: 100, top: 50 })!;
    expect(beforePinch.focus).toEqual({ x: 120, y: 120 });

    gesture.pointerMove(1, { x: 160, y: 170 });
    gesture.pointerMove(2, { x: 280, y: 170 });
    const afterPinch = gesture.twoPointerState({ left: 100, top: 50 })!;
    const camera = { offsetX: 20, offsetY: -10, scale: 1 };
    const focalBoardPoint = screenToBoard(camera, afterPinch.focus);
    const zoomed = zoomAroundPoint(
      camera,
      afterPinch.distance / beforePinch.distance,
      afterPinch.focus,
      0.3,
      2.5,
    );

    expect(screenToBoard(zoomed, afterPinch.focus).x).toBeCloseTo(focalBoardPoint.x, 9);
    expect(screenToBoard(zoomed, afterPinch.focus).y).toBeCloseTo(focalBoardPoint.y, 9);
  });

  it('classifies pointercancel as not a tap', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 20, y: 30 });
    expect(gesture.pointerEnd(1, { x: 20, y: 30 }, true)).toBe(false);
  });

  it('classifies an unmoved single pointerup as a tap', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 20, y: 30 });
    expect(gesture.pointerEnd(1, { x: 20, y: 30 }, false)).toBe(true);
  });

  it('classifies a single-pointer drag beyond the threshold as not a tap', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 20, y: 30 });
    gesture.pointerMove(1, { x: 31, y: 30 });
    expect(gesture.pointerEnd(1, { x: 31, y: 30 }, false)).toBe(false);
  });

  it('never turns pinch then sequential lifts into a tap', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 20, y: 30 });
    gesture.pointerDown(2, { x: 40, y: 30 });
    expect(gesture.pointerEnd(2, { x: 40, y: 30 }, false)).toBeNull();
    expect(gesture.pointerEnd(1, { x: 20, y: 30 }, false)).toBe(false);
  });

  it('resets after pinch so a new single-pointer gesture can tap', () => {
    const gesture = new CameraGestureSession();
    gesture.pointerDown(1, { x: 20, y: 30 });
    gesture.pointerDown(2, { x: 40, y: 30 });
    gesture.pointerEnd(2, { x: 40, y: 30 }, false);
    expect(gesture.pointerEnd(1, { x: 20, y: 30 }, false)).toBe(false);

    gesture.pointerDown(3, { x: 50, y: 60 });
    expect(gesture.pointerEnd(3, { x: 50, y: 60 }, false)).toBe(true);
  });
});
