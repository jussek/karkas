import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceToPlayableDraw,createTurnFlow } from '../../../api/_lib/matchCore';
import { chooseAutomationIntent,firstLegalMeepleIntent,firstLegalTileIntent } from '../../../api/_lib/matchAutomation';
import { applyOnlineMatchIntent } from '../../../api/_lib/matchCore';
import { clearActiveMatch,loadActiveMatch,saveActiveMatch } from '../activeMatchPersistence';
import { deadlineFor,formatCountdown,remainingSeconds } from '../timerModel';

class MemoryStorage { private data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}removeItem(key:string){this.data.delete(key);} }

describe('Stage 5D.3 timer, automation and reconnect',()=>{
  it.each([0,15,30,60] as const)('TIMER_%s deadline contract',(seconds)=>{
    const start='2026-10-02T00:00:00.000Z',deadline=deadlineFor(start,seconds);
    expect(deadline).toBe(seconds===0?null:new Date(Date.parse(start)+seconds*1000).toISOString());
  });
  it('formats a server-derived countdown without mutating state',()=>{expect(remainingSeconds('2026-10-02T00:00:15Z',Date.parse('2026-10-02T00:00:01Z'))).toBe(14);expect(formatCountdown(14)).toBe('00:14');});
  it('ACTIVE_MATCH_ID_PERSISTED and stale reference can be cleared',()=>{const storage=new MemoryStorage();saveActiveMatch({activeMatchId:'m',lobbyId:'l'},storage);expect(loadActiveMatch(storage)).toEqual({activeMatchId:'m',lobbyId:'l'});clearActiveMatch(storage);expect(loadActiveMatch(storage)).toBeNull();});
  it('bot policy chooses legal intents and completes a full turn',()=>{
    for(let seed=0;seed<100;seed++){
      let flow=advanceToPlayableDraw(createTurnFlow({gameId:`g${seed}`,seed,players:[{id:'bot:g:0',name:'B',color:'blue',score:0},{id:'u',name:'U',color:'red',score:0}]}));
      const player=flow.game.currentPlayerIndex,turn=flow.game.turnNumber,tile=firstLegalTileIntent(flow);expect(tile).not.toBeNull();flow=applyOnlineMatchIntent(flow,tile!);
      const meeple=firstLegalMeepleIntent(flow);if(meeple)flow=applyOnlineMatchIntent(flow,meeple);
      expect(chooseAutomationIntent(flow,'bot')).toEqual({type:'END_TURN'});flow=applyOnlineMatchIntent(flow,{type:'END_TURN'});
      expect(flow.phase==='GAME_OVER'||flow.game.currentPlayerIndex!==player||flow.game.turnNumber>turn).toBe(true);
    }
  });
  it('timeout deterministically places a tile, skips meeple and ends turn',()=>{let flow=advanceToPlayableDraw(createTurnFlow({gameId:'timeout',seed:18,players:[{id:'a',name:'A',color:'blue',score:0},{id:'b',name:'B',color:'red',score:0}]}));const tile=chooseAutomationIntent(flow,'timeout');expect(tile?.type).toBe('PLACE_TILE');flow=applyOnlineMatchIntent(flow,tile!);expect(chooseAutomationIntent(flow,'timeout')).toEqual({type:'END_TURN'});});
  it('migration protects timer races, preserves mid-turn deadline, and logs source',()=>{const sql=readFileSync(join(process.cwd(),'supabase/migrations/20261002100000_stage5d3_timer_automation.sql'),'utf8');for(const contract of ['turn_timer_seconds','turn_deadline_at','p_source=\'human\' and v_deadline is not null and now()>=v_deadline','when p_turn_advanced','source in (\'human\',\'bot\',\'timeout\')','where id=p_match_id for update','list_due_online_matches_server'])expect(sql).toContain(contract);expect(sql).not.toContain('http://');});
  it('keeps automation secret and implementation outside client source',()=>{const env=readFileSync(join(process.cwd(),'.env.example'),'utf8');expect(env).toContain('MATCH_AUTOMATION_SECRET=');const client=readFileSync(join(process.cwd(),'src/online/matchApi.ts'),'utf8');expect(client).not.toContain('MATCH_AUTOMATION_SECRET');expect(client).not.toContain('matchAutomation');});
  it('TURN_EXPIRED clears drafts and participant pump is server-decided',()=>{const page=readFileSync(join(process.cwd(),'src/game-ui/online/OnlineGamePage.tsx'),'utf8'),pump=readFileSync(join(process.cwd(),'api/online/match/pump.ts'),'utf8');expect(page).toContain("error.code==='TURN_EXPIRED'");expect(page).toContain('setDrafts(EMPTY_ONLINE_DRAFTS)');expect(pump).toContain("eq('user_id',actor)");expect(pump).toContain('pumpAuthoritativeMatch');});
});
