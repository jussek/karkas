import { GAME_CARD_CATALOG } from '../../game/cards/canonicalCatalog';

/** Source-based fallback: the historical card-106 JPG is not stored in Git. */
const RIVER_END_106_SVG = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="grass" x2="0" y2="1"><stop stop-color="#a9bd55"/><stop offset="1" stop-color="#718f3c"/></linearGradient>
      <linearGradient id="water" x2="1" y2="1"><stop stop-color="#b9d9d0"/><stop offset="1" stop-color="#6fa7a9"/></linearGradient>
    </defs>
    <rect width="256" height="256" fill="url(#grass)"/>
    <path d="M256 82C214 79 189 90 164 106C142 121 119 132 89 132C55 132 27 120 0 112V176C35 183 62 190 94 190C134 190 166 177 194 157C216 141 235 135 256 137Z" fill="url(#water)" stroke="#e4e2c5" stroke-width="8"/>
    <path d="M126 0C126 37 132 62 147 89" fill="none" stroke="#eee4bd" stroke-width="17"/>
    <path d="M126 0C126 37 132 62 147 89" fill="none" stroke="#8f8567" stroke-width="3"/>
    <path d="M88 256V216L110 198L132 216L154 194L181 217V256Z" fill="#9a512d" stroke="#57341f" stroke-width="5"/>
    <path d="M77 222L110 187L139 220L166 184L194 224" fill="none" stroke="#d89b51" stroke-width="12"/>
  </svg>
`)}`;

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
  const url = card.id === 'card-106' ? RIVER_END_106_SVG : importedAssets[path];
  if (!url) throw new Error(`Missing tile artwork for ${card.id}: ${card.asset}`);
  return { cardId: card.id, filename: card.asset, url };
});

const ASSET_BY_CARD_ID = new Map(TILE_ASSETS.map((entry) => [entry.cardId, entry]));

export function tileAssetForCard(cardId: string): TileAssetEntry {
  const entry = ASSET_BY_CARD_ID.get(cardId);
  if (!entry) throw new Error(`Unknown tile artwork: ${cardId}`);
  return entry;
}
