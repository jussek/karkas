import { describe, expect, it } from 'vitest';

import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { getCardDefinition } from '../cards/catalogApi';
import { frontiersOf, planRiver, requiredEdgeForFrontier } from '../deck/riverPlanner';
import { createTurnFlow, RIVER_CARD_COUNT } from '../engine/turnFlow';
import { posKey } from '../types/state';
import type { Board, Player } from '../types/state';

const SOURCE_ID = 'card-133';
const END_ID = 'card-106';
const FORK_ID = 'card-109';
const MIDDLE_IDS = [
  'card-053', 'card-054', 'card-055', 'card-067', 'card-079', 'card-088',
  'card-090', 'card-091', 'card-099', 'card-100', 'card-101', 'card-102',
  'card-107', 'card-108', 'card-109', 'card-110', 'card-111', 'card-121',
];

function sourceBoard(): Board {
  return {
    [posKey({ x: 0, y: 0 })]: {
      definitionId: SOURCE_ID,
      rotation: 0,
      position: { x: 0, y: 0 },
    },
  };
}

function onePlayer(): Player[] {
  return [{ id: 'p1', name: 'P1', color: 'red', score: 0 }];
}

describe('fork-aware canonical river', () => {
  it('uses the standard opposite-edge convention', () => {
    expect(requiredEdgeForFrontier(0)).toBe(2);
    expect(requiredEdgeForFrontier(1)).toBe(3);
    expect(requiredEdgeForFrontier(2)).toBe(0);
    expect(requiredEdgeForFrontier(3)).toBe(1);
  });

  it('derives the 20-card set: 133 source, 18 middle, 106 final', () => {
    const river = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
    const middle = river.filter((card) => card.riverKind === 'middle').map((card) => card.id).sort();
    expect(RIVER_CARD_COUNT).toBe(20);
    expect(river).toHaveLength(20);
    expect(river.filter((card) => card.riverKind === 'start').map((card) => card.id)).toEqual([SOURCE_ID]);
    expect(river.filter((card) => card.riverKind === 'end').map((card) => card.id)).toEqual([END_ID]);
    expect(middle).toEqual(MIDDLE_IDS.slice().sort());
  });

  it('pins the verified final and fork orientations', () => {
    expect(getCardDefinition(END_ID).topology.riverEdges).toEqual([3]);
    expect(getCardDefinition(FORK_ID).topology.riverEdges).toEqual([0, 1, 3]);
  });

  it('plans every middle once and appends 106 last', () => {
    const plan = planRiver(7, sourceBoard());
    expect(plan).toHaveLength(19);
    expect(plan[18].cardId).toBe(END_ID);
    const middle = plan.slice(0, 18).map((step) => step.cardId);
    expect(new Set(middle).size).toBe(18);
    expect(middle.slice().sort()).toEqual(MIDDLE_IDS.slice().sort());
  });

  it('supports multiple open frontiers created by the real 109 fork', () => {
    const plan = planRiver(17, sourceBoard());
    let board = sourceBoard();
    let frontierCountAfterFork = 0;
    for (const step of plan) {
      board = {
        ...board,
        [posKey(step.position)]: {
          definitionId: step.cardId,
          rotation: step.rotation,
          position: step.position,
        },
      };
      if (step.cardId === FORK_ID) {
        frontierCountAfterFork = frontiersOf(board).length;
        break;
      }
    }
    expect(frontierCountAfterFork).toBeGreaterThan(1);
  });

  it('is deterministic and produces a complete sequence for 1000 seeds', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const plan = planRiver(seed, sourceBoard());
      expect(plan).toHaveLength(19);
      expect(plan[18].cardId).toBe(END_ID);
      expect(new Set(plan.map((step) => step.cardId)).size).toBe(19);
    }
    expect(planRiver(123, sourceBoard())).toEqual(planRiver(123, sourceBoard()));
  }, 300_000);

  it('starts a turn flow with only source 133 on the board and no river in landDeck', () => {
    const flow = createTurnFlow({ gameId: 'g', players: onePlayer(), seed: 12 });
    const placed = Object.values(flow.game.board);
    expect(placed).toHaveLength(1);
    expect(placed[0].definitionId).toBe(SOURCE_ID);
    expect(flow.riverPlaced).toBe(1);
    expect(flow.riverDeck).toHaveLength(19);
    expect(flow.riverDeck[18]).toBe(END_ID);
    expect(flow.landDeck).toHaveLength(124);
    expect(flow.landDeck.every((id) => getCardDefinition(id).riverCard !== true)).toBe(true);
  });
});
