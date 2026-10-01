import { describe, expect, it } from 'vitest';

import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import type { CardDefinition } from '../cards/types';
import type { EdgeIndex, EdgeType, Rotation, TileDefinition } from '../types/geometry';
import { cardToTileDefinition } from '../cards/toTileDefinition';
import { getTileEdges, rotateEdge } from '../engine/geometry';
import { isLegalTilePlacement } from '../rules/placement';
import type { Board } from '../types/state';

const SIDES = ['north', 'east', 'south', 'west'] as const;
const VALID_EDGES: readonly EdgeType[] = ['field', 'road', 'city', 'river'];

function terrainAt(card: CardDefinition, edge: number): EdgeType {
  return card.edges[SIDES[edge]];
}

function flattened(groups: readonly (readonly number[])[]): number[] {
  return groups.flatMap((group) => [...group]);
}

function occurrences(values: readonly number[], edge: number): number {
  return values.filter((value) => value === edge).length;
}

describe('whole runtime catalog structural audit', () => {
  it('contains all 143 playable physical ids/assets exactly once', () => {
    expect(RUNTIME_CARD_CATALOG).toHaveLength(143);
    expect(new Set(RUNTIME_CARD_CATALOG.map((card) => card.id)).size).toBe(143);
    expect(new Set(RUNTIME_CARD_CATALOG.map((card) => card.asset)).size).toBe(143);
    for (let number = 1; number <= 144; number += 1) {
      if (number === 109) continue;
      const id = `card-${String(number).padStart(3, '0')}`;
      const card = RUNTIME_CARD_CATALOG.find((item) => item.id === id);
      expect(card, `missing ${id}`).toBeDefined();
      expect(card?.asset).toBe(`1 (${number}).jpg`);
    }
  });

  it('has exact N/E/S/W terrain and topology that covers each linear edge exactly once', () => {
    for (const card of RUNTIME_CARD_CATALOG) {
      expect(Object.keys(card.edges).sort()).toEqual([...SIDES].sort());
      const roads = flattened(card.topology.roads);
      const cities = flattened(card.topology.cities);
      const rivers = [...(card.topology.riverEdges ?? [])];

      for (let edge = 0; edge < 4; edge += 1) {
        const terrain = terrainAt(card, edge);
        expect(VALID_EDGES, `${card.id} edge ${edge}`).toContain(terrain);
        expect(occurrences(roads, edge), `${card.id} road edge ${edge}`).toBe(terrain === 'road' ? 1 : 0);
        expect(occurrences(cities, edge), `${card.id} city edge ${edge}`).toBe(terrain === 'city' ? 1 : 0);
        expect(occurrences(rivers, edge), `${card.id} river edge ${edge}`).toBe(terrain === 'river' ? 1 : 0);
      }

      for (const edge of [...roads, ...cities, ...rivers]) {
        expect(Number.isInteger(edge), `${card.id} topology edge`).toBe(true);
        expect(edge).toBeGreaterThanOrEqual(0);
        expect(edge).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has coherent river metadata: 1 source, 17 middle, 1 final', () => {
    const riverCards = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
    expect(riverCards).toHaveLength(19);
    expect(riverCards.filter((card) => card.riverKind === 'start')).toHaveLength(1);
    expect(riverCards.filter((card) => card.riverKind === 'middle')).toHaveLength(17);
    expect(riverCards.filter((card) => card.riverKind === 'end')).toHaveLength(1);
    expect(riverCards.find((card) => card.riverKind === 'start')?.id).toBe('card-133');
    expect(riverCards.find((card) => card.riverKind === 'end')?.id).toBe('card-106');

    for (const card of RUNTIME_CARD_CATALOG) {
      if (card.riverCard) {
        expect(['start', 'middle', 'end']).toContain(card.riverKind);
        expect(card.topology.riverEdges?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(card.riverKind, `${card.id} non-river kind`).toBeUndefined();
        expect(card.topology.riverEdges ?? [], `${card.id} non-river edges`).toEqual([]);
      }
    }
  });


  it('exhaustively validates 143 cards x rotations x edges x terrain probes in the real placement engine', () => {
    const rotations: readonly Rotation[] = [0, 90, 180, 270];
    const terrains: readonly EdgeType[] = ['field', 'road', 'city', 'river'];
    const offsets = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}] as const;
    for (const card of RUNTIME_CARD_CATALOG) {
      const tile = cardToTileDefinition(card);
      for (const rotation of rotations) {
        const edges = getTileEdges(tile, rotation);
        for (const sourceEdge of [0,1,2,3] as const) {
          const edge = rotateEdge(sourceEdge, rotation);
          expect(edges[edge]).toBe(terrainAt(card, sourceEdge));
          for (const terrain of terrains) {
            const sides: EdgeType[]=['field','field','field','field'];
            const neighbor: TileDefinition = { id:'probe', sides, topology:{roadSegments:[],citySegments:[],hasMonastery:false,roadEdgeSegments:[null,null,null,null],cityEdgeSegments:[null,null,null,null]} };
            sides[((edge+2)%4) as EdgeIndex]=terrain;
            const position=offsets[edge];
            const board: Board = {[`${position.x},${position.y}`]:{definitionId:'probe',rotation:0,position}};
            const result=isLegalTilePlacement({board,getDefinition:()=>neighbor},tile,rotation,{x:0,y:0});
            expect(result.legal, `${card.id}/${rotation}/${edge}/${terrain}`).toBe(terrain===edges[edge]);
            if (!result.legal) expect(result.error).toBe('EDGE_MISMATCH');
          }
        }
      }
    }
  });

  it('pins visually re-verified high-risk cards', () => {
    const byId = new Map(RUNTIME_CARD_CATALOG.map((card) => [card.id, card]));
    expect(byId.get('card-079')).toMatchObject({
      edges: { north: 'river', east: 'road', south: 'river', west: 'city' },
      topology: { roads: [[1]], cities: [[3]], riverEdges: [0, 2] },
      riverKind: 'middle',
    });
    expect(byId.get('card-091')).toMatchObject({
      edges: { north: 'field', east: 'river', south: 'river', west: 'field' },
      topology: { riverEdges: [1, 2] },
      riverKind: 'middle',
    });
    expect(byId.get('card-096')).toMatchObject({
      edges: { north: 'road', east: 'field', south: 'road', west: 'field' },
      topology: { roads: [[0, 2]], cities: [] },
    });
    expect(byId.get('card-096')?.riverCard).not.toBe(true);
    expect(byId.get('card-106')).toMatchObject({
      edges: { north: 'field', east: 'field', south: 'field', west: 'river' },
      topology: { roads: [], cities: [], riverEdges: [3] },
      riverKind: 'end',
    });
    expect(byId.get('card-133')).toMatchObject({
      edges: { north: 'field', east: 'field', south: 'river', west: 'field' },
      topology: { roads: [], cities: [], riverEdges: [2] },
      riverKind: 'start',
    });
  });
});
