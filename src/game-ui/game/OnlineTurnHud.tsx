import { memo,useEffect,useRef,useState } from 'react';
import { formatCountdown,remainingSeconds } from '../../online/timerModel';
import type { MatchConnectionStatus } from '../../online/matchApi';
import { timerVisualState } from './gamePresentationModel';

export const OnlineTurnHud=memo(function OnlineTurnHud({deadline,label,connection,onExpired}:{deadline:string|null;label:string;connection:MatchConnectionStatus;onExpired:()=>void}){
  const [now,setNow]=useState(Date.now()),reported=useRef<string|null>(null);
  useEffect(()=>{setNow(Date.now());if(!deadline)return;const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[deadline]);
  const seconds=remainingSeconds(deadline,now),visual=timerVisualState(seconds);
  useEffect(()=>{if(seconds!==0||!deadline||reported.current===deadline)return;reported.current=deadline;onExpired();},[deadline,onExpired,seconds]);
  return <div className={`game-turn-status is-${visual}`} role="status"><span>{label}</span>{seconds!==null&&<b role="timer">{seconds===0?'Время вышло…':formatCountdown(seconds)}</b>}<i className={`connection-dot is-${connection}`} aria-label={connection==='connected'?'Подключено':connection==='reconnecting'?'Переподключение…':'Нет связи'} />{connection!=='connected'&&<small>{connection==='reconnecting'?'Переподключение…':'Нет связи'}</small>}</div>;
});
