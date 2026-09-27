import { applyAction } from '../../game/engine/gameEngine';
import { getLegalMeeplePlacements } from '../../game/rules/localFeatures';
import type { MeeplePlacement, TileDefinition } from '../../game/types/geometry';
import type { ActionResult, GameState } from '../../game/types/state';

export interface MeeplePlacementUiState {
  meeplePlacementMode: boolean;
  selectedMeepleTarget: MeeplePlacement | null;
}

export const INITIAL_MEEPLE_PLACEMENT_UI: MeeplePlacementUiState = {
  meeplePlacementMode: false,
  selectedMeepleTarget: null,
};

export function toggleMeeplePlacementMode(state: MeeplePlacementUiState): MeeplePlacementUiState {
  return state.meeplePlacementMode
    ? INITIAL_MEEPLE_PLACEMENT_UI
    : { meeplePlacementMode: true, selectedMeepleTarget: null };
}

export function selectMeepleTarget(
  state: MeeplePlacementUiState,
  target: MeeplePlacement,
): MeeplePlacementUiState {
  if (!state.meeplePlacementMode) return state;
  return { ...state, selectedMeepleTarget: { ...target } };
}

export function legalMeepleTargets(
  state: GameState,
  getDefinition: (id: string) => TileDefinition,
): MeeplePlacement[] {
  return getLegalMeeplePlacements(state, getDefinition);
}

/** Commits the optional preview and completes scoring/turn advancement atomically for UI callers. */
export function finalizeMeepleTurn(
  state: GameState,
  selected: MeeplePlacement | null,
  getDefinition: (id: string) => TileDefinition,
): ActionResult {
  const player = state.players[state.currentPlayerIndex];
  const last = state.lastPlacedTile;
  if (!player || !last) {
    return applyAction(state, { type: 'SKIP_MEEPLE', playerId: player?.id ?? '' }, getDefinition);
  }
  const decision = selected
    ? applyAction(state, {
        type: 'PLACE_MEEPLE',
        playerId: player.id,
        position: last.position,
        featureType: selected.featureType,
        edge: selected.edge,
      }, getDefinition)
    : applyAction(state, { type: 'SKIP_MEEPLE', playerId: player.id }, getDefinition);
  if (!decision.ok) return decision;
  return applyAction(decision.state, { type: 'COMPLETE_TURN', playerId: player.id }, getDefinition);
}
