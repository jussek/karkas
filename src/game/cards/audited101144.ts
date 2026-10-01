import type { CardDefinition } from './types';

/** Manual visual audit of the user-supplied archive, cards 101..144.
 * Topology edge order: N=0, E=1, S=2, W=3.
 * Card 106 is intentionally excluded by product decision.
 * White expansion badges and garden artwork are not gameplay features.
 */
export const AUDITED_101_144: readonly CardDefinition[] = [
  { id:'card-101', asset:'1 (101).jpg', edges:{north:'field',east:'river',south:'road',west:'river'}, topology:{roads:[[2]],cities:[],monastery:true,riverEdges:[1,3]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-102', asset:'1 (102).jpg', edges:{north:'field',east:'river',south:'river',west:'field'}, topology:{roads:[],cities:[],riverEdges:[1,2]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-103', asset:'1 (103).jpg', edges:{north:'field',east:'field',south:'field',west:'road'}, topology:{roads:[[3]],cities:[]}, shields:0 },
  { id:'card-104', asset:'1 (104).jpg', edges:{north:'road',east:'road',south:'field',west:'field'}, topology:{roads:[[0,1]],cities:[]}, shields:0 },
  { id:'card-105', asset:'1 (105).jpg', edges:{north:'road',east:'field',south:'city',west:'field'}, topology:{roads:[[0]],cities:[[2]],cityShields:[0]}, shields:0 },
  { id:'card-107', asset:'1 (107).jpg', edges:{north:'field',east:'river',south:'field',west:'river'}, topology:{roads:[],cities:[],riverEdges:[1,3]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-108', asset:'1 (108).jpg', edges:{north:'road',east:'river',south:'road',west:'river'}, topology:{roads:[[0,2]],cities:[],riverEdges:[1,3]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-109', asset:'1 (109).jpg', edges:{north:'river',east:'field',south:'field',west:'river'}, topology:{roads:[],cities:[],riverEdges:[0,3]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-110', asset:'1 (110).jpg', edges:{north:'road',east:'river',south:'city',west:'river'}, topology:{roads:[[0]],cities:[[2]],cityShields:[0],riverEdges:[1,3]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-111', asset:'1 (111).jpg', edges:{north:'field',east:'river',south:'river',west:'field'}, topology:{roads:[],cities:[],riverEdges:[1,2]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-112', asset:'1 (112).jpg', edges:{north:'field',east:'field',south:'field',west:'city'}, topology:{roads:[],cities:[[3]],cityShields:[0]}, shields:0 },
  { id:'card-113', asset:'1 (113).jpg', edges:{north:'road',east:'road',south:'field',west:'city'}, topology:{roads:[[0,1]],cities:[[3]],cityShields:[0]}, shields:0 },
  { id:'card-114', asset:'1 (114).jpg', edges:{north:'city',east:'city',south:'field',west:'road'}, topology:{roads:[[3]],cities:[[0,1]],cityShields:[0]}, shields:0 },
  { id:'card-115', asset:'1 (115).jpg', edges:{north:'field',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[]}, shields:0 },
  { id:'card-116', asset:'1 (116).jpg', edges:{north:'field',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[]}, shields:0 },
  { id:'card-117', asset:'1 (117).jpg', edges:{north:'city',east:'field',south:'field',west:'city'}, topology:{roads:[],cities:[[0,3]],cityShields:[1]}, shields:1 },
  { id:'card-118', asset:'1 (118).jpg', edges:{north:'field',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[1,2,3]],cityShields:[1]}, shields:1 },
  { id:'card-119', asset:'1 (119).jpg', edges:{north:'city',east:'city',south:'field',west:'city'}, topology:{roads:[],cities:[[0,1,3]],cityShields:[0]}, shields:0 },
  { id:'card-120', asset:'1 (120).jpg', edges:{north:'road',east:'city',south:'road',west:'city'}, topology:{roads:[[0],[2]],cities:[[1,3]],cityShields:[0]}, shields:0 },
  { id:'card-121', asset:'1 (121).jpg', edges:{north:'river',east:'road',south:'river',west:'road'}, topology:{roads:[[1,3]],cities:[],riverEdges:[0,2]}, shields:0, riverCard:true, riverKind:'middle' },
  { id:'card-122', asset:'1 (122).jpg', edges:{north:'city',east:'city',south:'road',west:'field'}, topology:{roads:[[2]],cities:[[0,1]],cityShields:[0]}, shields:0 },
  { id:'card-123', asset:'1 (123).jpg', edges:{north:'city',east:'field',south:'field',west:'city'}, topology:{roads:[],cities:[[0,3]],cityShields:[0]}, shields:0 },
  { id:'card-124', asset:'1 (124).jpg', edges:{north:'road',east:'city',south:'field',west:'field'}, topology:{roads:[[0]],cities:[[1]],cityShields:[0]}, shields:0 },
  { id:'card-125', asset:'1 (125).jpg', edges:{north:'city',east:'field',south:'road',west:'road'}, topology:{roads:[[2,3]],cities:[[0]],cityShields:[0]}, shields:0 },
  { id:'card-126', asset:'1 (126).jpg', edges:{north:'road',east:'road',south:'city',west:'city'}, topology:{roads:[[0,1]],cities:[[2,3]],cityShields:[0]}, shields:0 },
  { id:'card-127', asset:'1 (127).jpg', edges:{north:'road',east:'city',south:'field',west:'road'}, topology:{roads:[[0,3]],cities:[[1]],cityShields:[0]}, shields:0 },
  { id:'card-128', asset:'1 (128).jpg', edges:{north:'field',east:'road',south:'road',west:'road'}, topology:{roads:[[1,2,3]],cities:[],monastery:true}, shields:0 },
  { id:'card-129', asset:'1 (129).jpg', edges:{north:'field',east:'road',south:'field',west:'city'}, topology:{roads:[[1]],cities:[[3]],cityShields:[0]}, shields:0 },
  { id:'card-130', asset:'1 (130).jpg', edges:{north:'field',east:'city',south:'field',west:'city'}, topology:{roads:[],cities:[[1],[3]],cityShields:[0,0]}, shields:0 },
  { id:'card-131', asset:'1 (131).jpg', edges:{north:'road',east:'city',south:'city',west:'road'}, topology:{roads:[[0,3]],cities:[[1,2]],cityShields:[0]}, shields:0 },
  { id:'card-132', asset:'1 (132).jpg', edges:{north:'field',east:'road',south:'road',west:'field'}, topology:{roads:[[1,2]],cities:[]}, shields:0 },
  { id:'card-133', asset:'1 (133).jpg', edges:{north:'field',east:'field',south:'river',west:'field'}, topology:{roads:[],cities:[],riverEdges:[2]}, shields:0, riverCard:true, riverKind:'start' },
  { id:'card-134', asset:'1 (134).jpg', edges:{north:'city',east:'city',south:'city',west:'field'}, topology:{roads:[],cities:[[0,1,2]],cityShields:[0]}, shields:0 },
  { id:'card-135', asset:'1 (135).jpg', edges:{north:'road',east:'field',south:'city',west:'city'}, topology:{roads:[[0]],cities:[[2,3]],cityShields:[0]}, shields:0 },
  { id:'card-136', asset:'1 (136).jpg', edges:{north:'city',east:'city',south:'road',west:'road'}, topology:{roads:[[2,3]],cities:[[0,1]],cityShields:[1]}, shields:1 },
  { id:'card-137', asset:'1 (137).jpg', edges:{north:'city',east:'road',south:'city',west:'road'}, topology:{roads:[[1,3]],cities:[[0],[2]],cityShields:[0,0]}, shields:0 },
  { id:'card-138', asset:'1 (138).jpg', edges:{north:'road',east:'road',south:'field',west:'field'}, topology:{roads:[[0,1]],cities:[]}, shields:0 },
  { id:'card-139', asset:'1 (139).jpg', edges:{north:'field',east:'road',south:'road',west:'road'}, topology:{roads:[[1,2,3]],cities:[],monastery:true}, shields:0 },
  { id:'card-140', asset:'1 (140).jpg', edges:{north:'road',east:'road',south:'field',west:'field'}, topology:{roads:[[0,1]],cities:[]}, shields:0 },
  { id:'card-141', asset:'1 (141).jpg', edges:{north:'road',east:'field',south:'field',west:'road'}, topology:{roads:[[0,3]],cities:[]}, shields:0 },
  { id:'card-142', asset:'1 (142).jpg', edges:{north:'field',east:'road',south:'field',west:'road'}, topology:{roads:[[1,3]],cities:[]}, shields:0 },
  { id:'card-143', asset:'1 (143).jpg', edges:{north:'field',east:'road',south:'road',west:'city'}, topology:{roads:[[1,2]],cities:[[3]],cityShields:[0]}, shields:0 },
  { id:'card-144', asset:'1 (144).jpg', edges:{north:'field',east:'city',south:'city',west:'city'}, topology:{roads:[],cities:[[1,2,3]],cityShields:[1]}, shields:1 },
] as const;

export const AUDITED_CARD_IDS_101_144: readonly string[] = AUDITED_101_144.map((card) => card.id);
