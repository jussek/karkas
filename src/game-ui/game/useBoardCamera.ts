/**
 * Stage 4A — карта доски как на телефоне: pan одним пальцем/мышью,
 * pinch-зум вокруг focal point, кнопки +/−, fit/recenter, «Показать ходы».
 *
 * Камера живёт ОТДЕЛЬНО от игровых координат: legality считает engine,
 * transform только рисует. Interactive descendants (buttons/inputs/etc.)
 * own their pointer gesture; camera never captures those pointers.
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
const INTERACTIVE_SELECTOR = 'button,input,select,textarea,a,[role="button"]';

export interface ActivePointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

export interface ElementRectOrigin {
  left: number;
  top: number;
}

export function clientPointToLocal(point: Point, rect: ElementRectOrigin): Point {
  return { x: point.x - rect.left, y: point.y - rect.top };
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  const maybeElement = target as { closest?: (selector: string) => unknown } | null;
  return typeof maybeElement?.closest === 'function'
    && Boolean(maybeElement.closest(INTERACTIVE_SELECTOR));
}

/** Mutable state for one pointer gesture, kept outside React for deterministic tests. */
export class CameraGestureSession {
  readonly pointers = new Map<number, ActivePointer>();
  private startedAsSingle = false;
  private hadMultiPointer = false;
  private cancelled = false;
  private moved = false;

  pointerDown(pointerId: number, point: Point): void {
    if (this.pointers.size === 0) {
      this.startedAsSingle = true;
      this.hadMultiPointer = false;
      this.cancelled = false;
      this.moved = false;
    }
    this.pointers.set(pointerId, { x: point.x, y: point.y, startX: point.x, startY: point.y });
    if (this.pointers.size > 1) this.hadMultiPointer = true;
  }

  pointerMove(pointerId: number, point: Point): void {
    const active = this.pointers.get(pointerId);
    if (!active) return;
    active.x = point.x;
    active.y = point.y;
    if (!isTapGesture({ x: active.startX, y: active.startY }, point)) this.moved = true;
  }

  twoPointerState(rect: ElementRectOrigin) {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      focus: clientPointToLocal(midpoint, rect),
    };
  }

  pointerEnd(pointerId: number, point: Point, wasCancelled: boolean): boolean | null {
    this.pointerMove(pointerId, point);
    const active = this.pointers.get(pointerId);
    if (wasCancelled) this.cancelled = true;
    this.pointers.delete(pointerId);
    if (this.pointers.size > 0) return null;
    return Boolean(
      active
      && this.startedAsSingle
      && !this.hadMultiPointer
      && !this.cancelled
      && !this.moved
      && !wasCancelled,
    );
  }
}

export interface UseBoardCameraOptions {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentWidth: number;
  contentHeight: number;
  getFitCells: () => readonly Point[];
  cellSize: number;
  originOffset: Point;
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
  const gesture = useRef(new CameraGestureSession());
  const lastPan = useRef<Point>({ x: 0, y: 0 });
  const lastPinchDistance = useRef<number | null>(null);
  const panningRef = useRef(false);
  const lastTapRef = useRef(true);

  const readViewport = useCallback(() => viewportOf(viewportRef), [viewportRef]);

  const fitContent = useCallback(() => {
    const cells = getFitCells();
    const viewport = readViewport();
    if (cells.length === 0) {
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
      const left = (cell.x + originOffset.x) * cellSize;
      const top = (cell.y + originOffset.y) * cellSize;
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

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current.pointerDown(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.current.pointers.size === 1) {
      lastPan.current = { x: event.clientX, y: event.clientY };
      panningRef.current = false;
    } else if (gesture.current.pointers.size === 2) {
      const state = gesture.current.twoPointerState(event.currentTarget.getBoundingClientRect());
      lastPinchDistance.current = state?.distance ?? null;
      panningRef.current = true;
    }
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current.pointers.get(event.pointerId);
    if (!active) return;
    gesture.current.pointerMove(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture.current.pointers.size >= 2) {
      const state = gesture.current.twoPointerState(event.currentTarget.getBoundingClientRect());
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
    const totalMove = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (totalMove > TAP_MOVE_THRESHOLD_PX) panningRef.current = true;
    if (panningRef.current && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
      lastPan.current = { x: event.clientX, y: event.clientY };
      setCamera((current) => panCamera(current, { x: dx, y: dy }));
    }
  }, []);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!gesture.current.pointers.has(event.pointerId)) return;
    const tap = gesture.current.pointerEnd(
      event.pointerId,
      { x: event.clientX, y: event.clientY },
      cancelled,
    );
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (gesture.current.pointers.size < 2) lastPinchDistance.current = null;
    if (gesture.current.pointers.size === 0) {
      lastTapRef.current = tap ?? false;
      panningRef.current = false;
    } else if (gesture.current.pointers.size === 1) {
      const remaining = [...gesture.current.pointers.values()][0];
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
      onPointerUp: (event) => finishPointer(event, false),
      onPointerCancel: (event) => finishPointer(event, true),
    },
    gestureActive: gesture.current.pointers.size > 0,
    didPan: panningRef.current,
    wasTapAtEnd: () => lastTapRef.current,
    toContentPoint,
    zoomIn,
    zoomOut,
    fitContent,
  };
}

export { boardToScreen, clampScale };
