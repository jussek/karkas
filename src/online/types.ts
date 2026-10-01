export const ONLINE_TIMER_OPTIONS = [0, 15, 30, 60] as const;
export type OnlineTurnTimerSeconds = (typeof ONLINE_TIMER_OPTIONS)[number];
export type LobbyVisibility = 'public' | 'private';
export type LobbyStatus = 'waiting' | 'starting' | 'in_game' | 'finished' | 'closed';

export interface OnlineLobbyPlayer {
  lobbyId: string;
  userId: string;
  seatIndex: number;
  displayName: string;
  ready: boolean;
  joinedAt: string;
}

export interface OnlineLobbySnapshot {
  id: string;
  code: string;
  hostUserId: string;
  name: string | null;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  maxPlayers: number;
  turnTimerSeconds: OnlineTurnTimerSeconds;
  botSlots: number;
  createdAt: string;
  updatedAt: string;
  players: OnlineLobbyPlayer[];
}

export interface OnlineMatchReference { lobbyId: string; matchId: string; version: number }
export interface CreateLobbyInput {
  name?: string;
  visibility: LobbyVisibility;
  maxPlayers: number;
  turnTimerSeconds: OnlineTurnTimerSeconds;
  botSlots: number;
  displayName?: string;
}
export type UpdateLobbySettingsInput = Partial<Pick<CreateLobbyInput, 'name' | 'visibility' | 'maxPlayers' | 'turnTimerSeconds' | 'botSlots'>>;

type Row = Record<string, unknown>;
const stringValue = (row: Row, key: string): string => {
  if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`Invalid lobby DTO: ${key}`);
  return row[key] as string;
};
const integerValue = (row: Row, key: string): number => {
  if (!Number.isInteger(row[key])) throw new Error(`Invalid lobby DTO: ${key}`);
  return row[key] as number;
};

export function lobbyPlayerFromDto(value: unknown): OnlineLobbyPlayer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lobby player DTO');
  const row = value as Row;
  return { lobbyId: stringValue(row, 'lobby_id'), userId: stringValue(row, 'user_id'), seatIndex: integerValue(row, 'seat_index'), displayName: stringValue(row, 'display_name'), ready: row.ready === true, joinedAt: stringValue(row, 'joined_at') };
}

export function lobbyFromDto(value: unknown, players: readonly unknown[] = []): OnlineLobbySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lobby DTO');
  const row = value as Row;
  const visibility = row.visibility;
  const status = row.status;
  const timer = integerValue(row, 'turn_timer_seconds');
  if (visibility !== 'public' && visibility !== 'private') throw new Error('Invalid lobby DTO: visibility');
  if (!['waiting', 'starting', 'in_game', 'finished', 'closed'].includes(String(status))) throw new Error('Invalid lobby DTO: status');
  if (!ONLINE_TIMER_OPTIONS.includes(timer as OnlineTurnTimerSeconds)) throw new Error('Invalid lobby DTO: turn_timer_seconds');
  return { id: stringValue(row, 'id'), code: stringValue(row, 'code'), hostUserId: stringValue(row, 'host_user_id'), name: row.name === null ? null : stringValue(row, 'name'), visibility, status: status as LobbyStatus, maxPlayers: integerValue(row, 'max_players'), turnTimerSeconds: timer as OnlineTurnTimerSeconds, botSlots: integerValue(row, 'bot_slots'), createdAt: stringValue(row, 'created_at'), updatedAt: stringValue(row, 'updated_at'), players: players.map(lobbyPlayerFromDto).sort((a, b) => a.seatIndex - b.seatIndex) };
}

export function canHostStartLobby(lobby: OnlineLobbySnapshot, actorUserId: string): boolean {
  return actorUserId === lobby.hostUserId && lobby.status === 'waiting' && lobby.players.length >= 2 && lobby.players.every((p) => p.ready) && lobby.players.length + lobby.botSlots <= lobby.maxPlayers;
}

export function canActorUpdateLobby(lobby: OnlineLobbySnapshot, actorUserId: string): boolean {
  return lobby.status === 'waiting' && lobby.hostUserId === actorUserId;
}
