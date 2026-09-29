import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
import { LocalLobby } from "./game-ui/setup/LocalLobby";
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
  // Stage 4A: local setup → game. No persistence (state only in memory).
  const [screen, setScreen] = useState<'menu' | 'setup' | 'lobby' | 'game'>('menu');
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  const prepare = (next: LocalGameConfig) => { setConfig(next); setScreen('lobby'); };
  if (screen === 'menu') return <MainMenu onCreateGame={() => setScreen('setup')} onQuickGame={() => setScreen('setup')} />;
  if (screen === 'setup') {
    return (
      <GameSetupPage
        makeGameId={browserGameId}
        makeSeed={browserSeed}
        onStart={prepare}
        onBack={() => setScreen('menu')}
      />
    );
  }
  if (screen === 'lobby' && config) return <LocalLobby config={config} onStart={() => setScreen('game')} onBack={() => setScreen('setup')} />;
  if (!config) return <MainMenu onCreateGame={() => setScreen('setup')} onQuickGame={() => setScreen('setup')} />;
  return <GamePage config={config} key={config.gameId} onExit={() => setScreen('menu')} onNewGame={() => setScreen('setup')} />;
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
