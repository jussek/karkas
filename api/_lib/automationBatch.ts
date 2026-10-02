import type { SupabaseClient } from '@supabase/supabase-js';
import { pumpAuthoritativeMatch,type PumpResult } from './matchAutomation.js';

export function logPump(mode:'participant'|'scheduler',matchId:string,result:PumpResult):void{
  console.info(JSON.stringify({event:'match_pump',mode,matchId,processed:result.processed,versionBefore:result.versionBefore,versionAfter:result.versionAfter,reason:result.reason}));
}
export async function pumpDueMatches(admin:SupabaseClient):Promise<{processed:number;results:PumpResult[]}>{
  const due=await admin.rpc('list_due_online_matches_server',{p_limit:20});if(due.error)throw due.error;
  const results:PumpResult[]=[];for(const row of due.data as Array<{match_id:string}>){const result=await pumpAuthoritativeMatch(admin,row.match_id);logPump('scheduler',row.match_id,result);results.push(result);}
  return {processed:results.filter(result=>result.processed).length,results};
}
