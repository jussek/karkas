import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
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
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  if (!config) {
    return (
      <GameSetupPage
        makeGameId={browserGameId}
        makeSeed={browserSeed}
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
