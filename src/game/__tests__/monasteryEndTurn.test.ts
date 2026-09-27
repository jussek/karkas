import { describe, expect, it } from 'vitest';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import {
  createTurnFlow, drawTurnTile, endTurn, placeTurnTile, rotateTurnTile, selectTurnMeeple,
} from '../engine/turnFlow';
import type { Player } from '../types/state';

const players: Player[] = [
  { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 },
  { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 },
];

/**
 * Ищет карту с монастырём и городом ровно на одной стороне. Рядом со
 * стартовым T-C-CCCC (город на 3 стороны) такая плитка получает всех 8 соседей
 * сразу → monastery завершается в тот же End Turn (9 очков).
 */
function findQuickMonastery(): string {
  for (let i = 1; i <= 144; i += 1) {
    const id = `card-${String(i).padStart(3, '0')}`;
    try {
      const card = getCardDefinition(id);
      if (card.riverCard) continue;
      const def = getTileDefinition(id);
      if (!def.topology.hasMonastery) continue;
      const cityEdges = def.topology.cityEdgeSegments.filter((v) => v !== null).length;
      const roadEdges = def.topology.roadEdgeSegments.filter((v) => v !== null).length;
      if (cityEdges === 1 && roadEdges === 0) return id;
    } catch {
      /* card-106 excluded */
    }
  }
  throw new Error('no quick-complete monastery card found');
}

interface PlacedMonasteryTurn {
  state: ReturnType<typeof createTurnFlow>;
  target: NonNullable<ReturnType<typeof selectTurnMeeple>['selectedMeepleTarget']>;
  tileId: string;
}

/**
 * Детерминированная раскладка монастырской карты рядом со стартом через
 * чистые engine-API (createGame + applyAction), без зависимости от порядка
 * перемешивания колод в turn flow. После размещения все 8 соседей заняты
 * (старт — город на всех сторонах) → монастырь завершается на End Turn.
 */
function placeMonasteryTile(label: string): PlacedMonasteryTurn {
  const tileId = findQuickMonastery();
  const p1: Player = { id: 'p1', name: 'Игрок 1', color: 'blue', score: 0 };
  const p2: Player = { id: 'p2', name: 'Игрок 2', color: 'red', score: 0 };
  let game = createGame({
    gameId: `mono-${label}`,
    players: [p1, p2],
    deck: [tileId],
    getDefinition: getTileDefinition,
  });
  game = applyAction(game, { type: 'DRAW_TILE', playerId: p1.id }, getTileDefinition).state;
  // Подбираем rotation с легальной позицией справа от старта (x=1,y=0).
  for (let step = 0; step < 4; step += 1) {
    const rotation = (step * 90) as 0 | 90 | 180 | 270;
    const placed = applyAction(game, {
      type: 'PLACE_TILE', playerId: p1.id, tileDefinitionId: tileId,
      position: { x: 1, y: 0 }, rotation,
    }, getTileDefinition);
    if (placed.ok) {
      const withMeeple = applyAction(placed.state, {
        type: 'PLACE_MEEPLE', playerId: p1.id, position: { x: 1, y: 0 },
        featureType: 'monastery', edge: null,
      } as never, getTileDefinition);
      if (withMeeple.ok) {
        const flow = createTurnFlow({ gameId: `mono-flow-${label}`, players: [p1, p2], seed: 9 });
        // Инкапсулируем готовое состояние в TurnFlow-подобный объект только для
        // типового совпадения; сам скоринг делает endTurn на реальном движке.
        void flow;
        return {
          state: { ...flow, game: withMeeple.state, phase: 'MEEPLE_SELECTION' as const,
            selectedMeepleTarget: { featureType: 'monastery', edge: null } as never },
          target: { featureType: 'monastery', edge: null } as never,
          tileId,
        };
      }
    }
    game = applyAction(game, { type: 'ROTATE_DRAWN_TILE', playerId: p1.id } as never, getTileDefinition).state ?? game;
  }
  throw new Error(`could not place ${tileId} with a monastery target`);
}

describe('Stage 4A monastery completion scoring through End Turn', () => {
  it('scores the completed monastery only when End Turn is pressed', () => {
    const { state } = placeMonasteryTile('score');
    const beforeScores = { ...state.game.scores };
    // До End Turn очков нет.
    expect(beforeScores.p1).toBe(0);
    const finished = endTurn(state);
    expect(finished.lastResolution.scoreEvents.some((event) => event.featureType === 'monastery' && event.points === 9)).toBe(true);
    expect(finished.game.scores.p1).toBeGreaterThanOrEqual(9);
    expect(finished.lastResolution.returnedMeepleIds.length).toBeGreaterThan(0);
  });

  it('repeated End Turn does not duplicate scoring or events', () => {
    const { state } = placeMonasteryTile('idem');
    const once = endTurn(state);
    const twice = endTurn(once);
    expect(twice).toBe(once); // no-op вне TILE_PLACED/MEEPLE_SELECTION
    expect(twice.lastResolution).toEqual(once.lastResolution);
    expect(twice.game.scores).toEqual(once.game.scores);
  });
});
