import { useEffect, useRef, useState } from 'react';
import { ensureOnlineIdentity } from '../../online/auth';
import { listLobbyMessages, mergeLobbyMessages, sendLobbyMessage } from '../../online/chatApi';
import { getLobby, leaveLobby, setLobbyDisplayName, setReady, startLobby, updateLobbySettings } from '../../online/lobbyApi';
import { subscribeToLobby, subscribeToLobbyMessages } from '../../online/realtime';
import { getMatchByLobby, startOnlineMatch } from '../../online/matchApi';
import type { OnlineMatch } from '../../online/matchTypes';
import type { OnlineLobbyMessage, OnlineLobbySnapshot } from '../../online/types';
import { TILE_ASSETS } from '../tiles/tileAssets';
import { OnlineIcon } from './OnlineIcon';
import {
  CREATE_PLAYER_OPTIONS,
  CREATE_TIMER_OPTIONS,
  SEAT_COLORS,
  currentLobbyPlayer,
  isLobbyHost,
  startBlockReason,
  timerLabel,
  validateChatBody,
} from './onlineLobbyModel';
import { lobbyDisplayName } from './lobbyBrowserModel';
import './onlineLobby.css';
import './lobbyIdentity.css';
import './lobbyReferenceFinal.css';
import './lobbyMenuV2.css';

const LOBBY_MAP_PREVIEW = [TILE_ASSETS[8], TILE_ASSETS[31], TILE_ASSETS[62], TILE_ASSETS[86]];

export function OnlineLobbyPage({
  lobbyId,
  initialLobby,
  onExit,
  onMatch,
}: {
  lobbyId: string;
  initialLobby: OnlineLobbySnapshot;
  onExit: () => void;
  onMatch: (match: OnlineMatch) => void;
}) {
  const [lobby, setLobby] = useState(initialLobby);
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState<OnlineLobbyMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const materializing = useRef(false);

  useEffect(() => {
    let active = true;
    let stopLobby = () => {};
    let stopChat = () => {};
    (async () => {
      try {
        const id = await ensureOnlineIdentity();
        const fresh = await getLobby(lobbyId);
        const initial = await listLobbyMessages(lobbyId);
        if (!active) return;
        setUserId(id);
        setLobby(fresh);
        setMessages(initial);
        stopLobby = subscribeToLobby(lobbyId, (next, reason) => {
          if (next) setLobby(next);
          if (reason) setError('Связь с лобби прервана.');
        });
        stopChat = subscribeToLobbyMessages(lobbyId, (next, reason) => {
          if (!reason) setMessages((current) => mergeLobbyMessages(current, next));
        });
      } catch (reason) {
        if (import.meta.env.DEV) console.error(reason);
        if (active) setError('Не удалось подключиться к лобби.');
      }
    })();
    return () => {
      active = false;
      stopLobby();
      stopChat();
    };
  }, [lobbyId]);

  useEffect(() => {
    if (nearBottom.current) chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const me = currentLobbyPlayer(lobby, userId);
  const host = isLobbyHost(lobby, userId);
  const startReason = startBlockReason(lobby, userId);

  useEffect(() => {
    if (me?.displayName) setNameDraft(me.displayName);
  }, [me?.displayName]);

  useEffect(() => {
    if (materializing.current) return;
    if (lobby.status === 'starting' && host) {
      materializing.current = true;
      void startOnlineMatch(lobbyId).then(onMatch).catch((reason) => {
        if (import.meta.env.DEV) console.error(reason);
        setError('Не удалось создать сетевую партию.');
        materializing.current = false;
      });
    } else if (lobby.status === 'in_game') {
      materializing.current = true;
      void getMatchByLobby(lobbyId).then(onMatch).catch((reason) => {
        if (import.meta.env.DEV) console.error(reason);
        setError('Не удалось открыть сетевую партию.');
        materializing.current = false;
      });
    }
  }, [host, lobby.status, lobbyId, onMatch]);

  const mutate = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (reason) {
      if (import.meta.env.DEV) console.error(reason);
      setError('Не удалось выполнить действие. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => mutate(async () => {
    await leaveLobby(lobbyId);
    onExit();
  });
  const settings = (patch: Parameters<typeof updateLobbySettings>[1]) => mutate(async () => {
    setLobby(await updateLobbySettings(lobbyId, patch));
  });
  const saveName = () => {
    const value = nameDraft.trim();
    if (!me || !value || value === me.displayName || lobby.status !== 'waiting' || busy) return;
    void mutate(async () => {
      setLobby(await setLobbyDisplayName(lobbyId, value));
    });
  };
  const send = () => {
    const value = validateChatBody(body);
    if (!value) return;
    void mutate(async () => {
      await sendLobbyMessage(lobbyId, value);
      setBody('');
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('Не удалось скопировать код.');
    }
  };

  if (lobby.status === 'closed') {
    return <main className="online-room"><div className="online-room__shell"><section className="room-panel room-terminal"><OnlineIcon name="meeple"/><h1>Лобби закрыто организатором</h1><button className="room-primary" onClick={onExit}><OnlineIcon name="home"/>В меню</button></section></div></main>;
  }

  return <main className="online-room lobby-menu-v2"><div className="online-room__shell lobby-shell">
    <header className="online-room__header lobby-reference-header">
      <button aria-label="Покинуть лобби" onClick={() => void leave()}><OnlineIcon name="back"/></button>
      <div className="lobby-reference-header__title">
        {host && lobby.status === 'waiting' ? <input
          className="lobby-title-editor"
          aria-label="Название лобби"
          value={lobby.name ?? ''}
          placeholder={`Лобби #${lobby.code}`}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setLobby({ ...lobby, name: event.target.value })}
          onBlur={(event) => void settings({ name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        /> : <h1>{lobbyDisplayName(lobby)}</h1>}
        <button type="button" className="lobby-code-copy" onClick={() => void copy()} aria-label="Скопировать код лобби">
          {copied ? 'Код скопирован' : `Код: ${lobby.code}`}
        </button>
      </div>
      <button aria-label="Закрыть" onClick={() => void leave()}><OnlineIcon name="close"/></button>
    </header>

    {lobby.status === 'starting' && <section className="room-panel room-starting"><span className="online-browser__spinner"/><h2>Игра запускается…</h2><p>Подготовка сетевой партии</p></section>}

    <section className="room-panel lobby-menu-settings">
      <div className="lobby-map-card">
        <strong>Карта</strong>
        <div className="lobby-map-preview" aria-hidden="true">
          {LOBBY_MAP_PREVIEW.map((tile) => <img src={tile.url} alt="" key={tile.cardId}/>) }
        </div>
        <small>Классическая карта</small>
      </div>
      <div className="lobby-settings-stack">
        <strong>Таймер на ход</strong>
        <fieldset className="lobby-timer" disabled={!host || busy || lobby.status !== 'waiting'}>
          <legend>Таймер на ход</legend>
          <div>{CREATE_TIMER_OPTIONS.map((value) => <button type="button" key={value} aria-pressed={lobby.turnTimerSeconds === value} onClick={() => void settings({ turnTimerSeconds: value })}>{timerLabel(value)}</button>)}</div>
        </fieldset>
        <div className="lobby-settings-bottom">
          <label>Игроков
            <select disabled={!host || busy || lobby.status !== 'waiting'} value={lobby.maxPlayers} onChange={(event) => void settings({ maxPlayers: Number(event.target.value) })}>
              {CREATE_PLAYER_OPTIONS.map((value) => <option disabled={value < lobby.players.length} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="bot-toggle">Боты
            <button type="button" disabled={!host || busy || lobby.status !== 'waiting'} aria-pressed={lobby.botFillEnabled} onClick={() => void settings({ botFillEnabled: !lobby.botFillEnabled })}>{lobby.botFillEnabled ? 'Вкл.' : 'Выкл.'}</button>
          </label>
          <label>Доступ
            <span className="lobby-visibility">
              <button type="button" disabled={!host || busy || lobby.status !== 'waiting'} aria-pressed={lobby.visibility === 'public'} onClick={() => void settings({ visibility: 'public' })}><OnlineIcon name="public"/>Все</button>
              <button type="button" disabled={!host || busy || lobby.status !== 'waiting'} aria-pressed={lobby.visibility === 'private'} onClick={() => void settings({ visibility: 'private' })}><OnlineIcon name="private"/>Код</button>
            </span>
          </label>
        </div>
      </div>
    </section>

    <section className="room-panel players-panel lobby-reference-players">
      <h2><span className="panel-title"><OnlineIcon name="users"/>Игроки</span><span>{lobby.players.length}/{lobby.maxPlayers}</span></h2>
      <div className="room-players">
        {Array.from({ length: lobby.maxPlayers }, (_, seat) => {
          const p = lobby.players.find((item) => item.seatIndex === seat);
          const bot = !p && lobby.status === 'starting' && seat >= lobby.maxPlayers - lobby.botSlots;
          const mine = p?.userId === userId;
          const seatColor = SEAT_COLORS[seat] ?? 'black';
          return <div className={`room-player seat-${seatColor}${p?.ready ? ' is-ready' : ''}${mine ? ' is-mine' : ''}`} key={seat}>
            <span className="room-player__seat-number" aria-hidden="true">{seat + 1}</span>
            {bot ? <span className="room-player__bot"><OnlineIcon name="bot"/></span> : <span className="lobby-meeple" aria-hidden="true"/>}
            <span className="room-player__body">
              {p ? <>
                {mine ? <div className="room-player__identity">
                  <div className="room-player__name-wrap">
                    <input
                      className="room-player__name-input"
                      aria-label="Ваше имя"
                      value={nameDraft}
                      maxLength={32}
                      disabled={busy || lobby.status !== 'waiting'}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          saveName();
                        }
                      }}
                    />
                    {p.ready && <span className="room-player__ready-check" aria-label="Готов"><OnlineIcon name="check"/></span>}
                  </div>
                  <button
                    type="button"
                    className="room-player__name-save"
                    aria-label="Сохранить имя"
                    disabled={busy || lobby.status !== 'waiting' || !nameDraft.trim() || nameDraft.trim() === p.displayName}
                    onClick={saveName}
                  ><OnlineIcon name="check"/></button>
                </div> : <div className="room-player__label"><b>{p.displayName}</b>{p.ready && <span className="room-player__ready-check" aria-label="Готов"><OnlineIcon name="check"/></span>}</div>}
                <small className="room-player__status">{p.userId === lobby.hostUserId ? <><OnlineIcon name="crown"/>Организатор</> : p.ready ? <>Готов</> : <>Не готов</>}</small>
              </> : bot ? <><b>Бот</b><small className="room-player__status"><OnlineIcon name="bot"/>Дозаполнение</small></> : <><b>Ожидание игрока…</b><small>Свободное место</small></>}
            </span>
            <span className={`room-player__ready-state${p?.ready ? ' is-ready' : ''}${!p ? ' is-empty' : ''}`} aria-label={p?.ready ? 'Готов' : p ? 'Не готов' : 'Свободное место'}>
              {p?.ready ? <><OnlineIcon name="check"/><em>Готов</em></> : p ? <em>Не готов</em> : <i/>}
            </span>
          </div>;
        })}
      </div>
    </section>

    <section className="room-panel chat-panel lobby-reference-chat">
      <h2><span className="panel-title"><OnlineIcon name="chat"/>Чат лобби</span></h2>
      <div className="chat-messages" ref={chatRef} onScroll={(event) => { const element = event.currentTarget; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>{messages.map((message) => <p className={message.userId === userId ? 'is-own' : ''} key={message.id}><b>{message.displayName}</b><span>{message.body}</span><time>{new Date(message.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time></p>)}</div>
      <div className="chat-input"><input value={body} maxLength={280} placeholder="Написать сообщение…" onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }}/><button aria-label="Отправить" disabled={!validateChatBody(body) || busy} onClick={send}><OnlineIcon name="send"/></button></div>
    </section>

    {error && <p className="room-error">{error}</p>}
    <footer className="lobby-actions lobby-reference-actions">
      <button
        className={`ready-button${me?.ready ? ' is-ready' : ''}`}
        aria-pressed={Boolean(me?.ready)}
        disabled={!me || lobby.status !== 'waiting' || busy}
        onClick={() => void mutate(() => setReady(lobbyId, !me?.ready))}
      ><OnlineIcon name={me?.ready ? 'close' : 'check'}/>{me?.ready ? 'Не готов' : 'Готов'}</button>
      {host ? <div><button className="room-primary" disabled={!!startReason || busy} onClick={() => void mutate(async () => setLobby(await startLobby(lobbyId)))}><OnlineIcon name="play"/>Начать игру</button>{startReason && <small>{startReason}</small>}</div> : <p>Ожидание организатора</p>}
    </footer>
  </div></main>;
}