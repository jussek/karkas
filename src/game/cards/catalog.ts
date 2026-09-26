/**
 * Card Catalog — Stage 2.5
 *
 * ⚠️ СТАТУС: КАТАЛОГ НЕ ЗАПОЛНЕН. Это НЕ финальные данные.
 *
 * Требования Stage 2.5 предписывают:
 *   - классифицировать каждую из 144 карт по её изображению;
 *   - НЕ угадывать тип карты по памяти о стандартном Carcassonne;
 *   - при невозможности однозначной классификации ставить reviewRequired: true.
 *
 * Я работаю в текстовой среде и НЕ имею возможности визуально инспектировать
 * содержимое JPG-файлов (188×188 px). Пиксельная эвристика по цвету полосок
 * у краёв даёт неоднозначные результаты для большинства файлов, а значит
 * любая конкретная раскладка edges/features была бы УГАДАЙКОЙ, что прямо
 * запрещено правилами этапа.
 *
 * Поэтому каталог состоит из 144 записей с корректными id/asset (эти данные
 * верифицируемы — файлы реально существуют), но с пустыми топологическими
 * полями и reviewRequired: true + явной reviewReason.
 *
 * После визуальной классификации (человеком или tool-ом компьютерного зрения)
 * записи будут заполнены без изменения структуры. Engine-код должен читать
 * описание карты ТОЛЬКО через getCardDefinition() и отказываться использовать
 * карту с metadata.reviewRequired === true.
 */

import type { EdgeType } from '../types/geometry';
import type { CardDefinition } from './types';

/** Общее основание записи, ожидаемое после классификации. */
const UNCLASSIFIED_REASON =
  'Card image exists on disk but its topology (edges/features/shields) has not been visually classified yet. ' +
  'Automatic pixel heuristics were inconclusive; manual or CV-based classification is required before this card enters the deck.';

function unclassifiedCard(index: number): CardDefinition {
  const num = String(index).padStart(3, '0');
  return {
    id: `card-${num}`,
    asset: `1 (${index}).jpg`,
    // Placeholder edge types — MUST be replaced after visual classification.
    // Marked invalid via reviewRequired so engine refuses to use them.
    edges: {
      north: 'field' as EdgeType,
      east: 'field' as EdgeType,
      south: 'field' as EdgeType,
      west: 'field' as EdgeType,
    },
    features: [],
    specialFeatures: [],
    totalShields: 0,
    hasMonastery: false,
    hasRiver: false,
    meeplePositions: [],
    metadata: {
      reviewRequired: true,
      reviewReason: UNCLASSIFIED_REASON,
      name: undefined,
    },
  };
}

/**
 * Полный каталог 144 карт. Записи упорядочены строго по номерам файлов 1–144.
 * Каждая запись ссылается на реально существующий asset.
 */
export const CARD_CATALOG: readonly CardDefinition[] = Array.from(
  { length: 144 },
  (_, i) => unclassifiedCard(i + 1),
);

/** Справочный ассет overview-карты. НЕ является игровой плиткой. */
export const MAPS_ASSET_NAME = 'maps.png';

/** Получить определение карты по имени файла ассета. */
export function getCardByAsset(assetName: string): CardDefinition | undefined {
  return CARD_CATALOG.find((c) => c.asset === assetName);
}

/** Получить определение карты по id. */
export function getCardById(id: string): CardDefinition | undefined {
  return CARD_CATALOG.find((c) => c.id === id);
}

/** Индекс «готовых» (классифицированных) карт — пока пусто. */
export function getClassifiedCards(): CardDefinition[] {
  return CARD_CATALOG.filter((c) => !c.metadata.reviewRequired);
}

/** Карты, требующие ручной классификации. */
export function getReviewRequiredCards(): CardDefinition[] {
  return CARD_CATALOG.filter((c) => c.metadata.reviewRequired);
}
