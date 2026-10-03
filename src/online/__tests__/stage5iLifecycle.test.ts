import { readFileSync } from 'node:fs';

describe('Stage 5I online session lifecycle',()=>{
  it('keeps one active online presence and leaves the old match only after new lobby entry succeeds',()=>{
    const lobbyApi=readFileSync('src/online/lobbyApi.ts','utf8');
    expect(lobbyApi).toContain('const lobby=await rpcLobby(name,args)');
    expect(lobbyApi).toContain('await leaveMyOnlineMatches()');
    expect(lobbyApi.indexOf('const lobby=await rpcLobby(name,args)')).toBeLessThan(lobbyApi.indexOf('await leaveMyOnlineMatches()'));
  });

  it('heartbeats visible online sessions and leaves on lifecycle cleanup',()=>{
    const app=readFileSync('src/main.tsx','utf8');
    expect(app).toContain('setMatchPresence(onlineMatch.id,true)');
    expect(app).toContain('setInterval(heartbeat,30000)');
    expect(app).toContain("document.visibilityState==='visible'");
    expect(app).toContain('setMatchPresence(onlineMatch.id,false)');
  });

  it('rejects actions and participant pump after a user leaves a match',()=>{
    const action=readFileSync('api/online/match/action.ts','utf8');
    const pump=readFileSync('api/online/match/pump.ts','utf8');
    expect(action).toContain('left_at');
    expect(action).toContain('MATCH_SESSION_ENDED');
    expect(pump).toContain("is('left_at',null)");
    expect(pump).toContain('MATCH_SESSION_ENDED');
  });

  it('abandons empty matches after five minutes via Supabase cron and keeps legacy clients safe',()=>{
    const lifecycle=readFileSync('supabase/migrations/20261003012530_stage5i_match_presence_lifecycle.sql','utf8');
    const compat=readFileSync('supabase/migrations/20261003014933_stage5i_presence_legacy_compat.sql','utf8');
    expect(lifecycle).toContain("'karkas_cleanup_abandoned_matches'");
    expect(lifecycle).toContain("'* * * * *'");
    expect(lifecycle).toContain("interval '5 minutes'");
    expect(compat).toContain('presence_capable boolean not null default false');
    expect(compat).toContain('not mp.presence_capable');
    expect(compat).toContain("mp.presence_capable and coalesce(mp.last_seen_at");
  });
});
