/**
 * Stage 4C — таймер хода (UI/browser слой, чистые pure-хелперы).
 *
 * Контракт:
 * - таймер НЕ принимает gameplay-решений: timeout не рисует плитку,
 *   не вращает, не подтверждает, не ставит meeple и НЕ вызывает endTurn;
 * - reset только при реальном переходе хода (turnNumber/currentPlayer);
 * - disabled (seconds === 0): running=false, remaining=0, expired=false.
 */

export interface MatchTimerState {
  durationSeconds: number;
  remainingSeconds: number;
  running: boolean;
  expired: boolean;
}

/** Новый таймер. seconds === 0 → выключен. */
export function createMatchTimer(seconds: number): MatchTimerState {
  const duration = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  if (duration === 0) {
    return { durationSeconds: 0, remainingSeconds: 0, running: false, expired: false };
  }
  return { durationSeconds: duration, remainingSeconds: duration, running: true, expired: false };
}

/** Один тик (1 сек). После expiry состояние неизменно, remaining не уходит в минус. */
export function tickMatchTimer(state: MatchTimerState): MatchTimerState {
  if (!state.running || state.durationSeconds === 0) return state;
  if (state.remainingSeconds <= 0) {
    return state.expired ? state : { ...state, expired: true };
  }
  const remainingSeconds = state.remainingSeconds - 1;
  return { ...state, remainingSeconds, expired: remainingSeconds === 0 };
}

export function pauseMatchTimer(state: MatchTimerState): MatchTimerState {
  if (!state.running) return state;
  return { ...state, running: false };
}

/** Возобновляет с того же remaining; expired-таймер остаётся expired на нуле. */
export function resumeMatchTimer(state: MatchTimerState): MatchTimerState {
  if (state.durationSeconds === 0 || state.running) return state;
  return { ...state, running: true };
}

/** Полный сброс к конфигурированной длительности (новый ход). */
export function resetMatchTimer(seconds: number): MatchTimerState {
  return createMatchTimer(seconds);
}

/** Формат ⏱ MM:SS для HUD. */
export function formatTimerRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Pure seams (используются GamePage и тестами без тяжёлого React)     */
/* ------------------------------------------------------------------ */

/**
 * Seam «тик истёк»: возвращает тот же flow БЕЗ изменений.
 * Timeout сознательно НЕ дергает engine actions — см. контракт выше.
 */
export function onTimerExpiredFlow<T>(flow: T): T {
  return flow;
}

/**
 * Reset-policy seam: таймер сбрасывается ТОЛЬКО когда authoritative
 * идентификатор хода (turnNumber/currentPlayerIndex) изменился.
 * Любые другие изменения flow (draw/place/rotate/confirm/meeple) — нет.
 */
export function matchTimerAfterFlowChange(
  timer: MatchTimerState,
  prevTurnKey: string,
  nextTurnKey: string,
): { timer: MatchTimerState; turnKey: string } {
  if (nextTurnKey === prevTurnKey) return { timer, turnKey: prevTurnKey };
  return { timer: resetMatchTimer(timer.durationSeconds), turnKey: nextTurnKey };
}

/** Идентификатор authoritative хода для reset-policy. */
export function turnKeyOf(turnNumber: number, currentPlayerIndex: number): string {
  return `${turnNumber}:${currentPlayerIndex}`;
}

/** Оставшиеся карты РЕКИ ещё НЕ взятые из deck (плитка в руке не считается). */
export function getRemainingRiverTiles(flow: { riverDeck: readonly unknown[] }): number {
  return Math.max(0, flow.riverDeck.length);
}

/** Оставшиеся ЗЕМНЫЕ карты ещё НЕ взятые из deck (в руке — не считается; discard не возвращается). */
export function getRemainingLandTiles(flow: { landDeck: readonly unknown[] }): number {
  return Math.max(0, flow.landDeck.length);
}
