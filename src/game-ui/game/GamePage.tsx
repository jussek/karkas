import { useMemo, useState } from 'react';
import { getTileDefinition } from '../../game/cards/catalogApi';
import {
  createTurnFlow,
  drawTurnTile,
  endTurn,
  placeTurnTile,
  rotateTurnTile,
  selectTurnMeeple,
  type TurnFlowState,
} from '../../game/engine/turnFlow';
import { getLegalMeeplePlacements } from '../../game/rules/localFeatures';
import type { MeeplePlacement } from '../../game/types/geometry';
import { TileRenderer } from '../tiles/TileRenderer';
import { anchorForPlacement } from '../tiles/tileSemanticManifest';
import './gamePage.css';

const CELL = 92;
const ORIGIN = 8;

function newDemoGame(): TurnFlowState {
  return createTurnFlow({
    gameId: 'local-game',
    seed: Date.now() & 0xffffffff,
    players: [
      { id: 'blue', name: 'Андрей', color: 'blue', score: 0 },
      { id: 'red', name: 'Мария', color: 'red', score: 0 },
    ],
  });
}

function key(target: MeeplePlacement) {
  return `${target.featureType}:${target.edge ?? 'center'}`;
}

export function GamePage() {
  const [flow, setFlow] = useState(newDemoGame);
  const [meepleMode, setMeepleMode] = useState(false);
  const heldId = flow.game.drawnTileDefinitionId;
  const legalMeeples = useMemo(
    () => flow.phase === 'TILE_PLACED' || flow.phase === 'MEEPLE_SELECTION'
      ? getLegalMeeplePlacements(flow.game, getTileDefinition)
      : [],
    [flow],
  );
  const player = flow.game.players[flow.game.currentPlayerIndex];
  const available = flow.game.meeples.filter((meeple) => meeple.playerId === player?.id && !meeple.position).length;
  const message = flow.phase === 'AWAITING_DRAW'
    ? 'Возьмите карту'
    : flow.phase === 'TILE_IN_HAND'
      ? 'Поверните карту или выберите подсвеченное место'
      : flow.phase === 'GAME_OVER'
        ? 'Игра окончена'
        : 'Карта установлена. Можно поставить подданного или закончить ход';

  return (
    <main className="game-page">
      <header className="game-header">
        <div><strong>Каркассон</strong><span>{flow.riverPlaced < 20 ? `Собираем реку — ${flow.riverPlaced}/20` : `Ход ${flow.game.turnNumber}`}</span></div>
        <div className="game-scores">
          {flow.game.players.map((item, index) => (
            <span className={index === flow.game.currentPlayerIndex ? 'is-current' : ''} key={item.id}>
              {item.name} <b>{flow.game.scores[item.id] ?? 0}</b> · {flow.game.meeples.filter((m) => m.playerId === item.id && !m.position).length} 👤
            </span>
          ))}
        </div>
      </header>

      <p className="turn-message" role="status">{message}</p>
      <section className="board-viewport" aria-label="Игровое поле">
        <div className="board" style={{ width: CELL * 17, height: CELL * 17 }}>
          {Object.values(flow.game.board).map((tile) => (
            <div className="board-tile" key={`${tile.position.x},${tile.position.y}`} style={{ left: (tile.position.x + ORIGIN) * CELL, top: (tile.position.y + ORIGIN) * CELL }}>
              <TileRenderer definition={getTileDefinition(tile.definitionId)} rotation={tile.rotation} size={CELL} />
            </div>
          ))}
          {flow.legalPlacements.map((position) => (
            <button
              className="legal-cell"
              type="button"
              aria-label={`Поставить карту: ${position.x}, ${position.y}`}
              key={`${position.x},${position.y}`}
              style={{ left: (position.x + ORIGIN) * CELL, top: (position.y + ORIGIN) * CELL }}
              onClick={() => setFlow((current) => placeTurnTile(current, position))}
            ><span>＋</span></button>
          ))}
          {meepleMode && flow.game.lastPlacedTile && legalMeeples.map((target) => {
            const anchor = anchorForPlacement(target);
            const tile = flow.game.lastPlacedTile!;
            const selected = flow.selectedMeepleTarget && key(flow.selectedMeepleTarget) === key(target);
            return <button
              type="button"
              className={`board-meeple-target${selected ? ' is-selected' : ''}`}
              key={key(target)}
              aria-label={`Поставить подданного: ${target.featureType}`}
              style={{ left: (tile.position.x + ORIGIN) * CELL + anchor.x * CELL / 100, top: (tile.position.y + ORIGIN) * CELL + anchor.y * CELL / 100 }}
              onClick={() => setFlow((current) => selectTurnMeeple(current, target))}
            >{selected ? '👤' : ''}</button>;
          })}
        </div>
      </section>

      <section className="turn-controls" aria-label="Действия хода">
        {heldId && <div className="held-tile"><TileRenderer definition={getTileDefinition(heldId)} rotation={flow.rotation} size={76} /><span>{flow.rotation}°</span></div>}
        <button type="button" disabled={flow.phase !== 'AWAITING_DRAW'} onClick={() => setFlow(drawTurnTile)}>Взять карту</button>
        <button type="button" aria-label="Повернуть карту по часовой стрелке" disabled={flow.phase !== 'TILE_IN_HAND'} onClick={() => setFlow(rotateTurnTile)}>↻ <span>Повернуть</span></button>
        <button
          type="button"
          aria-pressed={meepleMode}
          disabled={!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(flow.phase) || available === 0 || legalMeeples.length === 0}
          onClick={() => {
            if (meepleMode) setFlow((current) => selectTurnMeeple(current, null));
            setMeepleMode((value) => !value);
          }}
        >👤 <span>{meepleMode ? 'Отменить' : `Подданный (${available})`}</span></button>
        <button
          type="button"
          className="end-turn"
          disabled={!['TILE_PLACED', 'MEEPLE_SELECTION'].includes(flow.phase)}
          onClick={() => { setFlow(endTurn); setMeepleMode(false); }}
        >Закончить ход</button>
      </section>
    </main>
  );
}
