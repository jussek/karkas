/**
 * Stage 4A — экран локальной настройки партии (1–6 игроков).
 *
 * Никаких сохранения/загрузки, сети, ботов. Только конфигурация новой
 * локальной игры; правила и состояние создаёт движок после «Начать игру».
 */

import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_IDENTITIES, buildPlayers, defaultPlayerName } from '../../game/session';
import type { LocalGameConfig, LocalMatchOptions } from '../../game/session';
import './gameSetup.css';

export const TURN_TIMER_OPTIONS: readonly { value: 0 | 15 | 30 | 60; label: string }[] = [
  { value: 0, label: 'Без таймера' },
  { value: 15, label: '15 секунд' },
  { value: 30, label: '30 секунд' },
  { value: 60, label: '60 секунд' },
];

export interface GameSetupPageProps {
  /** Вызывается после нажатия «Создать игру» с готовой конфигурацией партии. */
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
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<0 | 15 | 30 | 60>(0);

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
    onStart(createLocalSetupConfig({ gameId: makeGameId(), seed: makeSeed(), count, names, matchOptions: { turnTimerSeconds } }));
  };

  return (
    <main className="setup-page">
      <header className="setup-header">
        {onBack && <button type="button" className="setup-back" onClick={onBack}>← Меню</button>}
        <p className="setup-kicker">Каркассон</p>
        <h1>Создать игру</h1>
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

      <section className="setup-card" aria-label="Таймер хода">
        <span className="setup-label">Таймер хода</span>
        <div className="setup-timer-row" role="radiogroup" aria-label="Длительность хода">
          {TURN_TIMER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="setup-timer-option"
              role="radio"
              aria-checked={turnTimerSeconds === option.value}
              onClick={() => setTurnTimerSeconds(option.value)}
            >{option.label}</button>
          ))}
        </div>
      </section>

      <p className="setup-note">Онлайн-лобби и боты пока недоступны. Эта партия работает локально на устройстве.</p>

      <div className="setup-actions">
        <button type="button" className="setup-start" onClick={start}>Создать игру</button>
        {onBack && <button type="button" className="setup-back" onClick={onBack}>Назад</button>}
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
  /** Stage 4C; отсутствует/битый → таймер выключен (обратная совместимость). */
  matchOptions?: LocalMatchOptions;
}): LocalGameConfig {
  const seconds = input.matchOptions?.turnTimerSeconds;
  const turnTimerSeconds: 0 | 15 | 30 | 60 =
    seconds === 15 || seconds === 30 || seconds === 60 ? seconds : 0;
  return {
    gameId: input.gameId,
    seed: input.seed >>> 0,
    players: buildPlayers({ count: input.count, names: input.names }),
    matchOptions: { turnTimerSeconds },
  };
}
