import { describe, expect, it } from 'vitest';
import { getLocalFeaturePlacements } from '../rules/localFeatures';
import type { MeeplePlacement, TileDefinition } from '../types/geometry';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { cardToTileDefinition } from '../cards/toTileDefinition';
import { rotateEdge } from '../engine/geometry';
import { resolveGlobalFeature } from '../rules/globalFeatures';

const mixedRoadCity: TileDefinition = {
  id: 'test-road-city',
  sides: ['road', 'field', 'city', 'field'],
  topology: {
    roadSegments: ['r0'],
    citySegments: ['c0'],
    hasMonastery: false,
    roadEdgeSegments: ['r0', null, null, null],
    cityEdgeSegments: [null, null, 'c0', null],
  },
};

describe('mixed-feature meeple targets', () => {
  it('keeps each real card feature selectable and independently occupied in every rotation', () => {
    for (const card of GAME_CARD_CATALOG) {
      const definition = cardToTileDefinition(card);
      for (const rotation of [0, 90, 180, 270] as const) {
        const targets = getLocalFeaturePlacements(definition, rotation);
        const expected: MeeplePlacement[] = (['road', 'city'] as const).flatMap((featureType) =>
          card.topology[featureType === 'road' ? 'roads' : 'cities'].map((group) => ({
            featureType,
            edge: rotateEdge(Math.min(...group) as 0 | 1 | 2 | 3, rotation),
          })),
        );
        if (card.topology.monastery) expected.push({ featureType: 'monastery', edge: null });
        const key = (target: { featureType: string; edge: number | null }) => `${target.featureType}:${target.edge}`;
        expect(targets.map(key).sort(), `${card.id}@${rotation}`).toEqual(expected.map(key).sort());
        const board = { '0,0': { definitionId: card.id, rotation, position: { x: 0, y: 0 } } };
        for (const occupied of targets) {
          const context = {
            board,
            getDefinition: () => definition,
            meeples: [{ id: 'occupied', playerId: 'other-player', position: { x: 0, y: 0 }, placement: occupied }],
          };
          const features = targets.map((target) => resolveGlobalFeature(context, { x: 0, y: 0 }, target)!);
          expect(new Set(features.map((feature) => feature.id)).size, `${card.id}@${rotation} independent features`).toBe(targets.length);
          features.forEach((feature, index) => {
            expect(feature.occupantPlayerIds, `${card.id}@${rotation}/${key(targets[index])}`).toEqual(
              key(targets[index]) === key(occupied) ? ['other-player'] : [],
            );
          });
        }
      }
    }
  });
  it('keeps road and city as separate selectable meeple locations on the same tile', () => {
    expect(getLocalFeaturePlacements(mixedRoadCity, 0)).toEqual([
      { featureType: 'road', edge: 0 },
      { featureType: 'city', edge: 2 },
    ]);
  });

  it('keeps both choices after tile rotation', () => {
    expect(getLocalFeaturePlacements(mixedRoadCity, 90)).toEqual([
      { featureType: 'road', edge: 1 },
      { featureType: 'city', edge: 3 },
    ]);
  });
});
