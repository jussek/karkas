import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TURN_TIMER_OPTIONS, createLocalSetupConfig } from '../../game-ui/setup/GameSetupPage';
import type { LocalGameConfig } from '../../game/session';
import { canActorUpdateLobby, canHostStartLobby, lobbyFromDto, type OnlineMatchReference } from '../types';
import { getSupabaseClient, readOnlineEnvironment, resetSupabaseClientForTests } from '../supabaseClient';

const lobbyRow = { id: 'lobby-id', code: 'ABC123', host_user_id: 'host', name: null, visibility: 'public', status: 'waiting', max_players: 4, turn_timer_seconds: 30, bot_slots: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
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
    expect(canHostStartLobby({ ...lobby, botSlots: 3 }, 'host')).toBe(false);
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

  it('migration enables RLS and restricts identity, seat, and host mutation', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261001000000_stage5a_online_lobbies.sql'), 'utf8');
    expect(sql).toContain('alter table public.online_lobbies enable row level security');
    expect(sql).toContain('alter table public.online_lobby_players enable row level security');
    expect(sql).toContain('grant update (ready) on public.online_lobby_players to authenticated');
    expect(sql).toContain("status='waiting'");
    expect(sql).toContain('host_user_id=auth.uid()');
    expect((sql.match(/create policy/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
