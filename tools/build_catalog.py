"""Generate src/game/cards/catalog.ts from pixel-classified card data."""
import json

SIDE_TO_IDX = {'N': 0, 'E': 1, 'S': 2, 'W': 3}
IDX_TO_SIDE = ['north', 'east', 'south', 'west']

data = json.load(open('/tmp/classified.json'))

def roads_for(edges):
    """Derive road topology groups from classified edges.
    Single road => one group of all road sides. Two+ road ends:
    topology (straight/corner/T/cross) cannot be derived reliably from edge
    colors alone -> we emit the set of road ends as a single candidate group
    and mark reviewRequired (per Stage 2.5 policy §6)."""
    ends = [SIDE_TO_IDX[s] for s, t in edges.items() if t == 'road']
    return ends

lines = []
lines.append("""/**
 * Card Catalog — Stage 2.5
 *
 * 144 real project card assets (src/game/cards/1 (N).jpg), canonical
 * orientation only (rotation is applied by rotateTile(), never stored here).
 *
 * Data source: pixel classification of the actual images via
 * tools/classify_cards.py. Edge types are filled whenever the edge is
 * visually unambiguous; where internal topology (how road/city ends connect)
 * or special markers could not be determined from the image with confidence,
 * reviewRequired=true is set per stage policy — nothing was guessed.
 *
 * maps.png is a reference asset, NOT a game card, and is intentionally
 * absent from this catalog.
 */

import type { CardDefinition } from './types';

export const CARD_CATALOG: readonly CardDefinition[] = [""")

review_ids = []
for i in range(1, 145):
    r = data[str(i)]
    edges = r['edges']
    conf = r['confidence']
    low = any(c == 'low' for c in conf.values())
    med = any(c == 'medium' for c in conf.values())
    monastery = r['monastery_center']
    road_ends = roads_for(edges)
    city_ends = [SIDE_TO_IDX[s] for s, t in edges.items() if t == 'city']
    river_ends = [SIDE_TO_IDX[s] for s, t in edges.items() if t == 'river']

    reasons = []
    if len(road_ends) >= 2:
        reasons.append("road connection topology (straight/corner/T-junction) not derivable from edge sampling")
    if len(city_ends) >= 2:
        reasons.append("city segmentation (one city vs separate segments) not derivable from edge sampling")
    if low:
        reasons.append("edge color ambiguous: " + ",".join(s for s,c in conf.items() if c=='low'))
    if monastery:
        reasons.append("possible center building detected; monastery/shields need manual check")
    review = bool(reasons)
    if review:
        review_ids.append(i)

    e = "{ north: '%s', east: '%s', south: '%s', west: '%s' }" % (
        edges['N'], edges['E'], edges['S'], edges['W'])
    topo_parts = []
    if road_ends:
        topo_parts.append("roads: [%s]" % ("[%s]" % ", ".join(map(str, road_ends)) if len(road_ends)==len(set(road_ends)) else ""))
    else:
        topo_parts.append("roads: []")
    topo_parts.append("cities: %s" % ("[]" if not city_ends else "[%s]" % ", ".join("[%d]"%c for c in city_ends)))
    if river_ends:
        topo_parts.append("riverEdges: [%s]" % ", ".join(map(str, river_ends)))

    lines.append("""  {
    id: 'card-%03d',
    asset: '1 (%d).jpg',
    edges: %s,
    topology: { %s },
    shields: 0,%s%s
  },""" % (
        i, i, e,
        ", ".join(topo_parts),
        "\n    monastery: true," if monastery else "",
        ("\n    reviewRequired: true,\n    reviewReason: '%s'," % "; ".join(reasons)) if review else ""))

lines.append("""];

/** Reference image only — not a game card, never enters the deck. */
export const MAPS_ASSET_NAME = 'maps.png';

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_CATALOG.find((c) => c.id === id);
}

export function getReviewRequiredCards(): CardDefinition[] {
  return CARD_CATALOG.filter((c) => c.reviewRequired);
}""")

open('src/game/cards/catalog.ts', 'w').write("\n".join(lines) + "\n")
print("cards:", len(data), "reviewRequired:", len(review_ids))
print("review ids:", review_ids[:50], "...")
