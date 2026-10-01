import { describe, expect, it } from 'vitest';

import { RUNTIME_CARD_CATALOG } from '../cards/runtimeCatalog';
import { getCardDefinition } from '../cards/catalogApi';
import {
  assertRiverSolvableFrom,
  boardSignature,
  frontiersOf,
  planRiver,
  requiredEdgeForFrontier,
} from '../deck/riverPlanner';
import { posKey, type Board, type Player } from '../types/state';
import {
  createTurnFlow,
  getLegalTilePlacementOptions,
  drawTurnTile,
  placeTurnTile,
  confirmTurnTilePlacement,
  endTurn,
  rotatePositionedTurnTile,
  RIVER_CARD_COUNT,
} from '../engine/turnFlow';
import type { Rotation } from '../types/geometry';

const SOURCE_ID = 'card-133';
const END_ID = 'card-106';
const FORK_ID = 'card-109';
const CANONICAL_MIDDLE = [
  'card-053', 'card-054', 'card-055', 'card-067', 'card-079', 'card-088',
  'card-090', 'card-091', 'card-099', 'card-100', 'card-101', 'card-102',
  'card-107', 'card-108', 'card-109', 'card-110', 'card-111', 'card-121',
];

function players(count = 1): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
    color: 'red',
    score: 0,
  }));
}

function startBoard(): Board {
  return {
    [posKey({ x: 0, y: 0 })]: {
      definitionId: SOURCE_ID,
      rotation: 0,
      position: { x: 0, y: 0 },
    },
  };
}

describe('river edge convention', () => {
  it('maps exposed edge to the opposite edge of the new tile', () => {
    expect(requiredEdgeForFrontier(0)).toBe(2);
    expect(requiredEdgeForFrontier(1)).toBe(3);
    expect(requiredEdgeForFrontier(2)).toBe(0);
    expect(requiredEdgeForFrontier(3)).toBe(1);
  });

  it('keeps coordinate-sensitive board signatures', () => {
    const first: Board = {
      [posKey({ x: 1, y: 2 })]: { definitionId: SOURCE_ID, rotation: 90, position: { x: 1, y: 2 } },
    };
    const second: Board = {
      [posKey({ x: 2, y: 1 })]: { definitionId: SOURCE_ID, rotation: 90, position: { x: 2, y: 1 } },
    };
    expect(boardSignature(first)).not.toBe(boardSignature(second));
  });
});

describe('canonical river set', () => {
  it('contains source + 18 middle + forced final = 20 cards', () => {
    const river = RUNTIME_CARD_CATALOG.filter((card) => card.riverCard === true);
    expect(RIVER_CARD_COUNT).toBe(20);
    expect(river).toHaveLength(20);
    expect(river.filter((card) => card.riverKind === 'start')).toHaveLength(1);
    expect(river.filter((card) => card.riverKind === 'end')).toHaveLength(1);
    expect(river.find((card) => card.riverKind === 'start')?.id).toBe(SOURCE_ID);
    expect(river.find((card) => card.riverKind === 'end')?.id).toBe(END_ID);
    expect([...river.filter((card) => card.riverKind === 'middle').map((card) => card.id)].sort())
      .toEqual([...CANONICAL_MIDDLE].sort());
  });

  it('encodes 106 west-facing end and 109 three-edge fork', () => {
    expect(getCardDefinition(END_ID).topology.riverEdges).toEqual([3]);
    expect(getCardDefinition(FORK_ID).topology.riverEdges).toEqual([0, 1, 3]);
  });

  it('plans all 18 middles once and 106 last', () => {
    const plan = planRiver(7, startBoard());
    expect(plan).toHaveLength(19);
    expect(plan.at(-1)?.cardId).toBe(END_ID);
    const middles = plan.slice(0, -1).map((step) => step.cardId);
    expect(new Set(middles).size).toBe(18);
    expect([...middles].sort()).toEqual([...CANONICAL_MIDDLE].sort());
  });

  it('is deterministic for the same seed', () => {
    expect(planRiver(123, startBoard())).toEqual(planRiver(123, startBoard()));
  });
});

describe('fork-aware frontiers', () => {
  it('supports more than one open frontier after card-109', () => {
    const plan = planRiver(17, startBoard());
    let board = startBoard();
    let sawFork = false;
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
        sawFork = true;
        expect(frontiersOf(board).length).toBeGreaterThan(1);
        break;
      }
    }
    expect(sawFork).toBe(true);
  });

  it('does not require an impossible zero-open-edge graph after the single final tile', () => {
    // One source (degree 1), one final (degree 1) and the verified fork
    // (degree 3) make a zero-open-edge graph impossible unless another odd
    // river tile exists. The product invariant is therefore sequencing: 106
    // is the last river card, after which land begins.
    const plan = planRiver(4, startBoard());
    let board = startBoard();
    for (const step of plan) {
      board = {
        ...board,
        [posKey(step.position)]: {
          definitionId: step.cardId,
          rotation: step.rotation,
          position: step.position,
        },
      };
    }
    expect(plan.at(-1)?.cardId).toBe(END_ID);
    expect(frontiersOf(board).length).toBeGreaterThanOrEqual(1);
  });
});

describe('river solvability across seeds', () => {
  it('plans the full 20-card river for 1000 seeds without duplicates', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const plan = planRiver(seed, startBoard());
      expect(plan).toHaveLength(19);
      expect(plan.at(-1)?.cardId).toBe(END_ID);
      expect(new Set(plan.map((step) => step.cardId)).size).toBe(19);
    }
  }, 300_000);
});

describe('player choices and land transition', () => {
  it('keeps every exposed safe choice completable for representative seeds', () => {
    let multiChoiceStatesChecked = 0;
    for (const seed of [4, 12, 17, 492]) {
      let state = createTurnFlow({ gameId: `g-${seed}`, players: players(1), seed });
      while (state.riverPlaced < RIVER_CARD_COUNT) {
        state = drawTurnTile(state);
        expect(state.phase).toBe('TILE_IN_HAND');
        const options = getLegalTilePlacementOptions(state);
        const safe = options.flatMap((option) =>
          option.rotations.map((rotation) => ({ rotation, ...option.position })),
        );
        expect(safe.length).toBeGreaterThan(0);
        if (safe.length > 1) multiChoiceStatesChecked += 1;
        const pick = safe[safe.length - 1];
        let positioned = placeTurnTile(state, { x: pick.x, y: pick.y });
        while (positioned.rotation !== pick.rotation) positioned = rotatePositionedTurnTile(positioned);
        positioned = confirmTurnTilePlacement(positioned);
        expect(positioned.phase).toBe('TILE_PLACED');
        state = endTurn(positioned);
        if (state.riverPlaced < RIVER_CARD_COUNT) {
          const remaining = state.riverDeck.filter((id) => id !== END_ID);
          expect(() => assertRiverSolvableFrom(seed, state.game.board, remaining)).not.toThrow();
        }
      }
    }
    expect(multiChoiceStatesChecked).toBeGreaterThan(0);
  }, 180_000);

  it('places 133 initially, draws 19 more river cards, 106 last, then land', () => {
    let state = createTurnFlow({ gameId: 'transition', players: players(1), seed: 3 });
    expect(state.game.board[posKey({ x: 0, y: 0 })].definitionId).toBe(SOURCE_ID);
    const riverDraws: string[] = [];

    while (state.riverPlaced < RIVER_CARD_COUNT) {
      state = drawTurnTile(state);
      const drawnId = state.game.drawnTileDefinitionId!;
      riverDraws.push(drawnId);
      expect(getCardDefinition(drawnId).riverCard).toBe(true);
      expect(state.legalPlacements.length).toBeGreaterThan(0);
      state = confirmTurnTilePlacement(placeTurnTile(state, state.legalPlacements[0]));
      state = endTurn(state);
    }

    expect(state.riverPlaced).toBe(20);
    expect(riverDraws).toHaveLength(19);
    expect(new Set([SOURCE_ID, ...riverDraws]).size).toBe(20);
    expect(riverDraws.at(-1)).toBe(END_ID);
    expect(state.discardedTileIds).toEqual([]);

    state = drawTurnTile(state);
    expect(getCardDefinition(state.game.drawnTileDefinitionId!).riverCard).not.toBe(true);
  }, 60_000);
});
