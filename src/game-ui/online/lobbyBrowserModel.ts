import type { OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';

export type LobbyTimerFilter = 'any' | OnlineTurnTimerSeconds;
export function onlineBrowserAvailability(client: unknown): 'available' | 'unavailable' { return client ? 'available' : 'unavailable'; }

export function filterLobbies(lobbies: readonly OnlineLobbySnapshot[], filter: LobbyTimerFilter): OnlineLobbySnapshot[] {
  return lobbies.filter((lobby) => filter === 'any' || lobby.turnTimerSeconds === filter);
}

export function formatLobbyTimer(seconds: OnlineTurnTimerSeconds): string {
  return seconds === 0 ? 'Без таймера' : `Ход: ${seconds} сек`;
}

export function lobbyDisplayName(lobby: Pick<OnlineLobbySnapshot, 'name' | 'code'>): string {
  return lobby.name?.trim() || `Лобби #${lobby.code}`;
}

export function isLobbyJoinable(lobby: Pick<OnlineLobbySnapshot, 'status' | 'players' | 'botSlots' | 'maxPlayers'>): boolean {
  return lobby.status === 'waiting' && lobby.players.length + lobby.botSlots < lobby.maxPlayers;
}

export function lobbyJoinLabel(lobby: Pick<OnlineLobbySnapshot, 'status' | 'players' | 'botSlots' | 'maxPlayers'>, joining = false): string {
  if (joining) return 'Подключение…';
  if (lobby.status !== 'waiting') return 'Игра началась';
  if (!isLobbyJoinable(lobby)) return 'Заполнено';
  return 'Присоединиться';
}

export function lobbyThumbnailSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
