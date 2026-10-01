import { ensureOnlineIdentity } from './auth';
import { requireSupabaseClient } from './supabaseClient';
import { lobbyFromDto, type CreateLobbyInput, type OnlineLobbySnapshot, type UpdateLobbySettingsInput } from './types';

const selectLobby = '*, online_lobby_players(*)';
function convert(row: Record<string, unknown>): OnlineLobbySnapshot {
  return lobbyFromDto(row, Array.isArray(row.online_lobby_players) ? row.online_lobby_players : []);
}
async function rpcLobby(name: string, args: Record<string, unknown>): Promise<OnlineLobbySnapshot> {
  await ensureOnlineIdentity();
  const { data, error } = await requireSupabaseClient().rpc(name, args);
  if (error) throw error;
  return getLobby(String(data));
}
export async function listPublicLobbies(): Promise<OnlineLobbySnapshot[]> {
  await ensureOnlineIdentity();
  const { data, error } = await requireSupabaseClient().from('online_lobbies').select(selectLobby).eq('visibility', 'public').eq('status', 'waiting').order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => convert(row));
}
export async function createLobby(input: CreateLobbyInput): Promise<OnlineLobbySnapshot> {
  return rpcLobby('create_online_lobby', { p_name: input.name?.trim() || null, p_visibility: input.visibility, p_max_players: input.maxPlayers, p_turn_timer_seconds: input.turnTimerSeconds, p_bot_fill_enabled: input.botFillEnabled, p_display_name: input.displayName?.trim() || null });
}
export async function joinLobby(lobbyId: string, displayName?: string): Promise<OnlineLobbySnapshot> { return rpcLobby('join_online_lobby', { p_lobby_id: lobbyId, p_display_name: displayName?.trim() || null }); }
export async function joinLobbyByCode(code: string, displayName?: string): Promise<OnlineLobbySnapshot> { return rpcLobby('join_online_lobby_by_code', { p_code: code.trim().toUpperCase(), p_display_name: displayName?.trim() || null }); }
export async function leaveLobby(lobbyId: string): Promise<void> { await ensureOnlineIdentity(); const { error } = await requireSupabaseClient().rpc('leave_online_lobby', { p_lobby_id: lobbyId }); if (error) throw error; }
export async function setReady(lobbyId: string, ready: boolean): Promise<void> {
  const userId = await ensureOnlineIdentity();
  const { error } = await requireSupabaseClient()
    .from('online_lobby_players')
    .update({ ready })
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId);
  if (error) throw error;
}
export async function updateLobbySettings(lobbyId: string, settings: UpdateLobbySettingsInput): Promise<OnlineLobbySnapshot> { return rpcLobby('update_online_lobby_settings', { p_lobby_id: lobbyId, p_settings: settings }); }
export async function getLobby(lobbyId: string): Promise<OnlineLobbySnapshot> { await ensureOnlineIdentity(); const { data, error } = await requireSupabaseClient().from('online_lobbies').select(selectLobby).eq('id', lobbyId).single(); if (error) throw error; return convert(data); }

export async function startLobby(lobbyId: string): Promise<OnlineLobbySnapshot> { return rpcLobby('start_online_lobby', { p_lobby_id: lobbyId }); }

/** Stage 5D will create the authoritative online match after a lobby starts. */
export async function startMatch(_lobbyId: string): Promise<never> { throw new Error('Online match creation is reserved for Stage 5D.'); }
