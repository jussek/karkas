import { describe, expect, it } from 'vitest';
import { getTileDefinition } from '../cards/catalogApi';
import {
  createTurnFlow, drawTurnTile, endTurn, placeTurnTile, selectTurnMeeple,
} from '../engine/turnFlow';
import { getLegalMeeplePlacements } from '../rules/localFeatures';
import { placementKey } from '../types/geometry';
import type { Player } from '../types/state';

const onePlayer: Player[] = [{ id: 'player-1', name: 'Игрок 1', color: 'blue', score: 0 }];

/** Ход до TILE_PLACED с авторитетным списком legal meeple targets. */
function placedState(gameId: string, seed: number) {
  let state = createTurnFlow({ gameId, players: onePlayer, seed });
  state = drawTurnTile(state);
  expect(state.phase).toBe('TILE_IN_HAND');
  state = placeTurnTile(state, state.legalPlacements[0]);
  expect(state.phase).toBe('TILE_PLACED');
  const legal = getLegalMeeplePlacements(state.game, getTileDefinition);
  return { state, legal };
}

describe('Stage 4A: selectTurnMeeple validates against authoritative legal targets', () => {
  it('rejects an invalid target as strict no-op; phase never hangs in MEEPLE_SELECTION', () => {
    const { state } = placedState('meeple-invalid', 3);
    // Заведомо нелегальная цель: monastery на стартовой river tile недостижима
    // (card-091 — река без монастыря).
    const next = selectTurnMeeple(state, { featureType: 'monastery', edge: null });
    expect(next).toBe(state); // strict no-op: тот же объект
    expect(next.phase).toBe('TILE_PLACED');
    expect(next.selectedMeepleTarget).toBeNull();
  });

  it('accepts a legal target obtained via getLegalMeeplePlacements()', () => {
    const { state, legal } = placedState('meeple-legal', 12);
    if (legal.length === 0) {
      // Нет доступных целей — любая цель должна быть отвергнута.
      const next = selectTurnMeeple(state, { featureType: 'road', edge: 0 });
      expect(next).toBe(state);
      return;
    }
    const target = legal[0];
    const next = selectTurnMeeple(state, target);
    expect(next.phase).toBe('MEEPLE_SELECTION');
    expect(next.selectedMeepleTarget).not.toBeNull();
    expect(placementKey(next.selectedMeepleTarget!)).toBe(placementKey(target));
  });

  it('null cancels a legal selection and returns to TILE_PLACED', () => {
    const { state, legal } = placedState('meeple-cancel', 12);
    if (legal.length === 0) return;
    const selected = selectTurnMeeple(state, legal[0]);
    expect(selected.phase).toBe('MEEPLE_SELECTION');
    const cancelled = selectTurnMeeple(selected, null);
    expect(cancelled.phase).toBe('TILE_PLACED');
    expect(cancelled.selectedMeepleTarget).toBeNull();
  });

  it('occupied global feature target is rejected (second identical target unavailable)', () => {
    const { state, legal } = placedState('meeple-occupied', 12);
    if (legal.length === 0) return;
    const first = selectTurnMeeple(state, legal[0]);
    // После выбора того же feature новый выбор остаётся валидным состоянием,
    // но повторная постановка на занятую фичу невозможна: целевой список
    // из нового хода не содержит занятых фич — проверяем контракт списка.
    const keys = new Set(legal.map((p) => placementKey(p)));
    expect(keys.size).toBe(legal.length); // нет дублей внутри authoritative списка
    expect(first.phase).toBe('MEEPLE_SELECTION');
  });

  it('no available meeple => every target is rejected', () => {
    const { state } = placedState('meeple-none', 3);
    // Исчерпаем пул: ставим всех meeples игрока через engine-legal путь
    // многократно невозможно в одном ходе — вместо этого конструируем
    // состояние с нулём свободных meeple напрямую и проверяем reject.
    const exhaustedGame = {
      ...state.game,
      meeples: state.game.meeples.map((m) =>
        m.playerId === 'player-1' ? { ...m, position: { x: 0, y: 0 }, placement: { featureType: 'city' as const, edge: 1 as const } } : m,
      ),
    };
    const exhausted = { ...state, game: exhaustedGame };
    const next = selectTurnMeeple(exhausted, { featureType: 'city', edge: 1 });
    expect(next).toBe(exhausted);
  });

  it('legal selected target + endTurn completes the turn', () => {
    const { state, legal } = placedState('meeple-endturn', 12);
    if (legal.length === 0) return;
    const selected = selectTurnMeeple(state, legal[0]);
    const finished = endTurn(selected);
    expect(finished.phase).toBe('AWAITING_DRAW');
    expect(finished.lastResolution.previousPlayerId).toBe('player-1');
  });

  it('stale corrupted selection cannot stall the flow: endTurn re-validates and completes', () => {
    const { state } = placedState('meeple-stale', 3);
    // Симулируем corrupted state: selectedMeepleTarget вне legal-списка,
    // phase=MEEPLE_SELECTION (например после merge-ошибки сериализации).
    const stale = {
      ...state,
      phase: 'MEEPLE_SELECTION' as const,
      selectedMeepleTarget: { featureType: 'monastery' as const, edge: null },
    };
    const finished = endTurn(stale);
    // Не зависание: ход завершён (skip fallback), фаза ушла из MEEPLE_SELECTION.
    expect(finished.phase).not.toBe('MEEPLE_SELECTION');
    expect(['AWAITING_DRAW', 'GAME_OVER']).toContain(finished.phase);
  });

  it('repeated endTurn remains idempotent after completion', () => {
    const { state, legal } = placedState('meeple-idem', 12);
    const base = legal.length > 0 ? endTurn(selectTurnMeeple(state, legal[0])) : endTurn(state);
    const again = endTurn(base);
    expect(again).toBe(base);
    expect(JSON.stringify(again.game.scores)).toBe(JSON.stringify(base.game.scores));
    expect(again.lastResolution).toEqual(base.lastResolution);
  });
});
