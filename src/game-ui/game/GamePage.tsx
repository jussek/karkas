import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCardDefinition, getTileDefinition } from '../../game/cards/catalogApi';
import {
  RIVER_CARD_COUNT,
  canEndTurn,
  cancelPositionedTurnTile,
  confirmTurnTilePlacement,
  drawTurnTile,
  endTurn,
  hasAnyLegalTilePlacement,
  placeTurnTile,
  replaceUnplayableTurnTile,
  rotatePositionedTurnTile,
  selectTurnMeeple,
} from '../../game/engine/turnFlow';
import type { TurnFlowState } from '../../game/engine/turnFlow';
import type { TurnResolution, TurnScoreEvent } from '../../game/engine/turnResolution';
import { getLegalMeeplePlacements } from '../../game/rules/localFeatures';
import type { MeeplePlacement } from '../../game/types/geometry';
import { playerIdentity } from '../../game/session';
import type { LocalGameConfig } from '../../game/session';
import { TileRenderer } from '../tiles/TileRenderer';
import { MeepleIcon } from '../tiles/MeepleIcon';
import { anchorForPlacement } from '../tiles/tileSemanticManifest';
import { createLocalGame } from './localGameBootstrap';
import { meepleDialogTitle, meepleTargetLabel } from './meepleDialogModel';
import { useBoardCamera } from './useBoardCamera';
import { saveLocalGameSave } from '../persistence/localGamePersistence';
import type { UiMatchState } from '../persistence/localGamePersistence';
import {
  createMatchTimer,
  formatTimerRemaining,
  getRemainingLandTiles,
  getRemainingRiverTiles,
  matchTimerAfterFlowChange,
  onTimerExpiredFlow,
  pauseMatchTimer,
  resumeMatchTimer,
  tickMatchTimer,
  turnKeyOf,
} from './matchTimer';
import type { MatchTimerState } from './matchTimer';
import { localHandVisible } from './draftVisibility';
import './gamePage.css';

const CELL = 92;
const BOARD_PADDING = 2;

function key(target: MeeplePlacement) {
  return `${target.featureType}:${target.edge ?? 'center'}`;
}

/* ------------------------------------------------------------------ */
/* Feedback: React ТОЛЬКО форматирует authoritative-события движка.    */
/* Никакого повторного скоринга в UI — данные берутся из               */
/* flow.lastResolution (создан единым scoring pass в engine).          */
/* ------------------------------------------------------------------ */

const FEATURE_LABELS: Record<TurnScoreEvent['featureType'], string> = {
  road: 'Дорога завершена',
  city: 'Город завершён',
  monastery: 'Монастырь завершён',
};

export function formatResolution(
  resolution: TurnResolution,
  playerName: (id: string) => string,
): string[] {
  const lines: string[] = [];
  for (const event of resolution.scoreEvents) {
    if (event.tied) {
      const names = event.playerIds.map(playerName).join(' и ');
      lines.push(`Ничья: ${names} получают по ${event.points}`);
    } else {
      const who = event.playerIds.length > 0 ? ` (${playerName(event.playerIds[0])})` : '';
      lines.push(`${FEATURE_LABELS[event.featureType]}: +${event.points}${who}`);
    }
  }
  if (resolution.returnedMeepleIds.length > 0) {
    lines.push(`Возвращено подданных: ${resolution.returnedMeepleIds.length}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Game page                                                           */
/* ------------------------------------------------------------------ */

export interface GamePageProps {
  config?: LocalGameConfig;
  /** Stage 4B: восстановленный из сохранения authoritative flow (не пересобирает колоды). */
  initialFlow?: TurnFlowState;
  /** Stage 4C: восстановленные таймер/пауза (не reset при загрузке). */
  initialUiMatchState?: UiMatchState;
  onExit?: () => void;
  onNewGame?: () => void;
  /** Stage 4C: rematch генерируется в App/browser layer, не внутри игры. */
  onRematch?: () => void;
}

export function GamePage({ config, initialFlow, initialUiMatchState, onExit, onNewGame, onRematch }: GamePageProps) {
  const [flow, setFlow] = useState<TurnFlowState>(() =>
    initialFlow ?? (config ? createLocalGame(config) : createLocalGame()),
  );
  const turnTimerSeconds = config?.matchOptions?.turnTimerSeconds ?? 0;
  const [timer, setTimer] = useState<MatchTimerState>(() => {
    if (initialUiMatchState?.timerRemainingSeconds != null) {
      const remaining = Math.max(0, Math.floor(initialUiMatchState.timerRemainingSeconds));
      return { durationSeconds: turnTimerSeconds, remainingSeconds: remaining, running: false, expired: remaining === 0 };
    }
    return createMatchTimer(turnTimerSeconds);
  });
  const [paused, setPaused] = useState<boolean>(initialUiMatchState?.paused ?? false);
  const [meepleMode, setMeepleMode] = useState(false);
  const [meepleDraft, setMeepleDraft] = useState<MeeplePlacement | null>(null);
  const [skipMeepleConfirm, setSkipMeepleConfirm] = useState(false);
  const [feedbackTick, setFeedbackTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [meepleDialogOpen, setMeepleDialogOpen] = useState(false);
  const [placementFeedback, setPlacementFeedback] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** Клетки для ближайшего вызова fitContent (для «Показать ходы»). */
  const fitOverrideRef = useRef<{ x: number; y: number }[] | null>(null);

  const gameOver = flow.phase === 'GAME_OVER' || flow.game.status === 'finished';
  const heldId = flow.game.drawnTileDefinitionId;
  const legalMeeples = useMemo(
    () => (flow.phase === 'TILE_PLACED' || flow.phase === 'MEEPLE_SELECTION')
      ? getLegalMeeplePlacements(flow.game, getTileDefinition)
      : [],
    [flow],
  );
  const player = flow.game.players[flow.game.currentPlayerIndex];
  const available = flow.game.meeples.filter((m) => m.playerId === player?.id && !m.position).length;

  const nameById = useCallback(
    (id: string) => flow.game.players.find((p) => p.id === id)?.name ?? id,
    [flow.game.players],
  );
  const feedbackLines = useMemo(
    () => formatResolution(flow.lastResolution, nameById),
    [flow.lastResolution, nameById],
  );
  const hasFeedback = feedbackTick > 0 && feedbackLines.length > 0;

  const unplayableTile = flow.phase === 'TILE_IN_HAND'
    && heldId !== null
    && !getCardDefinition(heldId).riverCard
    && !hasAnyLegalTilePlacement(flow, heldId);
  const message = flow.phase === 'GAME_OVER'
    ? 'Игра окончена'
    : flow.phase === 'AWAITING_DRAW'
      ? 'Возьмите карту'
      : flow.phase === 'TILE_IN_HAND'
        ? unplayableTile
          ? 'Эту карту нельзя поставить. Возьмите другую.'
          : 'Выберите подсвеченное место'
        : flow.phase === 'TILE_POSITIONED'
          ? 'Выберите поворот и подтвердите размещение'
        : 'Карта установлена. Можно поставить подданного или закончить ход';

  /* --- camera ------------------------------------------------------ */
  const placedCells = useMemo(
    () => Object.values(flow.game.board).map((tile) => tile.position),
    [flow.game.board],
  );
  const boardProjection = useMemo(() => {
    const positions = [...placedCells, ...flow.legalPlacements];
    if (flow.positionedAt) positions.push(flow.positionedAt);
    if (positions.length === 0) positions.push({ x: 0, y: 0 });
    const minX = Math.min(...positions.map((position) => position.x)) - BOARD_PADDING;
    const minY = Math.min(...positions.map((position) => position.y)) - BOARD_PADDING;
    const maxX = Math.max(...positions.map((position) => position.x)) + BOARD_PADDING;
    const maxY = Math.max(...positions.map((position) => position.y)) + BOARD_PADDING;
    return {
      minX, minY,
      originX: -minX,
      originY: -minY,
      width: (maxX - minX + 1) * CELL,
      height: (maxY - minY + 1) * CELL,
    };
  }, [placedCells, flow.legalPlacements, flow.positionedAt]);

  const getFitCells = useCallback(() => {
    if (fitOverrideRef.current) return fitOverrideRef.current;
    const cells = [...placedCells];
    if (flow.phase === 'TILE_IN_HAND') cells.push(...flow.legalPlacements);
    return cells;
  }, [placedCells, flow.phase, flow.legalPlacements]);

  const camera = useBoardCamera({
    viewportRef,
    contentWidth: boardProjection.width,
    contentHeight: boardProjection.height,
    getFitCells,
    cellSize: CELL,
    originOffset: { x: boardProjection.originX, y: boardProjection.originY },
  });

  const initialCameraFitDone = useRef(false);
  useLayoutEffect(() => {
    if (initialCameraFitDone.current || !viewportRef.current) return;
    initialCameraFitDone.current = true;
    camera.fitContent();
  }, [camera.fitContent]);

  /* --- Stage 4B: autosave authoritative flow (не camera/modal/UI-состояние) --- */
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const currentUiMatchState = useCallback((): UiMatchState | undefined => {
    if (timerRef.current.durationSeconds === 0 && !pausedRef.current) return undefined;
    return {
      timerRemainingSeconds: timerRef.current.durationSeconds > 0 ? timerRef.current.remainingSeconds : null,
      paused: pausedRef.current,
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    saveLocalGameSave(config, flow, currentUiMatchState());
  }, [config, flow, currentUiMatchState]);

  /* --- Stage 4C: таймер хода. Reset ТОЛЬКО при реальном переходе хода. --- */
  const turnKey = turnKeyOf(flow.game.turnNumber, flow.game.currentPlayerIndex);
  const prevFlowRef = useRef({ flow, turnKey });
  useEffect(() => {
    const prev = prevFlowRef.current;
    prevFlowRef.current = { flow, turnKey };
    if (flow === prev.flow) return;
    setTimer((current) => matchTimerAfterFlowChange(current, prev.turnKey, turnKey).timer);
  }, [flow, turnKey]);

  // Один interval максимум; cleanup при unmount/паузе.
  useEffect(() => {
    if (!timer.running || paused || gameOver) return;
    const id = window.setInterval(() => {
      setTimer((current) => tickMatchTimer(current));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer.running, paused, gameOver]);

  // Timeout НЕ дёргает engine actions — flow остаётся неизменным (контракт).
  useEffect(() => {
    if (timer.expired) setFlow((current) => onTimerExpiredFlow(current));
  }, [timer.expired]);

  // Редкая запись таймера (максимум раз в ~5 сек), без цикла с flow-autosave.
  useEffect(() => {
    if (!config || timer.durationSeconds === 0) return;
    const id = window.setInterval(() => {
      saveLocalGameSave(config, flow, currentUiMatchState());
    }, 5000);
    return () => window.clearInterval(id);
  }, [config, flow, timer.durationSeconds, currentUiMatchState]);

  const exitToMenu = () => {
    if (config) saveLocalGameSave(config, flow, currentUiMatchState());
    onExit?.();
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    setTimer((current) => (next ? pauseMatchTimer(current) : resumeMatchTimer(current)));
    if (config) saveLocalGameSave(config, flow, currentUiMatchState());
  };

  const placeAt = useCallback((position: { x: number; y: number }) => {
    const next = placeTurnTile(flow, position);
    if (next === flow) {
      setPlacementFeedback('Сюда карту поставить нельзя');
      return false;
    }
    setFlow(next);
    setPlacementFeedback(null);
    return true;
  }, [flow]);

  /** «Показать ходы»: вписывает legal positions текущей ротации в viewport. */
  const showLegalMoves = () => {
    fitOverrideRef.current = flow.legalPlacements.length > 0
      ? [...flow.legalPlacements]
      : flow.phase === 'TILE_IN_HAND'
        ? []
        : [...placedCells];
    camera.fitContent();
    fitOverrideRef.current = null;
  };

  const endTurnAction = () => {
    setFlow((current) => endTurn(current));
    setMeepleMode(false);
    setMeepleDraft(null);
    setMeepleDialogOpen(false);
    setFeedbackTick((tick) => tick + 1);
  };

  const finalScores = flow.lastResolution.final;
  const riverActive = flow.riverPlaced < RIVER_CARD_COUNT;
  const remainingTiles = riverActive ? getRemainingRiverTiles(flow) : getRemainingLandTiles(flow);

  return (
    <main className="game-page">
      <header className="game-header">
        <div>
          <strong>Каркассон</strong>
          <span>Ход {flow.game.turnNumber}</span>
          <span>Сейчас: {player?.name ?? '—'}</span>
        </div>
        <div className="game-scores">
          {flow.game.players.map((item, index) => (
            <span className={index === flow.game.currentPlayerIndex ? 'is-current' : ''} key={item.id}>
              <i className="score-dot" style={{ background: playerIdentity(index + 1).hex }} aria-hidden />
              {' '}{item.name} <b>{flow.game.scores[item.id] ?? 0}</b> · {flow.game.meeples.filter((m) => m.playerId === item.id && !m.position).length} 👤
            </span>
          ))}
        </div>
        <div className="game-hud-right">
          <span className="tiles-remaining">{riverActive ? `Река: осталось ${remainingTiles}` : `Карты: осталось ${remainingTiles}`}</span>
          {timer.durationSeconds > 0 && (
            <span
              className={`turn-timer${timer.remainingSeconds <= 10 && timer.remainingSeconds > 0 ? ' is-warning' : ''}${timer.expired ? ' is-expired' : ''}`}
              role="timer"
              aria-label="Оставшееся время хода"
            >⏱ {timer.expired ? 'Время вышло' : formatTimerRemaining(timer.remainingSeconds)}</span>
          )}
          <button type="button" className="game-menu-button" aria-label="Меню игры" onClick={() => setMenuOpen(true)}>☰</button>
        </div>
      </header>

      <p className="turn-message" role="status">{message}</p>
      {placementFeedback && <p className="placement-feedback" role="status">{placementFeedback}</p>}
      {hasFeedback && !gameOver && (
        <ul className="resolution-feedback" role="status" aria-live="polite">
          {feedbackLines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}

      <section className="board-viewport" ref={viewportRef} aria-label="Игровое поле">
        <div
          className="board-canvas"
          style={{ transform: `translate(${camera.camera.offsetX}px, ${camera.camera.offsetY}px) scale(${camera.camera.scale})` }}
          {...camera.handlers}
        >
          <div className="board" style={{ width: boardProjection.width, height: boardProjection.height }}>
            {Object.values(flow.game.board).map((tile) => (
              <div className={`board-tile${flow.game.lastPlacedTile?.position.x===tile.position.x&&flow.game.lastPlacedTile.position.y===tile.position.y?' is-last':''}`} key={`${tile.position.x},${tile.position.y}`} style={{ left: (tile.position.x + boardProjection.originX) * CELL, top: (tile.position.y + boardProjection.originY) * CELL }}>
                <TileRenderer definition={getTileDefinition(tile.definitionId)} rotation={tile.rotation} size={CELL} />
              </div>
            ))}
            {flow.game.meeples.filter((meeple) => meeple.position && meeple.placement).map((meeple) => {
              const position = meeple.position!;
              const anchor = anchorForPlacement(meeple.placement!);
              const owner = flow.game.players.find((item) => item.id === meeple.playerId);
              return <svg
                key={meeple.id}
                className="board-meeple"
                viewBox="0 0 100 100"
                aria-label={`Человечек игрока ${owner?.name ?? meeple.playerId}`}
                style={{
                  left: (position.x + boardProjection.originX) * CELL + (anchor.x * CELL) / 100,
                  top: (position.y + boardProjection.originY) * CELL + (anchor.y * CELL) / 100,
                }}
              ><MeepleIcon fill={owner?.color ?? '#b8332b'} size={30} /></svg>;
            })}
            {meepleDraft && flow.game.lastPlacedTile && (() => {
              const anchor = anchorForPlacement(meepleDraft);
              const position = flow.game.lastPlacedTile.position;
              return <svg className="board-meeple meeple-draft-preview" viewBox="0 0 100 100" aria-label="Предпросмотр человечка" style={{ left: (position.x + boardProjection.originX) * CELL + (anchor.x * CELL) / 100, top: (position.y + boardProjection.originY) * CELL + (anchor.y * CELL) / 100 }}><MeepleIcon fill={player?.color ?? '#2f6fd6'} size={30} /></svg>;
            })()}
            {flow.legalPlacements.map((position) => (
              <button
                className="legal-cell"
                type="button"
                disabled={paused}
                aria-label={`Поставить карту: ${position.x}, ${position.y}`}
                key={`${position.x},${position.y}`}
                style={{ left: (position.x + boardProjection.originX) * CELL, top: (position.y + boardProjection.originY) * CELL }}
                onClick={() => placeAt(position)}
              ><span /></button>
            ))}
            {heldId && flow.phase === 'TILE_POSITIONED' && flow.positionedAt && (
              <div
                className="positioned-tile-preview"
                style={{
                  left: (flow.positionedAt.x + boardProjection.originX) * CELL,
                  top: (flow.positionedAt.y + boardProjection.originY) * CELL,
                }}
              >
                <TileRenderer definition={getTileDefinition(heldId)} rotation={flow.rotation} size={CELL} />
                {flow.positionedRotations.length > 1 && <button
                  type="button"
                  className="preview-rotate"
                  disabled={paused}
                  aria-label="Выбрать следующий разрешённый поворот"
                  onClick={() => setFlow(rotatePositionedTurnTile)}
                >↻</button>}
              </div>
            )}
            {meepleMode&&flow.game.lastPlacedTile&&legalMeeples.map(target=>{const anchor=anchorForPlacement(target),position=flow.game.lastPlacedTile!.position;return <button type="button" disabled={paused} className="feature-meeple-target" aria-label={`Выбрать место: ${meepleTargetLabel(legalMeeples,target)}`} key={key(target)} style={{left:(position.x+boardProjection.originX)*CELL+(anchor.x*CELL)/100,top:(position.y+boardProjection.originY)*CELL+(anchor.y*CELL)/100}} onClick={()=>{setMeepleDraft(target);setMeepleMode(false);setPlacementFeedback(null);}}><MeepleIcon fill="none" size={27}/></button>;})}
          </div>
        </div>

        <div className={`camera-controls${paused ? ' is-paused' : ''}`} aria-label="Камера доски">
          <button type="button" className="camera-button" aria-label="Приблизить" disabled={paused} onClick={camera.zoomIn}>+</button>
          <button type="button" className="camera-button" aria-label="Отдалить" disabled={paused} onClick={camera.zoomOut}>−</button>
          <button type="button" className="camera-button" aria-label="Вписать доску" disabled={paused} onClick={() => camera.fitContent()}>⤢</button>
          {flow.phase === 'TILE_IN_HAND' && (
            <button type="button" className="camera-button camera-show-moves" onClick={showLegalMoves}>Показать ходы</button>
          )}
        </div>
      </section>

      {paused && !gameOver && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Пауза">
          <section className="pause-sheet">
            <h2>Игра на паузе</h2>
            <button type="button" onClick={togglePause}>Продолжить</button>
            <button type="button" className="danger" onClick={exitToMenu}>Выйти в меню</button>
          </section>
        </div>
      )}

      {gameOver && finalScores && (
        <section className="game-over-panel" role="status" aria-live="assertive">
          <h2>Игра окончена</h2>
          <ol className="final-scores">
            {flow.game.players
              .slice()
              .sort((a, b) => (finalScores.scoreByPlayerId[b.id] ?? 0) - (finalScores.scoreByPlayerId[a.id] ?? 0))
              .map((p) => (
                <li key={p.id}>{p.name}: <b>{finalScores.scoreByPlayerId[p.id] ?? 0}</b></li>
              ))}
          </ol>
          {flow.game.players.length === 1 ? (
            <p>Результат: {finalScores.scoreByPlayerId[flow.game.players[0].id] ?? 0} очков</p>
          ) : finalScores.tied ? (
            <p>Ничья: {finalScores.leaderPlayerIds.map(nameById).join(', ')}</p>
          ) : (
            <p>Победитель: {finalScores.leaderPlayerIds.map(nameById).join(', ')}</p>
          )}
          <p>Сыграно ходов: {flow.game.turnNumber}</p>
          <div className="game-over-actions">
            {onRematch && <button type="button" className="rematch-action" onClick={onRematch}>Сыграть ещё раз</button>}
            {onNewGame && <button type="button" onClick={onNewGame}>Новая игра</button>}
            {onExit && <button type="button" onClick={exitToMenu}>Главное меню</button>}
          </div>
        </section>
      )}

      {menuOpen && <div className="game-menu-overlay" role="dialog" aria-modal="true" aria-label="Меню игры">
        <section className="game-menu-sheet">
          <h2>Меню</h2>
          <button type="button" onClick={() => setMenuOpen(false)}>Продолжить</button>
          {!gameOver && <button type="button" aria-pressed={paused} onClick={() => { setMenuOpen(false); togglePause(); }}>Пауза</button>}
          <button type="button" onClick={() => { setMenuOpen(false); setRulesOpen(true); }}>Правила</button>
          {onNewGame && <button type="button" onClick={onNewGame}>Новая игра</button>}
          {onExit && <button type="button" className="danger" onClick={() => { setMenuOpen(false); exitToMenu(); }}>Выйти в меню</button>}
        </section>
      </div>}

      {rulesOpen && <div className="game-menu-overlay" role="dialog" aria-modal="true" aria-label="Правила">
        <section className="game-menu-sheet">
          <h2>Как играть</h2>
          <p>Возьмите карту и выберите подсвеченное место. Если доступно несколько поворотов, выберите подходящий и подтвердите установку. После этого можно поставить человечка или закончить ход.</p>
          <button type="button" onClick={() => setRulesOpen(false)}>Понятно</button>
        </section>
      </div>}

      {meepleDialogOpen && <div className="game-menu-overlay" role="dialog" aria-modal="true" aria-label="Выбор места человечка">
        <section className="game-menu-sheet meeple-dialog">
          <h2>{meepleDialogTitle(legalMeeples)}</h2>
          {legalMeeples.map((target) => (
            <button
              type="button"
              key={key(target)}
              onClick={() => {
                setMeepleDraft(target);
                setMeepleDialogOpen(false);
                setMeepleMode(false);
                setPlacementFeedback(null);
              }}
            >
              {legalMeeples.length === 1 ? 'Подтвердить' : meepleTargetLabel(legalMeeples, target)}
            </button>
          ))}
          <button type="button" onClick={() => setMeepleDialogOpen(false)}>Отмена</button>
        </section>
      </div>}

      {skipMeepleConfirm && <div className="game-menu-overlay" role="dialog" aria-modal="true" aria-label="Подтверждение пропуска человечка"><section className="game-menu-sheet"><h2>Закончить ход без человечка?</h2><button type="button" onClick={() => setSkipMeepleConfirm(false)}>Отмена</button><button type="button" onClick={() => { setSkipMeepleConfirm(false); endTurnAction(); }}>Закончить</button></section></div>}

      <section className={`turn-controls${paused ? ' is-paused' : ''}`} aria-label="Действия хода" aria-hidden={paused} inert={paused}>
        {heldId && localHandVisible(flow.phase) && <div
          className={`held-tile${unplayableTile ? ' is-unplayable' : ''}`}
        >{unplayableTile && <button
          type="button"
          disabled={paused}
          className="replace-action"
          aria-label="Заменить неразмещаемую карту"
          onClick={() => {
            setPlacementFeedback(null);
            setFlow((current) => replaceUnplayableTurnTile(current));
          }}
        >↺ <span>Заменить</span></button>}<TileRenderer definition={getTileDefinition(heldId)} rotation={flow.rotation} size={92} /><span>{flow.rotation}°</span></div>}
        {flow.phase === 'AWAITING_DRAW' && <button type="button" className="draw-action" disabled={paused} onClick={() => setFlow(drawTurnTile)}>Взять карту</button>}
        {flow.phase === 'TILE_POSITIONED' && <><button type="button" className="cancel-placement" disabled={paused} onClick={() => setFlow((current) => cancelPositionedTurnTile(current))}>Отмена</button><button type="button" className="confirm-placement" aria-label="Подтвердить размещение карты" disabled={paused} onClick={() => setFlow(confirmTurnTilePlacement)}>✓ <span>Установить карту</span></button></>}
        {meepleDraft ? <><button type="button" disabled={paused} onClick={() => setMeepleDraft(null)}>Отмена</button><button type="button" className="confirm-meeple" disabled={paused} onClick={() => { setFlow((current) => selectTurnMeeple(current, meepleDraft)); setMeepleDraft(null); }}>Поставить человечка</button></> : ['TILE_PLACED', 'MEEPLE_SELECTION'].includes(flow.phase) && <button
          type="button"
          aria-pressed={meepleMode}
          disabled={!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(flow.phase) || available === 0 || paused}
          onClick={() => {
            if (meepleMode) {
              setMeepleDialogOpen(false);
            }
            setMeepleMode((value) => !value);
          }}
        ><MeepleIcon fill={player?.color??'#888'} size={34}/><span>{meepleMode ? 'Отменить' : `× ${available}`}</span></button>}
        {canEndTurn(flow) && <button
          type="button"
          className="end-turn"
          disabled={!canEndTurn(flow) || paused}
          onClick={() => {
            if (meepleDraft) { setPlacementFeedback('Сначала поставьте человечка или отмените выбор'); return; }
            if (legalMeeples.length > 0 && available > 0 && flow.phase === 'TILE_PLACED') { setSkipMeepleConfirm(true); return; }
            endTurnAction();
          }}
        ><b>✓</b><span>Закончить ход</span></button>}
      </section>
    </main>
  );
}
