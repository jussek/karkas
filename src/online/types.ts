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
  botFillEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  players: OnlineLobbyPlayer[];
}

export interface OnlineLobbyDirectoryEntry {
  id: string;
  name: string | null;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  maxPlayers: number;
  turnTimerSeconds: OnlineTurnTimerSeconds;
  botSlots: number;
  botFillEnabled: boolean;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineMatchReference { lobbyId: string; matchId: string; version: number }
export interface CreateLobbyInput {
  name?: string;
  visibility: LobbyVisibility;
  maxPlayers: number;
  turnTimerSeconds: OnlineTurnTimerSeconds;
  botFillEnabled: boolean;
  displayName?: string;
  joinCode?: string;
}
export type UpdateLobbySettingsInput = Partial<Pick<CreateLobbyInput, 'name' | 'visibility' | 'maxPlayers' | 'turnTimerSeconds' | 'botFillEnabled'>>;

export interface OnlineLobbyMessage { id: number; lobbyId: string; userId: string; displayName: string; body: string; createdAt: string }

type Row = Record<string, unknown>;
const stringValue = (row: Row, key: string): string => {
  if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`Invalid lobby DTO: ${key}`);
  return row[key] as string;
};
const integerValue = (row: Row, key: string): number => {
  if (!Number.isInteger(row[key])) throw new Error(`Invalid lobby DTO: ${key}`);
  return row[key] as number;
};
function visibilityValue(value: unknown): LobbyVisibility {
  if (value !== 'public' && value !== 'private') throw new Error('Invalid lobby DTO: visibility');
  return value;
}
function statusValue(value: unknown): LobbyStatus {
  if (!['waiting', 'starting', 'in_game', 'finished', 'closed'].includes(String(value))) throw new Error('Invalid lobby DTO: status');
  return value as LobbyStatus;
}
function timerValue(value: number): OnlineTurnTimerSeconds {
  if (!ONLINE_TIMER_OPTIONS.includes(value as OnlineTurnTimerSeconds)) throw new Error('Invalid lobby DTO: turn_timer_seconds');
  return value as OnlineTurnTimerSeconds;
}

export function lobbyPlayerFromDto(value: unknown): OnlineLobbyPlayer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lobby player DTO');
  const row = value as Row;
  return { lobbyId: stringValue(row, 'lobby_id'), userId: stringValue(row, 'user_id'), seatIndex: integerValue(row, 'seat_index'), displayName: stringValue(row, 'display_name'), ready: row.ready === true, joinedAt: stringValue(row, 'joined_at') };
}

export function lobbyFromDto(value: unknown, players: readonly unknown[] = []): OnlineLobbySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lobby DTO');
  const row = value as Row;
  const visibility = visibilityValue(row.visibility);
  const status = statusValue(row.status);
  const timer = timerValue(integerValue(row, 'turn_timer_seconds'));
  if (typeof row.bot_fill_enabled !== 'boolean') throw new Error('Invalid lobby DTO: bot_fill_enabled');
  return { id: stringValue(row, 'id'), code: stringValue(row, 'code'), hostUserId: stringValue(row, 'host_user_id'), name: row.name === null ? null : stringValue(row, 'name'), visibility, status, maxPlayers: integerValue(row, 'max_players'), turnTimerSeconds: timer, botSlots: integerValue(row, 'bot_slots'), botFillEnabled: row.bot_fill_enabled, createdAt: stringValue(row, 'created_at'), updatedAt: stringValue(row, 'updated_at'), players: players.map(lobbyPlayerFromDto).sort((a, b) => a.seatIndex - b.seatIndex) };
}

export function lobbyDirectoryEntryFromDto(value: unknown): OnlineLobbyDirectoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lobby directory DTO');
  const row = value as Row;
  const visibility = visibilityValue(row.visibility);
  const status = statusValue(row.status);
  const timer = timerValue(integerValue(row, 'turn_timer_seconds'));
  if (typeof row.bot_fill_enabled !== 'boolean') throw new Error('Invalid lobby directory DTO: bot_fill_enabled');
  return { id: stringValue(row, 'id'), name: row.name === null ? null : stringValue(row, 'name'), visibility, status, maxPlayers: integerValue(row, 'max_players'), turnTimerSeconds: timer, botSlots: integerValue(row, 'bot_slots'), botFillEnabled: row.bot_fill_enabled, playerCount: integerValue(row, 'player_count'), createdAt: stringValue(row, 'created_at'), updatedAt: stringValue(row, 'updated_at') };
}

export function canHostStartLobby(lobby: OnlineLobbySnapshot, actorUserId: string): boolean {
  const minimumMet = lobby.botFillEnabled ? lobby.players.length >= 1 && lobby.maxPlayers >= 2 : lobby.players.length >= 2;
  return actorUserId === lobby.hostUserId && lobby.status === 'waiting' && minimumMet && lobby.players.every((p) => p.ready);
}

export function canActorUpdateLobby(lobby: OnlineLobbySnapshot, actorUserId: string): boolean {
  return lobby.status === 'waiting' && lobby.hostUserId === actorUserId;
}
