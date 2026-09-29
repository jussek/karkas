/**
 * Stage 4A — карта доски как на телефоне: pan одним пальцем/мышью,
 * pinch-зум вокруг focal point, кнопки +/−, fit/recenter, «Показать ходы».
 *
 * Камера живёт ОТДЕЛЬНО от игровых координат: legality считает engine,
 * transform только рисует. pointer-down НИКОГДА не ставит плитку —
 * размещение происходит по tap (движение ниже порога) над кнопкой клетки.
 */

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  boardToScreen,
  clampScale,
  fitBounds,
  isTapGesture,
  panCamera,
  screenToBoard,
  TAP_MOVE_THRESHOLD_PX,
  zoomAroundPoint,
  zoomByButton,
} from '../board/boardTransform';
import type { Camera, Point, ViewportSize } from '../board/boardTransform';

export const MIN_CAMERA_SCALE = 0.3;
export const MAX_CAMERA_SCALE = 2.5;

interface ActivePointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

export interface UseBoardCameraOptions {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentWidth: number;
  contentHeight: number;
  /** Клетки в game-координатах, которые нужно уместить («Показать ходы» / fit). */
  getFitCells: () => readonly Point[];
  cellSize: number;
  originOffset: number;
}

export interface BoardCameraHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface BoardCamera {
  camera: Camera;
  handlers: BoardCameraHandlers;
  gestureActive: boolean;
  didPan: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  fitContent: () => void;
  /** true, если последний tap был распознан (для проверки, что tile не ставится при drag). */
  wasTapAtEnd: () => boolean;
  toContentPoint: (screen: Point) => Point;
}

function viewportOf(ref: RefObject<HTMLDivElement | null>): ViewportSize {
  const element = ref.current;
  if (!element) return { width: 360, height: 520 };
  return { width: element.clientWidth, height: element.clientHeight };
}

export function useBoardCamera(options: UseBoardCameraOptions): BoardCamera {
  const { viewportRef, contentWidth, contentHeight, getFitCells, cellSize, originOffset } = options;
  const [camera, setCamera] = useState<Camera>({ offsetX: 0, offsetY: 0, scale: 1 });
  const pointers = useRef(new Map<number, ActivePointer>());
  const lastPan = useRef<Point>({ x: 0, y: 0 });
  const lastPinchDistance = useRef<number | null>(null);
  const movedRef = useRef(false);
  const panningRef = useRef(false);
  const lastTapRef = useRef(true);

  const readViewport = useCallback(() => viewportOf(viewportRef), [viewportRef]);

  const fitContent = useCallback(() => {
    const cells = getFitCells();
    const viewport = readViewport();
    if (cells.length === 0) {
      // Пустая доска: центрируем область старта без привязки к card id.
      setCamera(fitBounds(
        { minX: 0, minY: 0, maxX: contentWidth, maxY: contentHeight },
        viewport,
        { padding: 12, minScale: MIN_CAMERA_SCALE, maxScale: 1 },
      ));
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      const left = (cell.x + originOffset) * cellSize;
      const top = (cell.y + originOffset) * cellSize;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + cellSize);
      maxY = Math.max(maxY, top + cellSize);
    }
    setCamera(fitBounds(
      { minX, minY, maxX, maxY },
      viewport,
      { padding: 16, minScale: MIN_CAMERA_SCALE, maxScale: MAX_CAMERA_SCALE },
    ));
  }, [contentHeight, contentWidth, cellSize, getFitCells, originOffset, readViewport]);

  const twoFingerState = useCallback(() => {
    const list = [...pointers.current.values()];
    if (list.length < 2) return null;
    const [a, b] = list;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const focus: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { distance, focus, mid: focus };
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
    });
    if (pointers.current.size === 1) {
      lastPan.current = { x: event.clientX, y: event.clientY };
      movedRef.current = false;
      panningRef.current = false;
    } else if (pointers.current.size === 2) {
      const state = twoFingerState();
      lastPinchDistance.current = state?.distance ?? null;
      movedRef.current = true;
      panningRef.current = true;
    }
  }, [twoFingerState]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointers.current.get(event.pointerId);
    if (!active) return;
    active.x = event.clientX;
    active.y = event.clientY;

    if (pointers.current.size >= 2) {
      const state = twoFingerState();
      if (!state || lastPinchDistance.current === null || state.distance === 0) return;
      const factor = state.distance / lastPinchDistance.current;
      lastPinchDistance.current = state.distance;
      setCamera((current) => zoomAroundPoint(
        current, factor, state.focus, MIN_CAMERA_SCALE, MAX_CAMERA_SCALE,
      ));
      return;
    }

    const dx = event.clientX - lastPan.current.x;
    const dy = event.clientY - lastPan.current.y;
    const totalMove = Math.hypot(
      event.clientX - active.startX,
      event.clientY - active.startY,
    );
    if (totalMove > TAP_MOVE_THRESHOLD_PX) {
      movedRef.current = true;
      panningRef.current = true;
    }
    if (panningRef.current && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
      lastPan.current = { x: event.clientX, y: event.clientY };
      setCamera((current) => panCamera(current, { x: dx, y: dy }));
    }
  }, [twoFingerState]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) lastPinchDistance.current = null;
    if (pointers.current.size === 0) {
      const end = active ?? { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      lastTapRef.current = isTapGesture({ x: end.startX, y: end.startY }, { x: end.x, y: end.y });
      panningRef.current = false;
    } else if (pointers.current.size === 1) {
      const remaining = [...pointers.current.values()][0];
      lastPan.current = { x: remaining.x, y: remaining.y };
    }
  }, []);

  const zoomIn = useCallback(() => {
    setCamera((current) => zoomByButton(current, 'in', readViewport(), MIN_CAMERA_SCALE, MAX_CAMERA_SCALE));
  }, [readViewport]);

  const zoomOut = useCallback(() => {
    setCamera((current) => zoomByButton(current, 'out', readViewport(), MIN_CAMERA_SCALE, MAX_CAMERA_SCALE));
  }, [readViewport]);

  const toContentPoint = useCallback((screen: Point) => screenToBoard(camera, screen), [camera]);

  return {
    camera,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
    },
    gestureActive: pointers.current.size > 0,
    didPan: panningRef.current,
    wasTapAtEnd: () => lastTapRef.current,
    toContentPoint,
    zoomIn,
    zoomOut,
    fitContent,
  };
}

export { boardToScreen, clampScale };
