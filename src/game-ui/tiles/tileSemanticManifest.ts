import { RUNTIME_CARD_CATALOG } from '../../game/cards/runtimeCatalog';
import { rotateEdge } from '../../game/engine/geometry';
import type { EdgeIndex, MeeplePlacement, Rotation } from '../../game/types/geometry';

export interface NormalizedPoint { x: number; y: number }
export interface MeepleAnchor extends MeeplePlacement { point: NormalizedPoint }

function anchorAtEdge(edge: EdgeIndex, depth: number): NormalizedPoint {
  switch (edge) {
    case 0: return { x: 50, y: depth };
    case 1: return { x: 100 - depth, y: 50 };
    case 2: return { x: 50, y: 100 - depth };
    case 3: return { x: depth, y: 50 };
  }
}

export function anchorForPlacement(placement: MeeplePlacement): NormalizedPoint {
  if (placement.featureType === 'monastery') return { x: 50, y: 50 };
  if (placement.edge === null) throw new Error('Linear feature anchor requires an edge');
  return anchorAtEdge(placement.edge, placement.featureType === 'city' ? 18 : 30);
}

export function rotateMeepleAnchor(anchor: MeepleAnchor, rotation: Rotation): MeepleAnchor {
  if (anchor.edge === null) return { ...anchor, point: { x: 50, y: 50 } };
  const edge = rotateEdge(anchor.edge, rotation);
  const placement = { featureType: anchor.featureType, edge };
  return { ...placement, point: anchorForPlacement(placement) };
}

export const TILE_SEMANTIC_MANIFEST = RUNTIME_CARD_CATALOG.map((card) => {
  const anchors: MeepleAnchor[] = [];
  card.topology.roads.forEach((edges) => {
    const edge = Math.min(...edges) as EdgeIndex;
    if (edges.length > 0) anchors.push({ featureType: 'road', edge, point: anchorForPlacement({ featureType: 'road', edge }) });
  });
  card.topology.cities.forEach((edges) => {
    const edge = Math.min(...edges) as EdgeIndex;
    if (edges.length > 0) anchors.push({ featureType: 'city', edge, point: anchorForPlacement({ featureType: 'city', edge }) });
  });
  if (card.topology.monastery === true) {
    anchors.push({ featureType: 'monastery', edge: null, point: { x: 50, y: 50 } });
  }
  return {
    cardId: card.id,
    asset: card.asset,
    edges: card.edges,
    topology: card.topology,
    shields: card.shields ?? 0,
    cityFeatures: card.topology.cities.map((edges, index) => ({
      edges,
      shields: card.topology.cityShields?.[index]
        ?? (card.topology.cities.length === 1 ? card.shields ?? 0 : 0),
    })),
    meepleAnchors: anchors,
  };
});
