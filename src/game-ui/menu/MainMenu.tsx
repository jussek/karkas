import type { LocalSettings } from '../persistence/localGamePersistence';
import { OnlineIcon } from '../online/OnlineIcon';
import { exitMainMenu } from './menuExit';
import './mainMenu.css';
import './mainMenuExactReference.css';
import './mainMenuStructureFix.css';

export interface MainMenuProps {
  onCreateGame: () => void;
  onQuickGame: () => void;
  onFindGame?: () => void;
  onExit?: () => void;
  hasSavedGame?: boolean;
  onContinueGame?: () => void;
  onReturnToOnlineGame?: () => void;
  settings?: LocalSettings;
  onToggleSound?: () => void;
  onToggleMusic?: () => void;
}

export function MainMenu({ onCreateGame, onFindGame, onExit, settings, onToggleSound, onToggleMusic }: MainMenuProps) {
  const soundEnabled = settings?.soundEnabled ?? true;
  const musicEnabled = settings?.musicEnabled ?? true;
  return <main className="main-menu">
    <div className="main-menu__toolbar">
      <button type="button" aria-label="Звук" aria-pressed={soundEnabled} onClick={onToggleSound}><OnlineIcon name="sound" /></button>
      <button type="button" aria-label="Музыка" aria-pressed={musicEnabled} onClick={onToggleMusic}><OnlineIcon name="music" /></button>
      <button type="button" aria-label="Выход" onClick={() => exitMainMenu(onExit, typeof window === 'undefined' ? undefined : window)}><OnlineIcon name="close" /></button>
    </div>
    <section className="main-menu__content">
      <header className="main-menu__brand"><h1 aria-label="Каркасон">Каркасон</h1></header>
      <nav className="main-menu__primary" aria-label="Главное меню">
        <button type="button" className="menu-action menu-action--blue" onClick={onFindGame}><OnlineIcon name="search" /><span><b>Найти игру</b><small>Присоединиться к существующему лобби</small></span></button>
        <button type="button" className="menu-action menu-action--green" onClick={onCreateGame}><OnlineIcon name="plus" /><span><b>Создать игру</b><small>Настроить и пригласить игроков</small></span></button>
      </nav>
    </section>
  </main>;
}
