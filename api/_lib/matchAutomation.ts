import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TurnFlowState } from '../../src/game/engine/turnFlow';
import type { OnlineMatchIntent } from '../../src/online/matchTypes';
import { applyOnlineMatchIntent, buildPublicMatchSnapshot } from './matchCore';

export type AutomationSource = 'bot' | 'timeout';
type MatchRow = { id:string; version:number; status:string; current_player_id:string|null; turn_deadline_at:string|null };
type RosterRow = { player_id:string; is_bot:boolean };

export function firstLegalTileIntent(flow:TurnFlowState):OnlineMatchIntent|null {
  const options=buildPublicMatchSnapshot(flow).derived.legalTilePlacementOptions
    .flatMap(option=>option.rotations.map(rotation=>({position:option.position,rotation})))
    .sort((a,b)=>a.position.x-b.position.x||a.position.y-b.position.y||a.rotation-b.rotation);
  const selected=options[0];
  return selected?{type:'PLACE_TILE',position:selected.position,rotation:selected.rotation}:null;
}

export function firstLegalMeepleIntent(flow:TurnFlowState):OnlineMatchIntent|null {
  const snapshot=buildPublicMatchSnapshot(flow);
  const player=flow.game.players[flow.game.currentPlayerIndex];
  const hasMeeple=flow.game.meeples.some(meeple=>meeple.playerId===player?.id&&meeple.position===null);
  const selected=hasMeeple?snapshot.derived.legalMeeplePlacements[0]:undefined;
  return selected?{type:'PLACE_MEEPLE',featureType:selected.featureType,edge:selected.edge}:null;
}

export function chooseAutomationIntent(flow:TurnFlowState,source:AutomationSource):OnlineMatchIntent|null {
  if(flow.phase==='GAME_OVER')return null;
  if(flow.phase==='TILE_IN_HAND')return firstLegalTileIntent(flow);
  if(source==='bot'&&flow.phase==='TILE_PLACED')return firstLegalMeepleIntent(flow)??{type:'END_TURN'};
  if(flow.phase==='TILE_PLACED'||flow.phase==='MEEPLE_SELECTION')return {type:'END_TURN'};
  return null;
}

async function load(admin:SupabaseClient,matchId:string):Promise<{match:MatchRow;flow:TurnFlowState;roster:RosterRow[]}> {
  const [matchResult,stateResult,rosterResult]=await Promise.all([
    admin.from('online_matches').select('id,version,status,current_player_id,turn_deadline_at').eq('id',matchId).single(),
    admin.from('online_match_states').select('state').eq('match_id',matchId).single(),
    admin.from('online_match_players').select('player_id,is_bot').eq('match_id',matchId),
  ]);
  if(matchResult.error)throw matchResult.error;if(stateResult.error)throw stateResult.error;if(rosterResult.error)throw rosterResult.error;
  return {match:matchResult.data as MatchRow,flow:stateResult.data.state as TurnFlowState,roster:rosterResult.data as RosterRow[]};
}

export async function pumpAuthoritativeMatch(admin:SupabaseClient,matchId:string,now=Date.now()):Promise<{processed:boolean;version:number}> {
  let loaded=await load(admin,matchId);
  if(loaded.match.status!=='playing')return {processed:false,version:loaded.match.version};
  const initialPlayer=loaded.match.current_player_id;
  const bot=loaded.roster.some(row=>row.player_id===initialPlayer&&row.is_bot);
  const expired=!bot&&!!loaded.match.turn_deadline_at&&now>=Date.parse(loaded.match.turn_deadline_at);
  if(!bot&&!expired)return {processed:false,version:loaded.match.version};
  const source:AutomationSource=bot?'bot':'timeout';let processed=false;
  for(let guard=0;guard<3&&loaded.match.status==='playing'&&loaded.match.current_player_id===initialPlayer;guard++){
    const intent=chooseAutomationIntent(loaded.flow,source);if(!intent)break;
    const next=applyOnlineMatchIntent(loaded.flow,intent),snapshot=buildPublicMatchSnapshot(next);
    const status=next.phase==='GAME_OVER'?'finished':'playing';
    const currentPlayerId=next.game.players[next.game.currentPlayerIndex]?.id??null;
    const committed=await admin.rpc('commit_online_match_transition_server',{
      p_match_id:matchId,p_expected_version:loaded.match.version,p_intent_id:randomUUID(),p_actor_user_id:null,
      p_action_type:intent.type,p_payload:intent,p_state:next,p_snapshot:snapshot,p_current_player_id:currentPlayerId,
      p_turn_number:next.game.turnNumber,p_status:status,p_source:source,p_turn_advanced:intent.type==='END_TURN',
    });
    if(committed.error){if(committed.error.message.includes('VERSION_CONFLICT'))return {processed,version:loaded.match.version};throw committed.error;}
    processed=true;loaded=await load(admin,matchId);
  }
  return {processed,version:loaded.match.version};
}
