#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const required=['E2E_BASE_URL','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','E2E_SUPABASE_SERVICE_ROLE_KEY'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length)throw new Error(`Refusing to start: missing ${missing.join(', ')}. The service-role input is required solely to guarantee exact-ID cleanup.`);
const base=process.env.E2E_BASE_URL.replace(/\/$/,'');
const publicClient=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const cleanupClient=createClient(process.env.VITE_SUPABASE_URL,process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let lobbyId=null,matchId=null;
async function rpc(name,args){const {data,error}=await publicClient.rpc(name,args);if(error)throw error;return data;}
async function post(path,token,body){const response=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});const payload=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${payload.code??payload.message??'failed'}`);return payload;}
async function remove(table,column,id){const {error}=await cleanupClient.from(table).delete().eq(column,id);if(error)throw error;}
async function cleanup(){if(matchId){await remove('online_match_actions','match_id',matchId);await remove('online_match_states','match_id',matchId);await remove('online_match_players','match_id',matchId);await remove('online_matches','id',matchId);}if(lobbyId){await remove('online_lobby_messages','lobby_id',lobbyId);await remove('online_lobby_players','lobby_id',lobbyId);await remove('online_lobbies','id',lobbyId);}}
try{
 const {data,error}=await publicClient.auth.signInAnonymously();if(error||!data.session)throw error??new Error('Anonymous session unavailable');const token=data.session.access_token;
 lobbyId=String(await rpc('create_online_lobby',{p_name:'__karkas_release_e2e__',p_visibility:'private',p_max_players:2,p_turn_timer_seconds:15,p_bot_fill_enabled:true,p_display_name:'Release E2E'}));
 await rpc('set_online_lobby_ready',{p_lobby_id:lobbyId,p_ready:true});await rpc('start_online_lobby',{p_lobby_id:lobbyId});
 let match=await post('/api/online/match/start',token,{lobbyId});matchId=match.id;
 const legal=match.snapshot?.derived?.legalTilePlacementOptions?.[0];if(!legal)throw new Error('No legal tile placement in public snapshot');
 const place={matchId,expectedVersion:match.version,intentId:crypto.randomUUID(),intent:{type:'PLACE_TILE',position:legal.position,rotation:legal.rotations[0]}};
 const placed=await post('/api/online/match/action',token,place);const duplicate=await post('/api/online/match/action',token,place);if(!duplicate.idempotent)throw new Error('Intent replay was not idempotent');
 const ended=await post('/api/online/match/action',token,{matchId,expectedVersion:placed.match.version,intentId:crypto.randomUUID(),intent:{type:'END_TURN'}});
 const pumped=await post('/api/online/match/pump',token,{matchId});if(!pumped.processed)throw new Error('Bot pump did not process');
 const {data:reconnected,error:readError}=await publicClient.from('online_matches').select('id,version,status').eq('id',matchId).single();if(readError||reconnected.id!==matchId)throw readError??new Error('Reconnect read failed');
 console.info(JSON.stringify({ok:true,lobbyId,matchId,versionBefore:ended.match.version,versionAfter:reconnected.version,cleanup:'pending'}));
}finally{await cleanup();if(lobbyId)console.info(JSON.stringify({event:'cleanup',lobbyId,matchId,ok:true}));}
