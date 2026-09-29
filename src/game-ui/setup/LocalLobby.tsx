import type { LocalGameConfig } from '../../game/session';
import { playerIdentity } from '../../game/session';
import type { CSSProperties } from 'react';

interface LocalLobbyProps { config: LocalGameConfig; onStart: () => void; onBack: () => void }

export function LocalLobby({ config, onStart, onBack }: LocalLobbyProps) {
  return <main className="setup-page">
    <section className="setup-card lobby-card">
      <p className="setup-kicker">Локальная партия</p><h1>Лобби игры</h1>
      <div className="lobby-players">
        {config.players.map((player, index) => <article key={player.id} className="lobby-player" style={{ '--player-color': playerIdentity(index + 1).hex } as CSSProperties}>
          <span className="lobby-meeple">♟</span><div><strong>{player.name}</strong><small>{index === 0 ? 'Хозяин · готов' : 'Готов'}</small></div><span>✓</span>
        </article>)}
      </div>
      <button type="button" className="setup-start" onClick={onStart}>Начать игру</button>
      <button type="button" className="setup-back" onClick={onBack}>Назад</button>
    </section>
  </main>;
}
