/**
 * Stage 3E — Deterministic, NON-SEMANTIC field decorations.
 *
 * Rules enforced here:
 *  - No random-number calls: every element comes from a seeded PRNG
 *    the card id (via the render model's decorationSeed).
 *  - Safety zones: decorations are rejected near edge anchors, along
 *    road/river paths, inside city masses and around the monastery.
 *  - Decorations never reach the tile border.
 * Game semantics always win over decoration.
 */

import type { EdgeIndex } from '../../game/types/geometry';
import type { RenderFeature, TileRenderModel } from './tileRenderModel';
import {
  CENTER,
  distanceToSegment,
  edgeAnchor,
  cityBoundingBox,
  parsePathPoints,
  type Point,
} from './tileGeometry';

export type DecorationKind = 'tree' | 'shrub' | 'stone' | 'tuft' | 'flower';

export interface FieldDecoration {
  kind: DecorationKind;
  x: number;
  y: number;
  /** Small deterministic rotation for variety of identical glyphs. */
  rot: number;
}

/* ------------------------------------------------------------------ */
/* Seeded PRNG (mulberry32-style, integer hash based)                  */
/* ------------------------------------------------------------------ */

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tiny deterministic PRNG. Same seed string → same sequence, always. */
export function createSeededRandom(seed: string): () => number {
  let state = hash32(seed) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Path sampling (approximate semantic centerlines)                    */
/* ------------------------------------------------------------------ */

interface SampledPath {
  pts: Point[];
}

/** Parse our own generated path syntax: M/Q/C/L/Z with "x,y" pairs. */
export function sampleSemanticPath(d: string): SampledPath {
  const pts: Point[] = [];
  if (!d) return { pts };
  const tokens = d.trim().split(/\s+/);
  let cursor: Point = { ...CENTER };
  let start: Point = { ...CENTER };
  let i = 0;
  const readPoint = (): Point => {
    const [x, y] = tokens[i++].split(',').map(Number);
    return { x, y };
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case 'M': {
        cursor = readPoint();
        start = cursor;
        pts.push(cursor);
        break;
      }
      case 'L': {
        const to = readPoint();
        for (let s = 1; s <= 6; s++) {
          pts.push({
            x: cursor.x + ((to.x - cursor.x) * s) / 6,
            y: cursor.y + ((to.y - cursor.y) * s) / 6,
          });
        }
        cursor = to;
        break;
      }
      case 'Q': {
        const c = readPoint();
        const to = readPoint();
        for (let s = 1; s <= 8; s++) {
          const t = s / 8;
          const mt = 1 - t;
          pts.push({
            x: mt * mt * start.x + 2 * mt * t * c.x + t * t * to.x,
            y: mt * mt * start.y + 2 * mt * t * c.y + t * t * to.y,
          });
        }
        cursor = to;
        start = to;
        break;
      }
      case 'C': {
        const c1 = readPoint();
        const c2 = readPoint();
        const to = readPoint();
        for (let s = 1; s <= 10; s++) {
          const t = s / 10;
          const mt = 1 - t;
          pts.push({
            x:
              mt * mt * mt * start.x +
              3 * mt * mt * t * c1.x +
              3 * mt * t * t * c2.x +
              t * t * t * to.x,
            y:
              mt * mt * mt * start.y +
              3 * mt * mt * t * c1.y +
              3 * mt * t * t * c2.y +
              t * t * t * to.y,
          });
        }
        cursor = to;
        start = to;
        break;
      }
      case 'Z': {
        start = cursor;
        break;
      }
      default:
        break;
    }
  }
  return { pts };
}

/* ------------------------------------------------------------------ */
/* Safety zones                                                        */
/* ------------------------------------------------------------------ */

const ANCHOR_EXCLUSION = 22; // radius around each edge anchor
const PATH_EXCLUSION_ROAD = 12; // half-width band around road centerline
const PATH_EXCLUSION_RIVER = 15; // river is wider
const MONASTERY_EXCLUSION = 20; // keep center clear when monastery exists
const BORDER_MARGIN = 6; // decorations never touch the border

function featureExclusions(features: readonly RenderFeature[], width: number) {
  const segs: { a: Point; b: Point; w: number }[] = [];
  for (const f of features) {
    // Sampled centerline points, in declared order per subpath.
    let pts = sampleSemanticPath(f.path).pts;
    if (f.spine) pts = parsePathPoints(f.spine);
    for (let k = 1; k < pts.length; k++) {
      segs.push({ a: pts[k - 1], b: pts[k], w: width });
    }
  }
  return segs;
}

/** True if a candidate point is safe for decoration placement. */
export function isDecorationSafe(
  p: Point,
  model: TileRenderModel,
): boolean {
  if (p.x < BORDER_MARGIN || p.x > 100 - BORDER_MARGIN) return false;
  if (p.y < BORDER_MARGIN || p.y > 100 - BORDER_MARGIN) return false;

  const declaredEdges = new Set<EdgeIndex>();
  for (const f of [...model.roads, ...model.cities, ...model.rivers]) {
    for (const e of f.edges) declaredEdges.add(e);
  }
  for (const e of declaredEdges) {
    const a = edgeAnchor(e);
    if (distanceToSegment(p, a, a) < ANCHOR_EXCLUSION) return false;
  }

  const exclusions = [
    ...featureExclusions(model.roads, PATH_EXCLUSION_ROAD),
    ...featureExclusions(model.rivers, PATH_EXCLUSION_RIVER),
  ];
  for (const s of exclusions) {
    if (distanceToSegment(p, s.a, s.b) < s.w) return false;
  }

  for (const city of model.cities) {
    const bb = cityBoundingBox(city.edges);
    if (
      p.x >= bb.minX - 4 &&
      p.x <= bb.maxX + 4 &&
      p.y >= bb.minY - 4 &&
      p.y <= bb.maxY + 4
    ) {
      return false;
    }
  }

  if (model.monastery) {
    if (distanceToSegment(p, CENTER, CENTER) < MONASTERY_EXCLUSION) return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const KINDS: readonly DecorationKind[] = [
  'tree',
  'shrub',
  'stone',
  'tuft',
  'flower',
];

/**
 * Deterministic field decoration layout for one tile. Same seed/card id
 * always yields the identical layout; different ids may differ even with
 * equal topology. Rejected candidates simply do not appear.
 */
export function buildFieldDecorations(
  model: TileRenderModel,
  maxItems = 10,
): FieldDecoration[] {
  const rand = createSeededRandom(`deco:${model.decorationSeed}`);
  const items: FieldDecoration[] = [];
  let attempts = 0;
  while (items.length < maxItems && attempts < 60) {
    attempts++;
    const p: Point = { x: 4 + rand() * 92, y: 4 + rand() * 92 };
    if (!isDecorationSafe(p, model)) continue;
    // avoid clustering two decorations on top of each other
    if (items.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 11)) continue;
    const kind = KINDS[Math.floor(rand() * KINDS.length)];
    items.push({ kind, x: p.x, y: p.y, rot: Math.floor(rand() * 360) });
  }
  return items;
}
