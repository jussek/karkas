import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TileDefinition } from '../../../game/types/geometry';
import type { GameState, Meeple, Player } from '../../../game/types/state';
import { GAME_CARD_CATALOG } from '../../../game/cards/canonicalCatalog';
import { TILE_ASSETS } from '../../tiles/tileAssets';
import { tileImageTransform } from '../../tiles/TileRenderer';
import { TILE_SEMANTIC_MANIFEST, rotateMeepleAnchor } from '../../tiles/tileSemanticManifest';
import {
  INITIAL_MEEPLE_PLACEMENT_UI,
  finalizeMeepleTurn,
  legalMeepleTargets,
  selectMeepleTarget,
  toggleMeeplePlacementMode,
} from '../meeplePlacementModel';

const road: TileDefinition = {
  id: 'road', sides: ['field', 'road', 'field', 'road'],
  topology: { roadSegments: ['r'], citySegments: [], hasMonastery: false, roadEdgeSegments: [null, 'r', null, 'r'], cityEdgeSegments: [null, null, null, null] },
};
const city: TileDefinition = {
  id: 'city', sides: ['field', 'city', 'field', 'city'],
  topology: { roadSegments: [], citySegments: ['c'], hasMonastery: false, roadEdgeSegments: [null, null, null, null], cityEdgeSegments: [null, 'c', null, 'c'] },
};
const monastery: TileDefinition = {
  id: 'monastery', sides: ['field', 'field', 'field', 'field'],
  topology: { roadSegments: [], citySegments: [], hasMonastery: true, roadEdgeSegments: [null, null, null, null], cityEdgeSegments: [null, null, null, null] },
};
const split: TileDefinition = {
  id: 'split', sides: ['road', 'road', 'road', 'road'],
  topology: { roadSegments: ['a', 'b'], citySegments: [], hasMonastery: false, roadEdgeSegments: ['a', 'b', 'a', 'b'], cityEdgeSegments: [null, null, null, null] },
};
const definitions = new Map([road, city, monastery, split].map((d) => [d.id, d]));
const getDefinition = (id: string) => {
  const definition = definitions.get(id);
  if (!definition) throw new Error(id);
  return definition;
};
const players: Player[] = [
  { id: 'p1', name: 'Alice', color: 'blue', score: 0 },
  { id: 'p2', name: 'Bob', color: 'red', score: 0 },
];
const homeMeeples = (): Meeple[] => players.flatMap((p) => Array.from({ length: 7 }, (_, i) => ({ id: `${p.id}-${i}`, playerId: p.id, position: null, placement: null })));
function turnState(definitionId: string): GameState {
  return {
    gameId: 'g', status: 'playing', players, currentPlayerIndex: 0, turnNumber: 1,
    board: { '0,0': { definitionId, rotation: 0, position: { x: 0, y: 0 } } },
    tileDeck: { remaining: ['road'] }, scores: { p1: 0, p2: 0 }, meeples: homeMeeples(),
    gamePhase: 'placeMeeple', drawnTileDefinitionId: null,
    lastPlacedTile: { definitionId, rotation: 0, position: { x: 0, y: 0 }, playerId: 'p1' },
  };
}

describe('mobile meeple placement state', () => {
  it('starts off with no selected target', () => expect(INITIAL_MEEPLE_PLACEMENT_UI).toEqual({ meeplePlacementMode: false, selectedMeepleTarget: null }));
  it('first toggle activates mode', () => expect(toggleMeeplePlacementMode(INITIAL_MEEPLE_PLACEMENT_UI).meeplePlacementMode).toBe(true));
  it('second toggle cancels mode and selection', () => {
    const active = selectMeepleTarget(toggleMeeplePlacementMode(INITIAL_MEEPLE_PLACEMENT_UI), { featureType: 'road', edge: 1 });
    expect(toggleMeeplePlacementMode(active)).toEqual(INITIAL_MEEPLE_PLACEMENT_UI);
  });
  it('changes preview without consuming a meeple', () => {
    const game = turnState('split');
    const active = toggleMeeplePlacementMode(INITIAL_MEEPLE_PLACEMENT_UI);
    const first = selectMeepleTarget(active, { featureType: 'road', edge: 0 });
    const second = selectMeepleTarget(first, { featureType: 'road', edge: 1 });
    expect(second.selectedMeepleTarget).toEqual({ featureType: 'road', edge: 1 });
    expect(game.meeples.every((m) => m.position === null)).toBe(true);
  });
});

describe('authoritative legal meeple targets', () => {
  it.each([
    ['road', 'road', 1], ['city', 'city', 1], ['monastery', 'monastery', null],
  ] as const)('offers a legal %s target', (definitionId, featureType, edge) => {
    expect(legalMeepleTargets(turnState(definitionId), getDefinition)).toContainEqual({ featureType, edge });
  });
  it('never offers fields or rivers', () => {
    const values = legalMeepleTargets(turnState('road'), getDefinition).map((p) => p.featureType as string);
    expect(values).not.toContain('field');
    expect(values).not.toContain('river');
  });
  it('blocks a globally connected road occupied by any player, including self', () => {
    for (const playerId of ['p1', 'p2']) {
      const state = turnState('road');
      state.board = {
        '0,0': { definitionId: 'road', rotation: 0, position: { x: 0, y: 0 } },
        '1,0': { definitionId: 'road', rotation: 0, position: { x: 1, y: 0 } },
      };
      state.lastPlacedTile = { definitionId: 'road', rotation: 0, position: { x: 1, y: 0 }, playerId: 'p1' };
      state.meeples[0] = { ...state.meeples[0], playerId, position: { x: 0, y: 0 }, placement: { featureType: 'road', edge: 1 } };
      expect(legalMeepleTargets(state, getDefinition)).toEqual([]);
    }
  });
  it('blocks an occupied global city', () => {
    const state = turnState('city');
    state.meeples[7] = { ...state.meeples[7], position: { x: 0, y: 0 }, placement: { featureType: 'city', edge: 1 } };
    expect(legalMeepleTargets(state, getDefinition)).toEqual([]);
  });
  it('keeps a disconnected local feature legal', () => {
    const state = turnState('split');
    state.meeples[7] = { ...state.meeples[7], position: { x: 0, y: 0 }, placement: { featureType: 'road', edge: 0 } };
    expect(legalMeepleTargets(state, getDefinition)).toEqual([{ featureType: 'road', edge: 1 }]);
  });
  it('offers no targets with zero available meeples', () => {
    const state = turnState('road');
    state.meeples = state.meeples.map((m) => m.playerId === 'p1' ? { ...m, position: { x: 9, y: 9 }, placement: { featureType: 'road', edge: 1 } } : m);
    expect(legalMeepleTargets(state, getDefinition)).toEqual([]);
  });
});

describe('atomic end turn', () => {
  it('commits exactly one preview meeple', () => {
    const result = finalizeMeepleTurn(turnState('road'), { featureType: 'road', edge: 1 }, getDefinition);
    expect(result.ok).toBe(true);
    expect(result.ok && result.state.meeples.filter((m) => m.position !== null)).toHaveLength(1);
  });
  it('allows end turn without a selection', () => {
    const result = finalizeMeepleTurn(turnState('road'), null, getDefinition);
    expect(result.ok).toBe(true);
    expect(result.ok && result.state.meeples.every((m) => m.position === null)).toBe(true);
  });
});

describe('artwork, anchors, and mobile guards', () => {
  it('maps all 143 runtime ids and contains no field anchors', () => {
    expect(TILE_ASSETS).toHaveLength(143);
    expect(TILE_SEMANTIC_MANIFEST).toHaveLength(143);
    expect(TILE_SEMANTIC_MANIFEST.flatMap((tile) => tile.meepleAnchors).every((a) => (a.featureType as string) !== 'field')).toBe(true);
  });
  it('preserves the audited project river set of 19 tiles', () => {
    expect(GAME_CARD_CATALOG.filter((card) => card.riverCard === true)).toHaveLength(19);
  });
  it('rotates an anchor through all engine rotations', () => {
    const anchor = { featureType: 'road' as const, edge: 0 as const, point: { x: 50, y: 30 } };
    expect([0, 90, 180, 270].map((r) => rotateMeepleAnchor(anchor, r as 0 | 90 | 180 | 270).edge)).toEqual([0, 1, 2, 3]);
  });
  it('keeps image and semantic rotations synchronized', () => {
    const rotations = [0, 90, 180, 270] as const;
    const anchor = { featureType: 'city' as const, edge: 0 as const, point: { x: 50, y: 18 } };
    rotations.forEach((rotation) => {
      expect(tileImageTransform(rotation)).toBe(`rotate(${rotation}deg)`);
      expect(rotateMeepleAnchor(anchor, rotation).edge).toBe(rotation / 90);
    });
  });
  it('uses touch targets larger than the visible marker and safe areas', () => {
    const css = readFileSync(join(new URL('.', import.meta.url).pathname, '..', 'meeplePlacement.css'), 'utf8');
    expect(css).toContain('width: 52px');
    expect(css).not.toContain('width="28"');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
