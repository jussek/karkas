import { describe, expect, it } from 'vitest';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { getCardDefinition, getTileDefinition } from '../cards/catalogApi';
import { cardToTileDefinition } from '../cards/toTileDefinition';
import { createCatalogDeck } from '../deck/catalogDeck';
import { seededShuffle } from '../deck/seededShuffle';
import { createCatalogGame } from '../engine/createCatalogGame';
import { MEEPLES_PER_PLAYER } from '../engine/gameEngine';
import type { Player } from '../types/state';

const verifiedStart = GAME_CARD_CATALOG.find((card) => card.reviewRequired !== true)!;
const reviewCard = GAME_CARD_CATALOG.find((card) => card.reviewRequired === true);

describe('card catalog adapter', () => {
  it('converts all 143 runtime cards exactly without mutation', () => {
    expect(GAME_CARD_CATALOG).toHaveLength(143);

    for (const card of GAME_CARD_CATALOG) {
      const before = JSON.stringify(card);
      const tile = cardToTileDefinition(card);
      const expectedRoadEdges: (string | null)[] = [null, null, null, null];
      const expectedCityEdges: (string | null)[] = [null, null, null, null];

      card.topology.roads.forEach((edges, index) => {
        for (const edge of edges) expectedRoadEdges[edge] = `road:${index}`;
      });
      card.topology.cities.forEach((edges, index) => {
        for (const edge of edges) expectedCityEdges[edge] = `city:${index}`;
      });

      expect(tile.id).toBe(card.id);
      expect(tile.sides).toEqual([
        card.edges.north,
        card.edges.east,
        card.edges.south,
        card.edges.west,
      ]);
      expect(tile.topology.roadSegments).toEqual(
        card.topology.roads.map((_, index) => `road:${index}`),
      );
      expect(tile.topology.roadEdgeSegments).toEqual(expectedRoadEdges);
      expect(tile.topology.citySegments).toEqual(
        card.topology.cities.map((_, index) => `city:${index}`),
      );
      expect(tile.topology.cityEdgeSegments).toEqual(expectedCityEdges);
      expect(tile.topology.hasMonastery).toBe(card.topology.monastery === true);

      tile.sides.forEach((side, edge) => {
        if (side === 'river') {
          expect(tile.topology.roadEdgeSegments[edge]).toBeNull();
          expect(tile.topology.cityEdgeSegments[edge]).toBeNull();
        }
      });
      expect(JSON.stringify(card)).toBe(before);
    }
  });

  it('preserves every river side', () => {
    for (const card of GAME_CARD_CATALOG) {
      const tile = cardToTileDefinition(card);
      const cardSides = [card.edges.north, card.edges.east, card.edges.south, card.edges.west];
      cardSides.forEach((side, edge) => {
        if (side === 'river') expect(tile.sides[edge]).toBe('river');
      });
    }
  });
});

describe('catalog lookup', () => {
  it('looks up card and tile definitions', () => {
    expect(getCardDefinition('card-001').id).toBe('card-001');
    expect(getTileDefinition('card-001').id).toBe('card-001');
  });

  it('rejects an unknown definition', () => {
    expect(() => getCardDefinition('does-not-exist')).toThrow(
      'Unknown card definition: does-not-exist',
    );
  });
});

describe('catalog deck', () => {
  it('builds the default verified deck in catalog order without mutation', () => {
    const before = JSON.stringify(GAME_CARD_CATALOG);
    const deck = createCatalogDeck({ startCardId: verifiedStart.id });
    const expected = GAME_CARD_CATALOG.filter(
      (card) => card.id !== verifiedStart.id && card.reviewRequired !== true,
    ).map((card) => card.id);

    expect(deck).toEqual(expected);
    expect(deck).toHaveLength(expected.length);
    expect(deck).not.toContain(verifiedStart.id);
    expect(new Set(deck).size).toBe(deck.length);
    expect(deck.every((id) => getCardDefinition(id).reviewRequired !== true)).toBe(true);
    expect(JSON.stringify(GAME_CARD_CATALOG)).toBe(before);
  });

  it('includes every non-start card when review cards are enabled', () => {
    const deck = createCatalogDeck({
      startCardId: verifiedStart.id,
      includeReviewRequired: true,
    });
    const expected = GAME_CARD_CATALOG.filter((card) => card.id !== verifiedStart.id).map(
      (card) => card.id,
    );

    expect(deck).toEqual(expected);
    expect(deck).toHaveLength(GAME_CARD_CATALOG.length - 1);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it('rejects an unknown start card', () => {
    expect(() => createCatalogDeck({ startCardId: 'does-not-exist' })).toThrow(
      'Unknown card definition: does-not-exist',
    );
  });
});

describe('seeded shuffle', () => {
  it('is deterministic, pure, and preserves all elements', () => {
    const input = Array.from({ length: 100 }, (_, index) => index);
    const original = [...input];
    const first = seededShuffle(input, 12345);

    expect(first).toEqual(seededShuffle(input, 12345));
    expect(first).not.toEqual(seededShuffle(input, 54321));
    expect(input).toEqual(original);
    expect(first).not.toBe(input);
    expect(first).toHaveLength(input.length);
    expect([...first].sort((a, b) => a - b)).toEqual(input);
  });
});

describe('catalog game factory', () => {
  const players: Player[] = [
    { id: 'p1', name: 'One', color: 'blue', score: 0 },
    { id: 'p2', name: 'Two', color: 'red', score: 0 },
  ];

  it('creates a deterministic game with the selected catalog start tile', () => {
    const options = {
      gameId: 'g1',
      players,
      startCardId: verifiedStart.id,
      seed: 12345,
    };
    const game = createCatalogGame(options);
    const sameGame = createCatalogGame(options);
    const differentSeed = createCatalogGame({ ...options, seed: 54321 });

    expect(game.status).toBe('playing');
    expect(game.gamePhase).toBe('drawTile');
    expect(game.turnNumber).toBe(1);
    expect(game.currentPlayerIndex).toBe(0);
    expect(Object.keys(game.board)).toHaveLength(1);
    expect(game.board['0,0'].definitionId).toBe(verifiedStart.id);
    expect(game.board['0,0'].rotation).toBe(0);
    expect(game.tileDeck.remaining).not.toContain(verifiedStart.id);
    expect(
      game.tileDeck.remaining.every(
        (id) => getCardDefinition(id).reviewRequired !== true,
      ),
    ).toBe(true);
    expect(game.tileDeck.remaining).toEqual(sameGame.tileDeck.remaining);
    expect(game.tileDeck.remaining).not.toEqual(differentSeed.tileDeck.remaining);
    for (const player of players) {
      expect(game.meeples.filter((meeple) => meeple.playerId === player.id)).toHaveLength(
        MEEPLES_PER_PLAYER,
      );
    }
  });

  it('requires explicit opt-in when the start card needs review', () => {
    if (!reviewCard) return;

    expect(() =>
      createCatalogGame({
        gameId: 'review',
        players,
        startCardId: reviewCard.id,
        seed: 1,
      }),
    ).toThrow(`Start card requires review: ${reviewCard.id}`);

    expect(
      createCatalogGame({
        gameId: 'review',
        players,
        startCardId: reviewCard.id,
        seed: 1,
        includeReviewRequired: true,
      }).board['0,0'].definitionId,
    ).toBe(reviewCard.id);
  });
});
