import type { OnlineLobbySnapshot } from '../../online/types';
import { OnlineIcon } from './OnlineIcon';
import { lobbyDisplayName } from './lobbyBrowserModel';
import './onlineBrowser.css';

export function OnlineCreateScaffold({ onBack }: { onBack: () => void }) {
  return <main className="online-browser"><div className="online-browser__shell"><header className="online-browser__header"><button type="button" aria-label="Назад" onClick={onBack}><OnlineIcon name="back" /></button><h1>Создать игру</h1><button type="button" aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close" /></button></header><section className="online-browser__state"><OnlineIcon name="crown" /><h2>Создать игру</h2><p>Настройка онлайн-лобби — следующий этап</p><button type="button" onClick={onBack}>Назад</button></section></div></main>;
}

export function OnlineLobbyScaffold({ lobby, onBack }: { lobby: OnlineLobbySnapshot; onBack: () => void }) {
  return <main className="online-browser"><div className="online-browser__shell"><header className="online-browser__header"><button type="button" aria-label="Назад" onClick={onBack}><OnlineIcon name="back" /></button><h1>Лобби подключено</h1><button type="button" aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close" /></button></header><section className="online-browser__state"><OnlineIcon name="meeple" /><h2>{lobbyDisplayName(lobby)}</h2><p>Код: <b>{lobby.code}</b></p><ul>{lobby.players.map((player) => <li key={player.userId}>{player.displayName}</li>)}</ul><button type="button" onClick={onBack}>Назад</button></section></div></main>;
}
