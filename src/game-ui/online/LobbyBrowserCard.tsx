import type { OnlineLobbySnapshot } from '../../online/types';
import { TILE_ASSETS } from '../tiles/tileAssets';
import { OnlineIcon } from './OnlineIcon';
import { formatLobbyTimer, isLobbyJoinable, lobbyDisplayName, lobbyJoinLabel, lobbyThumbnailSeed } from './lobbyBrowserModel';

export function LobbyBrowserCard({ lobby, joining, onJoin }: { lobby: OnlineLobbySnapshot; joining: boolean; onJoin: (lobby: OnlineLobbySnapshot) => void }) {
  const seed = lobbyThumbnailSeed(lobby.id || lobby.code);
  const tiles = Array.from({ length: 4 }, (_, index) => TILE_ASSETS[(seed + index * 31) % TILE_ASSETS.length]);
  return <article className="lobby-card">
    <div className="lobby-card__tiles" aria-hidden="true">{tiles.map((tile, index) => <img key={tile.cardId} src={tile.url} alt="" style={{ transform: `rotate(${[-4, 3, 2, -3][index]}deg)` }} />)}</div>
    <div className="lobby-card__body">
      <div className="lobby-card__title"><OnlineIcon name={lobby.players[0]?.userId === lobby.hostUserId ? 'crown' : 'meeple'} /><h2>{lobbyDisplayName(lobby)}</h2></div>
      <div className="lobby-card__meeples" aria-label={`${lobby.players.length} из ${lobby.maxPlayers} игроков`}>
        {Array.from({ length: lobby.maxPlayers }, (_, index) => <OnlineIcon key={index} name="meeple" className={index < lobby.players.length ? 'is-player' : 'is-empty'} />)}
        <b>{lobby.players.length}/{lobby.maxPlayers}</b>{lobby.botSlots > 0 && <small>+ {lobby.botSlots} бот.</small>}
      </div>
      <div className="lobby-card__meta"><span>◷ {formatLobbyTimer(lobby.turnTimerSeconds)}</span><span><OnlineIcon name="map" /> Классическая карта</span></div>
      <button type="button" disabled={joining || !isLobbyJoinable(lobby)} onClick={() => onJoin(lobby)}>{lobbyJoinLabel(lobby, joining)}</button>
    </div>
  </article>;
}
