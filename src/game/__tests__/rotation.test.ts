import { describe, expect, it } from 'vitest';
import {
  getTileEdges,
  normalizeRotation,
  oppositeEdge,
  rotateEdge,
  rotateTile,
} from '../engine/geometry';
import {
  TILE_CITY_CORNER_ROADS,
  TILE_ROAD_CURVE_NE,
  TILE_ROAD_STRAIGHT_NS,
} from '../tiles/testTiles';

describe('rotateTile / getTileEdges', () => {
  it('rotation 0 leaves edges unchanged', () => {
    expect(getTileEdges(TILE_ROAD_CURVE_NE, 0)).toEqual([
      'road',
      'road',
      'city',
      'city',
    ]);
  });

  it('rotating N-E curve by 90° clockwise gives E-S roads', () => {
    // Дороги были на N и E; после CW-90 они должны оказаться на E и S.
    expect(getTileEdges(TILE_ROAD_CURVE_NE, 90)).toEqual([
      'city',
      'road',
      'road',
      'city',
    ]);
  });

  it('rotating straight N-S road by 90° gives E-W road', () => {
    expect(getTileEdges(TILE_ROAD_STRAIGHT_NS, 90)).toEqual([
      'city',
      'road',
      'city',
      'road',
    ]);
  });

  it('full 360° rotation returns to original sides', () => {
    let def = TILE_CITY_CORNER_ROADS;
    for (let i = 0; i < 4; i++) def = rotateTile(def, 90);
    expect(def.sides).toEqual(TILE_CITY_CORNER_ROADS.sides);
  });

  it('rotateTile moves topology edge segments consistently with sides', () => {
    const rotated = rotateTile(TILE_ROAD_CURVE_NE, 90);
    // В базовой ориентации дороги r0 подходят к N(0) и E(1).
    expect(TILE_ROAD_CURVE_NE.topology.roadEdgeSegments).toEqual([
      'r0',
      'r0',
      null,
      null,
    ]);
    // После CW-90 дороги должны быть на E(1) и S(2).
    expect(rotated.topology.roadEdgeSegments).toEqual([
      null,
      'r0',
      'r0',
      null,
    ]);
    expect(rotated.sides).toEqual(['city', 'road', 'road', 'city']);
  });

  it('four successive 90° rotations restore original topology', () => {
    let def = TILE_ROAD_CURVE_NE;
    for (let i = 0; i < 4; i++) def = rotateTile(def, 90);
    expect(def.sides).toEqual(TILE_ROAD_CURVE_NE.sides);
    expect(def.topology.roadEdgeSegments).toEqual(
      TILE_ROAD_CURVE_NE.topology.roadEdgeSegments,
    );
  });

  it('rotateEdge maps N->E->S->W for 90° steps', () => {
    expect(rotateEdge(0, 90)).toBe(1);
    expect(rotateEdge(1, 90)).toBe(2);
    expect(rotateEdge(2, 90)).toBe(3);
    expect(rotateEdge(3, 90)).toBe(0);
    expect(rotateEdge(0, 180)).toBe(2);
    expect(rotateEdge(0, 270)).toBe(3);
  });

  it('normalizeRotation wraps arbitrary multiples of 90', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(() => normalizeRotation(45)).toThrow();
  });

  it('oppositeEdge pairs N/S and E/W', () => {
    expect(oppositeEdge(0)).toBe(2);
    expect(oppositeEdge(2)).toBe(0);
    expect(oppositeEdge(1)).toBe(3);
    expect(oppositeEdge(3)).toBe(1);
  });
});
