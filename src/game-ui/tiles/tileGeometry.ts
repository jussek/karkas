/**
 * Stage 3E — Pure tile geometry helpers for the rule-driven SVG renderer.
 *
 * All math lives here (outside React). Coordinates are in the logical
 * tile space defined by viewBox "0 0 100 100":
 *
 *   center      = (50, 50)
 *   N anchor    = (50,  0)
 *   E anchor    = (100, 50)
 *   S anchor    = (50, 100)
 *   W anchor    = (  0, 50)
 *
 * Edge index contract (identical to src/game/types/geometry.ts):
 *   0 = NORTH, 1 = EAST, 2 = SOUTH, 3 = WEST
 *
 * This module is presentation-only: it never mutates game data and never
 * encodes card-ID-specific geometry.
 */

import type { EdgeIndex } from '../../game/types/geometry';

export interface Point {
  x: number;
  y: number;
}

/** Logical tile size (viewBox units). */
export const TILE_SIZE = 100;
/** Logical tile center. */
export const CENTER: Point = { x: 50, y: 50 };

/**
 * Authoritative edge anchor points on the tile border, indexed by
 * EdgeIndex (0=N, 1=E, 2=S, 3=W).
 */
export const EDGE_ANCHORS: readonly Point[] = [
  { x: 50, y: 0 }, // NORTH
  { x: 100, y: 50 }, // EAST
  { x: 50, y: 100 }, // SOUTH
  { x: 0, y: 50 }, // WEST
];

/** Unit inward direction per edge (points from the border toward the interior). */
export const EDGE_INWARD: readonly Point[] = [
  { x: 0, y: 1 }, // NORTH -> down
  { x: -1, y: 0 }, // EAST -> left
  { x: 0, y: -1 }, // SOUTH -> up
  { x: 1, y: 0 }, // WEST -> right
];

/** Anchor point for an edge (fresh copy so callers cannot mutate state). */
export function edgeAnchor(edge: EdgeIndex): Point {
  return { ...EDGE_ANCHORS[edge] };
}

/** A point `depth` logical units inward from the edge anchor. */
export function edgeInwardPoint(edge: EdgeIndex, depth: number): Point {
  const a = EDGE_ANCHORS[edge];
  const d = EDGE_INWARD[edge];
  return { x: a.x + d.x * depth, y: a.y + d.y * depth };
}

/* ------------------------------------------------------------------ */
/* Small vector utilities                                              */
/* ------------------------------------------------------------------ */

const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });

const dist = (a: Point, b: Point): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

const round1 = (n: number): number => Math.round(n * 10) / 10;

const fmt = (p: Point): string => `${round1(p.x)},${round1(p.y)}`;

/* ------------------------------------------------------------------ */
/* Organic wobble (deterministic, seed-derived — no random number generator) */
/* ------------------------------------------------------------------ */

/** FNV-1a style string hash → 32-bit unsigned int. Deterministic. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic float in [0,1) from a seed string + integer index. */
export function seededFloat(seed: string, index: number): number {
  const h = hashString(`${seed}#${index}`);
  return (h & 0xffffff) / 0x1000000;
}

/** Signed organic offset in [-maxAbs, maxAbs], deterministic per seed/index. */
function wobble(seed: string, index: number, maxAbs: number): Point {
  const angle = seededFloat(seed, index * 2) * Math.PI * 2;
  const radius = seededFloat(seed, index * 2 + 1) * maxAbs;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/* ------------------------------------------------------------------ */
/* Road geometry                                                       */
/* ------------------------------------------------------------------ */

/** Approximate road width in logical units (spec: ~13–17). */
export const ROAD_WIDTH = 15;

/** Semantic geometry: endpoints + SVG path, kept separate from serialization. */
export interface SemanticGeometry {
  /** Exact semantic endpoints (edge anchors and/or internal terminals). */
  endpoints: Point[];
  /** Serialized SVG path `d` string for rendering. */
  path: string;
}

/** Depth of the control region used when a road bends between edges. */
const BEND_CONTROL_DEPTH = 34;

/**
 * Internal endpoint for a dead-end (single-edge) road group.
 * `slot` separates multiple distinct single-edge road features so they
 * never share an internal endpoint or look connected.
 */
export function roadDeadEndEndpoint(
  edge: EdgeIndex,
  slot: number,
  seed: string,
): Point {
  const base = edgeInwardPoint(edge, 46);
  const inward = EDGE_INWARD[edge];
  // perpendicular unit vector
  const p = { x: -inward.y, y: inward.x };
  const off = (seededFloat(seed, 200 + slot) - 0.5) * 18;
  const along = (seededFloat(seed, 300 + slot) - 0.5) * 8;
  return add(base, add(scale(p, off), scale(inward, along)));
}

/** Junction point for a multi-edge road that passes through the center. */
function junctionPoint(edges: readonly EdgeIndex[], seed: string): Point {
  if (edges.length === 2 && (edges[0] + 2) % 4 === edges[1]) {
    // straight opposite pair: exactly the center
    return { ...CENTER };
  }
  // adjacent pair or 3/4-edge junction: slight organic drift around center
  return add(CENTER, wobble(seed, 900 + edges.length, 2));
}

/**
 * Semantic geometry for one road feature: the exact endpoints plus the
 * serialized SVG path. Endpoints are NEVER moved by the organic wobble —
 * only intermediate control points are, so semantic connectivity stays
 * exact while lines look hand-drawn.
 */
export function roadGeometry(
  edges: readonly EdgeIndex[],
  seed: string,
  slot: number,
): SemanticGeometry {
  if (edges.length === 0) return { endpoints: [], path: '' };
  if (edges.length === 1) {
    const a = edgeAnchor(edges[0]);
    const e = roadDeadEndEndpoint(edges[0], slot, seed);
    const c1 = edgeInwardPoint(edges[0], 16);
    const c2 = add(e, scale(EDGE_INWARD[edges[0]], -10));
    return { endpoints: [a, e], path: `M ${fmt(a)} C ${fmt(c1)} ${fmt(c2)} ${fmt(e)}` };
  }
  if (edges.length === 2) {
    const [e0, e1] = edges;
    const a = edgeAnchor(e0);
    const b = edgeAnchor(e1);
    if ((e0 + 2) % 4 === e1) {
      // straight (slightly organic) line across the tile
      const m = add(mid(a, b), wobble(seed, slot * 7 + 1, 2));
      return { endpoints: [a, b], path: `M ${fmt(a)} Q ${fmt(m)} ${fmt(b)}` };
    }
    // bend through the quadrant between the two edges: the quadratic
    // control point sits at the CORNER of the bounding box spanned by
    // the two anchors, pulled inward so the curve hugs that quadrant.
    const c = {
      x: 50 + ((a.x - 50) / 50) * BEND_CONTROL_DEPTH + ((b.x - 50) / 50) * BEND_CONTROL_DEPTH,
      y: 50 + ((a.y - 50) / 50) * BEND_CONTROL_DEPTH + ((b.y - 50) / 50) * BEND_CONTROL_DEPTH,
    };
    const cw = add(c, wobble(seed, slot * 7 + 2, 3));
    return { endpoints: [a, b], path: `M ${fmt(a)} Q ${fmt(cw)} ${fmt(b)}` };
  }
  // 3- or 4-edge junction: every listed edge reaches the same junction
  const j = junctionPoint(edges, seed);
  const parts: string[] = [];
  edges.forEach((e, i) => {
    const a = edgeAnchor(e);
    const c = add(scale(a, 0.4), scale(j, 0.6));
    const cw = add(c, wobble(seed, slot * 11 + i + 3, 2));
    parts.push(`M ${fmt(a)} Q ${fmt(cw)} ${fmt(j)}`);
  });
  return { endpoints: [...edges.map(edgeAnchor), j], path: parts.join(' ') };
}

/**
 * Build the SVG path `d` string for one road feature.
 * The path always starts at the first listed edge's anchor and ends at
 * the last listed edge's anchor (single-edge roads end at an internal
 * dead-end point).
 */
export function buildRoadPath(
  edges: readonly EdgeIndex[],
  seed: string,
  slot: number,
): string {
  return roadGeometry(edges, seed, slot).path;
}

/* ------------------------------------------------------------------ */
/* River geometry                                                      */
/* ------------------------------------------------------------------ */

/** Width of the river water band (wider than roads to stay distinguishable). */
export const RIVER_WIDTH = 19;

/** Internal endpoint for a river source/end with a single edge. */
export function riverTerminalPoint(edge: EdgeIndex, seed: string): Point {
  return add(edgeInwardPoint(edge, 50), wobble(seed, 1200, 3));
}

/**
 * Semantic geometry for one river feature: exact endpoints (declared edge
 * anchors, plus the internal source/lake terminal for single-edge rivers)
 * and the serialized SVG path. Declared edge anchors are hit exactly;
 * only control points wobble.
 */
export function riverGeometry(
  edges: readonly EdgeIndex[],
  seed: string,
): SemanticGeometry {
  if (edges.length === 0) return { endpoints: [], path: '' };
  if (edges.length === 1) {
    const a = edgeAnchor(edges[0]);
    const e = riverTerminalPoint(edges[0], seed);
    const c1 = edgeInwardPoint(edges[0], 18);
    const c2 = add(e, scale(EDGE_INWARD[edges[0]], -12));
    return { endpoints: [a, e], path: `M ${fmt(a)} C ${fmt(c1)} ${fmt(c2)} ${fmt(e)}` };
  }
  if (edges.length === 2) {
    const [e0, e1] = edges;
    const a = edgeAnchor(e0);
    const b = edgeAnchor(e1);
    if ((e0 + 2) % 4 === e1) {
      const m1 = add(edgeInwardPoint(e0, 25), wobble(seed, 40, 3));
      const m2 = add(edgeInwardPoint(e1, 25), wobble(seed, 41, 3));
      return { endpoints: [a, b], path: `M ${fmt(a)} C ${fmt(m1)} ${fmt(m2)} ${fmt(b)}` };
    }
    const corner = add(
      edgeInwardPoint(e0, BEND_CONTROL_DEPTH + 4),
      edgeInwardPoint(e1, BEND_CONTROL_DEPTH + 4),
    );
    const cw = add(corner, wobble(seed, 42, 4));
    return { endpoints: [a, b], path: `M ${fmt(a)} Q ${fmt(cw)} ${fmt(b)}` };
  }
  // three-way river: all declared edges meet at one confluence
  const j = add(CENTER, wobble(seed, 43, 2));
  const parts: string[] = [];
  edges.forEach((e, i) => {
    const a = edgeAnchor(e);
    const c = add(scale(a, 0.35), scale(j, 0.65));
    const cw = add(c, wobble(seed, 50 + i, 3));
    parts.push(`M ${fmt(a)} Q ${fmt(cw)} ${fmt(j)}`);
  });
  return { endpoints: [...edges.map(edgeAnchor), j], path: parts.join(' ') };
}

/**
 * SVG path for one river feature. Same endpoint guarantees as roads.
 */
export function buildRiverPath(
  edges: readonly EdgeIndex[],
  seed: string,
): string {
  return riverGeometry(edges, seed).path;
}

/* ------------------------------------------------------------------ */
/* City geometry                                                       */
/* ------------------------------------------------------------------ */

/** How far the city mass extends inward from each touched edge. */
const CITY_REACH = 46;
/** Half-width of the city band along the touched edge. */
const CITY_HALF_SPAN = 26;
/** Keep the mass away from corners so it never touches non-declared edges. */
const CITY_EDGE_MARGIN = 1;

function clampCoord(v: number): number {
  return Math.min(100 - CITY_EDGE_MARGIN, Math.max(CITY_EDGE_MARGIN, v));
}

function clampPoint(p: Point): Point {
  return { x: clampCoord(p.x), y: clampCoord(p.y) };
}

/**
 * Rectangle bounding box of a city mass touching the given edges.
 * This rectangle IS the semantic connectivity shape: it spans each
 * declared edge and stops well short of every undeclared edge.
 */
export function cityBoundingBox(
  edges: readonly EdgeIndex[],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 100;
  let maxY = 100;
  for (const e of edges) {
    switch (e) {
      case 0:
        minY = 0;
        break;
      case 2:
        maxY = 100;
        break;
      case 3:
        minX = 0;
        break;
      case 1:
        maxX = 100;
        break;
    }
  }
  // Inward reach: the mass extends CITY_REACH from each declared edge.
  if (minY === 0) maxY = Math.min(maxY, CITY_REACH);
  if (maxY === 100) minY = Math.max(minY, 100 - CITY_REACH);
  if (minX === 0) maxX = Math.min(maxX, CITY_REACH);
  if (maxX === 100) minX = Math.max(minX, 100 - CITY_REACH);
  // Band width along each declared edge is limited so that undeclared
  // edges are never reached; a single-edge city spans its whole edge but
  // still stops short of the corners.
  const spanMinX = 50 - CITY_HALF_SPAN;
  const spanMaxX = 50 + CITY_HALF_SPAN;
  const spanMinY = 50 - CITY_HALF_SPAN;
  const spanMaxY = 50 + CITY_HALF_SPAN;
  const touchesTop = edges.includes(0);
  const touchesBottom = edges.includes(2);
  const touchesLeft = edges.includes(3);
  const touchesRight = edges.includes(1);
  if (touchesTop || touchesBottom) {
    if (edges.length >= 2) {
      minX = Math.max(minX, spanMinX);
      maxX = Math.min(maxX, spanMaxX);
    } else {
      minX = Math.max(minX, CITY_EDGE_MARGIN);
      maxX = Math.min(maxX, 100 - CITY_EDGE_MARGIN);
    }
  }
  if (touchesLeft || touchesRight) {
    if (edges.length >= 2) {
      minY = Math.max(minY, spanMinY);
      maxY = Math.min(maxY, spanMaxY);
    } else {
      minY = Math.max(minY, CITY_EDGE_MARGIN);
      maxY = Math.min(maxY, 100 - CITY_EDGE_MARGIN);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Polygon vertices of a city mass, traced clockwise starting at the top
 * edge. For a single-edge city this is a rectangle flush with that edge;
 * for L-shaped (adjacent pair) cities the inner corner is chamfered so
 * the mass visibly hugs both edges without covering the opposite corner.
 */
export function cityMassPoints(edges: readonly EdgeIndex[]): Point[] {
  const bb = cityBoundingBox(edges);
  const tl = clampPoint({ x: bb.minX, y: bb.minY });
  const tr = clampPoint({ x: bb.maxX, y: bb.minY });
  const br = clampPoint({ x: bb.maxX, y: bb.maxY });
  const bl = clampPoint({ x: bb.minX, y: bb.maxY });
  const set = new Set(edges);
  const touchesTop = set.has(0);
  const touchesBottom = set.has(2);
  const touchesLeft = set.has(3);
  const touchesRight = set.has(1);

  if (touchesTop && touchesRight && !touchesBottom && !touchesLeft) {
    // NE L-shape: chamfer the inner (SW-of-corner) vertex
    return [tl, tr, br, { x: bb.maxX - 26, y: bb.maxY - 26 }, bl];
  }
  if (touchesTop && touchesLeft && !touchesBottom && !touchesRight) {
    return [tl, tr, { x: bb.minX + 26, y: bb.maxY - 26 }, bl];
  }
  if (touchesBottom && touchesRight && !touchesTop && !touchesLeft) {
    return [{ x: bb.minX, y: bb.minY + 26 }, tr, br, bl];
  }
  if (touchesBottom && touchesLeft && !touchesTop && !touchesRight) {
    return [
      { x: bb.minX + 26, y: bb.minY },
      { x: bb.maxX, y: bb.minY + 26 },
      br,
      bl,
    ];
  }
  return [tl, tr, br, bl];
}

/** SVG polygon `points` attribute for a city mass. */
export function cityMassPolygonPoints(edges: readonly EdgeIndex[]): string {
  return cityMassPoints(edges).map(fmt).join(' ');
}

/** Closed SVG path (`d`) tracing the city mass outline. */
export function buildCityMassPath(edges: readonly EdgeIndex[]): string {
  const pts = cityMassPoints(edges);
  if (pts.length === 0) return '';
  return `M ${pts.map(fmt).join(' L ')} Z`;
}

/** Center of a city mass (used to place decorative buildings). */
export function cityMassCenter(edges: readonly EdgeIndex[]): Point {
  const bb = cityBoundingBox(edges);
  return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
}

/**
 * Edges whose border the city mass actually touches (mass boundary lies
 * ON the tile border for that edge). This is the semantic connectivity
 * contract used by tests: it must equal the declared feature edges.
 */
export function cityTouchedEdges(edges: readonly EdgeIndex[]): EdgeIndex[] {
  const bb = cityBoundingBox(edges);
  const touched: EdgeIndex[] = [];
  if (bb.minY <= CITY_EDGE_MARGIN) touched.push(0);
  if (bb.maxX >= 100 - CITY_EDGE_MARGIN) touched.push(1);
  if (bb.maxY >= 100 - CITY_EDGE_MARGIN) touched.push(2);
  if (bb.minX <= CITY_EDGE_MARGIN) touched.push(3);
  return touched;
}

/**
 * Semantic spine of a city mass: one segment from each declared edge
 * anchor to the mass center. Used for endpoint invariants and for
 * decoration safety checks (it is not itself rendered as a line).
 */
export function buildCitySpine(edges: readonly EdgeIndex[]): string {
  return edges
    .map((e) => `M ${fmt(edgeAnchor(e))} L ${fmt(cityMassCenter(edges))}`)
    .join(' ');
}

/** Extract all "x,y" coordinate tokens from a generated path string. */
export function parsePathPoints(d: string): Point[] {
  const out: Point[] = [];
  for (const tok of d.split(/\s+/)) {
    const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(tok);
    if (m) out.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return out;
}

/**
 * Deterministic decoration layout inside a city mass: a row of building
 * blocks. Purely decorative — connectivity comes from the mass alone.
 */
export interface CityBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: 'gable' | 'flat';
}

export function cityBuildings(
  edges: readonly EdgeIndex[],
  seed: string,
  slot: number,
): CityBuilding[] {
  const bb = cityBoundingBox(edges);
  const horizontal = edges.includes(0) || edges.includes(2);
  const buildings: CityBuilding[] = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    const jitter = seededFloat(seed, slot * 31 + i);
    if (horizontal) {
      const w = 10 + jitter * 5;
      const usable = Math.max(1, bb.maxX - bb.minX - w - 4);
      const x = bb.minX + 2 + ((i + 0.5) * usable) / count + (jitter - 0.5) * 3;
      const h = 8 + seededFloat(seed, slot * 31 + 10 + i) * 6;
      const y = (bb.minY + bb.maxY) / 2 - h / 2;
      buildings.push({ x, y, w, h, roof: i % 2 === 0 ? 'gable' : 'flat' });
    } else {
      const h = 10 + jitter * 5;
      const usable = Math.max(1, bb.maxY - bb.minY - h - 4);
      const y = bb.minY + 2 + ((i + 0.5) * usable) / count + (jitter - 0.5) * 3;
      const w = 8 + seededFloat(seed, slot * 31 + 10 + i) * 6;
      const x = (bb.minX + bb.maxX) / 2 - w / 2;
      buildings.push({ x, y, w, h, roof: i % 2 === 0 ? 'gable' : 'flat' });
    }
  }
  return buildings;
}

/* ------------------------------------------------------------------ */
/* Shared predicates                                                   */
/* ------------------------------------------------------------------ */

/** Distance from point to segment, used by decoration safety checks. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * abx, y: a.y + t * aby });
}

/** Midpoint helper exposed for path sampling by decorations. */
export function midpoint(a: Point, b: Point): Point {
  return mid(a, b);
}

/** Distance helper exposed for tests/decorations. */
export function distance(a: Point, b: Point): number {
  return dist(a, b);
}
