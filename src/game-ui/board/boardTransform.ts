/**
 * Stage 4A — чистые помощники камеры доски.
 *
 * Камера полностью отделена от игровых координат:
 * - game coordinates (x, y клетки, rotation) никогда не зависят от пикселей;
 * - camera = { offsetX, offsetY, scale } — только визуальный трансформ;
 * - legality placements считает engine, камера её не меняет.
 *
 * Чистый TypeScript: без React / DOM / Supabase / Math.random().
 */

export interface Camera {
  /** Смещение в экранных px при scale = 1. */
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Границы содержимого                                                 */
/* ------------------------------------------------------------------ */

/** Нормализует пару точек в bounds (не требует упорядоченности). */
export function boundsFromPoints(a: Point, b: Point): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function extendBounds(bounds: Bounds, point: Point): Bounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

/**
 * Pixel-space rectangle of a board cell at grid coordinates (col,row).
 * A tile occupies [col*cellSize, (col+1)*cellSize] on both axes.
 */
export function cellRect(col: number, row: number, cellSize: number): Bounds {
  return {
    minX: col * cellSize,
    minY: row * cellSize,
    maxX: (col + 1) * cellSize,
    maxY: (row + 1) * cellSize,
  };
}

/**
 * Границы набора клеток (game positions) в content-координатах.
 * Позиции переводятся через projectPosition (без смещения origin —
 * origin задаётся вызывающим кодом как часть content-системы).
 */
export function boardBounds(
  positions: readonly Point[],
  cellSize: number,
): Bounds | null {
  if (positions.length === 0) return null;
  let bounds = cellRect(positions[0].x, positions[0].y, cellSize);
  for (let i = 1; i < positions.length; i += 1) {
    bounds = unionBounds(bounds, cellRect(positions[i].x, positions[i].y, cellSize));
  }
  return bounds;
}

/* ------------------------------------------------------------------ */
/* Fit                                                                 */
/* ------------------------------------------------------------------ */

export const MIN_FIT_SCALE = 0.05;
export const DEFAULT_MAX_FIT_SCALE = 2;

/**
 * Возвращает камеру, которая вписывает bounds в viewport с padding
 * (content-координаты, те же, что у bounds). Центрирует содержимое.
 * maxScale защищает от абсурдного зума на крошечном содержимом.
 */
export function fitBounds(
  bounds: Bounds,
  viewport: ViewportSize,
  options: { padding?: number; minScale?: number; maxScale?: number } = {},
): Camera {
  const padding = options.padding ?? 0;
  const minScale = options.minScale ?? MIN_FIT_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_FIT_SCALE;
  const innerWidth = Math.max(1, viewport.width - padding * 2);
  const innerHeight = Math.max(1, viewport.height - padding * 2);
  const rawScale = Math.min(
    innerWidth / Math.max(1e-6, bounds.maxX - bounds.minX),
    innerHeight / Math.max(1e-6, bounds.maxY - bounds.minY),
  );
  const scale = clampValue(rawScale, minScale, maxScale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: viewport.width / 2 - centerX * scale,
    offsetY: viewport.height / 2 - centerY * scale,
  };
}

/* ------------------------------------------------------------------ */
/* Масштаб                                                             */
/* ------------------------------------------------------------------ */

export function clampValue(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampScale(scale: number, minScale: number, maxScale: number): number {
  return clampValue(scale, Math.min(minScale, maxScale), Math.max(minScale, maxScale));
}

/* ------------------------------------------------------------------ */
/* Pan / zoom                                                          */
/* ------------------------------------------------------------------ */

/** Сдвиг камеры на deltaScreen px (пальце/мышь уехала на dx,dy). */
export function panCamera(camera: Camera, deltaScreen: Point): Camera {
  return {
    scale: camera.scale,
    offsetX: camera.offsetX + deltaScreen.x,
    offsetY: camera.offsetY + deltaScreen.y,
  };
}

/**
 * Zoom вокруг экранной точки focal (например центра pinch).
 * Content-точка под focal остаётся неподвижной — «как на карте».
 */
export function zoomAroundPoint(
  camera: Camera,
  factor: number,
  focal: Point,
  minScale: number,
  maxScale: number,
): Camera {
  const nextScale = clampScale(camera.scale * factor, minScale, maxScale);
  if (nextScale === camera.scale) return camera;
  return {
    scale: nextScale,
    offsetX: focal.x - ((focal.x - camera.offsetX) / camera.scale) * nextScale,
    offsetY: focal.y - ((focal.y - camera.offsetY) / camera.scale) * nextScale,
  };
}

/** Кнопки +/−: фиксированный множитель относительно центра viewport. */
export function zoomByButton(
  camera: Camera,
  direction: 'in' | 'out',
  viewport: ViewportSize,
  minScale: number,
  maxScale: number,
  factor = 1.35,
): Camera {
  const multiplier = direction === 'in' ? factor : 1 / factor;
  return zoomAroundPoint(
    camera,
    multiplier,
    { x: viewport.width / 2, y: viewport.height / 2 },
    minScale,
    maxScale,
  );
}

/* ------------------------------------------------------------------ */
/* Преобразования координат                                            */
/* ------------------------------------------------------------------ */

export function screenToBoard(camera: Camera, screen: Point): Point {
  return {
    x: (screen.x - camera.offsetX) / camera.scale,
    y: (screen.y - camera.offsetY) / camera.scale,
  };
}

export function boardToScreen(camera: Camera, content: Point): Point {
  return {
    x: content.x * camera.scale + camera.offsetX,
    y: content.y * camera.scale + camera.offsetY,
  };
}

/* ------------------------------------------------------------------ */
/* Tap vs drag                                                         */
/* ------------------------------------------------------------------ */

/** Порог движения: меньше — tap (действие над доской), больше — панорама. */
export const TAP_MOVE_THRESHOLD_PX = 10;

export function isTapGesture(
  start: Point,
  end: Point,
  thresholdPx: number = TAP_MOVE_THRESHOLD_PX,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.hypot(dx, dy) <= thresholdPx;
}
