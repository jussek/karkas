import { getSupabaseAdmin, authenticateBearer } from '../../_lib/supabaseAdmin.js';
import { type ApiRequest,type ApiResponse,requirePost,sendError } from '../../_lib/http.js';
import { pumpAuthoritativeMatch } from '../../_lib/matchAutomation.js';
import { logPump,pumpDueMatches } from '../../_lib/automationBatch.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request:ApiRequest,response:ApiResponse):Promise<void>{
  try{
    requirePost(request);const admin=getSupabaseAdmin();const body=request.body as {matchId?:unknown}|null;
    const schedulerSecret=typeof request.headers['x-karkas-automation-secret']==='string'?request.headers['x-karkas-automation-secret']:undefined;
    const scheduler=!!process.env.MATCH_AUTOMATION_SECRET&&schedulerSecret===process.env.MATCH_AUTOMATION_SECRET;
    if(scheduler){
      if(typeof body?.matchId==='string'&&uuid.test(body.matchId)){const result=await pumpAuthoritativeMatch(admin,body.matchId);logPump('scheduler',body.matchId,result);response.status(200).json(result);return;}
      const batch=await pumpDueMatches(admin);response.status(200).json({processed:batch.processed});return;
    }
    const actor=await authenticateBearer(typeof request.headers.authorization==='string'?request.headers.authorization:undefined);
    if(typeof body?.matchId!=='string'||!uuid.test(body.matchId))throw Object.assign(new Error('Invalid request body.'),{status:400,code:'INVALID_BODY'});
    const member=await admin.from('online_match_players').select('match_id').eq('match_id',body.matchId).eq('user_id',actor).eq('is_bot',false).is('left_at',null).maybeSingle();
    if(member.error)throw member.error;if(!member.data)throw Object.assign(new Error('Actor has left this match.'),{status:403,code:'MATCH_SESSION_ENDED'});
    const result=await pumpAuthoritativeMatch(admin,body.matchId);logPump('participant',body.matchId,result);response.status(200).json(result);
  }catch(error){sendError(response,error);}
}
