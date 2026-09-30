import './mainMenu.css';

export interface MainMenuProps {
  onCreateGame: () => void;
  onQuickGame: () => void;
  /** Opens the rules modal (rendered by the application root). */
  onRules?: () => void;
}

export function MainMenu({ onCreateGame, onQuickGame, onRules }: MainMenuProps) {
  return <main className="main-menu">
    <div className="main-menu__audio" aria-label="Звук и музыка">
      <button type="button" aria-label="Звук">🔊</button>
      <button type="button" aria-label="Музыка">♫</button>
    </div>
    <header className="main-menu__brand">
      <span className="main-menu__meeple" aria-hidden>♟</span>
      <p>Настольная игра</p>
      <h1>Каркассон</h1>
      <span>Стройте земли · собирайте реку · побеждайте</span>
    </header>
    <nav className="main-menu__actions" aria-label="Главное меню">
      <button type="button" className="wood-button wood-button--blue" disabled title="Сетевой режим появится позже">Найти игру <small>Скоро</small></button>
      <button type="button" className="wood-button wood-button--green" onClick={onCreateGame}>Создать игру</button>
      <button type="button" className="wood-button" onClick={onQuickGame}>Быстрая локальная игра</button>
      <div className="main-menu__minor">
        <button type="button" onClick={onRules}>Правила</button>
        <button type="button">Настройки</button>
        <button type="button">Выход</button>
      </div>
    </nav>
    <p className="main-menu__offline">Локальный режим · 1–6 игроков · без сети</p>
  </main>;
}
