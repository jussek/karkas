/**
 * Stage 3E — Pure geometry tests for the rule-driven SVG tile renderer.
 *
 * These tests assert SEMANTIC endpoint data (never exact SVG path
 * strings): every declared feature edge must be reached by an exact edge
 * anchor, and no undeclared border anchor may appear as an endpoint.
 */

// @ts-expect-error -- Node builtins are available under the vitest runtime but not in the DOM tsconfig types.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error -- Node builtins are available under the vitest runtime but not in the DOM tsconfig types.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EdgeIndex } from '../../../game/types/geometry';
import {
  CENTER,
  EDGE_ANCHORS,
  cityBoundingBox,
  cityMassPoints,
  cityTouchedEdges,
  distanceToSegment,
  edgeAnchor,
  edgeInwardPoint,
  hashString,
  parsePathPoints,
  riverGeometry,
  riverTerminalPoint,
  roadGeometry,
  seededFloat,
  type Point,
} from '../tileGeometry';
import { RUNTIME_ASSET_SOURCE, TILE_ASSETS, tileAssetForCard } from '../tileAssets';

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Anchors among a set of endpoints, mapped back to edge indices. */
function anchorEdges(points: readonly Point[]): EdgeIndex[] {
  const out: EdgeIndex[] = [];
  for (const e of [0, 1, 2, 3] as EdgeIndex[]) {
    if (points.some((p) => samePoint(p, EDGE_ANCHORS[e]))) out.push(e);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Edge anchors (§37)                                                  */
/* ------------------------------------------------------------------ */

describe('edge anchors', () => {
  it('N = {50,0}', () => expect(edgeAnchor(0)).toEqual({ x: 50, y: 0 }));
  it('E = {100,50}', () => expect(edgeAnchor(1)).toEqual({ x: 100, y: 50 }));
  it('S = {50,100}', () => expect(edgeAnchor(2)).toEqual({ x: 50, y: 100 }));
  it('W = {0,50}', () => expect(edgeAnchor(3)).toEqual({ x: 0, y: 50 }));
  it('logical center is 50,50', () => expect(CENTER).toEqual({ x: 50, y: 50 }));
  it('inward points move toward the interior per edge', () => {
    expect(edgeInwardPoint(0, 10)).toEqual({ x: 50, y: 10 });
    expect(edgeInwardPoint(1, 10)).toEqual({ x: 90, y: 50 });
    expect(edgeInwardPoint(2, 10)).toEqual({ x: 50, y: 90 });
    expect(edgeInwardPoint(3, 10)).toEqual({ x: 10, y: 50 });
  });
});

/* ------------------------------------------------------------------ */
/* Road endpoint invariant (§9, §13–16)                                */
/* ------------------------------------------------------------------ */

describe('road geometry — semantic endpoint invariant', () => {
  const seed = 'test-seed';
  const cases: readonly (readonly EdgeIndex[])[] = [[0], [0, 2], [0, 1], [0, 1, 3], [0, 1, 2, 3]];

  for (const edges of cases) {
    it(`edges [${edges.join(',')}] expose exactly the declared anchors`, () => {
      const g = roadGeometry(edges, seed, 0);
      // every declared edge anchor is present among endpoints
      for (const e of edges) {
        expect(g.endpoints.some((p) => samePoint(p, EDGE_ANCHORS[e]))).toBe(true);
      }
      // no UNDECLARED border anchor appears as an endpoint
      const exposed = new Set(anchorEdges(g.endpoints));
      for (const e of [0, 1, 2, 3] as EdgeIndex[]) {
        if (!edges.includes(e)) expect(exposed.has(e), `edge ${e}`).toBe(false);
      }
      // path string starts at the first declared anchor (serialization sanity)
      expect(g.path.startsWith(`M ${EDGE_ANCHORS[edges[0]].x},${EDGE_ANCHORS[edges[0]].y}`)).toBe(true);
    });
  }

  it('single-edge road ends at an INTERNAL dead-end point (not another anchor)', () => {
    const g = roadGeometry([0], seed, 0);
    expect(g.endpoints).toHaveLength(2);
    const terminal = g.endpoints[1];
    expect(terminal.x > 0 && terminal.x < 100).toBe(true);
    expect(terminal.y > 0 && terminal.y < 100).toBe(true);
    expect(anchorEdges([terminal])).toEqual([]);
  });

  it('opposite pair N-S passes through the center region (straight)', () => {
    const g = roadGeometry([0, 2], seed, 0);
    expect(anchorEdges(g.endpoints)).toEqual([0, 2]);
    const pts = parsePathPoints(g.path);
    const midPt = pts[Math.floor(pts.length / 2)];
    expect(distanceToSegment(midPt, CENTER, CENTER)).toBeLessThan(4);
  });

  it('adjacent pair N-E bends through the NE quadrant', () => {
    const g = roadGeometry([0, 1], seed, 0);
    const ctrl = parsePathPoints(g.path)[1]; // Q control point
    expect(ctrl.x).toBeGreaterThan(50);
    expect(ctrl.y).toBeLessThan(50);
  });

  it('3-edge junction: all three anchors reach one shared junction point', () => {
    const g = roadGeometry([0, 1, 3], seed, 0);
    const junction = g.endpoints[g.endpoints.length - 1];
    const subpaths = g.path.split('M ').filter(Boolean);
    expect(subpaths).toHaveLength(3);
    for (const sp of subpaths) {
      expect(sp.trim().endsWith(`${Math.round(junction.x * 10) / 10},${Math.round(junction.y * 10) / 10}`)).toBe(true);
    }
  });

  it('disconnected groups ([[0,1]] slot 0 vs [[2,3]] slot 1) stay distinct', () => {
    const a = roadGeometry([0, 1], seed, 0);
    const b = roadGeometry([2, 3], seed, 1);
    expect(anchorEdges(a.endpoints)).toEqual([0, 1]);
    expect(anchorEdges(b.endpoints)).toEqual([2, 3]);
    // no shared internal endpoint between the two features
    for (const pa of a.endpoints) {
      for (const pb of b.endpoints) {
        expect(samePoint(pa, pb)).toBe(false);
      }
    }
  });

  it('two single-edge roads in different slots get different internal terminals', () => {
    const t0 = roadGeometry([0], seed, 0).endpoints[1];
    const t1 = roadGeometry([0], seed, 1).endpoints[1];
    expect(samePoint(t0, t1)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* City invariant (§11)                                                */
/* ------------------------------------------------------------------ */

describe('city geometry — declared-edge touch invariant', () => {
  const cases: readonly (readonly EdgeIndex[])[] = [[0], [0, 1], [0, 2], [0, 1, 3]];

  for (const edges of cases) {
    it(`mass for [${edges.join(',')}] touches exactly its declared edges`, () => {
      const touched = [...cityTouchedEdges(edges)].sort();
      expect(touched).toEqual([...edges].sort());
    });
  }

  it('[[0],[2]] produces two separated masses (boxes do not overlap)', () => {
    const north = cityBoundingBox([0]);
    const south = cityBoundingBox([2]);
    expect(north.maxY).toBeLessThan(south.minY);
  });

  it('mass polygon vertices stay inside the tile', () => {
    for (const edges of [[0], [1], [2], [3], [0, 1], [0, 2], [1, 3], [0, 1, 2], [0, 1, 2, 3]] as const) {
      for (const p of cityMassPoints(edges)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('city spine starts at each declared anchor and ends at the mass center', () => {
    const edges: EdgeIndex[] = [0, 1];
    const bb = cityBoundingBox(edges);
    const center = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    const spine = parsePathPoints(
      edges
        .map((e) => `M ${EDGE_ANCHORS[e].x},${EDGE_ANCHORS[e].y} L ${center.x},${center.y}`)
        .join(' '),
    );
    expect(spine.some((p) => samePoint(p, EDGE_ANCHORS[0]))).toBe(true);
    expect(spine.some((p) => samePoint(p, EDGE_ANCHORS[1]))).toBe(true);
    expect(spine.some((p) => samePoint(p, center))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* River invariant (§12, §21–26)                                       */
/* ------------------------------------------------------------------ */

describe('river geometry — semantic endpoint invariant', () => {
  const seed = 'river-seed';
  const cases: readonly (readonly EdgeIndex[])[] = [[2], [0, 2], [0, 1], [0, 1, 3]];

  for (const edges of cases) {
    it(`river [${edges.join(',')}] reaches exactly its declared anchors`, () => {
      const g = riverGeometry(edges, seed);
      for (const e of edges) {
        expect(g.endpoints.some((p) => samePoint(p, EDGE_ANCHORS[e]))).toBe(true);
      }
      const exposed = new Set(anchorEdges(g.endpoints));
      for (const e of [0, 1, 2, 3] as EdgeIndex[]) {
        if (!edges.includes(e)) expect(exposed.has(e), `edge ${e}`).toBe(false);
      }
    });
  }

  it('single-edge river terminal is INTERNAL (source/lake, never a fake exit)', () => {
    for (const e of [0, 1, 2, 3] as EdgeIndex[]) {
      const t = riverTerminalPoint(e, seed);
      expect(t.x).toBeGreaterThan(0);
      expect(t.x).toBeLessThan(100);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(100);
      expect(anchorEdges([t])).toEqual([]);
    }
    const g = riverGeometry([2], seed);
    expect(g.endpoints[0]).toEqual(EDGE_ANCHORS[2]);
    expect(g.endpoints[1]).toEqual(riverTerminalPoint(2, seed));
  });

  it('three-way river connects all declared edges at one confluence', () => {
    const g = riverGeometry([0, 1, 3], seed);
    const subpaths = g.path.split('M ').filter(Boolean);
    expect(subpaths).toHaveLength(3);
    const junction = g.endpoints[g.endpoints.length - 1];
    const jStr = `${Math.round(junction.x * 10) / 10},${Math.round(junction.y * 10) / 10}`;
    for (const sp of subpaths) expect(sp.trim().endsWith(jStr)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Deterministic helpers (§30)                                         */
/* ------------------------------------------------------------------ */

describe('deterministic hashing helpers', () => {
  it('hashString is stable across calls', () => {
    expect(hashString('card-001')).toBe(hashString('card-001'));
    expect(hashString('card-001')).not.toBe(hashString('card-002'));
  });

  it('seededFloat returns values in [0,1) deterministically', () => {
    for (let i = 0; i < 20; i++) {
      const v = seededFloat('s', i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(seededFloat('s', i));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Source guard: no Math.random in the renderer layer (§15)            */
/* ------------------------------------------------------------------ */

describe('renderer source guards', () => {
  const tilesDir = join(new URL('.', import.meta.url).pathname, '..');

  it('no executable Math.random in src/game-ui/tiles sources', () => {
    const files = readdirSync(tilesDir).filter(
      // @ts-expect-error -- implicit any: node fs typings unavailable in this tsconfig.
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(tilesDir, f), 'utf8');
      expect(src.includes('Math.random'), f).toBe(false);
    }
  });

  it('maps all 143 runtime card ids to local authoritative JPG assets', () => {
    expect(RUNTIME_ASSET_SOURCE).toBe('src/a');
    expect(TILE_ASSETS).toHaveLength(143);
    TILE_ASSETS.forEach((asset) => {
      const number = Number(asset.cardId.slice(5));
      expect(number).not.toBe(109);
      expect(asset.filename).toBe(`1 (${number}).jpg`);
      expect(asset.url).toBeTruthy();
    });
    expect(TILE_ASSETS.some((asset) => asset.filename === '1 (106).jpg')).toBe(true);
    expect(TILE_ASSETS.find((asset) => asset.cardId === 'card-106')?.filename).toBe('1 (106).jpg');
    expect(() => tileAssetForCard('card-109')).toThrow('Unknown tile artwork');
    const loaderSource = readFileSync(join(tilesDir, 'tileAssets.ts'), 'utf8');
    expect(loaderSource).toContain("../../a/*.jpg");
    expect(loaderSource).not.toContain("../../game/cards/*.jpg");
  });
});
