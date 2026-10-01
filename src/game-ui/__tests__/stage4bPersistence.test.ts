/**
 * Stage 4B — seam-тесты persistence/resume без React harness.
 *
 * Проверяют контракт App/GamePage seams через production-функции:
 * - save/load roundtrip, malformed/wrong-version/clear;
 * - restored flow продолжает игру детерминированно (serialize ->
 *   deserialize -> полный ход == тот же engine-результат);
 * - settings roundtrip/defaults/fallback;
 * - hasLocalGameSave: unfinished true, finished false;
 * - quick game defaults (2 игрока, имена по умолчанию) через session API;
 * - явные click-кнопки не зависят от camera tap-флага (pure seam).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalGameSave,
  hasLocalGameSave,
  loadLocalGameSave,
  loadSettings,
  LOCAL_GAME_SAVE_KEY,
  saveLocalGameSave,
  saveSettings,
  SETTINGS_KEY,
} from '../persistence/localGamePersistence';
import {
  confirmTurnTilePlacement,
  createTurnFlow,
  drawTurnTile,
  endTurn,
  placeTurnTile,
  selectTurnMeeple,
} from '../../game/engine/turnFlow';
import type { TurnFlowState } from '../../game/engine/turnFlow';
import { getLegalMeeplePlacements } from '../../game/rules/localFeatures';
import { getTileDefinition } from '../../game/cards/catalogApi';
import { buildPlayers, createLocalGameConfig } from '../../game/session';
import type { LocalGameConfig } from '../../game/session';

/* --- in-memory localStorage stub (browser API shape) --------------- */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function installStorage() {
  const storage = new MemoryStorage();
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

const config: LocalGameConfig = {
  gameId: 'save-test',
  seed: 4,
  players: buildPlayers({ count: 2 }),
};

function makeFlow(seed = 4): TurnFlowState {
  return createTurnFlow({ gameId: 'save-test', seed, players: buildPlayers({ count: 2 }) });
}

/** Один полный authoritative ход (draw -> place -> confirm -> end). */
function playOneTurn(state: TurnFlowState): TurnFlowState {
  const drawn = drawTurnTile(state);
  const positioned = placeTurnTile(drawn, drawn.legalPlacements[0]);
  const placed = confirmTurnTilePlacement(positioned);
  return endTurn(placed);
}

beforeEach(() => {
  installStorage();
});

describe('local game save: format & safety', () => {
  it('loads legacy 90/120 second timer options with disabled fallback', () => {
    const flow = makeFlow();
    expect(saveLocalGameSave({ ...config, matchOptions: { turnTimerSeconds: 0 } }, flow)).toBe(true);
    for (const legacySeconds of [90, 120]) {
      const raw = JSON.parse(window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)!);
      raw.config.matchOptions.turnTimerSeconds = legacySeconds;
      window.localStorage.setItem(LOCAL_GAME_SAVE_KEY, JSON.stringify(raw));
      expect(loadLocalGameSave()?.config.matchOptions?.turnTimerSeconds).toBe(0);
    }
  });

  it('A. save/load roundtrip preserves authoritative fields', () => {
    const flow = playOneTurn(makeFlow());
    expect(saveLocalGameSave(config, flow)).toBe(true);
    const loaded = loadLocalGameSave();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(2);
    expect(loaded?.config.gameId).toBe(config.gameId);
    // board / decks / player / turn / scores / meeples / drawn tile
    expect(loaded?.flow.game.board).toEqual(flow.game.board);
    expect(loaded?.flow.riverDeck).toEqual(flow.riverDeck);
    expect(loaded?.flow.landDeck).toEqual(flow.landDeck);
    expect(loaded?.flow.game.currentPlayerIndex).toBe(flow.game.currentPlayerIndex);
    expect(loaded?.flow.game.turnNumber).toBe(flow.game.turnNumber);
    expect(loaded?.flow.game.scores).toEqual(flow.game.scores);
    expect(loaded?.flow.game.meeples).toEqual(flow.game.meeples);
    expect(loaded?.flow.game.drawnTileDefinitionId).toBe(flow.game.drawnTileDefinitionId);
    expect(loaded?.flow.lastResolution).toEqual(flow.lastResolution);
    expect(loaded?.flow.phase).toBe(flow.phase);
  });

  it('B. malformed JSON returns null and is cleared', () => {
    window.localStorage.setItem(LOCAL_GAME_SAVE_KEY, '{not json');
    expect(loadLocalGameSave()).toBeNull();
    expect(window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)).toBeNull();
  });

  it('C. wrong version returns null', () => {
    window.localStorage.setItem(LOCAL_GAME_SAVE_KEY, JSON.stringify({ version: 99, savedAt: 'x' }));
    expect(loadLocalGameSave()).toBeNull();
  });

  it('structurally invalid save returns null and is cleared', () => {
    window.localStorage.setItem(
      LOCAL_GAME_SAVE_KEY,
      JSON.stringify({ version: 1, savedAt: 'x', config, flow: { phase: 'NOT_A_PHASE' } }),
    );
    expect(loadLocalGameSave()).toBeNull();
    expect(window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)).toBeNull();
  });

  it('rejects and clears a stale save containing removed card-109', () => {
    expect(saveLocalGameSave(config, makeFlow())).toBe(true);
    const raw = JSON.parse(window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)!);
    raw.flow.riverDeck[0] = 'card-109';
    window.localStorage.setItem(LOCAL_GAME_SAVE_KEY, JSON.stringify(raw));
    expect(loadLocalGameSave()).toBeNull();
    expect(window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)).toBeNull();
  });

  it('missing storage does not crash', () => {
    vi.stubGlobal('window', {});
    expect(loadLocalGameSave()).toBeNull();
    expect(saveLocalGameSave(config, makeFlow())).toBe(false);
    expect(() => clearLocalGameSave()).not.toThrow();
    expect(hasLocalGameSave()).toBe(false);
  });

  it('D. clear removes the save', () => {
    saveLocalGameSave(config, makeFlow());
    expect(loadLocalGameSave()).not.toBeNull();
    clearLocalGameSave();
    expect(loadLocalGameSave()).toBeNull();
    expect(hasLocalGameSave()).toBe(false);
  });

  it('hasLocalGameSave: unfinished true, finished false', () => {
    saveLocalGameSave(config, makeFlow());
    expect(hasLocalGameSave()).toBe(true);
    const finished = makeFlow();
    finished.game.status = 'finished';
    saveLocalGameSave(config, finished);
    expect(loadLocalGameSave()).not.toBeNull();
    expect(hasLocalGameSave()).toBe(false);
  });
});

describe('resume determinism (critical regression)', () => {
  it('restored flow continues to the SAME engine result as the original', () => {
    const original = playOneTurn(makeFlow(492));
    saveLocalGameSave(config, original);
    const restored = loadLocalGameSave()?.flow;
    expect(restored).toBeDefined();
    const a = playOneTurn(original);
    const b = playOneTurn(restored as TurnFlowState);
    expect(b).toEqual(a);
    // decks are NOT rebuilt/shuffled on restore
    expect(restored?.riverDeck).toEqual(original.riverDeck);
    expect(restored?.landDeck).toEqual(original.landDeck);
  });

  it('seed 4: full river resume equals uninterrupted run', () => {
    let original = makeFlow(4);
    for (let i = 0; i < 5; i += 1) original = playOneTurn(original);
    saveLocalGameSave(config, original);
    const restored = loadLocalGameSave()?.flow as TurnFlowState;
    let a = original;
    let b = restored;
    for (let i = 0; i < 3; i += 1) {
      a = playOneTurn(a);
      b = playOneTurn(b);
    }
    expect(b).toEqual(a);
  });
});

describe('settings persistence', () => {
  it('G. defaults are sound=true music=true', () => {
    expect(loadSettings()).toEqual({ soundEnabled: true, musicEnabled: true });
  });

  it('F. roundtrip persists across reload', () => {
    expect(saveSettings({ soundEnabled: false, musicEnabled: true })).toBe(true);
    expect(loadSettings()).toEqual({ soundEnabled: false, musicEnabled: true });
  });

  it('H. malformed settings fall back to defaults', () => {
    window.localStorage.setItem(SETTINGS_KEY, 'garbage{');
    expect(loadSettings()).toEqual({ soundEnabled: true, musicEnabled: true });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled: 'yes' }));
    expect(loadSettings()).toEqual({ soundEnabled: true, musicEnabled: true });
  });
});

describe('app navigation seams', () => {
  it('I/J. valid save exposes continue and restores stored flow (no createLocalGame)', () => {
    const mid = playOneTurn(makeFlow(4));
    saveLocalGameSave(config, mid);
    // MainMenu shows Continue only when hasLocalGameSave() — same predicate App uses.
    expect(hasLocalGameSave()).toBe(true);
    const save = loadLocalGameSave();
    expect(save).not.toBeNull();
    // GamePage initialFlow seam: useState initializer takes initialFlow first.
    const initialFlow = save?.flow ?? undefined;
    expect(initialFlow?.game.turnNumber).toBe(mid.game.turnNumber);
    expect(initialFlow?.phase).toBe(mid.phase);
  });

  it('K. exit-to-menu keeps the save intact', () => {
    const mid = playOneTurn(makeFlow(4));
    saveLocalGameSave(config, mid);
    // App.onExit НЕ вызывает clearLocalGameSave — save должен пережить выход.
    expect(loadLocalGameSave()?.flow.game.turnNumber).toBe(mid.game.turnNumber);
    expect(hasLocalGameSave()).toBe(true);
  });

  it('L. New Game action clears the save', () => {
    saveLocalGameSave(config, makeFlow());
    clearLocalGameSave(); // App.onNewGame path
    expect(hasLocalGameSave()).toBe(false);
    expect(loadLocalGameSave()).toBeNull();
  });

  it('M. quick game defaults: 2 players with default names, explicit id/seed', () => {
    const quick = createLocalGameConfig({ gameId: 'quick-1', seed: 7, count: 2 });
    expect(quick.players).toHaveLength(2);
    expect(quick.players.map((p) => p.name)).toEqual(['Игрок 1', 'Игрок 2']);
    expect(quick.seed).toBe(7);
  });
});

describe('explicit button clicks are not camera-gated (pure seam)', () => {
  it('legal + click transitions TILE_IN_HAND -> TILE_POSITIONED without any camera state', () => {
    const drawn = drawTurnTile(makeFlow(4));
    expect(drawn.phase).toBe('TILE_IN_HAND');
    const target = drawn.legalPlacements[0];
    // onClick={() => placeAt(position)} — no wasTapAtEnd prerequisite exists.
    const clicked = placeTurnTile(drawn, target);
    expect(clicked.phase).toBe('TILE_POSITIONED');
    // board unchanged until confirm
    expect(clicked.game.board).toEqual(drawn.game.board);
    const confirmed = confirmTurnTilePlacement(clicked);
    expect(confirmed.game.board).not.toEqual(drawn.game.board);
  });

  it('meeple target selection is an authoritative engine seam independent of UI flags', () => {
    // Pure seam: legal targets come from the engine (road/city/monastery only),
    // UI merely forwards the chosen target — no camera/tap state involved.
    const placed = confirmTurnTilePlacement(
      (() => {
        const drawn = drawTurnTile(makeFlow(4));
        return placeTurnTile(drawn, drawn.legalPlacements[0]);
      })(),
    );
    const targets = getLegalMeeplePlacements(placed.game, getTileDefinition);
    for (const t of targets) {
      expect(['road', 'city', 'monastery']).toContain(t.featureType);
    }
    // Invalid target via selectTurnMeeple is a strict no-op (no React/camera state needed).
    const bogus = { featureType: 'road', edge: 99 } as unknown as (typeof targets)[number];
    expect(selectTurnMeeple(placed, bogus)).toBe(placed);
  });
});
