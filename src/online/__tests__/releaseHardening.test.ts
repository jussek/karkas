import { readFileSync } from 'node:fs';
import { audioRuntimeState,configureAudio } from '../../audio/gameAudio';

describe('Stage 5F release hardening',()=>{
  it('keeps audio lazy until a user gesture',()=>{configureAudio({soundEnabled:true,musicEnabled:true});expect(audioRuntimeState()).toEqual({unlocked:false,contextCreated:false,musicNodes:0});});
  it('keeps the authenticated scheduler endpoint without an unsupported Hobby cron cadence',()=>{const vercel=JSON.parse(readFileSync('vercel.json','utf8'));expect(vercel.crons??[]).toEqual([]);const cron=readFileSync('api/online/match/cron.ts','utf8');expect(cron).toContain('CRON_SECRET');expect(cron).toContain('Bearer ${expected}');expect(readFileSync('src/vite-env.d.ts','utf8')).not.toContain('CRON_SECRET');});
  it('health response exposes configuration booleans but not secret values',()=>{const source=readFileSync('api/health.ts','utf8');expect(source).toContain('supabaseConfigured');expect(source).toContain('automationSecretConfigured');expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY:');});
  it('production E2E is opt-in and exact-ID cleanup is mandatory',()=>{const script=readFileSync('tools/production-e2e.mjs','utf8');expect(script).toContain('E2E_SUPABASE_SERVICE_ROLE_KEY');expect(script).toContain(".eq(column,id)");expect(script).not.toMatch(/delete\(\)(?!\.eq)/);expect(JSON.parse(readFileSync('package.json','utf8')).scripts.build).not.toContain('e2e:production');});
  it('loading and reconnect recovery have controlled user paths',()=>{const loading=readFileSync('src/game-ui/loading/GameLoadingScreen.tsx','utf8'),game=readFileSync('src/game-ui/online/OnlineGamePage.tsx','utf8');expect(loading).toContain('Не удалось загрузить игру');expect(loading).toContain('Повторить');expect(game).toContain("visibilitychange");expect(game).toContain("addEventListener('online'");expect(game).toContain('clearActiveMatch()');});
});
