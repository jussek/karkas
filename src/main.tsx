import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";

function App() {
  // Stage 3E: minimal temporary route switch. Full routing arrives in Stage 4A.
  if (typeof window !== "undefined" && window.location.pathname === "/tiles") {
    return <TileGalleryPage />;
  }
  return <GamePage />;
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
