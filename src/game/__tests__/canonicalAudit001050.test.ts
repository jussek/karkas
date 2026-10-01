import { describe, expect, it } from 'vitest';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { cardToTileDefinition } from '../cards/toTileDefinition';
import { getTileEdges } from '../engine/geometry';
import { isLegalTilePlacement } from '../rules/placement';
import type { CardDefinition } from '../cards/types';
import type { EdgeIndex, EdgeType, Rotation, TileDefinition } from '../types/geometry';
import type { Board } from '../types/state';

type AuditRow = readonly [
  edges: string,
  roads: readonly (readonly EdgeIndex[])[],
  cities: readonly (readonly EdgeIndex[])[],
  monastery?: true,
  shieldCity?: number,
];

const AUDIT: readonly AuditRow[] = [
  ['CCFF', [], [[0, 1]]], ['CFCC', [], [[0, 2, 3]]], ['CCRC', [[2]], [[0, 1, 3]]],
  ['FCCR', [[3]], [[1, 2]]], ['RRCF', [[0, 1]], [[2]]], ['RFRF', [[0, 2]], []],
  ['CFFF', [], [[0]]], ['RFRF', [[0, 2]], []], ['FFRR', [[2, 3]], []],
  ['RRFR', [[0], [1], [3]], []], ['CRFR', [[1, 3]], [[0]]], ['FRFR', [[1, 3]], []],
  ['CRCR', [[1], [3]], [[0, 2]]], ['RRCC', [[0], [1]], [[2, 3]]],
  ['CCCC', [], [[0, 3], [1, 2]]], ['CCFF', [], [[0, 1]], undefined, 0],
  ['CFRR', [[2, 3]], [[0]]], ['RRRR', [[0], [1], [2], [3]], []],
  ['RFCR', [[0, 3]], [[2]]], ['FRRF', [[1, 2]], []], ['CFFF', [], [[0]], true],
  ['FFRR', [[2, 3]], []], ['RRCR', [[1, 3], [0]], [[2]]], ['FRFR', [[1, 3]], []],
  ['CRCF', [[1]], [[0, 2]]], ['CRRR', [[1, 3], [2]], [[0]]], ['CRCC', [[1]], [[0, 2, 3]]],
  ['CCCC', [], [[0, 1, 2, 3]], undefined, 0], ['FCCF', [], [[1, 2]], undefined, 0],
  ['CFRR', [[2, 3]], [[0]]], ['FRRF', [[1, 2]], []], ['CFFF', [], [[0]]],
  ['FFCC', [], [[2, 3]]], ['FCFC', [], [[1], [3]]], ['CCRC', [[2]], [[0, 1, 3]]],
  ['CCFC', [], [[0, 1, 3]]], ['CCCF', [], [[0, 1], [2]]],
  ['CFCF', [], [[0, 2]], undefined, 0], ['CFCF', [], [[0, 2]]],
  ['CCCR', [[3]], [[0], [1, 2]]], ['FFFF', [], [], true], ['CFCF', [], [[0], [2]]],
  ['CCCC', [], [[0, 1, 2, 3]], undefined, 0], ['CFCF', [], [[0], [2]]],
  ['CFFF', [], [[0]]], ['CFCC', [], [[0, 2, 3]]], ['CCCC', [], [[0, 1, 2, 3]]],
  ['CCCC', [], [[0, 1, 2, 3]]], ['FCFF', [], [[1]]],
  ['CFCC', [], [[0, 2, 3]], undefined, 0],
] as const;

const TERRAIN: Record<string, EdgeType> = { F: 'field', R: 'road', C: 'city' };
const SIDES = ['north', 'east', 'south', 'west'] as const;
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const SHIELD_IDS = ['card-016', 'card-028', 'card-029', 'card-038', 'card-043', 'card-050'];
const auditedCards = GAME_CARD_CATALOG.slice(0, 50);

function id(number: number): string {
  return `card-${String(number).padStart(3, '0')}`;
}

function expectedCard(index: number, row: AuditRow) {
  const [edgeCodes, roads, cities, monastery = undefined, shieldCity = -1] = row;
  const shieldCount = shieldCity >= 0 ? 1 : 0;
  return {
    id: id(index + 1),
    asset: `1 (${index + 1}).jpg`,
    edges: Object.fromEntries(SIDES.map((side, edge) => [side, TERRAIN[edgeCodes[edge]]])),
    topology: {
      roads,
      cities,
      ...(cities.length > 0
        ? { cityShields: cities.map((_, city) => city === shieldCity ? 1 : 0) }
        : {}),
      ...(monastery ? { monastery: true } : {}),
    },
    shields: shieldCount,
  };
}

function neighborDefinition(edge: EdgeIndex, terrain: EdgeType): TileDefinition {
  const sides: EdgeType[] = ['field', 'field', 'field', 'field'];
  sides[((edge + 2) % 4) as EdgeIndex] = terrain;
  return {
    id: 'neighbor',
    sides,
    topology: {
      roadSegments: [], citySegments: [], hasMonastery: false,
      roadEdgeSegments: [null, null, null, null],
      cityEdgeSegments: [null, null, null, null],
    },
  };
}

function placementAgainst(
  card: CardDefinition,
  rotation: Rotation,
  edge: EdgeIndex,
  neighborTerrain: EdgeType,
) {
  const positions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const neighbor = neighborDefinition(edge, neighborTerrain);
  const board: Board = {
    [`${positions[edge].x},${positions[edge].y}`]: {
      definitionId: neighbor.id, rotation: 0, position: positions[edge],
    },
  };
  return isLegalTilePlacement(
    { board, getDefinition: () => neighbor },
    cardToTileDefinition(card),
    rotation,
    { x: 0, y: 0 },
  );
}

describe('canonical artwork audit 001..050', () => {
  it('table-drives every complete canonical definition and exact asset filename', () => {
    expect(AUDIT).toHaveLength(50);
    expect(auditedCards).toHaveLength(50);
    AUDIT.forEach((row, index) => expect(auditedCards[index]).toEqual(expectedCard(index, row)));
  });

  it.each([10, 14, 23, 25, 26, 30, 33, 37, 45])(
    'keeps corrected card-%s equal to its authoritative audit row',
    (number) => expect(auditedCards[number - 1]).toEqual(expectedCard(number - 1, AUDIT[number - 1])),
  );

  it.each([
    [10, [[0], [1], [3]], []], [18, [[0], [1], [2], [3]], []],
    [23, [[1, 3], [0]], [[2]]], [26, [[1, 3], [2]], [[0]]],
    [15, [], [[0, 3], [1, 2]]], [34, [], [[1], [3]]],
    [37, [], [[0, 1], [2]]], [40, [[3]], [[0], [1, 2]]],
    [42, [], [[0], [2]]], [44, [], [[0], [2]]],
  ] as const)('preserves independent feature topology for card-%s', (number, roads, cities) => {
    expect(auditedCards[number - 1].topology.roads).toEqual(roads);
    expect(auditedCards[number - 1].topology.cities).toEqual(cities);
  });

  it('exposes only the audited monasteries relevant to the correction', () => {
    expect(auditedCards.filter((card) => card.topology.monastery).map((card) => card.id))
      .toEqual(['card-021', 'card-041']);
    expect(auditedCards.find((card) => card.id === 'card-018')?.topology.monastery).not.toBe(true);
    expect(auditedCards.find((card) => card.id === 'card-045')?.topology.monastery).not.toBe(true);
  });

  it('records exactly the six visual shields without adding river flags', () => {
    expect(auditedCards.filter((card) => card.shields === 1).map((card) => card.id)).toEqual(SHIELD_IDS);
    expect(auditedCards.every((card) => card.riverCard !== true)).toBe(true);
  });

  it('uses audited rotated edges in the actual placement engine compatibility matrix', () => {
    for (const card of auditedCards) {
      const tile = cardToTileDefinition(card);
      const canonicalEdges = SIDES.map((side) => card.edges[side]);
      for (const rotation of ROTATIONS) {
        const rotatedEdges = getTileEdges(tile, rotation);
        const steps = rotation / 90;
        canonicalEdges.forEach((terrain, sourceEdge) => {
          expect(rotatedEdges[(sourceEdge + steps) % 4]).toBe(terrain);
        });
        rotatedEdges.forEach((terrain, edge) => {
          expect(placementAgainst(card, rotation, edge as EdgeIndex, terrain)).toEqual({ legal: true });
          for (const mismatch of (['field', 'road', 'city'] as const).filter((type) => type !== terrain)) {
            expect(placementAgainst(card, rotation, edge as EdgeIndex, mismatch)).toMatchObject({
              legal: false, error: 'EDGE_MISMATCH', mismatchedEdges: [edge],
            });
          }
        });
      }
    }
  });
});
