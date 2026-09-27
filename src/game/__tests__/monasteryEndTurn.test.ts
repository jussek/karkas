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

function placeMonasteryTile(label: string): PlacedMonasteryTurn {
  const tileId = findQuickMonastery();
  let state = createTurnFlow({ gameId: `mono-${label}`, players, seed: 9 });
  // Протягиваем карты реки, пока не вытянем нужную монастырскую карту.
  for (let guard = 0; guard < 64; guard += 1) {
    state = drawTurnTile(state);
    if (state.game.drawnTileDefinitionId === tileId) break;
    state = placeTurnTile(state, state.legalPlacements[0]);
    state = endTurn(state);
  }
  expect(state.game.drawnTileDefinitionId).toBe(tileId);
  // Подбираем rotation с monastery meeple target после размещения.
  for (let rotationStep = 0; rotationStep < 4; rotationStep += 1) {
    if (state.legalPlacements.length > 0) {
      const placed = placeTurnTile(state, state.legalPlacements[0]);
      if (placed.phase === 'TILE_PLACED') {
        const withMeeple = selectTurnMeeple(placed, { featureType: 'monastery', edge: null });
        if (withMeeple.phase === 'MEEPLE_SELECTION') {
          return { state: withMeeple, target: withMeeple.selectedMeepleTarget!, tileId };
        }
      }
    }
    state = rotateTurnTile(state);
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
