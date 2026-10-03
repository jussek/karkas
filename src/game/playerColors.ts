export const PLAYER_SEAT_COLORS = ['blue', 'red', 'green', 'yellow', 'purple', 'black'] as const;

export type PlayerSeatColor = (typeof PLAYER_SEAT_COLORS)[number];

export function playerSeatColor(seatIndex: number): PlayerSeatColor {
  return PLAYER_SEAT_COLORS[seatIndex] ?? 'black';
}
