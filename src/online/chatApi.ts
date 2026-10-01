import { ensureOnlineIdentity } from './auth';
import { requireSupabaseClient } from './supabaseClient';
import type { OnlineLobbyMessage } from './types';

function messageFromDto(row: Record<string, unknown>): OnlineLobbyMessage {
  if (!Number.isInteger(row.id) || typeof row.lobby_id !== 'string' || typeof row.user_id !== 'string' || typeof row.display_name !== 'string' || typeof row.body !== 'string' || typeof row.created_at !== 'string') throw new Error('Invalid lobby message DTO');
  return { id: row.id as number, lobbyId: row.lobby_id, userId: row.user_id, displayName: row.display_name, body: row.body, createdAt: row.created_at };
}
export async function listLobbyMessages(lobbyId: string): Promise<OnlineLobbyMessage[]> {
  await ensureOnlineIdentity();
  const { data, error } = await requireSupabaseClient().from('online_lobby_messages').select('*').eq('lobby_id', lobbyId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map(messageFromDto).reverse();
}
export async function sendLobbyMessage(lobbyId: string, body: string): Promise<void> {
  await ensureOnlineIdentity(); const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 280) throw new RangeError('Message must contain 1..280 characters.');
  const { error } = await requireSupabaseClient().rpc('send_online_lobby_message', { p_lobby_id: lobbyId, p_body: trimmed });
  if (error) throw error;
}
export function mergeLobbyMessages(current: readonly OnlineLobbyMessage[], incoming: readonly OnlineLobbyMessage[]): OnlineLobbyMessage[] {
  return [...new Map([...current, ...incoming].map((message) => [message.id, message])).values()].sort((a, b) => a.id - b.id).slice(-100);
}
export { messageFromDto };
