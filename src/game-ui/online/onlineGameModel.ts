import type { MeeplePlacement, Rotation, TilePosition } from '../../game/types/geometry';
import type { OnlineMatch, OnlineMatchIntent } from '../../online/matchTypes';

export interface TilePlacementDraft { position: TilePosition; rotation: Rotation; expectedVersion: number }
export interface OnlineDraftState { tileDraft: TilePlacementDraft | null; meepleDraft: MeeplePlacement | null }
export const EMPTY_ONLINE_DRAFTS:OnlineDraftState={tileDraft:null,meepleDraft:null};
export function selectTileDraft(match:OnlineMatch,position:TilePosition):TilePlacementDraft|null{const option=match.snapshot.derived.legalTilePlacementOptions.find(item=>item.position.x===position.x&&item.position.y===position.y);return option?{position:{...position},rotation:option.rotations[0],expectedVersion:match.version}:null;}
export function rotateTileDraft(match:OnlineMatch,draft:TilePlacementDraft):TilePlacementDraft{const option=match.snapshot.derived.legalTilePlacementOptions.find(item=>item.position.x===draft.position.x&&item.position.y===draft.position.y);if(!option||option.rotations.length<2)return draft;const index=option.rotations.indexOf(draft.rotation);return {...draft,rotation:option.rotations[(index+1)%option.rotations.length]};}
export function reconcileMatch(current:OnlineMatch,incoming:OnlineMatch,drafts:OnlineDraftState):{match:OnlineMatch;drafts:OnlineDraftState;changed:boolean}{if(incoming.version<current.version)return {match:current,drafts,changed:false};const changed=incoming.version>current.version;return {match:incoming,drafts:changed?EMPTY_ONLINE_DRAFTS:drafts,changed};}
export function shouldPromptSkipMeeple(legalCount:number,available:number,meepleDraft:MeeplePlacement|null):'blocked'|'prompt'|'submit'{if(meepleDraft)return 'blocked';return legalCount>0&&available>0?'prompt':'submit';}
export function currentPlayerId(match:OnlineMatch):string|undefined{return match.snapshot.game.players[match.snapshot.game.currentPlayerIndex]?.id;}
export function availableMeeples(match:OnlineMatch,userId:string):number{return match.snapshot.game.meeples.filter(m=>m.playerId===userId&&!m.position).length;}
export function tileIntent(draft:TilePlacementDraft):OnlineMatchIntent{return {type:'PLACE_TILE',position:draft.position,rotation:draft.rotation};}
export function isServerUndoIntent(intent:OnlineMatchIntent):boolean{return !['PLACE_TILE','PLACE_MEEPLE','END_TURN'].includes(intent.type);}
export class LogicalIntentAttempt { readonly intentId:string; constructor(readonly intent:OnlineMatchIntent,makeId:()=>string){this.intentId=makeId();} }
