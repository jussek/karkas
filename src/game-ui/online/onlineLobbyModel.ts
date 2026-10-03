import { PLAYER_SEAT_COLORS } from '../../game/playerColors';
import type { CreateLobbyInput, OnlineLobbyMessage, OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';

export const CREATE_PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;
export const CREATE_TIMER_OPTIONS = [0, 15, 30, 60] as const;
export const DEFAULT_ONLINE_LOBBY: CreateLobbyInput = { visibility: 'public', maxPlayers: 4, turnTimerSeconds: 0, botFillEnabled: false };
export const SEAT_COLORS = PLAYER_SEAT_COLORS;
export function currentLobbyPlayer(lobby: OnlineLobbySnapshot, userId: string) { return lobby.players.find((player) => player.userId === userId); }
export function isLobbyHost(lobby: OnlineLobbySnapshot, userId: string): boolean { return lobby.hostUserId === userId; }
export function startBlockReason(lobby: OnlineLobbySnapshot, userId: string): string | null {
  if (!isLobbyHost(lobby, userId)) return 'Ожидание организатора';
  if (lobby.status !== 'waiting') return 'Игра уже запускается';
  if (lobby.players.some((player) => !player.ready)) return 'Все игроки должны быть готовы';
  if (!lobby.botFillEnabled && lobby.players.length < 2) return 'Нужно минимум 2 игрока';
  if (lobby.botFillEnabled && (lobby.players.length < 1 || lobby.maxPlayers < 2)) return 'Нужно минимум 2 участника';
  return null;
}
export function calculatedBotSlots(lobby: Pick<OnlineLobbySnapshot, 'botFillEnabled'|'maxPlayers'|'players'>): number { return lobby.botFillEnabled ? lobby.maxPlayers - lobby.players.length : 0; }
export function validateChatBody(body: string): string | null { const value=body.trim(); return value.length >= 1 && value.length <= 280 ? value : null; }
export function dedupeMessages(messages: readonly OnlineLobbyMessage[]): OnlineLobbyMessage[] { return [...new Map(messages.map((message)=>[message.id,message])).values()].sort((a,b)=>a.id-b.id).slice(-100); }
export function timerLabel(value: OnlineTurnTimerSeconds): string { return value === 0 ? 'Нет' : `${value} сек`; }
