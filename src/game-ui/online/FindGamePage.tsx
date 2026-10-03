import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureOnlineIdentity } from '../../online/auth';
import { joinLobby, joinLobbyByCode, listPublicLobbies } from '../../online/lobbyApi';
import { getSupabaseClient } from '../../online/supabaseClient';
import type { OnlineLobbySnapshot } from '../../online/types';
import { LobbyBrowserCard } from './LobbyBrowserCard';
import { OnlineIcon } from './OnlineIcon';
import { LobbyCodePad } from './LobbyCodePad';
import { filterLobbies, onlineBrowserAvailability, type LobbyTimerFilter } from './lobbyBrowserModel';
import './onlineBrowser.css';
import './joinCode.css';

const FILTERS: readonly { value: LobbyTimerFilter; label: string }[] = [{ value: 'any', label: 'Любой' }, { value: 15, label: '15 сек' }, { value: 30, label: '30 сек' }, { value: 60, label: '60 сек' }, { value: 0, label: 'Без таймера' }];
type LoadState = 'loading' | 'loaded' | 'error';
const joinErrorMessage=(reason:unknown)=>{
  const text=reason&&typeof reason==='object'&&'message' in reason?String((reason as {message?:unknown}).message??''):'';
  if(text.includes('already in active lobby'))return 'Вы уже состоите в другом активном лобби.';
  if(text.includes('not joinable'))return 'Лобби с таким кодом не найдено или оно уже запущено.';
  if(text.includes('full'))return 'В этом лобби уже нет свободных мест.';
  return 'Не удалось присоединиться. Проверьте код и соединение.';
};

export function FindGamePage({ onBack, onCreate, onJoined }: { onBack: () => void; onCreate: () => void; onJoined: (lobby: OnlineLobbySnapshot) => void }) {
  const [lobbies, setLobbies] = useState<OnlineLobbySnapshot[]>([]);
  const [filter, setFilter] = useState<LobbyTimerFilter>('any');
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [codeOpen,setCodeOpen]=useState(false);
  const [code,setCode]=useState('');
  const [codeError,setCodeError]=useState('');
  const [codePending,setCodePending]=useState(false);
  const [joinError,setJoinError]=useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setState('loading');
    if (onlineBrowserAvailability(getSupabaseClient()) === 'unavailable') { setState('error'); setRefreshing(false); return; }
    try { await ensureOnlineIdentity(); setLobbies(await listPublicLobbies()); setState('loaded'); }
    catch (error) { if(import.meta.env.DEV)console.error('Не удалось загрузить online lobby',error); setState('error'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => filterLobbies(lobbies, filter), [lobbies, filter]);
  const handleJoin = async (lobby: OnlineLobbySnapshot) => {
    setJoiningId(lobby.id);setJoinError('');
    try { onJoined(await joinLobby(lobby.id)); }
    catch (error) { if(import.meta.env.DEV)console.error('Не удалось присоединиться к lobby',error); setJoinError(joinErrorMessage(error)); }
    finally { setJoiningId(null); }
  };
  const handleCodeJoin=async()=>{
    if(!/^\d{4}$/.test(code))return;
    setCodePending(true);setCodeError('');
    try{onJoined(await joinLobbyByCode(code));}
    catch(error){if(import.meta.env.DEV)console.error('Не удалось войти по коду',error);setCodeError(joinErrorMessage(error));}
    finally{setCodePending(false)}
  };

  return <main className="online-browser">
    <div className="online-browser__shell">
      <header className="online-browser__header"><button type="button" aria-label="Назад" onClick={onBack}><OnlineIcon name="back" /></button><h1>Найти игру</h1><button type="button" aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close" /></button></header>
      <nav className="online-browser__filters" aria-label="Фильтр таймера">{FILTERS.map((item) => <button type="button" key={String(item.value)} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</nav>
      {joinError&&<p className="online-browser__join-error">{joinError}</p>}
      <section className="online-browser__list" aria-live="polite">
        {state === 'loading' && <div className="online-browser__state"><span className="online-browser__spinner" /><h2>Ищем свободные лобби…</h2></div>}
        {state === 'error' && <div className="online-browser__state"><OnlineIcon name="meeple" /><h2>Онлайн-режим временно недоступен</h2><p>Проверьте соединение и попробуйте ещё раз.</p><div><button type="button" onClick={() => void load()}><OnlineIcon name="retry"/>Повторить</button><button type="button" onClick={onBack}><OnlineIcon name="back"/>Назад</button></div></div>}
        {state === 'loaded' && shown.map((lobby) => <LobbyBrowserCard key={lobby.id} lobby={lobby} joining={joiningId === lobby.id} onJoin={(item) => void handleJoin(item)} />)}
        {state === 'loaded' && shown.length === 0 && <div className="online-browser__state"><OnlineIcon name="map" /><h2>Сейчас нет доступных игр</h2><p>Создайте лобби или войдите в закрытое по коду.</p></div>}
      </section>
      <footer className="online-browser__actions online-browser__actions--three"><button type="button" onClick={() => void load(true)} disabled={refreshing}><OnlineIcon name="refresh" />{refreshing ? 'Обновляем…' : 'Обновить'}</button><button type="button" className="is-code" onClick={()=>{setCode('');setCodeOpen(true);setCodeError('')}}><OnlineIcon name="private"/>По коду</button><button type="button" className="is-create" onClick={onCreate}><OnlineIcon name="plus" />Создать</button></footer>
    </div>
    {codeOpen&&<LobbyCodePad title="Войти по коду" description="Введите 4 цифры закрытого лобби." value={code} onChange={(value)=>{setCode(value);setCodeError('')}} onConfirm={()=>void handleCodeJoin()} onClose={()=>setCodeOpen(false)} pending={codePending} error={codeError}/>} 
  </main>;
}
