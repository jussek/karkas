import { useMemo, useState } from 'react';
import type { MeeplePlacement, TileDefinition } from '../../game/types/geometry';
import type { GameState } from '../../game/types/state';
import { MeepleIcon } from '../tiles/MeepleIcon';
import { TileRenderer } from '../tiles/TileRenderer';
import { anchorForPlacement } from '../tiles/tileSemanticManifest';
import {
  INITIAL_MEEPLE_PLACEMENT_UI,
  finalizeMeepleTurn,
  legalMeepleTargets,
  selectMeepleTarget,
  toggleMeeplePlacementMode,
} from './meeplePlacementModel';
import './meeplePlacement.css';

export interface MeeplePlacementPanelProps {
  game: GameState;
  getDefinition: (id: string) => TileDefinition;
  onTurnComplete: (game: GameState) => void;
}

function targetKey(target: MeeplePlacement): string {
  return `${target.featureType}:${target.edge ?? 'center'}`;
}

export function MeeplePlacementPanel({ game, getDefinition, onTurnComplete }: MeeplePlacementPanelProps) {
  const [ui, setUi] = useState(INITIAL_MEEPLE_PLACEMENT_UI);
  const targets = useMemo(() => legalMeepleTargets(game, getDefinition), [game, getDefinition]);
  const player = game.players[game.currentPlayerIndex];
  const available = game.meeples.filter((m) => m.playerId === player?.id && m.position === null).length;
  const disabled = game.gamePhase !== 'placeMeeple' || available === 0 || targets.length === 0;
  const placedTile = game.lastPlacedTile;

  const endTurn = () => {
    const result = finalizeMeepleTurn(game, ui.selectedMeepleTarget, getDefinition);
    if (result.ok) {
      setUi(INITIAL_MEEPLE_PLACEMENT_UI);
      onTurnComplete(result.state);
    }
  };

  return (
    <section className="meeple-panel" aria-label="Ход игрока">
      <div className="meeple-panel__scoreboard">
        {game.players.map((p) => (
          <span key={p.id}><b>{p.name}</b> {game.scores[p.id] ?? 0} · {game.meeples.filter((m) => m.playerId === p.id && m.position === null).length}</span>
        ))}
      </div>
      <div className="meeple-panel__tile" aria-label="Доступные позиции подданного">
        {placedTile ? (
          <TileRenderer
            definition={getDefinition(placedTile.definitionId)}
            rotation={placedTile.rotation}
            size={352}
            className="meeple-panel__artwork"
          />
        ) : null}
        {ui.meeplePlacementMode && targets.map((target) => {
          const point = anchorForPlacement(target);
          const selected = targetKey(ui.selectedMeepleTarget ?? { featureType: 'monastery', edge: null }) === targetKey(target) && ui.selectedMeepleTarget !== null;
          return (
            <button
              type="button"
              key={targetKey(target)}
              className={`meeple-target${selected ? ' is-selected' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-label={`Выбрать: ${target.featureType}`}
              aria-pressed={selected}
              onClick={() => setUi((current) => selectMeepleTarget(current, target))}
            >
              {selected ? (
                <svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">
                  <MeepleIcon fill={player?.color ?? 'blue'} size={22} />
                </svg>
              ) : <span />}
            </button>
          );
        })}
      </div>
      <div className="meeple-panel__actions">
        <button
          type="button"
          className="meeple-panel__toggle"
          disabled={disabled}
          aria-pressed={ui.meeplePlacementMode}
          onClick={() => setUi((current) => toggleMeeplePlacementMode(current))}
        >
          {ui.meeplePlacementMode ? 'Отменить подданного' : `Поставить подданного (${available})`}
        </button>
        <button type="button" className="meeple-panel__end" onClick={endTurn}>Завершить ход</button>
      </div>
    </section>
  );
}
