import { PLAYER_SEAT_COLORS, playerSeatColor } from '../../../game/playerColors';
import { SEAT_COLORS as SERVER_SEAT_COLORS } from '../../../../api/_lib/matchCore';
import { SEAT_COLORS as LOBBY_SEAT_COLORS } from '../onlineLobbyModel';

describe('six-player seat colours', () => {
  it('uses one stable order from lobby through match start', () => {
    expect(PLAYER_SEAT_COLORS).toEqual(['blue', 'red', 'green', 'yellow', 'purple', 'black']);
    expect(LOBBY_SEAT_COLORS).toBe(PLAYER_SEAT_COLORS);
    expect(SERVER_SEAT_COLORS).toBe(PLAYER_SEAT_COLORS);
  });

  it('maps all six seats and keeps a safe fallback', () => {
    expect(Array.from({ length: 6 }, (_, seat) => playerSeatColor(seat))).toEqual([
      'blue', 'red', 'green', 'yellow', 'purple', 'black',
    ]);
    expect(playerSeatColor(99)).toBe('black');
  });
});
