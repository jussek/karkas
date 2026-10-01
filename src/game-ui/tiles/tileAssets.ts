import { GAME_CARD_CATALOG } from '../../game/cards/canonicalCatalog';

const importedAssets = import.meta.glob([
  '../../game/cards/*.jpg',
], {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

export interface TileAssetEntry {
  cardId: string;
  filename: string;
  url: string;
}

export const TILE_ASSETS: readonly TileAssetEntry[] = GAME_CARD_CATALOG.map((card) => {
  const path = `../../game/cards/${card.asset}`;
  const url = importedAssets[path];
  if (!url) throw new Error(`Missing tile artwork for ${card.id}: ${card.asset}`);
  return { cardId: card.id, filename: card.asset, url };
});

const ASSET_BY_CARD_ID = new Map(TILE_ASSETS.map((entry) => [entry.cardId, entry]));

export function tileAssetForCard(cardId: string): TileAssetEntry {
  const entry = ASSET_BY_CARD_ID.get(cardId);
  if (!entry) throw new Error(`Unknown tile artwork: ${cardId}`);
  return entry;
}
