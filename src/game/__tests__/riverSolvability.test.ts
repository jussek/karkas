import { describe, expect, it } from 'vitest';
import { getCardDefinition } from '../cards/catalogApi';
import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { createTurnFlow, drawTurnTile, placeTurnTile, confirmTurnTilePlacement, endTurn, getLegalTilePlacementOptions, rotatePositionedTurnTile } from '../engine/turnFlow';
import { countOpenRiverEdges, frontiersOf, planRiver } from '../deck/riverPlanner';
import type { Board } from '../types/state';

const SOURCE_ID = 'card-133';
const END_ID = 'card-106';
const MIDDLE = ['card-053','card-054','card-055','card-067','card-079','card-088','card-090','card-091','card-099','card-100','card-101','card-102','card-107','card-108','card-110','card-111','card-121'];
function sourceBoard(): Board { return {'0,0':{definitionId:SOURCE_ID,rotation:0,position:{x:0,y:0}}}; }

describe('canonical single-frontier river', () => {
  it('derives 133 + 17 middle + 106 and rejects removed 109', () => {
    const river=RUNTIME_CARD_CATALOG.filter(c=>c.riverCard);
    expect(river).toHaveLength(19);
    expect(river.filter(c=>c.riverKind==='middle').map(c=>c.id).sort()).toEqual([...MIDDLE].sort());
    expect(()=>getCardDefinition('card-109')).toThrow('Unknown card definition');
  });
  it('plans deterministic closed rivers for 1000 seeds', () => {
    for(let seed=0;seed<1000;seed++){
      const plan=planRiver(seed,sourceBoard());
      expect(plan).toHaveLength(18); expect(plan[plan.length - 1]?.cardId).toBe(END_ID);
      expect(new Set(plan.map(x=>x.cardId)).size).toBe(18);
      expect(plan.slice(0,-1).map(x=>x.cardId).sort()).toEqual([...MIDDLE].sort());
      expect(planRiver(seed,sourceBoard())).toEqual(plan);
      let board=sourceBoard();
      for(const step of plan) board={...board,[`${step.position.x},${step.position.y}`]:{definitionId:step.cardId,rotation:step.rotation,position:step.position}};
      expect(frontiersOf(board)).toHaveLength(0); expect(countOpenRiverEdges(board)).toBe(0);
    }
  }, 120000);
  it('plays a complete river through real turn APIs before land', () => {
    let flow=createTurnFlow({gameId:'stress',players:[{id:'p1',name:'P1',color:'red',score:0}],seed:42});
    expect(Object.values(flow.game.board)).toHaveLength(1); expect(flow.riverPlaced).toBe(1);
    const used:string[]=[];
    while(flow.riverPlaced<19){ flow=drawTurnTile(flow); const id=flow.game.drawnTileDefinitionId!; used.push(id); const option=getLegalTilePlacementOptions(flow,id)[0]; expect(option).toBeTruthy(); flow=placeTurnTile(flow,option.position); while(flow.rotation!==option.rotations[0]) flow=rotatePositionedTurnTile(flow); flow=confirmTurnTilePlacement(flow); flow=endTurn(flow); }
    expect(used.slice(0,-1).sort()).toEqual([...MIDDLE].sort()); expect(used[used.length - 1]).toBe(END_ID); expect(flow.discardedTileIds).toEqual([]);
    expect(frontiersOf(flow.game.board)).toHaveLength(0); expect(countOpenRiverEdges(flow.game.board)).toBe(0);
    flow=drawTurnTile(flow); expect(getCardDefinition(flow.game.drawnTileDefinitionId!).riverCard).not.toBe(true);
  });
});
