/**
 * Минимальная чистая модель ЛОКАЛЬНЫХ feature плитки (Stage 2).
 *
 * Определяет, какие позиции на плитке допустимы для размещения meeple:
 *  - каждая отдельная дорога (сегмент) плитки;
 *  - каждый отдельный город (сегмент) плитки;
 *  - монастырь в центре (если есть).
 *
 * Сегменты берутся из TileDefinition.topology: стороны с одинаковым
 * id сегмента — это ОДНА локальная feature. Для канонической стороны
 * сегмента выбирается минимальный индекс стороны (детерминированно),
 * поэтому позиция не зависит от порядка обхода.
 *
 * Глобальное объединение features (connected roads/cities) — Stage 3.
 */

import type {
  EdgeIndex,
  MeeplePlacement,
  Rotation,
  TileDefinition,
} from '../types/geometry.js';
import { EDGES } from '../types/geometry.js';
import { rotateEdge } from '../engine/geometry.js';
import type { GameState } from '../types/state.js';
import { isGlobalFeatureOccupied } from './globalFeatures.js';

/**
 * Множество поворотов sides-индексов: baseEdge -> [rotatedEdges...].
 */
function rotationMap(rotation: Rotation): Map<EdgeIndex, EdgeIndex[]> {
  const m = new Map<EdgeIndex, EdgeIndex[]>();
  for (const b of EDGES) {
    const list = m.get(b) ?? [];
    list.push(rotateEdge(b, rotation));
    m.set(b, list);
  }
  return m;
}

/** Все допустимые локальные позиции meeple на повёрнутой плитке. */
export function getLocalFeaturePlacements(
  definition: TileDefinition,
  rotation: Rotation,
): MeeplePlacement[] {
  const map = rotationMap(rotation);
  const result: MeeplePlacement[] = [];

  const collect = (
    segs: readonly (string | null)[],
    featureType: 'road' | 'city',
  ) => {
    // canonical base side per segment = min index (deterministic)
    const canonical = new Map<string, number>();
    segs.forEach((seg, i) => {
      if (seg === null) return;
      const prev = canonical.get(seg);
      if (prev === undefined || i < prev) canonical.set(seg, i);
    });
    for (const base of canonical.values()) {
      const edges = map.get(base as EdgeIndex) ?? [];
      for (const e of edges) {
        result.push({ featureType, edge: e });
      }
    }
  };

  collect(definition.topology.roadEdgeSegments, 'road');
  collect(definition.topology.cityEdgeSegments, 'city');

  if (definition.topology.hasMonastery) {
    result.push({ featureType: 'monastery', edge: null });
  }

  return result;
}

/**
 * Множество СТОРОН каждой локальной feature плитки (Stage 2 — только
 * локальная модель, без глобального объединения).
 * Возвращает запись: "road:r0" -> [N,S] и т.п., с учётом поворота.
 * Используется для проверки «нельзя второй meeple на той же feature».
 */
export function getLocalFeatureSideSets(
  definition: TileDefinition,
  rotation: Rotation,
): Record<string, EdgeIndex[]> {
  const map = rotationMap(rotation);
  const out: Record<string, EdgeIndex[]> = {};

  const fill = (segs: readonly (string | null)[], prefix: 'road' | 'city') => {
    const sidesBySeg = new Map<string, EdgeIndex[]>();
    segs.forEach((seg, i) => {
      if (seg === null) return;
      const list = sidesBySeg.get(seg) ?? [];
      for (const e of map.get(i as EdgeIndex) ?? []) list.push(e);
      sidesBySeg.set(seg, list);
    });
    for (const [seg, list] of sidesBySeg) {
      out[`${prefix}:${seg}`] = list.sort((a, b) => a - b);
    }
  };

  fill(definition.topology.roadEdgeSegments, 'road');
  fill(definition.topology.cityEdgeSegments, 'city');
  if (definition.topology.hasMonastery) {
    out['monastery:center'] = [];
  }
  return out;
}

/**
 * Проверка: является ли placement допустимой локальной feature
 * данной (повёрнутой) плитки.
 */
export function isPlacementOnValidFeature(
  definition: TileDefinition,
  rotation: Rotation,
  placement: MeeplePlacement,
): boolean {
  return getLocalFeaturePlacements(definition, rotation).some(
    (p) => p.featureType === placement.featureType && p.edge === placement.edge,
  );
}

/**
 * Authoritative meeple targets for the tile placed during the current turn.
 * The UI consumes this list and never duplicates global occupancy rules.
 */
export function getLegalMeeplePlacements(
  state: GameState,
  getDefinition: (id: string) => TileDefinition,
): MeeplePlacement[] {
  const last = state.lastPlacedTile;
  const player = state.players[state.currentPlayerIndex];
  if (state.gamePhase !== 'placeMeeple' || !last || !player) return [];
  if (!state.meeples.some((m) => m.playerId === player.id && m.position === null)) return [];

  const context = { board: state.board, meeples: state.meeples, getDefinition };
  return getLocalFeaturePlacements(getDefinition(last.definitionId), last.rotation).filter(
    (placement) => !isGlobalFeatureOccupied(context, last.position, placement),
  );
}

/**
 * Возвращает id ЛОКАЛЬНОЙ feature для placement ("road:r0", "city:c1",
 * "monastery:center") либо null, если placement не принадлежит плитке.
 */
export function localFeatureIdForPlacement(
  definition: TileDefinition,
  rotation: Rotation,
  placement: MeeplePlacement,
): string | null {
  const sets = getLocalFeatureSideSets(definition, rotation);
  for (const [id, edges] of Object.entries(sets)) {
    const type = id.split(':')[0];
    if (placement.featureType !== type) continue;
    if (type === 'monastery') return id; // edge null
    if (edges.includes(placement.edge as EdgeIndex)) return id;
  }
  return null;
}
