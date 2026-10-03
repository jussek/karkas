import type { LobbyVisibility, OnlineLobbyDirectoryEntry, OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';

export type LobbyTimerFilter = 'any' | OnlineTurnTimerSeconds;
export function onlineBrowserAvailability(client: unknown): 'available' | 'unavailable' { return client ? 'available' : 'unavailable'; }

export function filterLobbies(lobbies: readonly OnlineLobbyDirectoryEntry[], filter: LobbyTimerFilter): OnlineLobbyDirectoryEntry[] {
  return lobbies.filter((lobby) => lobby.status === 'waiting' && (filter === 'any' || lobby.turnTimerSeconds === filter));
}

export function formatLobbyTimer(seconds: OnlineTurnTimerSeconds): string {
  return seconds === 0 ? 'Без таймера' : `Ход: ${seconds} сек`;
}

export function lobbyDisplayName(lobby: { name: string | null; code?: string; visibility?: LobbyVisibility }): string {
  if (lobby.name?.trim()) return lobby.name.trim();
  if (lobby.code) return `Лобби #${lobby.code}`;
  return lobby.visibility === 'private' ? 'Закрытое лобби' : 'Открытое лобби';
}

export function lobbyPlayerCount(lobby: Pick<OnlineLobbyDirectoryEntry, 'playerCount'> | Pick<OnlineLobbySnapshot, 'players'>): number {
  return 'playerCount' in lobby ? lobby.playerCount : lobby.players.length;
}

export function isLobbyJoinable(lobby: { status: OnlineLobbySnapshot['status']; maxPlayers: number; playerCount?: number; players?: readonly unknown[] }): boolean {
  const count = lobby.playerCount ?? lobby.players?.length ?? 0;
  return lobby.status === 'waiting' && count < lobby.maxPlayers;
}

export function lobbyJoinLabel(lobby: { status: OnlineLobbySnapshot['status']; maxPlayers: number; visibility?: LobbyVisibility; playerCount?: number; players?: readonly unknown[] }, joining = false): string {
  if (joining) return 'Подключение…';
  if (lobby.status !== 'waiting') return 'Игра началась';
  if (!isLobbyJoinable(lobby)) return 'Заполнено';
  return lobby.visibility === 'private' ? 'Ввести код' : 'Присоединиться';
}

export function lobbyThumbnailSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
