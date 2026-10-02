import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import type { ApiRequest,ApiResponse } from './_lib/http.js';

export default async function handler(request:ApiRequest,response:ApiResponse):Promise<void>{
  if(request.method!=='GET'){response.status(405).json({code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'});return;}
  const supabaseConfigured=Boolean(process.env.SUPABASE_URL?.trim()&&process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const automationSecretConfigured=Boolean(process.env.MATCH_AUTOMATION_SECRET?.trim());
  const cronSecretConfigured=Boolean(process.env.CRON_SECRET?.trim());
  let databaseReady=false;
  if(supabaseConfigured){try{const result=await getSupabaseAdmin().from('online_matches').select('id',{head:true,count:'exact'}).limit(1);databaseReady=!result.error;}catch{databaseReady=false;}}
  const coreReady=supabaseConfigured&&databaseReady;
  const schedulerConfigured=automationSecretConfigured||cronSecretConfigured;
  response.status(coreReady?200:503).json({ok:coreReady,coreReady,schedulerConfigured,supabaseConfigured,automationSecretConfigured,cronSecretConfigured,databaseReady,version:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,12)??'local'});
}
