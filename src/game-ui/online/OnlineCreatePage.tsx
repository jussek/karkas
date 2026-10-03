import { useState } from 'react';
import { createLobby } from '../../online/lobbyApi';
import type { LobbyVisibility, OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';
import { TILE_ASSETS } from '../tiles/tileAssets';
import { OnlineIcon } from './OnlineIcon';
import { CREATE_PLAYER_OPTIONS, CREATE_TIMER_OPTIONS, DEFAULT_ONLINE_LOBBY, timerLabel } from './onlineLobbyModel';
import './onlineLobby.css';

const CREATE_MAP_PREVIEW = [TILE_ASSETS[8], TILE_ASSETS[31], TILE_ASSETS[62], TILE_ASSETS[86]];

export function OnlineCreatePage({ onBack, onCreated }: { onBack:()=>void; onCreated:(lobby:OnlineLobbySnapshot)=>void }) {
  const [name,setName]=useState(''); const [maxPlayers,setMaxPlayers]=useState<number>(DEFAULT_ONLINE_LOBBY.maxPlayers);
  const [timer,setTimer]=useState<OnlineTurnTimerSeconds>(0); const [botFill,setBotFill]=useState(false); const [visibility,setVisibility]=useState<LobbyVisibility>('public');
  const [pending,setPending]=useState(false); const [error,setError]=useState(false);
  const submit=async()=>{setPending(true);setError(false);try{onCreated(await createLobby({name,visibility,maxPlayers,turnTimerSeconds:timer,botFillEnabled:botFill}));}catch(reason){if(import.meta.env.DEV)console.error('Не удалось создать лобби',reason);setError(true);}finally{setPending(false)}};
  return <main className="online-room"><div className="online-room__shell">
    <header className="online-room__header"><button aria-label="Назад" onClick={onBack}><OnlineIcon name="back"/></button><h1>Создать игру</h1><button aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close"/></button></header>
    <section className="room-panel create-form"><label>Название лобби <input value={name} maxLength={80} placeholder="Лобби #CODE" onChange={(e)=>setName(e.target.value)}/></label>
      <div className="classic-map"><div className="classic-map__tiles" aria-hidden="true">{CREATE_MAP_PREVIEW.map((tile)=><img src={tile.url} alt="" key={tile.cardId}/>)}</div><span><b>Классическая карта</b><small>Базовая игра с рекой</small></span></div>
      <fieldset><legend>Количество игроков</legend><div className="room-chips">{CREATE_PLAYER_OPTIONS.map(v=><button type="button" aria-pressed={maxPlayers===v} onClick={()=>setMaxPlayers(v)} key={v}>{v}</button>)}</div></fieldset>
      <fieldset><legend>Таймер хода</legend><div className="room-chips">{CREATE_TIMER_OPTIONS.map(v=><button type="button" aria-pressed={timer===v} onClick={()=>setTimer(v)} key={v}>{timerLabel(v)}</button>)}</div></fieldset>
      <label className="room-toggle"><span><b>Боты (дозаполнение)</b><small>Свободные места заполнятся при старте</small></span><button type="button" aria-pressed={botFill} onClick={()=>setBotFill(!botFill)}>{botFill?'Вкл':'Выкл'}</button></label>
      <fieldset className="visibility"><legend>Доступ</legend><div className="room-chips"><button type="button" aria-pressed={visibility==='public'} onClick={()=>setVisibility('public')}>Публичная</button><button type="button" aria-pressed={visibility==='private'} onClick={()=>setVisibility('private')}>По коду</button></div></fieldset>
      {error&&<p className="room-error">Не удалось создать лобби. Проверьте соединение и повторите.</p>}
    </section><button className="room-primary" disabled={pending} onClick={()=>void submit()}>{pending?'Создаём…':'Создать игру'}</button>
  </div></main>;
}
