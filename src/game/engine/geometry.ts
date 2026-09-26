/**
 * Чистые, детерминированные функции геометрии плитки.
 * Никаких зависимостей от React / Supabase / DOM.
 */

import type {
  EdgeIndex,
  EdgeType,
  Rotation,
  TileDefinition,
  TilePosition,
} from '../types/geometry';
import { EDGES } from '../types/geometry';

/** Противоположная сторона (N<->S, E<->W). */
export function oppositeEdge(edge: EdgeIndex): EdgeIndex {
  return ((edge + 2) % 4) as EdgeIndex;
}

/** Смещение координат для направления: N=(0,-1), E=(1,0), S=(0,1), W=(-1,0). */
export function edgeOffset(edge: EdgeIndex): TilePosition {
  switch (edge) {
    case 0:
      return { x: 0, y: -1 };
    case 1:
      return { x: 1, y: 0 };
    case 2:
      return { x: 0, y: 1 };
    case 3:
      return { x: -1, y: 0 };
  }
}

/** Нормализация произвольного угла в валидный Rotation (по часовой, mod 360). */
export function normalizeRotation(deg: number): Rotation {
  const r = ((deg % 360) + 360) % 360;
  if (r !== 0 && r !== 90 && r !== 180 && r !== 270) {
    throw new Error(`Rotation must be a multiple of 90 degrees, got ${deg}`);
  }
  return r as Rotation;
}

/**
 * Поворот индекса стороны на rotation градусов по часовой стрелке.
 * Пример: сторона N(0) при повороте на 90° становится E(1).
 */
export function rotateEdge(edge: EdgeIndex, rotation: Rotation): EdgeIndex {
  const steps = rotation / 90;
  return ((edge + steps) % 4) as EdgeIndex;
}

/**
 * Типы сторон повёрнутой плитки в базовой ориентации [N,E,S,W].
 * sidesRotated[i] = baseSides[(i - steps + 4) % 4],
 * т.к. содержимое стороны, повернутой на +steps, приходит из стороны i-steps.
 */
export function rotatedSides(
  definition: TileDefinition,
  rotation: Rotation,
): readonly EdgeType[] {
  const steps = rotation / 90;
  return EDGES.map((i) => definition.sides[((i - steps) % 4 + 4) % 4]);
}

/**
 * Возвращает новый TileDefinition, повёрнутый на rotation градусов
 * по часовой стрелке (топология тоже перемещается).
 * Полезен для тестов и для нормализации шаблонов.
 */
export function rotateTile(
  definition: TileDefinition,
  rotation: Rotation,
): TileDefinition {
  const steps = rotation / 90;
  const mapSegments = (
    segs: readonly (string | null)[],
  ): (string | null)[] => EDGES.map((i) => segs[((i - steps) % 4 + 4) % 4]);

  return {
    ...definition,
    id: `${definition.id}@${rotation}`,
    sides: rotatedSides(definition, rotation),
    topology: {
      ...definition.topology,
      roadEdgeSegments: mapSegments(definition.topology.roadEdgeSegments),
      cityEdgeSegments: mapSegments(definition.topology.cityEdgeSegments),
    },
  };
}

/**
 * Фактические типы сторон размещённой/повёрнутой плитки,
 * порядок [N, E, S, W].
 */
export function getTileEdges(
  definition: TileDefinition,
  rotation: Rotation,
): readonly EdgeType[] {
  return rotatedSides(definition, rotation);
}

/**
 * Совместимость стыка двух соседних плиток (Carcassonne 2019):
 * элементы ландшафта на встречающихся сторонах должны совпадать
 * (road-road, city-city, иначе — mismatch).
 *
 * @param edgesA стороны первой плитки [N,E,S,W]
 * @param edgeA  сторона первой плитки, обращённая к соседу
 * @param edgesB стороны второй плитки [N,E,S,W]
 * @param edgeB  сторона второй плитки, обращённая к первой
 */
export function areEdgesCompatible(
  edgesA: readonly EdgeType[],
  edgeA: EdgeIndex,
  edgesB: readonly EdgeType[],
  edgeB: EdgeIndex,
): boolean {
  return edgesA[edgeA] === edgesB[edgeB];
}

/** 4 ортогональных соседа (без диагоналей). */
export function getAdjacentPositions(position: TilePosition): TilePosition[] {
  return EDGES.map((e) => {
    const off = edgeOffset(e);
    return { x: position.x + off.x, y: position.y + off.y };
  });
}

/** 8 соседей (ортогональные + диагонали) — нужно для монастырей позже. */
export function getAllNeighborhoodPositions(
  position: TilePosition,
): TilePosition[] {
  const result: TilePosition[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      result.push({ x: position.x + dx, y: position.y + dy });
    }
  }
  return result;
}
