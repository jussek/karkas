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

/** Тип элемента ландшафта на стороне плитки (Этап 1: без полей/крестьян). */
export type EdgeType = 'road' | 'city';

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
