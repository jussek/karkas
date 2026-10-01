import type { RealtimeChannel } from '@supabase/supabase-js';
import { getLobby } from './lobbyApi';
import { requireSupabaseClient } from './supabaseClient';
import type { OnlineLobbySnapshot } from './types';

type Callback = (lobby: OnlineLobbySnapshot | null, error?: Error) => void;
interface SharedSubscription { channel: RealtimeChannel; callbacks: Set<Callback>; refresh: () => void }
const subscriptions = new Map<string, SharedSubscription>();

export function subscribeToLobby(lobbyId: string, callback: Callback): () => void {
  let shared = subscriptions.get(lobbyId);
  if (!shared) {
    const callbacks = new Set<Callback>();
    let running = false;
    let pending = false;
    const refresh = () => {
      if (running) { pending = true; return; }
      running = true;
      void getLobby(lobbyId).then((lobby) => callbacks.forEach((cb) => cb(lobby))).catch((reason: unknown) => callbacks.forEach((cb) => cb(null, reason instanceof Error ? reason : new Error(String(reason))))).finally(() => { running = false; if (pending) { pending = false; refresh(); } });
    };
    const channel = requireSupabaseClient().channel(`online-lobby:${lobbyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'online_lobbies', filter: `id=eq.${lobbyId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'online_lobby_players', filter: `lobby_id=eq.${lobbyId}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    shared = { channel, callbacks, refresh };
    subscriptions.set(lobbyId, shared);
  }
  shared.callbacks.add(callback);
  shared.refresh();
  return () => {
    const current = subscriptions.get(lobbyId);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size === 0) { subscriptions.delete(lobbyId); void requireSupabaseClient().removeChannel(current.channel); }
  };
}
