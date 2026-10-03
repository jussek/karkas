import type { OnlineLobbyDirectoryEntry } from '../../online/types';
import { TILE_ASSETS } from '../tiles/tileAssets';
import { OnlineIcon } from './OnlineIcon';
import { MeepleSprite } from './MeepleSprite';
import { SEAT_COLORS } from './onlineLobbyModel';
import { formatLobbyTimer, isLobbyJoinable, lobbyDisplayName, lobbyJoinLabel, lobbyThumbnailSeed } from './lobbyBrowserModel';

export function LobbyBrowserCard({ lobby, joining, onJoin }: { lobby: OnlineLobbyDirectoryEntry; joining: boolean; onJoin: (lobby: OnlineLobbyDirectoryEntry) => void }) {
  const seed = lobbyThumbnailSeed(lobby.id);
  const tiles = Array.from({ length: 4 }, (_, index) => TILE_ASSETS[(seed + index * 31) % TILE_ASSETS.length]);
  return <article className={`lobby-card${lobby.visibility === 'private' ? ' is-private' : ''}`}>
    <div className="lobby-card__tiles" aria-hidden="true">{tiles.map((tile, index) => <img key={tile.cardId} src={tile.url} alt="" style={{ transform: `rotate(${[-4, 3, 2, -3][index]}deg)` }} />)}</div>
    <div className="lobby-card__body">
      <div className="lobby-card__title"><OnlineIcon name={lobby.visibility === 'private' ? 'private' : 'public'} /><h2>{lobbyDisplayName(lobby)}</h2>{lobby.visibility === 'private' && <small>По коду</small>}</div>
      <div className="lobby-card__meeples" aria-label={`${lobby.playerCount} из ${lobby.maxPlayers} игроков`}>
        {Array.from({ length: lobby.maxPlayers }, (_, index) => <MeepleSprite className={index < lobby.playerCount ? 'is-player' : 'is-empty'} color={SEAT_COLORS[index] ?? 'black'} size={18} key={index}/>)}
        <b>{lobby.playerCount}/{lobby.maxPlayers}</b>{lobby.botSlots > 0 && <small className="lobby-card__bots"><OnlineIcon name="bot" />+{lobby.botSlots}</small>}
      </div>
      <div className="lobby-card__meta"><span><OnlineIcon name="clock" />{formatLobbyTimer(lobby.turnTimerSeconds)}</span><span><OnlineIcon name="map" />Классическая карта</span></div>
      <button type="button" disabled={joining || !isLobbyJoinable(lobby)} onClick={() => onJoin(lobby)}><OnlineIcon name={lobby.visibility === 'private' ? 'private' : joining ? 'refresh' : 'play'}/>{lobbyJoinLabel(lobby, joining)}</button>
    </div>
  </article>;
}
