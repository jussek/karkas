import { useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
import { LocalLobby } from "./game-ui/setup/LocalLobby";
import { MainMenu } from "./game-ui/menu/MainMenu";
import { FindGamePage } from "./game-ui/online/FindGamePage";
import { OnlineCreateScaffold, OnlineLobbyScaffold } from "./game-ui/online/OnlineScaffoldPage";
import { onlineNavigationTarget } from "./game-ui/online/onlineNavigation";
import type { OnlineLobbySnapshot } from "./online/types";
import type { LocalGameConfig } from "./game/session";
import { DEFAULT_MATCH_OPTIONS, createLocalGameConfig } from "./game/session";
import type { TurnFlowState } from "./game/engine/turnFlow";
import {
  clearLocalGameSave,
  loadLocalGameSave,
  loadSettings,
  saveSettings,
} from "./game-ui/persistence/localGamePersistence";
import type { LocalSettings, UiMatchState } from "./game-ui/persistence/localGamePersistence";

function browserGameId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}`;
}

function browserSeed(): number {
  const buffer = new Uint32Array(1);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(buffer);
    return buffer[0];
  }
  return Date.now() >>> 0;
}

export type Screen = "menu" | "setup" | "lobby" | "game" | "online-browser" | "online-create" | "online-lobby";

/**
 * Stage 4C: rematch-конфиг генерируется в App/browser layer (не внутри игры):
 * те же players/names/colors/order и matchOptions, НОВЫЕ gameId/seed.
 */
export function buildRematchConfig(
  previous: LocalGameConfig,
  gameId: string,
  seed: number,
): LocalGameConfig {
  return {
    gameId,
    seed,
    players: previous.players.map((player) => ({ ...player })),
    matchOptions: { ...(previous.matchOptions ?? DEFAULT_MATCH_OPTIONS) },
  };
}

const RULES_STEPS = [
  "Возьмите карту.",
  "Выберите подсвеченное место.",
  "Если доступно несколько поворотов — выберите нужный.",
  "Подтвердите карту.",
  "При желании поставьте человечка.",
  "Закончите ход.",
];

export function App() {
  // Stage 4B: локальная партия сохраняется автоматически; из меню её
  // можно продолжить. Engine/scoring/river — нетронутые, UI-слой только
  // читает/пишет localStorage.
  const [screen, setScreen] = useState<Screen>("menu");
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  const [restoredFlow, setRestoredFlow] = useState<TurnFlowState | null>(null);
  const [restoredUiMatchState, setRestoredUiMatchState] = useState<UiMatchState | undefined>(undefined);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(() => loadLocalGameSave() !== null);
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobbySnapshot | null>(null);

  const updateSetting = (patch: Partial<LocalSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  };

  /** Сохранение есть → сначала спрашиваем разрешение удалить старую партию. */
  const guardDestructive = (proceed: () => void) => {
    if (loadLocalGameSave() !== null) setConfirmNewGame(true);
    else proceed();
  };

  const discardSaveAndGoToSetup = () => {
    clearLocalGameSave();
    setHasSavedGame(false);
    setConfirmNewGame(false);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    setScreen("setup");
  };

  const quickGame = () => {
    // sensible defaults: 2 local players, default names, new random gameId/seed.
    const next = createLocalGameConfig({
      gameId: browserGameId(),
      seed: browserSeed(),
      count: 2,
      matchOptions: { turnTimerSeconds: 0 },
    });
    setConfig(next);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    setScreen("game");
  };

  const continueGame = () => {
    const save = loadLocalGameSave();
    if (!save) {
      setHasSavedGame(false);
      return;
    }
    setConfig(save.config);
    setRestoredFlow(save.flow);
    setRestoredUiMatchState(save.uiMatchState);
    setScreen("game");
  };

  /** Stage 4C rematch: те же игроки/опции, новые id/seed; старое сохранение заменяется. */
  const rematch = () => {
    if (!config) return;
    clearLocalGameSave();
    const next = buildRematchConfig(config, browserGameId(), browserSeed());
    setConfig(next);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    setHasSavedGame(true);
    setScreen("game");
  };

  const prepare = (next: LocalGameConfig) => {
    setConfig(next);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    setScreen("lobby");
  };

  if (screen === "menu") {
    return (
      <>
        <MainMenu
          hasSavedGame={hasSavedGame}
          settings={settings}
          onToggleSound={() => updateSetting({ soundEnabled: !settings.soundEnabled })}
          onToggleMusic={() => updateSetting({ musicEnabled: !settings.musicEnabled })}
          onContinueGame={hasSavedGame ? continueGame : undefined}
          onCreateGame={() => setScreen(onlineNavigationTarget("create"))}
          onQuickGame={() => guardDestructive(quickGame)}
          onFindGame={() => setScreen(onlineNavigationTarget("find"))}
          onExit={() => { if (typeof window !== "undefined" && window.history.length > 1) window.history.back(); }}
        />
        {rulesOpen && (
          <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <section className="rules-card">
              <button type="button" className="rules-close" aria-label="Закрыть правила" onClick={() => setRulesOpen(false)}>×</button>
              <h2 id="rules-title">Как играть</h2>
              <ol>
                {RULES_STEPS.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <p>Река строится первой — пока все речные карты не размещены, сдаются только они.</p>
              <p>Человечки ставятся только на дорогу, город или монастырь. Поля и сады игровыми целями не являются.</p>
            </section>
          </div>
        )}
        {settingsOpen && (
          <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <section className="rules-card">
              <button type="button" className="rules-close" aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)}>×</button>
              <h2 id="settings-title">Настройки</h2>
              <div className="settings-row">
                <button type="button" aria-pressed={settings.soundEnabled} onClick={() => updateSetting({ soundEnabled: !settings.soundEnabled })}>
                  Звук: {settings.soundEnabled ? "вкл" : "выкл"}
                </button>
                <button type="button" aria-pressed={settings.musicEnabled} onClick={() => updateSetting({ musicEnabled: !settings.musicEnabled })}>
                  Музыка: {settings.musicEnabled ? "вкл" : "выкл"}
                </button>
              </div>
            </section>
          </div>
        )}
        {confirmNewGame && (
          <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="newgame-title">
            <section className="rules-card">
              <h2 id="newgame-title">Начать новую игру?</h2>
              <p>Текущая сохранённая партия будет удалена.</p>
              <div className="settings-row">
                <button type="button" onClick={discardSaveAndGoToSetup}>Да, начать новую</button>
                <button type="button" onClick={() => setConfirmNewGame(false)}>Отмена</button>
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  if (screen === "online-browser") return <FindGamePage onBack={() => setScreen(onlineNavigationTarget("back"))} onCreate={() => setScreen(onlineNavigationTarget("create"))} onJoined={(lobby) => { setOnlineLobby(lobby); setScreen(onlineNavigationTarget("joined")); }} />;
  if (screen === "online-create") return <OnlineCreateScaffold onBack={() => setScreen("menu")} />;
  if (screen === "online-lobby" && onlineLobby) return <OnlineLobbyScaffold lobby={onlineLobby} onBack={() => { setOnlineLobby(null); setScreen("menu"); }} />;

  if (screen === "setup") {
    return (
      <GameSetupPage
        makeGameId={browserGameId}
        makeSeed={browserSeed}
        onStart={prepare}
        onBack={() => setScreen("menu")}
      />
    );
  }

  if (screen === "lobby" && config) {
    return (
      <LocalLobby
        config={config}
        onStart={() => setScreen("game")}
        onBack={() => setScreen("setup")}
      />
    );
  }

  if (screen === "game" && config) {
    return (
      <GamePage
        config={config}
        key={restoredFlow ? `${config.gameId}:resume` : config.gameId}
        initialFlow={restoredFlow ?? undefined}
        initialUiMatchState={restoredUiMatchState}
        onExit={() => { setRestoredFlow(null); setRestoredUiMatchState(undefined); setHasSavedGame(true); setScreen("menu"); }}
        onRematch={rematch}
        onNewGame={() => {
          clearLocalGameSave();
          setHasSavedGame(false);
          setRestoredFlow(null);
          setRestoredUiMatchState(undefined);
          setConfig(null);
          setScreen("setup");
        }}
      />
    );
  }

  // Defensive fallback: without a config we cannot enter lobby/game.
  return (
    <MainMenu
      hasSavedGame={hasSavedGame}
      settings={settings}
      onToggleSound={() => updateSetting({ soundEnabled: !settings.soundEnabled })}
      onToggleMusic={() => updateSetting({ musicEnabled: !settings.musicEnabled })}
      onContinueGame={hasSavedGame ? continueGame : undefined}
      onCreateGame={() => setScreen(onlineNavigationTarget("create"))}
      onQuickGame={() => guardDestructive(quickGame)}
      onFindGame={() => setScreen(onlineNavigationTarget("find"))}
    />
  );
}

function RoutedApp() {
  // Stage 3E: gallery route. Full routing arrives later.
  if (typeof window !== "undefined" && window.location.pathname === "/tiles") {
    return <TileGalleryPage />;
  }
  return <App />;
}

export function mountApp(container: HTMLElement) {
  createRoot(container).render(
    <StrictMode>
      <RoutedApp />
    </StrictMode>,
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  mountApp(rootElement);
}
