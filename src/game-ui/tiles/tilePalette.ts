/**
 * Stage 3E — Original procedural color palette for the SVG tile renderer.
 * Warm, stylized, Carcassonne-adjacent but NOT a copy of any existing art.
 * All values are plain hex strings used by SVG primitives.
 */

export const PALETTE = {
  /* Field (meadow) */
  fieldBase: '#7fae53',
  fieldToneA: '#86b65b',
  fieldToneB: '#77a54c',
  fieldShrub: '#5f8f3d',
  fieldTree: '#4e7d33',
  fieldTrunk: '#7a5a38',
  fieldStone: '#a9a294',
  fieldFlower: '#e8d46a',

  /* Road — light beige track with an earthy transition band */
  roadOuter: '#b99a6b',
  roadInner: '#efe3c8',

  /* City — warm terracotta + stone */
  cityMass: '#c96f4a',
  cityWall: '#8f4a30',
  cityRoof: '#a53f28',
  cityTower: '#d9d2c1',
  cityAccent: '#5f2c1c',

  /* River — blue water, darker banks, subtle highlight */
  riverBank: '#2e5f82',
  riverWater: '#4f8fc0',
  riverHighlight: '#8ec3e6',

  /* Monastery */
  monasteryWall: '#e8e0cf',
  monasteryRoof: '#96432b',
  monasteryTower: '#d8cdb6',
  monasteryPath: '#cbb389',

  /* Tile border */
  border: 'rgba(70, 60, 40, 0.35)',

  /* Meeple (presentation default; players may override via fill prop) */
  meeple: '#b8332b',
} as const;
