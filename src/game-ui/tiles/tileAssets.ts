import { RUNTIME_CARD_CATALOG } from '../../game/cards/runtimeCatalog';

const importedAssets = import.meta.glob('../../game/cards/*.jpg', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

export interface TileAssetEntry {
  cardId: string;
  filename: string;
  url: string;
}

// card-105 was accidentally deleted from this branch before the user clarified that
// card-106 is the tile to remove. Keep 105 playable immediately using the exact artwork
// from main; the binary should be restored to src/game/cards in the next repository-file sync.
const CARD_105_FALLBACK = 'https://raw.githubusercontent.com/jussek/karkas/main/src/game/cards/1%20(105).jpg';

export const TILE_ASSETS: readonly TileAssetEntry[] = RUNTIME_CARD_CATALOG.map((card) => {
  const path = `../../game/cards/${card.asset}`;
  const url = importedAssets[path] ?? (card.id === 'card-105' ? CARD_105_FALLBACK : undefined);
  if (!url) throw new Error(`Missing tile artwork for ${card.id}: ${card.asset}`);
  return { cardId: card.id, filename: card.asset, url };
});

const ASSET_BY_CARD_ID = new Map(TILE_ASSETS.map((entry) => [entry.cardId, entry]));

export function tileAssetForCard(cardId: string): TileAssetEntry {
  const entry = ASSET_BY_CARD_ID.get(cardId);
  if (!entry) throw new Error(`Unknown tile artwork: ${cardId}`);
  return entry;
}
