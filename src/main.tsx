import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
import { MainMenu } from "./game-ui/menu/MainMenu";
import type { LocalGameConfig } from "./game/session";

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

function App() {
  // Stage 3E: gallery route. Full routing arrives later.
  if (typeof window !== "undefined" && window.location.pathname === "/tiles") {
    return <TileGalleryPage />;
  }
  // Local menu → setup → game. No persistence/network (state only in memory).
  const [screen, setScreen] = useState<"menu" | "setup" | "game">("menu");
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  if (screen === "menu") {
    return <>
      <MainMenu onNewGame={() => setScreen("setup")} onRules={() => setRulesOpen(true)} />
      {rulesOpen && <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <section className="rules-card">
          <button type="button" className="rules-close" aria-label="Закрыть правила" onClick={() => setRulesOpen(false)}>×</button>
          <h2 id="rules-title">Как играть</h2>
          <ol><li>Возьмите карту и поверните её.</li><li>Поставьте на подсвеченную клетку.</li><li>При желании поставьте подданного.</li><li>Завершите ход — очки начислит игра.</li></ol>
          <p>Поля, сады и река не являются целями для подданных.</p>
        </section>
      </div>}
    </>;
  }
  if (screen === "setup" || !config) {
  // Stage 4A: local setup → game. No persistence (state only in memory).
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  if (!config) {
    return (
      <GameSetupPage
        makeGameId={browserGameId}
        makeSeed={browserSeed}
        onBack={() => setScreen("menu")}
        onStart={(next) => { setConfig(next); setScreen("game"); }}
      />
    );
  }
  return <GamePage config={config} key={config.gameId} onExit={() => { setConfig(null); setScreen("menu"); }} onNewGame={() => { setConfig(null); setScreen("setup"); }} />;
        onStart={setConfig}
      />
    );
  }
  return <GamePage config={config} key={config.gameId} />;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
