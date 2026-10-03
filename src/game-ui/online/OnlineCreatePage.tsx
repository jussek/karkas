import { useState } from 'react';
import { createLobby } from '../../online/lobbyApi';
import type { LobbyVisibility, OnlineLobbySnapshot, OnlineTurnTimerSeconds } from '../../online/types';
import { TILE_ASSETS } from '../tiles/tileAssets';
import { OnlineIcon } from './OnlineIcon';
import { CREATE_PLAYER_OPTIONS, CREATE_TIMER_OPTIONS, DEFAULT_ONLINE_LOBBY, timerLabel } from './onlineLobbyModel';
import './onlineLobby.css';
import './createLobbyCode.css';
import '../referenceDetails.css';

const CREATE_MAP_PREVIEW = [TILE_ASSETS[8], TILE_ASSETS[31], TILE_ASSETS[62], TILE_ASSETS[86]];
const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const errorMessage = (reason: unknown) => {
  const text = reason && typeof reason === 'object' && 'message' in reason ? String((reason as { message?: unknown }).message ?? '') : '';
  if (text.includes('already in active lobby')) return 'Вы уже состоите в другом активном лобби. Сначала выйдите из него.';
  if (text.includes('already used')) return 'Такой код уже занят. Выберите другой шестизначный код.';
  if (text.includes('exactly 6')) return 'Код входа должен состоять ровно из 6 букв или цифр.';
  return 'Не удалось создать лобби. Проверьте соединение и повторите.';
};

export function OnlineCreatePage({ onBack, onCreated }: { onBack:()=>void; onCreated:(lobby:OnlineLobbySnapshot)=>void }) {
  const [name,setName]=useState('');
  const [maxPlayers,setMaxPlayers]=useState<number>(DEFAULT_ONLINE_LOBBY.maxPlayers);
  const [timer,setTimer]=useState<OnlineTurnTimerSeconds>(0);
  const [visibility,setVisibility]=useState<LobbyVisibility>('public');
  const [joinCode,setJoinCode]=useState('');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const privateCodeValid = visibility !== 'private' || /^[A-Z0-9]{6}$/.test(joinCode);

  const submit=async()=>{
    if(!privateCodeValid)return;
    setPending(true);setError('');
    try{
      onCreated(await createLobby({name,visibility,maxPlayers,turnTimerSeconds:timer,botFillEnabled:false,joinCode:visibility==='private'?joinCode:undefined}));
    }catch(reason){
      if(import.meta.env.DEV)console.error('Не удалось создать лобби',reason);
      setError(errorMessage(reason));
    }finally{setPending(false)}
  };

  return <main className="online-room"><div className="online-room__shell">
    <header className="online-room__header"><button aria-label="Назад" onClick={onBack}><OnlineIcon name="back"/></button><h1>Создать игру</h1><button aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close"/></button></header>
    <section className="room-panel create-form"><label>Название лобби <input value={name} maxLength={80} placeholder="Название игры" onChange={(e)=>setName(e.target.value)}/></label>
      <div className="classic-map"><div className="classic-map__tiles" aria-hidden="true">{CREATE_MAP_PREVIEW.map((tile)=><img src={tile.url} alt="" key={tile.cardId}/>)}</div><span><b><OnlineIcon name="map"/>Классическая карта</b><small>Базовая игра с рекой</small></span></div>
      <fieldset><legend><OnlineIcon name="users"/>Количество игроков</legend><div className="room-chips">{CREATE_PLAYER_OPTIONS.map(v=><button type="button" aria-pressed={maxPlayers===v} onClick={()=>setMaxPlayers(v)} key={v}>{v}</button>)}</div></fieldset>
      <fieldset><legend><OnlineIcon name="clock"/>Таймер хода</legend><div className="room-chips">{CREATE_TIMER_OPTIONS.map(v=><button type="button" aria-pressed={timer===v} onClick={()=>setTimer(v)} key={v}>{timerLabel(v)}</button>)}</div></fieldset>
      <fieldset className="visibility"><legend><OnlineIcon name="public"/>Доступ</legend><div className="room-chips"><button type="button" aria-pressed={visibility==='public'} onClick={()=>{setVisibility('public');setError('')}}><OnlineIcon name="public"/>Публичная</button><button type="button" aria-pressed={visibility==='private'} onClick={()=>{setVisibility('private');setError('')}}><OnlineIcon name="private"/>По коду</button></div></fieldset>
      {visibility==='private'&&<label className="create-join-code"><span><OnlineIcon name="private"/>Код входа</span><input value={joinCode} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={6} placeholder="A1B2C3" onChange={(event)=>setJoinCode(normalizeCode(event.target.value))}/><small>Придумайте 6 букв или цифр. Этот код введут остальные игроки.</small></label>}
      {error&&<p className="room-error">{error}</p>}
    </section><button className="room-primary" disabled={pending||!privateCodeValid} onClick={()=>void submit()}><OnlineIcon name={pending?'refresh':'plus'}/>{pending?'Создаём…':'Создать игру'}</button>
  </div></main>;
}
