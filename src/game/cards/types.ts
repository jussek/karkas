/**
 * Card Catalog Types — Stage 2.5
 *
 * Each card is described in canonical orientation (rotation = 0).
 * The visual asset (image) is the source of truth for the configuration.
 *
 * IMPORTANT: This catalog does NOT encode rotation. Use rotateTile()
 * from geometry to derive rotated variants at runtime.
 */

import type { EdgeIndex, EdgeType } from '../types/geometry.js';

export type { EdgeType };

/** Side identifier for cardinal directions */
export type CardSide = 'north' | 'east' | 'south' | 'west';

/** Canonical order of sides, matching EdgeIndex 0..3 */
export const CARD_SIDES: readonly CardSide[] = ['north', 'east', 'south', 'west'] as const;

/**
 * Internal topology of a card. Feature connectivity is expressed as
 * groups of EdgeIndex values that are connected WITHIN this card.
 *
 * roads: each inner array lists road ends belonging to one road feature,
 *        e.g. [[0,2]] = straight N-S road, [[0],[1]] = two separate dead-end roads.
 * cities: same convention for city segments.
 * riverEdges: sides touched by the river (river is never merged into roads/cities).
 */
export interface CardTopology {
  /** Road features as groups of connected edge indices */
  roads: readonly (readonly EdgeIndex[])[];
  /** City features as groups of connected edge indices */
  cities: readonly (readonly EdgeIndex[])[];
  /** Shield count aligned with each independent city segment, when present. */
  cityShields?: readonly number[];
  /** Sides where the river touches the card border (optional) */
  riverEdges?: readonly EdgeIndex[];
  /** True if a monastery/abbey stands in the center of the card */
  monastery?: boolean;
}

/** Complete definition of one physical card asset */
export interface CardDefinition {
  /** Unique ID, e.g. "card-001" */
  id: string;

  /** Exact filename in authoritative src/a/, e.g. "1 (1).jpg" — never renamed */
  asset: string;

  /** Edge terrain types in canonical orientation */
  edges: {
    north: EdgeType;
    east: EdgeType;
    south: EdgeType;
    west: EdgeType;
  };

  /** Internal connectivity (source of truth for feature merging later) */
  topology: CardTopology;

  /** Number of shields visually confirmed on this card (0 if none/unverified) */
  shields?: number;

  /** Other special markers detected but not yet given game meaning */
  special?: string[];

  /** True if some aspect could not be reliably classified from the image */
  reviewRequired?: boolean;

  /** Why manual review is needed */
  reviewReason?: string;

  /**
   * River marker card: user-confirmed checkpoint (visual verification of real
   * JPGs) that the river passes through this card. Geometric classification
   * only — no river gameplay implemented at Stage 2.5.
   */
  riverCard?: boolean;

  /** Kind of river card, when riverCard === true (source / middle / lake-end). */
  riverKind?: 'start' | 'middle' | 'end';
}

/** Reference to the overview map asset (NOT a playable tile, never in deck) */
export const MAPS_ASSET = 'maps.png';
