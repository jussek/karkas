import { describe, expect, it } from 'vitest';
import { getTileDefinition } from '../cards/catalogApi';
import {
  confirmTurnTilePlacement, createTurnFlow, drawTurnTile, endTurn, getLegalTilePlacementOptions,
  getRiverCards, legalPlacementsFor, placeTurnTile, rotatePositionedTurnTile, ROTATIONS,
  RIVER_CARD_COUNT, TURN_PHASES,
} from '../engine/turnFlow';
import { getLegalTilePlacements } from '../rules/placement';
import type { Player } from '../types/state';

const players: Player[] = [
  { id: 'a', name: 'A', color: 'blue', score: 0 },
  { id: 'b', name: 'B', color: 'red', score: 0 },
];

describe('Stage 3G turn flow', () => {
  it('exposes only phases used by the current state machine', () => {
    expect(TURN_PHASES).toEqual(['AWAITING_DRAW', 'TILE_IN_HAND', 'TILE_POSITIONED', 'TILE_PLACED', 'MEEPLE_SELECTION', 'GAME_OVER']);
  });

  it('starts with the source placed and requires an explicit draw', () => {
    const state = createTurnFlow({ gameId: 'g', players, seed: 12 });
    expect(state.phase).toBe('AWAITING_DRAW');
    expect(state.riverPlaced).toBe(1);
    expect(Object.values(state.game.board)[0].definitionId).toBe(getRiverCards().find((card) => card.riverKind === 'start')?.id);
    expect(state.game.drawnTileDefinitionId).toBeNull();
  });

  it('defines the 19-card river with source 133 first and end 106 last', () => {
    const state = createTurnFlow({ gameId: 'g', players, seed: 12 });
    expect(RIVER_CARD_COUNT).toBe(19);
    expect(getRiverCards()).toHaveLength(19);
    expect(Object.values(state.game.board)[0].definitionId).toBe('card-133');
    expect(state.riverDeck).toHaveLength(18);
    expect(state.riverDeck[state.riverDeck.length - 1]).toBe('card-106');
    expect(getRiverCards().find((card) => card.id === state.riverDeck[state.riverDeck.length - 1])?.riverKind).toBe('end');
    expect(state.riverDeck.slice(0, -1).every((id) => getRiverCards().find((card) => card.id === id)?.riverKind === 'middle')).toBe(true);
  });

  it('draws one playable tile and rejects a repeated draw', () => {
    const initial = createTurnFlow({ gameId: 'g', players, seed: 22 });
    const drawn = drawTurnTile(initial);
    expect(drawn.phase).toBe('TILE_IN_HAND');
    expect(drawn.riverDeck.length + drawn.discardedTileIds.length).toBe(initial.riverDeck.length - 1);
    expect(drawTurnTile(drawn)).toBe(drawn);
  });

  it('hand tile waits at rotation 0; positioned rotation cycles only within legal set', () => {
    const drawn = drawTurnTile(createTurnFlow({ gameId: 'g', players, seed: 32 }));
    const id = drawn.game.drawnTileDefinitionId!;
    // Hand-tile больше не выбирает rotation до размещения: подсветка = union.
    expect(drawn.rotation).toBe(0);
    const options = getLegalTilePlacementOptions(drawn, id);
    const cell = options.find((option) => option.rotations.length >= 2) ?? options[0];
    const positioned = placeTurnTile(drawn, cell.position);
    expect(positioned.phase).toBe('TILE_POSITIONED');
    expect(positioned.game.drawnTileDefinitionId).toBe(id);
    // Цикл ориентации замкнут и детерминирован: только legal rotation клетки.
    let current = positioned;
    const seen = [current.rotation];
    for (let index = 0; index < cell.rotations.length; index += 1) {
      current = rotatePositionedTurnTile(current);
      expect(cell.rotations).toContain(current.rotation);
      seen.push(current.rotation);
    }
    expect(seen[seen.length - 1]).toBe(seen[0]); // полный цикл вернулся к первой
    if (cell.rotations.length >= 2) {
      expect(new Set(seen).size).toBe(cell.rotations.length);
    }
    // Вне TILE_POSITIONED rotate — строгий no-op.
    expect(rotatePositionedTurnTile(drawn)).toBe(drawn);
  });

  it('only places on an engine-provided highlight and scores only at end turn', () => {
    const drawn = drawTurnTile(createTurnFlow({ gameId: 'g', players, seed: 42 }));
    const rejected = placeTurnTile(drawn, { x: 100, y: 100 });
    expect(rejected).toBe(drawn);
    const positioned = placeTurnTile(drawn, drawn.legalPlacements[0]);
    expect(positioned.phase).toBe('TILE_POSITIONED');
    // До подтверждения board НЕ мутирован и очки не начисляются.
    expect(positioned.game.scores).toEqual(drawn.game.scores);
    const placed = confirmTurnTilePlacement(positioned);
    expect(placed.phase).toBe('TILE_PLACED');
    expect(placed.game.scores).toEqual(drawn.game.scores);
    const ended = endTurn(placed);
    expect(ended.phase).toBe('AWAITING_DRAW');
    expect(ended.game.currentPlayerIndex).toBe(1);
    expect(endTurn(ended)).toBe(ended);
    expect(ended.game.drawnTileDefinitionId).toBeNull();
  });

  it('never injects a fake card id while completing a turn', () => {
    const drawn = drawTurnTile(createTurnFlow({ gameId: 'g', players, seed: 62 }));
    const placed = confirmTurnTilePlacement(placeTurnTile(drawn, drawn.legalPlacements[0]));
    const ended = endTurn(placed);
    const serialized = JSON.stringify(ended.game);
    expect(serialized).not.toContain('sentinel');
    expect(serialized).not.toContain('dummy');
    expect(serialized).not.toContain('fake');
  });

  it('uses all four rotations when deciding whether a candidate is playable', () => {
    const state = createTurnFlow({ gameId: 'g', players, seed: 52 });
    const candidate = state.riverDeck[0];
    expect(ROTATIONS.map((rotation) => legalPlacementsFor(state, candidate, rotation).length).some(Boolean)).toBe(true);
  });
});

describe('legal placement highlights', () => {
  it('are generated by rules and reject occupied or diagonal-only cells', () => {
    const state = createTurnFlow({ gameId: 'g', players, seed: 1 });
    const source = Object.values(state.game.board)[0];
    const definition = getTileDefinition(source.definitionId);
    const legal = getLegalTilePlacements({ board: state.game.board, getDefinition: getTileDefinition }, definition, 0);
    expect(legal).not.toContainEqual({ x: 0, y: 0 });
    expect(legal).not.toContainEqual({ x: 1, y: 1 });
  });
});
