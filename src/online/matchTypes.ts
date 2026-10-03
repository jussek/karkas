import type { Board, Meeple, Player } from '../game/types/state.js';
import type { LastPlacedTile } from '../game/types/state.js';
import type { MeeplePlacement, Rotation, TilePosition } from '../game/types/geometry.js';
import type { TurnResolution } from '../game/engine/turnResolution.js';

export type OnlineMatchStatus = 'playing' | 'finished' | 'abandoned';
export type OnlineMatchIntent =
  | { type: 'PLACE_TILE'; position: TilePosition; rotation: Rotation }
  | { type: 'PLACE_MEEPLE'; featureType: MeeplePlacement['featureType']; edge: MeeplePlacement['edge'] }
  | { type: 'END_TURN' };

export interface OnlinePublicMatchSnapshot {
  game: {
    gameId: string; status: 'setup' | 'playing' | 'finished'; players: Player[]; board: Board;
    currentPlayerIndex: number; turnNumber: number; scores: Record<string, number>; meeples: Meeple[];
    gamePhase: 'drawTile' | 'placeTile' | 'placeMeeple' | 'scoreFeatures' | 'turnComplete';
    drawnTileDefinitionId: string | null; lastPlacedTile: LastPlacedTile | null;
  };
  flow: {
    phase: 'AWAITING_DRAW' | 'TILE_IN_HAND' | 'TILE_POSITIONED' | 'TILE_PLACED' | 'MEEPLE_SELECTION' | 'GAME_OVER';
    riverPlaced: number;
    remainingTileCount?: number;
    lastResolution: TurnResolution;
  };
  derived: { legalTilePlacementOptions: Array<{ position: TilePosition; rotations: Rotation[] }>; legalMeeplePlacements: MeeplePlacement[]; canEndTurn: boolean };
}
export interface OnlineMatch { id: string; lobbyId: string; version: number; status: OnlineMatchStatus; currentPlayerId: string | null; turnNumber: number; snapshot: OnlinePublicMatchSnapshot; turnTimerSeconds:0|15|30|60; turnStartedAt:string|null; turnDeadlineAt:string|null; createdAt: string; updatedAt: string }
export interface OnlineMatchActionRequest { matchId: string; expectedVersion: number; intentId: string; intent: OnlineMatchIntent }
export interface OnlineMatchActionResponse { match: OnlineMatch; idempotent: boolean }
