import type { CardDefinition } from './types';
import type { TileDefinition } from '../types/geometry';

export function cardToTileDefinition(card: CardDefinition): TileDefinition {
  const roadSegments = card.topology.roads.map((_, index) => `road:${index}`);
  const roadEdgeSegments: (string | null)[] = [null, null, null, null];
  card.topology.roads.forEach((edges, index) => {
    for (const edge of edges) roadEdgeSegments[edge] = `road:${index}`;
  });

  const citySegments = card.topology.cities.map((_, index) => `city:${index}`);
  const cityEdgeSegments: (string | null)[] = [null, null, null, null];
  card.topology.cities.forEach((edges, index) => {
    for (const edge of edges) cityEdgeSegments[edge] = `city:${index}`;
  });

  return {
    id: card.id,
    name: card.id,
    sides: [card.edges.north, card.edges.east, card.edges.south, card.edges.west],
    topology: {
      roadSegments,
      citySegments,
      hasMonastery: card.topology.monastery === true,
      roadEdgeSegments,
      cityEdgeSegments,
    },
  };
}
