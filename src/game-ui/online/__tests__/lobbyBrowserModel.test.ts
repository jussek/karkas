import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OnlineLobbySnapshot } from '../../../online/types';
import { filterLobbies, formatLobbyTimer, isLobbyJoinable, lobbyDisplayName, lobbyJoinLabel, lobbyThumbnailSeed, onlineBrowserAvailability } from '../lobbyBrowserModel';
import { onlineNavigationTarget } from '../onlineNavigation';

function lobby(timer: 0 | 15 | 30 | 60, overrides: Partial<OnlineLobbySnapshot> = {}): OnlineLobbySnapshot {
  return { id: `id-${timer}`, code: `CODE${timer}`, hostUserId: 'host', name: `Lobby ${timer}`, visibility: 'public', status: 'waiting', maxPlayers: 4, turnTimerSeconds: timer, botSlots: 0, botFillEnabled: false, createdAt: '', updatedAt: '', players: [], ...overrides };
}

describe('online lobby browser model', () => {
  const lobbies = [lobby(0), lobby(15), lobby(30), lobby(60)];
  it('FILTER_ANY', () => expect(filterLobbies(lobbies, 'any')).toEqual(lobbies));
  it.each([0, 15, 30, 60] as const)('filters timer %s', (timer) => expect(filterLobbies(lobbies, timer)).toEqual([lobby(timer)]));
  it('removes stale non-waiting lobbies from cached results',()=>expect(filterLobbies([lobby(15),lobby(15,{id:'stale',status:'in_game'})],'any')).toEqual([lobby(15)]));
  it('uses lobby code when name is null', () => expect(lobbyDisplayName(lobby(0, { name: null, code: '2458AB' }))).toBe('Лобби #2458AB'));
  it('formats timer labels', () => {
    expect([0, 15, 30, 60].map((value) => formatLobbyTimer(value as 0 | 15 | 30 | 60))).toEqual(['Без таймера', 'Ход: 15 сек', 'Ход: 30 сек', 'Ход: 60 сек']);
  });
  it('handles open, full, bot-filled, and stale lobbies', () => {
    expect(isLobbyJoinable(lobby(0))).toBe(true);
    expect(lobbyJoinLabel(lobby(0))).toBe('Присоединиться');
    expect(isLobbyJoinable(lobby(0, { maxPlayers: 2, players: [{}, {}] as never }))).toBe(false);
    expect(lobbyJoinLabel(lobby(0, { maxPlayers: 2, players: [{}, {}] as never }))).toBe('Заполнено');
    expect(isLobbyJoinable(lobby(0, { maxPlayers: 3, botSlots: 2, botFillEnabled: true, players: [{}] as never }))).toBe(true);
    expect(lobbyJoinLabel(lobby(0, { status: 'in_game' }))).toBe('Игра началась');
  });
  it('reports missing Supabase and produces stable thumbnail seeds', () => {
    expect(onlineBrowserAvailability(null)).toBe('unavailable');
    expect(onlineBrowserAvailability({})).toBe('available');
    expect(lobbyThumbnailSeed('ABC')).toBe(lobbyThumbnailSeed('ABC'));
    expect(lobbyThumbnailSeed('ABC')).not.toBe(lobbyThumbnailSeed('ABD'));
  });
  it('keeps local migration filenames synchronized with hosted history', () => {
    const files = readdirSync(join(process.cwd(), 'supabase/migrations')).sort();
    expect(files).toEqual([
      '20261001131523_stage5a_online_lobbies.sql',
      '20261001132230_stage5a_lobby_performance.sql',
      '20261001143130_stage5c_real_online_lobby.sql',
      '20261001143823_stage5c1_lobby_consistency.sql',
      '20261002062013_stage5d1_authoritative_match_core.sql',
      '20261002062148_stage5d1_match_performance.sql',
      '20261002081931_stage5d3_timer_automation.sql',
    ]);
    expect(files).not.toContain('20261001150000_stage5c_real_online_lobby.sql');
    expect(files).not.toContain('20261002090000_stage5d1_authoritative_match_core.sql');
  });
  it('maps menu, back, create, and successful join navigation', () => {
    expect(onlineNavigationTarget('find')).toBe('online-browser');
    expect(onlineNavigationTarget('back')).toBe('menu');
    expect(onlineNavigationTarget('create')).toBe('online-create');
    expect(onlineNavigationTarget('joined')).toBe('online-lobby');
  });
});
