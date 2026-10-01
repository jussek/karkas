import type { LocalSettings } from '../persistence/localGamePersistence';
import { OnlineIcon } from '../online/OnlineIcon';
import './mainMenu.css';

export interface MainMenuProps {
  onCreateGame: () => void;
  onQuickGame: () => void;
  onFindGame?: () => void;
  onExit?: () => void;
  hasSavedGame?: boolean;
  onContinueGame?: () => void;
  settings?: LocalSettings;
  onToggleSound?: () => void;
  onToggleMusic?: () => void;
}

export function MainMenu({ onCreateGame, onQuickGame, onFindGame, onExit, hasSavedGame = false, onContinueGame, settings, onToggleSound, onToggleMusic }: MainMenuProps) {
  const soundEnabled = settings?.soundEnabled ?? true;
  const musicEnabled = settings?.musicEnabled ?? true;
  return <main className="main-menu">
    <div className="main-menu__beams" aria-hidden="true" />
    <div className="main-menu__toolbar">
      <button type="button" aria-label="Звук" aria-pressed={soundEnabled} onClick={onToggleSound}><OnlineIcon name="sound" /></button>
      <button type="button" aria-label="Музыка" aria-pressed={musicEnabled} onClick={onToggleMusic}><OnlineIcon name="music" /></button>
      <button type="button" aria-label="Выход" onClick={onExit}><OnlineIcon name="close" /></button>
    </div>
    <section className="main-menu__content">
      <div className="main-menu__emblem" aria-hidden="true"><OnlineIcon name="meeple" /></div>
      <header className="main-menu__brand"><span>Настольная игра</span><h1>Каркассон</h1><p>Стройте земли · собирайте реку · побеждайте</p></header>
      <nav className="main-menu__primary" aria-label="Главное меню">
        <button type="button" className="menu-action menu-action--blue" onClick={onFindGame}><OnlineIcon name="search" /><span><b>Найти игру</b><small>Присоединиться к существующему лобби</small></span></button>
        <button type="button" className="menu-action menu-action--green" onClick={onCreateGame}><OnlineIcon name="plus" /><span><b>Создать игру</b><small>Настроить и пригласить игроков</small></span></button>
      </nav>
      <div className="main-menu__local">
        {hasSavedGame && onContinueGame && <button type="button" onClick={onContinueGame}>Продолжить локальную игру</button>}
        <button type="button" onClick={onQuickGame}>Локальная игра</button>
      </div>
    </section>
    <div className="main-menu__table" aria-hidden="true"><i /><i /><i /></div>
  </main>;
}
