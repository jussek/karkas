import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { pumpDueMatches } from '../../_lib/automationBatch.js';
import { type ApiRequest,type ApiResponse,sendError } from '../../_lib/http.js';

export default async function handler(request:ApiRequest,response:ApiResponse):Promise<void>{
  try{
    if(request.method!=='GET')throw Object.assign(new Error('Method not allowed.'),{status:405,code:'METHOD_NOT_ALLOWED'});
    const expected=process.env.CRON_SECRET;const authorization=typeof request.headers.authorization==='string'?request.headers.authorization:'';
    if(!expected||authorization!==`Bearer ${expected}`)throw Object.assign(new Error('Authorization required.'),{status:401,code:'UNAUTHORIZED'});
    const batch=await pumpDueMatches(getSupabaseAdmin());response.status(200).json({ok:true,processed:batch.processed});
  }catch(error){sendError(response,error);}
}
