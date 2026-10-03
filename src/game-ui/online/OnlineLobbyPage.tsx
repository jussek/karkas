import { useEffect, useRef, useState } from 'react';
import { ensureOnlineIdentity } from '../../online/auth';
import { listLobbyMessages, mergeLobbyMessages, sendLobbyMessage } from '../../online/chatApi';
import { getLobby, leaveLobby, setLobbyDisplayName, setReady, startLobby, updateLobbySettings } from '../../online/lobbyApi';
import { subscribeToLobby, subscribeToLobbyMessages } from '../../online/realtime';
import { getMatchByLobby, startOnlineMatch } from '../../online/matchApi';
import type { OnlineMatch } from '../../online/matchTypes';
import type { OnlineLobbyMessage, OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Не удалось скопировать код.');
    }
  };

  if (lobby.status === 'closed') {
    return <main className="online-room"><div className="online-room__shell"><section className="room-panel room-terminal"><OnlineIcon name="meeple"/><h1>Лобби закрыто организатором</h1><button className="room-primary" onClick={onExit}><OnlineIcon name="home"/>В меню</button></section></div></main>;
  }

  return <main className="online-room"><div className="online-room__shell lobby-shell">
    <header className="online-room__header">
      <button aria-label="Покинуть лобби" onClick={() => void leave()}><OnlineIcon name="back"/></button>
      <div><h1>{lobbyDisplayName(lobby)}</h1><small>Код: {lobby.code}</small></div>
      <button aria-label="Закрыть" onClick={() => void leave()}><OnlineIcon name="close"/></button>
    </header>

    {lobby.visibility === 'private' && <div className="room-code"><b><OnlineIcon name="private"/>Код: {lobby.code}</b><button onClick={() => void copy()}><OnlineIcon name={copied ? 'check' : 'copy'}/>{copied ? 'Скопирован' : 'Копировать'}</button></div>}
    {lobby.status === 'starting' && <section className="room-panel room-starting"><span className="online-browser__spinner"/><h2>Игра запускается…</h2><p>Подготовка сетевой партии</p></section>}

    <section className="room-panel players-panel">
      <h2><span className="panel-title"><OnlineIcon name="users"/>Игроки</span><span>{lobby.players.length}/{lobby.maxPlayers}</span></h2>
      <div className="room-players">
        {Array.from({ length: lobby.maxPlayers }, (_, seat) => {
          const p = lobby.players.find((item) => item.seatIndex === seat);
          const bot = !p && lobby.status === 'starting' && seat >= lobby.maxPlayers - lobby.botSlots;
          const mine = p?.userId === userId;
          return <div className={`room-player seat-${SEAT_COLORS[seat]}${p?.ready ? ' is-ready' : ''}`} key={seat}>
            <OnlineIcon name={bot ? 'bot' : 'meeple'}/>
            <span>
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
              </> : bot ? <><b>Бот</b><small className="room-player__status"><OnlineIcon name="bot"/>Дозаполнение</small></> : <><b>Ожидание игрока</b><small>Свободное место</small></>}
            </span>
          </div>;
        })}
      </div>
    </section>

    <section className="room-panel lobby-settings">
      <h2>Настройки</h2>
      <label>Название <input disabled={!host || lobby.status !== 'waiting'} value={lobby.name ?? ''} onChange={(event) => setLobby({ ...lobby, name: event.target.value })} onBlur={(event) => void settings({ name: event.target.value })}/></label>
      <div className="settings-grid">
        <label><span className="label-with-icon"><OnlineIcon name="users"/>Игроков</span><select disabled={!host || busy || lobby.status !== 'waiting'} value={lobby.maxPlayers} onChange={(event) => void settings({ maxPlayers: Number(event.target.value) })}>{CREATE_PLAYER_OPTIONS.map((value) => <option disabled={value < lobby.players.length} key={value}>{value}</option>)}</select></label>
        <label><span className="label-with-icon"><OnlineIcon name="clock"/>Таймер</span><select disabled={!host || busy || lobby.status !== 'waiting'} value={lobby.turnTimerSeconds} onChange={(event) => void settings({ turnTimerSeconds: Number(event.target.value) as OnlineTurnTimerSeconds })}>{CREATE_TIMER_OPTIONS.map((value) => <option value={value} key={value}>{timerLabel(value)}</option>)}</select></label>
      </div>
      <label className="room-toggle"><span><b><OnlineIcon name="bot"/>Боты (дозаполнение)</b><small>{lobby.botFillEnabled ? 'Свободные места будут заполнены при старте' : 'Выключено'}</small></span><button disabled={!host || busy || lobby.status !== 'waiting'} aria-pressed={lobby.botFillEnabled} onClick={() => void settings({ botFillEnabled: !lobby.botFillEnabled })}>{lobby.botFillEnabled ? 'Вкл' : 'Выкл'}</button></label>
      {host && lobby.status === 'waiting' && <div className="room-chips"><button disabled={busy} aria-pressed={lobby.visibility === 'public'} onClick={() => void settings({ visibility: 'public' })}><OnlineIcon name="public"/>Публичная</button><button disabled={busy} aria-pressed={lobby.visibility === 'private'} onClick={() => void settings({ visibility: 'private' })}><OnlineIcon name="private"/>По коду</button></div>}
    </section>

    <section className="room-panel chat-panel">
      <h2><span className="panel-title"><OnlineIcon name="chat"/>Чат</span></h2>
      <div className="chat-messages" ref={chatRef} onScroll={(event) => { const element = event.currentTarget; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>{messages.map((message) => <p className={message.userId === userId ? 'is-own' : ''} key={message.id}><b>{message.displayName}</b><span>{message.body}</span><time>{new Date(message.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time></p>)}</div>
      <div className="chat-input"><input value={body} maxLength={280} placeholder="Сообщение…" onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }}/><button aria-label="Отправить" disabled={!validateChatBody(body) || busy} onClick={send}><OnlineIcon name="send"/></button></div>
    </section>

    {error && <p className="room-error">{error}</p>}
    <footer className="lobby-actions">
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
