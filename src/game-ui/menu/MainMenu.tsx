import './mainMenu.css';

export interface MainMenuProps {
  onNewGame: () => void;
  onRules: () => void;
}

export function MainMenu({ onNewGame, onRules }: MainMenuProps) {
  return (
    <main className="main-menu">
      <div className="main-menu__sky" aria-hidden="true" />
      <div className="main-menu__castle" aria-hidden="true"><i /><i /><i /></div>
      <div className="main-menu__tree" aria-hidden="true" />
      <div className="main-menu__audio" aria-label="Настройки звука">
        <button type="button" aria-label="Звук">♪</button>
        <button type="button" aria-label="Музыка">♫</button>
      </div>
      <section className="main-menu__content">
        <div className="main-menu__meeple" aria-hidden="true">♟</div>
        <h1>Каркасон</h1>
        <p>Стройте города, прокладывайте дороги и создавайте своё королевство</p>
        <nav aria-label="Главное меню">
          <button type="button" className="wood-button wood-button--primary" onClick={onNewGame}>Новая игра</button>
          <button type="button" className="wood-button" onClick={onRules}>Правила</button>
        </nav>
      </section>
      <div className="main-menu__table" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
