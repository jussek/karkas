import { describe, expect, it } from 'vitest';
import { getLocalFeaturePlacements } from '../rules/localFeatures';
import type { TileDefinition } from '../types/geometry';

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
