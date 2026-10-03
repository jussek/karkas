import { useCallback, useEffect, useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TileGalleryPage } from "./game-ui/gallery/TileGalleryPage";
import { GamePage } from "./game-ui/game/GamePage";
import { GameSetupPage } from "./game-ui/setup/GameSetupPage";
import { LocalLobby } from "./game-ui/setup/LocalLobby";
import { MainMenu } from "./game-ui/menu/MainMenu";
import { FindGamePage } from "./game-ui/online/FindGamePage";
import { OnlineCreatePage } from "./game-ui/online/OnlineCreatePage";
import { OnlineLobbyPage } from "./game-ui/online/OnlineLobbyPage";
import { OnlineGamePage } from "./game-ui/online/OnlineGamePage";
import { GameLoadingScreen } from "./game-ui/loading/GameLoadingScreen";
import { onlineNavigationTarget } from "./game-ui/online/onlineNavigation";
import type { OnlineLobbySnapshot } from "./online/types";
import type { OnlineMatch } from "./online/matchTypes";
import { findMyActiveMatch, leaveMyOnlineMatches, setMatchPresence } from "./online/matchApi";
import { clearActiveMatch, loadActiveMatch, saveActiveMatch } from "./online/activeMatchPersistence";
import { getSupabaseClient } from "./online/supabaseClient";
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
import { configureAudio,installAudioGestureUnlock } from "./audio/gameAudio";
import "./game-ui/referenceVisual.css";
import "./game-ui/referenceMobilePolish.css";
import "./game-ui/sessionLifecyclePolish.css";
import "./game-ui/referenceDetailPolish.css";

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

function onlineCriticalCards(match:OnlineMatch):string[]{return [...Object.values(match.snapshot.game.board).map(tile=>tile.definitionId),match.snapshot.game.drawnTileDefinitionId].filter((id):id is string=>Boolean(id));}

export type Screen = "menu" | "setup" | "lobby" | "game" | "online-browser" | "online-create" | "online-lobby" | "online-game" | "loading";

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

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [config, setConfig] = useState<LocalGameConfig | null>(null);
  const [restoredFlow, setRestoredFlow] = useState<TurnFlowState | null>(null);
  const [restoredUiMatchState, setRestoredUiMatchState] = useState<UiMatchState | undefined>(undefined);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(() => loadLocalGameSave() !== null);
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobbySnapshot | null>(null);
  const [onlineMatch, setOnlineMatch] = useState<OnlineMatch | null>(null);
  const [loadingTarget,setLoadingTarget]=useState<'game'|'online-game'>('game');
  const [loadingCards,setLoadingCards]=useState<string[]>(['card-133']);
  const [loadingVariant,setLoadingVariant]=useState<'game'|'reconnect'>('game');

  useEffect(()=>{configureAudio(settings);return installAudioGestureUnlock();},[settings]);

  const beginLoading=useCallback((target:'game'|'online-game',cardIds:string[],variant:'game'|'reconnect'='game')=>{setLoadingTarget(target);setLoadingCards(cardIds.length?cardIds:['card-133']);setLoadingVariant(variant);setScreen('loading');},[]);
  const finishLoading=useCallback(()=>setScreen(loadingTarget),[loadingTarget]);

  useEffect(() => {
    let cancelled=false;
    void (async()=>{
      const client=getSupabaseClient();if(!client)return;
      const {data}=await client.auth.getSession();if(!data.session)return;
      const saved=loadActiveMatch();
      try{
        const match=await findMyActiveMatch();
        if(cancelled)return;
        if(match){setOnlineMatch(match);saveActiveMatch({activeMatchId:match.id,lobbyId:match.lobbyId});beginLoading('online-game',onlineCriticalCards(match),'reconnect');}
        else if(saved)clearActiveMatch();
      }catch{if(saved)clearActiveMatch();}
    })();
    return()=>{cancelled=true;};
  },[beginLoading]);

  useEffect(()=>{
    if(screen!=='online-game'||!onlineMatch||onlineMatch.status!=='playing')return;
    let disposed=false;
    const heartbeat=()=>{
      if(disposed||document.visibilityState!=='visible')return;
      void setMatchPresence(onlineMatch.id,true).catch(()=>undefined);
    };
    heartbeat();
    const timer=window.setInterval(heartbeat,30000);
    const onVisibility=()=>{if(document.visibilityState==='visible')heartbeat();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{
      disposed=true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibility);
      void setMatchPresence(onlineMatch.id,false).catch(()=>undefined);
    };
  },[screen,onlineMatch?.id,onlineMatch?.status]);

  const acceptOnlineMatch=(match:OnlineMatch)=>{setOnlineMatch(match);saveActiveMatch({activeMatchId:match.id,lobbyId:match.lobbyId});beginLoading('online-game',onlineCriticalCards(match));};
  const returnToOnlineGame=()=>{if(onlineMatch?.status==='playing')beginLoading('online-game',onlineCriticalCards(onlineMatch),'reconnect');};
  const leaveOnlineForLocal=()=>{clearActiveMatch();setOnlineMatch(null);void leaveMyOnlineMatches().catch(()=>undefined);};

  const updateSetting = (patch: Partial<LocalSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  };

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
    leaveOnlineForLocal();
    const next = createLocalGameConfig({
      gameId: browserGameId(),
      seed: browserSeed(),
      count: 2,
      matchOptions: { turnTimerSeconds: 0 },
    });
    setConfig(next);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    beginLoading('game',['card-133']);
  };

  const continueGame = () => {
    const save = loadLocalGameSave();
    if (!save) {
      setHasSavedGame(false);
      return;
    }
    leaveOnlineForLocal();
    setConfig(save.config);
    setRestoredFlow(save.flow);
    setRestoredUiMatchState(save.uiMatchState);
    beginLoading('game',[save.flow.game.drawnTileDefinitionId,...Object.values(save.flow.game.board).map(tile=>tile.definitionId)].filter((id):id is string=>Boolean(id)),'reconnect');
  };

  const rematch = () => {
    if (!config) return;
    clearLocalGameSave();
    const next = buildRematchConfig(config, browserGameId(), browserSeed());
    setConfig(next);
    setRestoredFlow(null);
    setRestoredUiMatchState(undefined);
    setHasSavedGame(true);
    beginLoading('game',['card-133']);
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
          onReturnToOnlineGame={onlineMatch?.status==='playing'?returnToOnlineGame:undefined}
          onCreateGame={() => setScreen(onlineNavigationTarget("create"))}
          onQuickGame={() => guardDestructive(quickGame)}
          onFindGame={() => setScreen(onlineNavigationTarget("find"))}
          onExit={() => { if (typeof window !== "undefined" && window.history.length > 1) window.history.back(); }}
        />
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

  if(screen==='loading')return <GameLoadingScreen cardIds={loadingCards} variant={loadingVariant} onReady={finishLoading} onExit={()=>setScreen('menu')}/>;

  if (screen === "online-browser") return <FindGamePage onBack={() => setScreen(onlineNavigationTarget("back"))} onCreate={() => setScreen(onlineNavigationTarget("create"))} onJoined={(lobby) => { setOnlineLobby(lobby); setScreen(onlineNavigationTarget("joined")); }} />;
  if (screen === "online-create") return <OnlineCreatePage onBack={() => setScreen("menu")} onCreated={(lobby) => { setOnlineLobby(lobby); setScreen("online-lobby"); }} />;
  if (screen === "online-lobby" && onlineLobby) return <OnlineLobbyPage lobbyId={onlineLobby.id} initialLobby={onlineLobby} onExit={() => { setOnlineLobby(null); setScreen("menu"); }} onMatch={acceptOnlineMatch} />;
  if (screen === "online-game" && onlineMatch) return <OnlineGamePage initialMatch={onlineMatch} onExit={() => { setOnlineLobby(null); setScreen("menu"); }} />;

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
        onStart={() => {leaveOnlineForLocal();beginLoading('game',['card-133']);}}
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

  return (
    <MainMenu
      hasSavedGame={hasSavedGame}
      settings={settings}
      onToggleSound={() => updateSetting({ soundEnabled: !settings.soundEnabled })}
      onToggleMusic={() => updateSetting({ musicEnabled: !settings.musicEnabled })}
      onContinueGame={hasSavedGame ? continueGame : undefined}
      onReturnToOnlineGame={onlineMatch?.status==='playing'?returnToOnlineGame:undefined}
      onCreateGame={() => setScreen(onlineNavigationTarget("create"))}
      onQuickGame={() => guardDestructive(quickGame)}
      onFindGame={() => setScreen(onlineNavigationTarget("find"))}
    />
  );
}

function RoutedApp() {
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
