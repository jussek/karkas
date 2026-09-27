import { CARD_CATALOG } from './catalog';
import { AUDITED_051_100 } from './audited051100';
import { AUDITED_101_144 } from './audited101144';
import type { CardDefinition } from './types';

/**
 * Stage 3H canonical visual audit.
 * Cards 001..050 were re-read directly from the user-supplied JPG archive.
 * Edge order in topology is N=0, E=1, S=2, W=3.
 * Crossroads split roads into independent road features, as they terminate a road.
 * Blue coat-of-arms shields are scoring shields; expansion/edition badges are ignored.
 * The legacy catalog is an import/source layer only. Runtime consumers use
 * GAME_CARD_CATALOG, which excludes only the user-removed card 106.
 * Card 106 is intentionally removed from the game by product decision; card 105 remains.
 */
const AUDITED_001_050: readonly CardDefinition[] = [
  { id:'card-001', asset:'1 (1).jpg', edges:{north:'city',east:'city',south:'field',west:'field'}, topology:{roads:[],cities:[[0,1]],cityShields:[0]}, shields:0 },
  { id:'card-002', asset:'1 (2).jpg', edges:{north:'city',east:'field',south:'city',west:'city'}, topology:{roads:[],cities:[[0,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-003', asset:'1 (3).jpg', edges:{north:'city',east:'city',south:'road',west:'city'}, topology:{roads:[[2]],cities:[[0,1,3]],cityShields:[0]}, shields:0 },
  { id:'card-004', asset:'1 (4).jpg', edges:{north:'field',east:'city',south:'city',west:'road'}, topology:{roads:[[3]],cities:[[1,2]],cityShields:[0]}, shields:0 },
  { id:'card-005', asset:'1 (5).jpg', edges:{north:'road',east:'road',south:'city',west:'field'}, topology:{roads:[[0,1]],cities:[[2]],cityShields:[0]}, shields:0 },
  { id:'card-006', asset:'1 (6).jpg', edges:{north:'road',east:'field',south:'road',west:'field'}, topology:{roads:[[0,2]],cities:[]}, shields:0 },
  { id:'card-007', asset:'1 (7).jpg', edges:{north:'city',east:'field',south:'field',west:'field'}, topology:{roads:[],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-008', asset:'1 (8).jpg', edges:{north:'road',east:'field',south:'road',west:'field'}, topology:{roads:[[0,2]],cities:[]}, shields:0 },
  { id:'card-009', asset:'1 (9).jpg', edges:{north:'field',east:'field',south:'road',west:'road'}, topology:{roads:[[2,3]],cities:[]}, shields:0 },
  { id:'card-010', asset:'1 (10).jpg', edges:{north:'road',east:'road',south:'road',west:'road'}, topology:{roads:[[0],[1],[2],[3]],cities:[]}, shields:0 },
  { id:'card-011', asset:'1 (11).jpg', edges:{north:'city',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-012', asset:'1 (12).jpg', edges:{north:'field',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[]}, shields:0 },
  { id:'card-013', asset:'1 (13).jpg', edges:{north:'city',east:'road',south:'city',west:'road'}, topology:{roads:[[1],[3]],cities:[[0,2]],cityShields:[0]}, shields:0 },
  { id:'card-014', asset:'1 (14).jpg', edges:{north:'road',east:'road',south:'city',west:'road'}, topology:{roads:[[0],[1],[3]],cities:[[2]],cityShields:[0]}, shields:0 },
  { id:'card-015', asset:'1 (15).jpg', edges:{north:'city',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[0,3],[1,2]],cityShields:[0,0]}, shields:0 },
  { id:'card-016', asset:'1 (16).jpg', edges:{north:'city',east:'city',south:'field',west:'field'}, topology:{roads:[],cities:[[0,1]],cityShields:[1]}, shields:1 },
  { id:'card-017', asset:'1 (17).jpg', edges:{north:'city',east:'field',south:'road',west:'road'}, topology:{roads:[[2,3]],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-018', asset:'1 (18).jpg', edges:{north:'road',east:'road',south:'road',west:'road'}, topology:{roads:[[0],[1],[2],[3]],cities:[]}, shields:0 },
  { id:'card-019', asset:'1 (19).jpg', edges:{north:'road',east:'field',south:'city',west:'road'}, topology:{roads:[[0,3]],cities:[[2]],cityShields:[0]}, shields:0 },
  { id:'card-020', asset:'1 (20).jpg', edges:{north:'field',east:'road',south:'road',west:'field'}, topology:{roads:[[1,2]],cities:[]}, shields:0 },
  { id:'card-021', asset:'1 (21).jpg', edges:{north:'city',east:'field',south:'field',west:'field'}, topology:{roads:[],cities:[[0]],cityShields:[0],monastery:true}, shields:0 },
  { id:'card-022', asset:'1 (22).jpg', edges:{north:'field',east:'field',south:'road',west:'road'}, topology:{roads:[[2,3]],cities:[]}, shields:0 },
  { id:'card-023', asset:'1 (23).jpg', edges:{north:'road',east:'road',south:'city',west:'road'}, topology:{roads:[[0],[1],[3]],cities:[[2]],cityShields:[0]}, shields:0 },
  { id:'card-024', asset:'1 (24).jpg', edges:{north:'field',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[]}, shields:0 },
  { id:'card-025', asset:'1 (25).jpg', edges:{north:'city',east:'road',south:'city',west:'city'}, topology:{roads:[[1]],cities:[[0,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-026', asset:'1 (26).jpg', edges:{north:'city',east:'road',south:'road',west:'road'}, topology:{roads:[[1],[2],[3]],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-027', asset:'1 (27).jpg', edges:{north:'city',east:'field',south:'city',west:'city'}, topology:{roads:[],cities:[[0,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-028', asset:'1 (28).jpg', edges:{north:'city',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[0,1,2,3]],cityShields:[1]}, shields:1 },
  { id:'card-029', asset:'1 (29).jpg', edges:{north:'field',east:'city',south:'city',west:'field'}, topology:{roads:[],cities:[[1,2]],cityShields:[1]}, shields:1 },
  { id:'card-030', asset:'1 (30).jpg', edges:{north:'city',east:'field',south:'field',west:'road'}, topology:{roads:[[3]],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-031', asset:'1 (31).jpg', edges:{north:'field',east:'road',south:'road',west:'field'}, topology:{roads:[[1,2]],cities:[]}, shields:0 },
  { id:'card-032', asset:'1 (32).jpg', edges:{north:'city',east:'field',south:'field',west:'field'}, topology:{roads:[],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-033', asset:'1 (33).jpg', edges:{north:'city',east:'field',south:'city',west:'city'}, topology:{roads:[],cities:[[0,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-034', asset:'1 (34).jpg', edges:{north:'field',east:'city',south:'field',west:'city'}, topology:{roads:[],cities:[[1],[3]],cityShields:[0,0]}, shields:0 },
  { id:'card-035', asset:'1 (35).jpg', edges:{north:'city',east:'city',south:'road',west:'city'}, topology:{roads:[[2]],cities:[[0,1,3]],cityShields:[0]}, shields:0 },
  { id:'card-036', asset:'1 (36).jpg', edges:{north:'city',east:'city',south:'field',west:'city'}, topology:{roads:[],cities:[[0,1,3]],cityShields:[0]}, shields:0 },
  { id:'card-037', asset:'1 (37).jpg', edges:{north:'city',east:'field',south:'city',west:'field'}, topology:{roads:[],cities:[[0],[2]],cityShields:[0,0]}, shields:0 },
  { id:'card-038', asset:'1 (38).jpg', edges:{north:'city',east:'field',south:'city',west:'field'}, topology:{roads:[],cities:[[0,2]],cityShields:[1]}, shields:1 },
  { id:'card-039', asset:'1 (39).jpg', edges:{north:'city',east:'field',south:'city',west:'field'}, topology:{roads:[],cities:[[0,2]],cityShields:[0]}, shields:0 },
  { id:'card-040', asset:'1 (40).jpg', edges:{north:'city',east:'city',south:'city',west:'road'}, topology:{roads:[[3]],cities:[[0],[1,2]],cityShields:[0,0]}, shields:0 },
  { id:'card-041', asset:'1 (41).jpg', edges:{north:'field',east:'field',south:'field',west:'field'}, topology:{roads:[],cities:[],monastery:true}, shields:0 },
  { id:'card-042', asset:'1 (42).jpg', edges:{north:'city',east:'field',south:'city',west:'field'}, topology:{roads:[],cities:[[0],[2]],cityShields:[0,0]}, shields:0 },
  { id:'card-043', asset:'1 (43).jpg', edges:{north:'city',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[0,1,2,3]],cityShields:[1]}, shields:1 },
  { id:'card-044', asset:'1 (44).jpg', edges:{north:'city',east:'field',south:'city',west:'field'}, topology:{roads:[],cities:[[0],[2]],cityShields:[0,0]}, shields:0 },
  { id:'card-045', asset:'1 (45).jpg', edges:{north:'city',east:'field',south:'field',west:'field'}, topology:{roads:[],cities:[[0]],cityShields:[0],monastery:true}, shields:0 },
  { id:'card-046', asset:'1 (46).jpg', edges:{north:'city',east:'field',south:'city',west:'city'}, topology:{roads:[],cities:[[0,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-047', asset:'1 (47).jpg', edges:{north:'city',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[0,1,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-048', asset:'1 (48).jpg', edges:{north:'city',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[0,1,2,3]],cityShields:[0]}, shields:0 },
  { id:'card-049', asset:'1 (49).jpg', edges:{north:'field',east:'city',south:'field',west:'field'}, topology:{roads:[],cities:[[1]],cityShields:[0]}, shields:0 },
  { id:'card-050', asset:'1 (50).jpg', edges:{north:'city',east:'field',south:'city',west:'city'}, topology:{roads:[],cities:[[0,2,3]],cityShields:[1]}, shields:1 },
] as const;

const AUDITED_BY_ID = new Map<string, CardDefinition>([
  ...AUDITED_001_050,
  ...AUDITED_051_100,
  ...AUDITED_101_144,
].map((card) => [card.id, card]));

/**
 * Authoritative Stage 3H runtime catalog.
 *
 * Overrides below record the final product audit: 091/133 are the sole river
 * terminals and 096 is a land tile with decorative pond artwork. Gardens and
 * edition badges intentionally have no semantic representation.
 */
export const GAME_CARD_CATALOG: readonly CardDefinition[] = CARD_CATALOG
  .filter((card) => card.id !== 'card-106')
  .map((legacy) => AUDITED_BY_ID.get(legacy.id) ?? legacy)
  .map((card): CardDefinition => {
    if (card.id === 'card-091') return {
      ...card,
      edges: { north: 'field', east: 'field', south: 'river', west: 'field' },
      topology: { roads: [], cities: [], riverEdges: [2] },
      shields: 0,
      riverCard: true,
      riverKind: 'start',
    };
    if (card.id === 'card-096') return {
      ...card,
      edges: { north: 'road', east: 'field', south: 'road', west: 'field' },
      topology: { roads: [[0, 2]], cities: [] },
      shields: 0,
      riverCard: undefined,
      riverKind: undefined,
    };
    return card;
  });
const AUDITED_BY_ID = new Map(AUDITED_001_050.map((card) => [card.id, card]));

/** Runtime base catalog: audited cards override legacy pixel guesses; only card-106 is absent. */
export const GAME_CARD_CATALOG: readonly CardDefinition[] = CARD_CATALOG
  .filter((card) => card.id !== 'card-106')
  .map((card) => AUDITED_BY_ID.get(card.id) ?? card);

export const AUDITED_CARD_IDS_001_050: readonly string[] = AUDITED_001_050.map((card) => card.id);
