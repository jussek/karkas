/**
 * Базовые геометрические и топологические типы игрового движка.
 * Не зависят от React / Supabase / UI.
 */

/** Сторона плитки. Индексы: 0 = North, 1 = East, 2 = South, 3 = West. */
export type EdgeIndex = 0 | 1 | 2 | 3;

/** Все четыре стороны плитки по порядку N, E, S, W. */
export const EDGES: readonly EdgeIndex[] = [0, 1, 2, 3] as const;

/** Направление индекса стороны (для читаемости кода). */
export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;

/**
 * Тип элемента ландшафта на стороне плитки.
 * Stage 1.5: 'field' — часть геометрии стыков (field+field совместимы),
 * но поля/крестьяне и их подсчёт реализуются на более поздних этапах.
 * Stage 2.5: 'river' — часть геометрии карты (набор карт проекта содержит
 * реки). River совместим только с river; механика реки — позже.
 */
export type EdgeType = 'road' | 'city' | 'field' | 'river';

/**
 * Поворот плитки. Значения — градусы по часовой стрелке.
 * rotateTile всегда нормализует результат к одному из этих значений.
 */
export type Rotation = 0 | 90 | 180 | 270;

/** Координата клетки на доске (система x/y, целочисленная сетка). */
export interface TilePosition {
  x: number;
  y: number;
}

/**
 * Внутренняя топология плитки: связность элементов ландшафта
 * внутри самой плитки (не через края).
 *
 * edgeSegments описывает, какой сегмент подходит к каждой стороне;
 * одинаковый id сегмента у двух сторон означает, что они соединены
 * внутри плитки (например, дорога с севера поворачивает на восток).
 */
export interface TileTopology {
  /** Уникальные id сегментов дорог на плитке. */
  roadSegments: readonly string[];
  /** Уникальные id сегментов городов на плитке. */
  citySegments: readonly string[];
  /** Shield count aligned with citySegments. Missing entries count as zero. */
  cityShields?: readonly number[];
  /** Есть ли на плитке монастырь (в центре). */
  hasMonastery: boolean;
  /**
   * Сегмент дороги, подходящий к каждой стороне [N, E, S, W].
   * null — если к стороне дорога не подходит.
   */
  roadEdgeSegments: readonly (string | null)[];
  /**
   * Сегмент города, подходящий к каждой стороне [N, E, S, W].
   * null — если к стороне город не подходит.
   */
  cityEdgeSegments: readonly (string | null)[];
}

/**
 * Определение типа плитки (шаблон), независимое от UI.
 * sides[i] описывает тип элемента ландшафта у стороны i в НЕПОВЁРНУТОМ виде.
 */
export interface TileDefinition {
  /** Уникальный id шаблона, например 'R-RRRR' или 'C-CCCC'. */
  id: string;
  /** Типы сторон в базовой (non-rotated) ориентации, порядок [N, E, S, W]. */
  sides: readonly EdgeType[];
  /** Топология связности внутри плитки в базовой ориентации. */
  topology: TileTopology;
  /** Человекочитаемое имя для отладки (не влияет на правила). */
  name?: string;
}

/**
 * Плитка, размещённая на доске: ссылка на шаблон + фактический поворот.
 */
export interface PlacedTile {
  definitionId: string;
  rotation: Rotation;
  position: TilePosition;
}

/**
 * Плитка «в руке» игрока (из колоды): шаблон ещё не повёрнут.
 */
export interface DrawnTile {
  definitionId: string;
}

/* ------------------------------------------------------------------ */
/* Мeeple-позиции (структурная модель Stage 2)                         */
/*                                                                     */
/* Локальная позиция на плитке однозначно определяет, КУДА ставится   */
/* подданный:                                                          */
/*  - road  + edge N/E/S/W — дорога, подходящая к этой стороне;       */
/*  - city  + edge N/E/S/W — город, подходящий к этой стороне;        */
/*  - monastery + edge null — монастырь в центре плитки.              */
/* Глобальное объединение features (connected roads/cities) — Stage 3. */
/* ------------------------------------------------------------------ */

/** Тип локального элемента плитки для размещения meeple. */
export type LocalFeatureType = 'road' | 'city' | 'monastery';

/** Однозначная позиция meeple на плитке. */
export interface MeeplePlacement {
  featureType: LocalFeatureType;
  /** Сторона [N,E,S,W] для дорог/городов; null для монастыря. */
  edge: EdgeIndex | null;
}

/** Стабильный ключ локальной позиции (для проверки занятости). */
export function placementKey(p: MeeplePlacement): string {
  return `${p.featureType}:${p.edge ?? 'center'}`;
}
