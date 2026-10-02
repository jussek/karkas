import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TURN_TIMER_OPTIONS, createLocalSetupConfig } from '../../game-ui/setup/GameSetupPage';
import type { LocalGameConfig } from '../../game/session';
import { canActorUpdateLobby, canHostStartLobby, lobbyFromDto, type OnlineMatchReference } from '../types';
import { getSupabaseClient, readOnlineEnvironment, resetSupabaseClientForTests } from '../supabaseClient';

const lobbyRow = { id: 'lobby-id', code: 'ABC123', host_user_id: 'host', name: null, visibility: 'public', status: 'waiting', max_players: 4, turn_timer_seconds: 30, bot_slots: 0, bot_fill_enabled: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
const player = (id: string, seat: number, ready = true) => ({ lobby_id: 'lobby-id', user_id: id, seat_index: seat, display_name: `Игрок ${seat + 1}`, ready, joined_at: '2026-10-01T00:00:00Z' });

describe('Stage 5A online foundation', () => {
  it('uses exactly the product timer choices and falls back for legacy values', () => {
    expect(TURN_TIMER_OPTIONS.map(({ value }) => value)).toEqual([0, 15, 30, 60]);
    expect(createLocalSetupConfig({ gameId: 'x', seed: 1, count: 2, matchOptions: { turnTimerSeconds: 15 } }).matchOptions?.turnTimerSeconds).toBe(15);
    expect(createLocalSetupConfig({ gameId: 'x', seed: 1, count: 2, matchOptions: { turnTimerSeconds: 90 } as never }).matchOptions?.turnTimerSeconds).toBe(0);
  });

  it('handles absent/partial/invalid environment without initializing Supabase', () => {
    expect(readOnlineEnvironment({})).toBeNull();
    expect(readOnlineEnvironment({ VITE_SUPABASE_URL: 'not-a-url', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' })).toBeNull();
    expect(readOnlineEnvironment({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' })).toEqual({ url: 'https://example.supabase.co', publishableKey: 'key' });
    resetSupabaseClientForTests();
    expect(getSupabaseClient({})).toBeNull();
    resetSupabaseClientForTests();
  });

  it('validates and converts lobby DTOs with stable seat ordering', () => {
    const lobby = lobbyFromDto(lobbyRow, [player('guest', 1), player('host', 0)]);
    expect(lobby.players.map(({ userId }) => userId)).toEqual(['host', 'guest']);
    expect(() => lobbyFromDto({ ...lobbyRow, turn_timer_seconds: 90 })).toThrow('turn_timer_seconds');
  });

  it('enforces ready and host application-layer rules', () => {
    const lobby = lobbyFromDto(lobbyRow, [player('host', 0), player('guest', 1)]);
    expect(canHostStartLobby(lobby, 'host')).toBe(true);
    expect(canHostStartLobby(lobby, 'guest')).toBe(false);
    expect(canActorUpdateLobby(lobby, 'guest')).toBe(false);
    expect(canActorUpdateLobby(lobby, 'host')).toBe(true);
    expect(canHostStartLobby({ ...lobby, players: [lobby.players[0], { ...lobby.players[1], ready: false }] }, 'host')).toBe(false);
    expect(canHostStartLobby({ ...lobby, botFillEnabled: true, players: [lobby.players[0]] }, 'host')).toBe(true);
  });

  it('keeps local configuration and online references explicitly separate', () => {
    const local: LocalGameConfig = createLocalSetupConfig({ gameId: 'local', seed: 1, count: 2 });
    const online: OnlineMatchReference = { lobbyId: 'lobby', matchId: 'match', version: 1 };
    expect(local).not.toHaveProperty('lobbyId');
    expect(online).not.toHaveProperty('players');
  });
});

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? filesBelow(path) : [path]; });
}

describe('architecture and migration regression', () => {
  it('does not import Supabase from the pure game domain', () => {
    const offenders = filesBelow(join(process.cwd(), 'src/game')).filter((path) => /\b(?:from\s+|import\s*\()['"]@supabase\//.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the service-role admin module out of all browser source', () => {
    const offenders = filesBelow(join(process.cwd(), 'src')).filter((path) => /(?:from\s+|import\s*\()['"][^'"]*api\/_lib\/supabaseAdmin/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(process.cwd(), '.env.example'), 'utf8')).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
  });

  it('migration has hardened schemas, invoker wrappers, grants, and join invariants', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261001131523_stage5a_online_lobbies.sql'), 'utf8');
    const publicFunctions = [...sql.matchAll(/create function public\.[\s\S]*?(?=create function|revoke all on function)/g)].map(([definition]) => definition);
    expect(sql).toContain('create schema if not exists private');
    expect(sql).toContain('private.is_online_lobby_member(p_lobby_id uuid)');
    expect(sql).not.toContain('p_user_id uuid');
    expect(publicFunctions).not.toHaveLength(0);
    expect(publicFunctions.every((definition) => definition.includes('security invoker'))).toBe(true);
    expect(publicFunctions.every((definition) => !definition.includes('security definer'))).toBe(true);
    expect(sql).toContain('alter table public.online_lobbies enable row level security');
    expect(sql).toContain('alter table public.online_lobby_players enable row level security');
    expect(sql).toContain('grant update (ready) on public.online_lobby_players to authenticated');
    expect(sql).toContain("v_visibility = 'private' and not p_allow_private");
    expect(sql).toContain('revoke all on function public.create_online_lobby');
    expect(sql).toContain('from public, anon');
    expect((sql.match(/create policy/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('database tests exercise identities, private joins, capacity, atomicity, and closed state', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/tests/database/online_lobby_security.test.sql'), 'utf8');
    for (const contract of ['anon cannot execute application RPC', 'creator is host', 'private lobby cannot be joined by UUID', 'private lobby can be joined with code', 'repeated join is idempotent even when full', 'bot fill does not reserve waiting seats', 'failed settings update rolls back both values', 'closed lobby rejects joins']) expect(sql).toContain(contract);
  });

  it('setReady uses the serialized member-only RPC instead of a direct table update', () => {
    const source = readFileSync(join(process.cwd(), 'src/online/lobbyApi.ts'), 'utf8');
    const implementation = source.match(/export async function setReady[\s\S]*?\n}/)?.[0] ?? '';
    expect(implementation).toContain("rpc('set_online_lobby_ready'");
    expect(implementation).toContain('p_lobby_id: lobbyId');
    expect(implementation).toContain('p_ready: ready');
    expect(implementation).not.toContain("from('online_lobby_players')");
    expect(implementation).not.toContain('.update(');
  });

  it('keeps the deployed 5C.1 consistency and serialization contract', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261001143823_stage5c1_lobby_consistency.sql'), 'utf8');
    expect(sql).toContain('coalesce(max(seat_index), -1)');
    expect(sql).toContain('v_humans > v_max or v_max_seat >= v_max');
    expect(sql).toContain("raise exception 'configured capacity exceeded'");
    expect(sql).toMatch(/from public\.online_lobbies[\s\S]*?where id=p_lobby_id[\s\S]*?for update;[\s\S]*?if not found or v_status <> 'waiting'/);
    expect(sql).toContain('private.set_online_lobby_ready_impl');
    expect(sql).toContain("and status='waiting'\n  for update");
    expect(sql).toContain('and user_id=auth.uid()');
    expect(sql).toContain('from public,anon');
    expect(sql).toContain('to authenticated');
    expect(sql).not.toMatch(/revoke\s+update\s*\(ready\)/i);
  });
});
