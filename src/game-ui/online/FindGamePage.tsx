import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureOnlineIdentity } from '../../online/auth';
import { joinLobby, listPublicLobbies } from '../../online/lobbyApi';
import { getSupabaseClient } from '../../online/supabaseClient';
import type { OnlineLobbySnapshot } from '../../online/types';
import { LobbyBrowserCard } from './LobbyBrowserCard';
import { OnlineIcon } from './OnlineIcon';
import { filterLobbies, onlineBrowserAvailability, type LobbyTimerFilter } from './lobbyBrowserModel';
import './onlineBrowser.css';

const FILTERS: readonly { value: LobbyTimerFilter; label: string }[] = [{ value: 'any', label: 'Любой' }, { value: 15, label: '15 сек' }, { value: 30, label: '30 сек' }, { value: 60, label: '60 сек' }, { value: 0, label: 'Без таймера' }];
type LoadState = 'loading' | 'loaded' | 'error';

export function FindGamePage({ onBack, onCreate, onJoined }: { onBack: () => void; onCreate: () => void; onJoined: (lobby: OnlineLobbySnapshot) => void }) {
  const [lobbies, setLobbies] = useState<OnlineLobbySnapshot[]>([]);
  const [filter, setFilter] = useState<LobbyTimerFilter>('any');
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

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
    setJoiningId(lobby.id);
    try { onJoined(await joinLobby(lobby.id)); }
    catch (error) { if(import.meta.env.DEV)console.error('Не удалось присоединиться к lobby',error); setState('error'); }
    finally { setJoiningId(null); }
  };

  return <main className="online-browser">
    <div className="online-browser__shell">
      <header className="online-browser__header"><button type="button" aria-label="Назад" onClick={onBack}><OnlineIcon name="back" /></button><h1>Найти игру</h1><button type="button" aria-label="Закрыть" onClick={onBack}><OnlineIcon name="close" /></button></header>
      <nav className="online-browser__filters" aria-label="Фильтр таймера">{FILTERS.map((item) => <button type="button" key={String(item.value)} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</nav>
      <section className="online-browser__list" aria-live="polite">
        {state === 'loading' && <div className="online-browser__state"><span className="online-browser__spinner" /><h2>Ищем свободные лобби…</h2></div>}
        {state === 'error' && <div className="online-browser__state"><OnlineIcon name="meeple" /><h2>Онлайн-режим временно недоступен</h2><p>Проверьте соединение и попробуйте ещё раз.</p><div><button type="button" onClick={() => void load()}>Повторить</button><button type="button" onClick={onBack}>Назад</button></div></div>}
        {state === 'loaded' && shown.map((lobby) => <LobbyBrowserCard key={lobby.id} lobby={lobby} joining={joiningId === lobby.id} onJoin={(item) => void handleJoin(item)} />)}
        {state === 'loaded' && shown.length === 0 && <div className="online-browser__state"><OnlineIcon name="map" /><h2>Сейчас нет доступных игр</h2><p>Создайте первое лобби и пригласите друзей.</p><button type="button" onClick={onCreate}>Создать игру</button></div>}
      </section>
      <footer className="online-browser__actions"><button type="button" onClick={() => void load(true)} disabled={refreshing}><OnlineIcon name="refresh" />{refreshing ? 'Обновляем…' : 'Обновить'}</button><button type="button" className="is-create" onClick={onCreate}><OnlineIcon name="plus" />Создать игру</button></footer>
    </div>
  </main>;
}
