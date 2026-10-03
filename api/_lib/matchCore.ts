import { getTileDefinition } from '../../src/game/cards/catalogApi.js';
import { canEndTurn, confirmTurnTilePlacement, createTurnFlow, drawTurnTile, endTurn, getLegalTilePlacementOptions, hasAnyLegalTilePlacement, placeTurnTile, replaceUnplayableTurnTile, rotatePositionedTurnTile, selectTurnMeeple, type TurnFlowState } from '../../src/game/engine/turnFlow.js';
import { getLegalMeeplePlacements } from '../../src/game/rules/localFeatures.js';
import type { Player } from '../../src/game/types/state.js';
import type { OnlineMatchIntent, OnlinePublicMatchSnapshot } from '../../src/online/matchTypes.js';

export class MatchIntentError extends Error { constructor(public code:string,message:string,public status=409){super(message);} }
export function assertActorTurn(flow:TurnFlowState,actorUserId:string,roster:ReadonlyArray<{playerId:string;userId:string|null;isBot:boolean}>):void{
  if(!roster.some(player=>player.userId===actorUserId&&!player.isBot))throw new MatchIntentError('FORBIDDEN','Actor is not a match participant.',403);
  const currentId=flow.game.players[flow.game.currentPlayerIndex]?.id;
  const current=roster.find(player=>player.playerId===currentId);
  if(current?.isBot)throw new MatchIntentError('BOT_TURN','Waiting for a bot turn.',423);
  if(currentId!==actorUserId)throw new MatchIntentError('TURN_OWNERSHIP','It is another player’s turn.',403);
}
export function advanceToPlayableDraw(input:TurnFlowState):TurnFlowState{
  let flow=input.phase==='AWAITING_DRAW'?drawTurnTile(input):input;
  while(flow.phase==='TILE_IN_HAND'&&flow.game.drawnTileDefinitionId&&!hasAnyLegalTilePlacement(flow)){
    const next=replaceUnplayableTurnTile(flow);if(next===flow)break;flow=next;
  }
  return flow;
}
export function buildPublicMatchSnapshot(flow:TurnFlowState):OnlinePublicMatchSnapshot{
  const {game}=flow;
  return {game:{gameId:game.gameId,status:game.status,players:game.players.map(p=>({...p})),board:Object.fromEntries(Object.entries(game.board).map(([key,tile])=>[key,{...tile,position:{...tile.position}}])),currentPlayerIndex:game.currentPlayerIndex,turnNumber:game.turnNumber,scores:{...game.scores},meeples:game.meeples.map(m=>({...m,position:m.position?{...m.position}:null,placement:m.placement?{...m.placement}:null})),gamePhase:game.gamePhase,drawnTileDefinitionId:game.drawnTileDefinitionId,lastPlacedTile:game.lastPlacedTile?{...game.lastPlacedTile,position:{...game.lastPlacedTile.position}}:null},flow:{phase:flow.phase,riverPlaced:flow.riverPlaced,lastResolution:flow.lastResolution},derived:{legalTilePlacementOptions:getLegalTilePlacementOptions(flow),legalMeeplePlacements:flow.phase==='TILE_PLACED'||flow.phase==='MEEPLE_SELECTION'?getLegalMeeplePlacements(flow.game,getTileDefinition):[],canEndTurn:canEndTurn(flow)}};
}
export function applyOnlineMatchIntent(flow:TurnFlowState,intent:OnlineMatchIntent):TurnFlowState{
  if(flow.phase==='GAME_OVER')throw new MatchIntentError('MATCH_FINISHED','Match is already finished.');
  if(intent.type==='PLACE_TILE'){
    let next=placeTurnTile(flow,intent.position);if(next.phase!=='TILE_POSITIONED'||!next.positionedRotations.includes(intent.rotation))throw new MatchIntentError('ILLEGAL_PLACEMENT','Requested tile placement is illegal.',400);
    for(let steps=0;next.rotation!==intent.rotation&&steps<4;steps++)next=rotatePositionedTurnTile(next);
    if(next.rotation!==intent.rotation)throw new MatchIntentError('ILLEGAL_PLACEMENT','Requested rotation is illegal.',400);
    next=confirmTurnTilePlacement(next);if(next.phase!=='TILE_PLACED')throw new MatchIntentError('ILLEGAL_PLACEMENT','Tile placement was rejected.',400);return next;
  }
  if(intent.type==='PLACE_MEEPLE'){
    const next=selectTurnMeeple(flow,{featureType:intent.featureType,edge:intent.edge});if(next===flow||next.phase!=='MEEPLE_SELECTION')throw new MatchIntentError('ILLEGAL_MEEPLE','Meeple placement was rejected.',400);return next;
  }
  if(intent.type==='END_TURN'){
    const next=endTurn(flow);if(next===flow)throw new MatchIntentError('ILLEGAL_PHASE','Turn cannot end in the current phase.',400);return next.phase==='GAME_OVER'?next:advanceToPlayableDraw(next);
  }
  throw new MatchIntentError('INVALID_INTENT','Unsupported match intent.',400);
}
export const SEAT_COLORS=['blue','red','green','yellow','purple','black'] as const;
export interface RosterSource {seatIndex:number;userId:string|null;displayName:string;isBot:boolean}
export function buildEnginePlayers(matchId:string,humans:ReadonlyArray<Omit<RosterSource,'isBot'>>,maxPlayers:number,botSlots:number):{players:Player[];roster:RosterSource[]} {
 const occupied=new Map(humans.map(h=>[h.seatIndex,{...h,isBot:false}]));let bot=1;for(let seat=0;seat<maxPlayers&&bot<=botSlots;seat++)if(!occupied.has(seat))occupied.set(seat,{seatIndex:seat,userId:null,displayName:`Бот ${bot++}`,isBot:true});
 const roster=[...occupied.values()].sort((a,b)=>a.seatIndex-b.seatIndex);return {roster,players:roster.map(r=>({id:r.userId??`bot:${matchId}:${r.seatIndex}`,name:r.displayName,color:SEAT_COLORS[r.seatIndex]??'black',score:0}))};
}
export { createTurnFlow };
