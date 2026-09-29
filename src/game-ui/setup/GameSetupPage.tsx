/**
 * Stage 4A — экран локальной настройки партии (1–6 игроков).
 *
 * Никаких сохранения/загрузки, сети, ботов. Только конфигурация новой
 * локальной игры; правила и состояние создаёт движок после «Начать игру».
 */

import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_IDENTITIES, buildPlayers, defaultPlayerName } from '../../game/session';
import type { LocalGameConfig } from '../../game/session';
import './gameSetup.css';

export interface GameSetupPageProps {
  /** Вызывается после нажатия «Начать игру» с готовой конфигурацией партии. */
  onStart: (config: LocalGameConfig) => void;
  /** Генератор sessionId/gameId (browser-only bootstrap из UI-слоя). */
  makeGameId: () => string;
  /** Генератор seed (crypto в браузере; инжектируется для тестов). */
  makeSeed: () => number;
  onBack?: () => void;
}

export function GameSetupPage({ onStart, makeGameId, makeSeed, onBack }: GameSetupPageProps) {
  const [count, setCount] = useState<number>(MIN_PLAYERS);
  const [names, setNames] = useState<(string | undefined)[]>([]);
  const [title, setTitle] = useState('Моя партия');
  const [timer, setTimer] = useState('none');
}

export function GameSetupPage({ onStart, makeGameId, makeSeed }: GameSetupPageProps) {
  const [count, setCount] = useState<number>(MIN_PLAYERS);
  const [names, setNames] = useState<(string | undefined)[]>([]);

  const setName = (index: number, value: string) => {
    setNames((current) => {
      const next = [...current];
      while (next.length < MAX_PLAYERS) next.push(undefined);
      next[index] = value;
      return next;
    });
  };

  const start = () => {
    // Валидация количества дублирует движок заранее (движок — authoritative).
    if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) return;
    onStart(createLocalSetupConfig({ gameId: makeGameId(), seed: makeSeed(), count, names }));
  };

  return (
    <main className="setup-page">
      <header className="setup-header">
        <p className="setup-kicker">Каркассон</p><h1>Создать игру</h1>
        <p>Локальная партия · от 1 до 6 игроков</p>
      </header>

      <section className="setup-card setup-options">
        <label>Название игры<input value={title} maxLength={32} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Таймер<select value={timer} onChange={(event) => setTimer(event.target.value)}><option value="none">Без таймера</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">60 секунд</option></select></label>
        <label>Карта<select disabled><option>Классическая · река 19 карт</option></select></label>
        <p className="setup-note">Онлайн-лобби и боты пока недоступны. Эта партия работает локально на устройстве.</p>
      </section>

        {onBack && <button type="button" className="setup-back" onClick={onBack}>← Меню</button>}
        <h1>Каркасон</h1>
        <p>Локальная партия · от 1 до 6 игроков</p>
      </header>

      <section className="setup-card" aria-label="Количество игроков">
        <span className="setup-label">Игроков: <b>{count}</b></span>
        <div className="setup-count-row">
          <button
            type="button"
            className="setup-step"
            aria-label="Меньше игроков"
            disabled={count <= MIN_PLAYERS}
            onClick={() => setCount((value) => Math.max(MIN_PLAYERS, value - 1))}
          >−</button>
          <input
            className="setup-count-input"
            type="number"
            inputMode="numeric"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={count}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isInteger(parsed)) {
                setCount(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, parsed)));
              }
            }}
            aria-label="Количество игроков"
          />
          <button
            type="button"
            className="setup-step"
            aria-label="Больше игроков"
            disabled={count >= MAX_PLAYERS}
            onClick={() => setCount((value) => Math.min(MAX_PLAYERS, value + 1))}
          >＋</button>
        </div>
      </section>

      <section className="setup-card setup-players" aria-label="Имена игроков">
        {Array.from({ length: count }, (_, i) => (
          <label className="setup-player" key={`player-${i + 1}`}>
            <span
              className="setup-swatch"
              style={{ background: PLAYER_IDENTITIES[i].hex }}
              aria-hidden
            />
            <span className="setup-player-name">{defaultPlayerName(i + 1)}</span>
            <input
              type="text"
              maxLength={24}
              placeholder={defaultPlayerName(i + 1)}
              value={names[i] ?? ''}
              onChange={(event) => setName(i, event.target.value)}
              aria-label={`Имя игрока ${i + 1}`}
            />
          </label>
        ))}
      </section>

      <div className="setup-actions">
        <button type="button" className="setup-start" onClick={start}>Создать игру</button>
        {onBack && <button type="button" className="setup-back" onClick={onBack}>Назад</button>}
        <button type="button" className="setup-start" onClick={start}>Начать игру</button>
      </div>
    </main>
  );
}

/** Чистая сборка конфигурации (валидируется session/buildPlayers). */
export function createLocalSetupConfig(input: {
  gameId: string;
  seed: number;
  count: number;
  names?: readonly (string | undefined)[];
}): LocalGameConfig {
  return {
    gameId: input.gameId,
    seed: input.seed >>> 0,
    players: buildPlayers({ count: input.count, names: input.names }),
  };
}
