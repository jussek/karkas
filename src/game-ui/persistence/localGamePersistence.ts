/**
 * Stage 4B — локальное сохранение партии (browser-only слой).
 *
 * Никакого backend/сети. Единственный источник — localStorage.
 * Десериализация всегда валидируется: битый JSON, чужая версия или
 * структурно некорректный save НЕ могут уронить приложение — они
 * возвращают null и (для save'а партии) удаляются из хранилища.
 *
 * Сохраняется только authoritative gameplay state (TurnFlowState +
 * LocalGameConfig). Никакого React state / refs / DOM / camera / modal /
 * временного feedback UI — см. flowToDto (явный DTO без functions/DOM).
 */

import { TURN_PHASES, ROTATIONS } from '../../game/engine/turnFlow';
import type { TurnPhase, TurnFlowState } from '../../game/engine/turnFlow';
import type { TurnResolution } from '../../game/engine/turnResolution';
import type { MeeplePlacement, Rotation, TilePosition } from '../../game/types/geometry';
import type { GameStatus } from '../../game/types/state';
import { posKey } from '../../game/types/state';
import type { LocalGameConfig } from '../../game/session';

export const LOCAL_GAME_SAVE_KEY = 'karkas.local-game.v1';
export const SETTINGS_KEY = 'karkas.settings.v1';

/* ------------------------------------------------------------------ */
/* Storage helpers (safe on missing/broken storage)                    */
/* ------------------------------------------------------------------ */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Validation primitives                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTilePosition(value: unknown): value is TilePosition {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

const FEATURE_TYPES = ['road', 'city', 'monastery'] as const;

function isMeeplePlacement(value: unknown): value is MeeplePlacement {
  if (!isRecord(value)) return false;
  const featureOk = (FEATURE_TYPES as readonly string[]).includes(String(value.featureType));
  const edgeOk =
    value.edge === undefined || value.edge === null || isFiniteNumber(value.edge);
  return featureOk && edgeOk;
}

function isRotation(value: unknown): value is Rotation {
  return (ROTATIONS as readonly number[]).includes(value as number);
}

function isTurnPhase(value: unknown): value is TurnPhase {
  return (TURN_PHASES as readonly string[]).includes(String(value));
}

function isGameStatus(value: unknown): value is GameStatus {
  return value === 'setup' || value === 'playing' || value === 'finished';
}

/* ------------------------------------------------------------------ */
/* Explicit DTO conversion (never stringify functions/DOM)             */
/* ------------------------------------------------------------------ */

function positionToDto(position: TilePosition): { x: number; y: number } {
  return { x: position.x, y: position.y };
}

function placementToDto(placement: MeeplePlacement): Record<string, unknown> {
  return {
    featureType: placement.featureType,
    ...(placement.edge === undefined || placement.edge === null ? {} : { edge: placement.edge }),
  };
}

function resolutionToDto(resolution: TurnResolution): Record<string, unknown> {
  return {
    scoreEvents: resolution.scoreEvents.map((event) => ({
      featureType: event.featureType,
      points: event.points,
      playerIds: [...event.playerIds],
      tied: event.tied,
    })),
    returnedMeepleIds: [...resolution.returnedMeepleIds],
    previousPlayerId: resolution.previousPlayerId,
    nextPlayerId: resolution.nextPlayerId,
    gameOver: resolution.gameOver,
    ...(resolution.final
      ? {
          final: {
            scoreByPlayerId: { ...resolution.final.scoreByPlayerId },
            leaderPlayerIds: [...resolution.final.leaderPlayerIds],
            tied: resolution.final.tied,
          },
        }
      : {}),
  };
}

function configToDto(config: LocalGameConfig): Record<string, unknown> {
  return {
    gameId: config.gameId,
    seed: config.seed,
    players: config.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      score: player.score,
    })),
  };
}

function flowToDto(flow: TurnFlowState): Record<string, unknown> {
  const game = flow.game;
  return {
    game: {
      gameId: game.gameId,
      status: game.status,
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        score: player.score,
      })),
      board: Object.fromEntries(
        Object.values(game.board).map((tile) => [
          posKey(tile.position),
          {
            position: positionToDto(tile.position),
            definitionId: tile.definitionId,
            rotation: tile.rotation,
          },
        ]),
      ),
      tileDeck: { remaining: [] },
      currentPlayerIndex: game.currentPlayerIndex,
      turnNumber: game.turnNumber,
      scores: { ...game.scores },
      meeples: game.meeples.map((meeple) => ({
        id: meeple.id,
        playerId: meeple.playerId,
        position: meeple.position ? positionToDto(meeple.position) : null,
        placement: meeple.placement ? placementToDto(meeple.placement) : null,
      })),
      gamePhase: game.gamePhase,
      drawnTileDefinitionId: game.drawnTileDefinitionId,
      lastPlacedTile: game.lastPlacedTile
        ? {
            definitionId: game.lastPlacedTile.definitionId,
            rotation: game.lastPlacedTile.rotation,
            position: positionToDto(game.lastPlacedTile.position),
            playerId: game.lastPlacedTile.playerId,
          }
        : null,
    },
    phase: flow.phase,
    rotation: flow.rotation,
    legalPlacements: flow.legalPlacements.map(positionToDto),
    positionedAt: flow.positionedAt ? positionToDto(flow.positionedAt) : null,
    positionedRotations: [...flow.positionedRotations],
    selectedMeepleTarget: flow.selectedMeepleTarget ? placementToDto(flow.selectedMeepleTarget) : null,
    riverPlaced: flow.riverPlaced,
    riverDeck: [...flow.riverDeck],
    landDeck: [...flow.landDeck],
    discardedTileIds: [...flow.discardedTileIds],
    seed: flow.seed,
    lastResolution: resolutionToDto(flow.lastResolution),
  };
}

/* ------------------------------------------------------------------ */
/* Save format validation                                              */
/* ------------------------------------------------------------------ */

export interface LocalGameSaveV1 {
  version: 1;
  savedAt: string;
  config: LocalGameConfig;
  flow: TurnFlowState;
}

function validateConfig(value: unknown): LocalGameConfig | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.gameId)) return null;
  if (!isFiniteNumber(value.seed)) return null;
  if (!Array.isArray(value.players) || value.players.length < 1) return null;
  for (const raw of value.players) {
    if (!isRecord(raw)) return null;
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) return null;
    if (typeof raw.color !== 'string' || !isFiniteNumber(raw.score)) return null;
  }
  return value as unknown as LocalGameConfig;
}

function validateResolution(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.scoreEvents)) return false;
  for (const event of value.scoreEvents) {
    if (!isRecord(event)) return false;
    if (!(FEATURE_TYPES as readonly string[]).includes(String(event.featureType))) return false;
    if (!isFiniteNumber(event.points)) return false;
    if (!Array.isArray(event.playerIds) || !event.playerIds.every(isNonEmptyString)) return false;
    if (typeof event.tied !== 'boolean') return false;
  }
  if (!Array.isArray(value.returnedMeepleIds) || !value.returnedMeepleIds.every(isNonEmptyString)) return false;
  if (!isNonEmptyString(value.previousPlayerId) || !isNonEmptyString(value.nextPlayerId)) return false;
  if (typeof value.gameOver !== 'boolean') return false;
  if (value.final !== undefined) {
    if (!isRecord(value.final)) return false;
    if (!isRecord(value.final.scoreByPlayerId)) return false;
    if (!Array.isArray(value.final.leaderPlayerIds)) return false;
    if (typeof value.final.tied !== 'boolean') return false;
  }
  return true;
}

function validateFlow(value: unknown): TurnFlowState | null {
  if (!isRecord(value)) return null;
  if (!isTurnPhase(value.phase)) return null;
  if (!isRotation(value.rotation)) return null;
  if (!Array.isArray(value.legalPlacements) || !value.legalPlacements.every(isTilePosition)) return null;
  if (value.positionedAt !== null && !isTilePosition(value.positionedAt)) return null;
  if (!Array.isArray(value.positionedRotations) || !value.positionedRotations.every(isRotation)) return null;
  if (value.selectedMeepleTarget !== null && !isMeeplePlacement(value.selectedMeepleTarget)) return null;
  if (!isFiniteNumber(value.riverPlaced)) return null;
  if (!Array.isArray(value.riverDeck) || !value.riverDeck.every(isNonEmptyString)) return null;
  if (!Array.isArray(value.landDeck) || !value.landDeck.every(isNonEmptyString)) return null;
  if (!Array.isArray(value.discardedTileIds) || !value.discardedTileIds.every(isNonEmptyString)) return null;
  if (!isFiniteNumber(value.seed)) return null;
  if (!validateResolution(value.lastResolution)) return null;
  if (!isRecord(value.game)) return null;
  const game = value.game;
  if (!isNonEmptyString(game.gameId)) return null;
  if (!isGameStatus(game.status)) return null;
  if (!Array.isArray(game.players) || game.players.length < 1) return null;
  for (const p of game.players) {
    if (!isRecord(p) || !isNonEmptyString(p.id) || !isNonEmptyString(p.name)) return null;
  }
  if (!isRecord(game.board)) return null;
  for (const tile of Object.values(game.board)) {
    if (!isRecord(tile) || !isTilePosition(tile.position)) return null;
    if (!isNonEmptyString(tile.definitionId) || !isRotation(tile.rotation)) return null;
  }
  if (!isRecord(game.tileDeck) || !Array.isArray(game.tileDeck.remaining)) return null;
  if (!isFiniteNumber(game.currentPlayerIndex)) return null;
  if (!isFiniteNumber(game.turnNumber)) return null;
  if (!isRecord(game.scores)) return null;
  if (!Array.isArray(game.meeples)) return null;
  for (const m of game.meeples) {
    if (!isRecord(m) || !isNonEmptyString(m.id) || !isNonEmptyString(m.playerId)) return null;
    if (m.position !== null && !isTilePosition(m.position)) return null;
    if (m.placement !== null && !isMeeplePlacement(m.placement)) return null;
  }
  if (typeof game.gamePhase !== 'string') return null;
  if (game.drawnTileDefinitionId !== null && !isNonEmptyString(game.drawnTileDefinitionId)) return null;
  if (game.lastPlacedTile !== null) {
    if (!isRecord(game.lastPlacedTile)) return null;
    if (!isNonEmptyString(game.lastPlacedTile.definitionId)) return null;
    if (!isRotation(game.lastPlacedTile.rotation)) return null;
    if (!isTilePosition(game.lastPlacedTile.position)) return null;
    if (!isNonEmptyString(game.lastPlacedTile.playerId)) return null;
  }
  return value as unknown as TurnFlowState;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Загружает и валидирует сохранение; null при любом повреждении. */
export function loadLocalGameSave(): LocalGameSaveV1 | null {
  const storage = getStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(LOCAL_GAME_SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearLocalGameSave();
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  if (typeof parsed.savedAt !== 'string') return null;
  const config = validateConfig(parsed.config);
  const flow = validateFlow(parsed.flow);
  if (!config || !flow) {
    clearLocalGameSave();
    return null;
  }
  return { version: 1, savedAt: parsed.savedAt, config, flow };
}

/** Сохраняет партию; возвращает false если хранилище недоступно/бросает. */
export function saveLocalGameSave(config: LocalGameConfig, flow: TurnFlowState): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const payload = {
    version: 1 as const,
    savedAt: new Date().toISOString(),
    config: configToDto(config) as unknown as LocalGameConfig,
    flow: flowToDto(flow) as unknown as TurnFlowState,
  };
  try {
    storage.setItem(LOCAL_GAME_SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalGameSave(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(LOCAL_GAME_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** true только если существует ВАЛИДНОЕ незавершённое сохранение. */
export function hasLocalGameSave(): boolean {
  const save = loadLocalGameSave();
  if (!save) return false;
  return save.flow.game.status !== 'finished';
}

/* ------------------------------------------------------------------ */
/* Settings (sound/music preferences)                                  */
/* ------------------------------------------------------------------ */

export interface LocalSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
}

export const DEFAULT_SETTINGS: LocalSettings = { soundEnabled: true, musicEnabled: true };

export function loadSettings(): LocalSettings {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  let raw: string | null = null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_SETTINGS };
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: LocalSettings): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings }));
    return true;
  } catch {
    return false;
  }
}
