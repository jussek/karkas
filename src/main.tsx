import { useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
import { LocalLobby } from "./game-ui/setup/LocalLobby";
import { MainMenu } from "./game-ui/menu/MainMenu";
import type { LocalGameConfig } from "./game/session";
import { createLocalGameConfig } from "./game/session";
import type { TurnFlowState } from "./game/engine/turnFlow";
import {
  clearLocalGameSave,
  loadLocalGameSave,
  loadSettings,
  saveSettings,
} from "./game-ui/persistence/localGamePersistence";
import type { LocalSettings } from "./game-ui/persistence/localGamePersistence";

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

type Screen = "menu" | "setup" | "lobby" | "game";

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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(() => loadLocalGameSave() !== null);
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());

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
    setScreen("setup");
  };

  const quickGame = () => {
    // sensible defaults: 2 local players, default names, new random gameId/seed.
    const next = createLocalGameConfig({ gameId: browserGameId(), seed: browserSeed(), count: 2 });
    setConfig(next);
    setRestoredFlow(null);
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
    setScreen("game");
  };

  const prepare = (next: LocalGameConfig) => {
    setConfig(next);
    setRestoredFlow(null);
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
          onCreateGame={() => guardDestructive(() => setScreen("setup"))}
          onQuickGame={() => guardDestructive(quickGame)}
          onRules={() => setRulesOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
        {rulesOpen && (
          <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <section className="rules-card">
              <button type="button" className="rules-close" aria-label="Закрыть правила" onClick={() => setRulesOpen(false)}>×</button>
              <h2 id="rules-title">Как играть</h2>
              <ol>
                {RULES_STEPS.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <p>Река строится первой — пока все 19 речных карт не размещены, сдаются только они.</p>
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
        onExit={() => { setRestoredFlow(null); setHasSavedGame(true); setScreen("menu"); }}
        onNewGame={() => {
          clearLocalGameSave();
          setHasSavedGame(false);
          setRestoredFlow(null);
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
      onCreateGame={() => guardDestructive(() => setScreen("setup"))}
      onQuickGame={() => guardDestructive(quickGame)}
      onRules={() => setRulesOpen(true)}
      onSettings={() => setSettingsOpen(true)}
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
