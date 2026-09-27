// @ts-expect-error -- Node builtins are available in Vitest.
import { existsSync } from 'node:fs';
// @ts-expect-error -- Node builtins are available in Vitest.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGalleryEntries } from '../../game-ui/gallery/galleryModel';
import { TILE_ASSETS } from '../../game-ui/tiles/tileAssets';
import { TILE_SEMANTIC_MANIFEST } from '../../game-ui/tiles/tileSemanticManifest';
import { GAME_CARD_CATALOG } from '../cards/canonicalCatalog';
import { getCardDefinition } from '../cards/catalogApi';
import { RIVER_CARD_COUNT, createTurnFlow, getRiverCards } from '../engine/turnFlow';
import type { Player } from '../types/state';

const players: Player[] = [
  { id: 'a', name: 'A', color: 'blue', score: 0 },
  { id: 'b', name: 'B', color: 'red', score: 0 },
];

describe('Stage 3H final runtime consistency', () => {
  it('contains exactly the 143 runtime cards and rejects only removed card-106', () => {
    expect(GAME_CARD_CATALOG).toHaveLength(143);
    expect(getCardDefinition('card-105').asset).toBe('1 (105).jpg');
    expect(() => getCardDefinition('card-106')).toThrow('Unknown card definition: card-106');
    expect(GAME_CARD_CATALOG.some((card) => card.id === 'card-106')).toBe(false);
  });

  it('has the canonical 19-card river with exactly one audited terminal of each kind', () => {
    const river = getRiverCards();
    expect(RIVER_CARD_COUNT).toBe(19);
    expect(river).toHaveLength(19);
    expect(river.filter((card) => card.riverKind === 'start').map((card) => card.id)).toEqual(['card-091']);
    expect(river.filter((card) => card.riverKind === 'end').map((card) => card.id)).toEqual(['card-133']);
    expect(getCardDefinition('card-096').riverCard).not.toBe(true);
  });

  it('orders source, shuffled middle cards, and end without admitting terminals to the shuffle', () => {
    const first = createTurnFlow({ gameId: 'a', players, seed: 1 });
    const second = createTurnFlow({ gameId: 'b', players, seed: 2 });
    expect(Object.values(first.game.board)[0].definitionId).toBe('card-091');
    expect(first.riverDeck[first.riverDeck.length - 1]).toBe('card-133');
    expect(first.riverDeck.slice(0, -1)).not.toContain('card-091');
    expect(first.riverDeck.slice(0, -1)).not.toContain('card-133');
    expect(first.riverDeck.slice(0, -1)).not.toEqual(second.riverDeck.slice(0, -1));
  });

  it('keeps artwork, semantic manifest, and gallery aligned with the runtime catalog', () => {
    const expected = GAME_CARD_CATALOG.map((card) => card.id);
    expect(TILE_ASSETS.map((asset) => asset.cardId)).toEqual(expected);
    expect(TILE_SEMANTIC_MANIFEST.map((tile) => tile.cardId)).toEqual(expected);
    expect(buildGalleryEntries().map((entry) => entry.id)).toEqual(expected);
    expect(TILE_ASSETS.some((asset) => asset.filename === '1 (106).jpg')).toBe(false);
  });

  it('has local artwork for every runtime card, including card-105', () => {
    const cardsDirectory = new URL('../cards/', import.meta.url).pathname;
    for (const card of GAME_CARD_CATALOG) {
      expect(existsSync(join(cardsDirectory, card.asset)), card.id).toBe(true);
    }
    expect(existsSync(join(cardsDirectory, '1 (105).jpg'))).toBe(true);
  });
});
