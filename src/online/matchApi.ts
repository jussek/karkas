import { ensureOnlineIdentity } from './auth';
import { requireSupabaseClient } from './supabaseClient';
import type { OnlineMatch, OnlineMatchActionRequest, OnlineMatchActionResponse, OnlinePublicMatchSnapshot } from './matchTypes';
import { saveActiveMatch } from './activeMatchPersistence';

type MatchRow = { id:string; lobby_id:string; version:number; status:OnlineMatch['status']; current_player_id:string|null; turn_number:number; snapshot:OnlinePublicMatchSnapshot; turn_timer_seconds:OnlineMatch['turnTimerSeconds']; turn_started_at:string|null; turn_deadline_at:string|null; created_at:string; updated_at:string };
const fromRow=(row:MatchRow):OnlineMatch=>({id:row.id,lobbyId:row.lobby_id,version:row.version,status:row.status,currentPlayerId:row.current_player_id,turnNumber:row.turn_number,snapshot:row.snapshot,turnTimerSeconds:row.turn_timer_seconds,turnStartedAt:row.turn_started_at,turnDeadlineAt:row.turn_deadline_at,createdAt:row.created_at,updatedAt:row.updated_at});
async function accessToken():Promise<string>{await ensureOnlineIdentity();const {data,error}=await requireSupabaseClient().auth.getSession();if(error)throw error;if(!data.session?.access_token)throw new Error('Authenticated online session is unavailable.');return data.session.access_token;}
async function post<T>(path:string,body:unknown):Promise<T>{const token=await accessToken();const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});const payload=await response.json() as {code?:string;message?:string};if(!response.ok)throw Object.assign(new Error(payload.message??'Online match request failed.'),{code:payload.code,status:response.status});return payload as T;}
export async function startOnlineMatch(lobbyId:string):Promise<OnlineMatch>{const match=fromRow(await post<MatchRow>('/api/online/match/start',{lobbyId}));saveActiveMatch({activeMatchId:match.id,lobbyId:match.lobbyId});return match;}
export async function submitMatchIntent(request:OnlineMatchActionRequest):Promise<OnlineMatchActionResponse>{const response=await post<{match:MatchRow;idempotent:boolean}>('/api/online/match/action',request);return {match:fromRow(response.match),idempotent:response.idempotent};}
export async function getMatch(matchId:string):Promise<OnlineMatch>{await ensureOnlineIdentity();const {data,error}=await requireSupabaseClient().from('online_matches').select('*').eq('id',matchId).single();if(error)throw error;return fromRow(data as MatchRow);}
export async function getMatchByLobby(lobbyId:string):Promise<OnlineMatch>{await ensureOnlineIdentity();const {data,error}=await requireSupabaseClient().from('online_matches').select('*').eq('lobby_id',lobbyId).single();if(error)throw error;const match=fromRow(data as MatchRow);saveActiveMatch({activeMatchId:match.id,lobbyId:match.lobbyId});return match;}
export async function pumpMatch(matchId:string):Promise<{processed:boolean;version?:number}>{return post('/api/online/match/pump',{matchId});}

export async function setMatchPresence(matchId:string,present:boolean):Promise<void>{
  await ensureOnlineIdentity();
  const {error}=await requireSupabaseClient().rpc('set_online_match_presence',{p_match_id:matchId,p_present:present});
  if(error)throw error;
}

export async function leaveMyOnlineMatches(exceptMatchId:string|null=null):Promise<number>{
  await ensureOnlineIdentity();
  const {data,error}=await requireSupabaseClient().rpc('leave_my_online_matches',{p_except_match_id:exceptMatchId});
  if(error)throw error;
  return Number(data??0);
}

export async function findMyActiveMatch():Promise<OnlineMatch|null>{
  await ensureOnlineIdentity();
  const client=requireSupabaseClient();
  const {data,error}=await client.rpc('find_my_active_online_match_id');
  if(error)throw error;
  if(!data)return null;
  const match=await getMatch(String(data));
  return match.status==='playing'?match:null;
}

export type MatchConnectionStatus='connected'|'reconnecting'|'offline';
export function subscribeToMatch(matchId:string,callback:(match:OnlineMatch|null,error?:Error)=>void,onStatus?:(status:MatchConnectionStatus)=>void):()=>void{
 const client=requireSupabaseClient();let channel:ReturnType<typeof client.channel>|null=null,running=false,pending=false,closed=false,retry=0,timer:ReturnType<typeof setTimeout>|null=null;
 const refresh=()=>{if(running){pending=true;return;}running=true;void getMatch(matchId).then(callback).catch((e:unknown)=>callback(null,e instanceof Error?e:new Error(String(e)))).finally(()=>{running=false;if(pending){pending=false;refresh();}})};
 const connect=()=>{if(closed)return;channel=client.channel(`online-match:${matchId}:${retry}`).on('postgres_changes',{event:'*',schema:'public',table:'online_matches',filter:`id=eq.${matchId}`},refresh).subscribe(status=>{if(closed)return;if(status==='SUBSCRIBED'){retry=0;onStatus?.('connected');refresh();return;}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){onStatus?.(retry>=4?'offline':'reconnecting');if(channel)void client.removeChannel(channel);channel=null;const delay=Math.min(1000*2**retry,15000);retry++;if(timer)clearTimeout(timer);timer=setTimeout(connect,delay);}});};
 connect();return()=>{closed=true;if(timer)clearTimeout(timer);if(channel)void client.removeChannel(channel);};
}
