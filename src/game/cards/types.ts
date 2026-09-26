/**
 * Card Catalog Types — Stage 2.5
 * 
 * Each card is described by its topology in canonical orientation (rotation = 0).
 * The visual asset (image) is the source of truth for the configuration.
 * 
 * IMPORTANT: This catalog does NOT encode rotation. Use rotateTile() from geometry.
 */

import type { EdgeType } from '../types/geometry';

/** Side identifier for cardinal directions */
export type CardSide = 'north' | 'east' | 'south' | 'west';

/** Connection between sides within a single feature */
export interface FeatureConnection {
  /** Which sides this feature touches */
  connections: readonly CardSide[];
}

/** Road feature on a card */
export interface RoadFeature extends FeatureConnection {
  type: 'road';
  /** Optional: dead-end side if applicable */
  deadEnd?: CardSide;
}

/** City feature on a card */
export interface CityFeature extends FeatureConnection {
  type: 'city';
  /** Number of shields/coats-of-arms visible on this city segment */
  shields: number;
}

/** Monastery feature (center of tile) */
export interface MonasteryFeature {
  type: 'monastery';
  /** Monastery occupies center; edges are determined by surrounding features */
}

/** Field area (not yet scored, but part of topology) */
export interface FieldFeature extends FeatureConnection {
  type: 'field';
}

/** River feature (special expansion element) */
export interface RiverFeature extends FeatureConnection {
  type: 'river';
  /** Is this the source spring? */
  isSource?: boolean;
  /** Is this the lake end? */
  isLake?: boolean;
}

/** Union of all possible features on a card */
export type CardFeature =
  | RoadFeature
  | CityFeature
  | MonasteryFeature
  | FieldFeature
  | RiverFeature;

/** Special symbols that may appear on cards */
export interface SpecialSymbol {
  type: 'shield' | 'coat_of_arms' | 'inn' | 'cathedral' | 'bridge' | 'dragon' | 'fairy' | 'castle' | 'abbey' | 'unknown';
  /** Which feature it belongs to, if identifiable */
  featureIndex?: number;
  reviewRequired: boolean;
  description?: string;
}

/** Meeple placement hint — where a meeple can theoretically stand */
export interface MeeplePositionHint {
  featureIndex: number;
  featureType: 'road' | 'city' | 'monastery' | 'field';
  /** If road/city, which edge is closest to the standing position */
  nearestEdge?: CardSide;
}

/** Complete definition of one physical card asset */
export interface CardDefinition {
  /** Unique ID for this card, e.g., "card-001" */
  id: string;
  
  /** Exact filename in src/game/cards/, e.g., "1 (1).jpg" */
  asset: string;
  
  /** Edge types in canonical orientation [N, E, S, W] */
  edges: {
    north: EdgeType;
    east: EdgeType;
    south: EdgeType;
    west: EdgeType;
  };
  
  /** All features present on this card in canonical orientation */
  features: readonly CardFeature[];
  
  /** Any special symbols/icons visible on the card */
  specialFeatures: readonly SpecialSymbol[];
  
  /** Total shield count across all cities (for quick reference) */
  totalShields: number;
  
  /** Does this card contain a monastery? */
  hasMonastery: boolean;
  
  /** Does this card contain river elements? */
  hasRiver: boolean;
  
  /** Theoretical meeple standing positions */
  meeplePositions: readonly MeeplePositionHint[];
  
  /** Metadata for catalog maintenance */
  metadata: {
    /** True if this card could not be unambiguously classified from the image */
    reviewRequired: boolean;
    /** Reason for manual review if needed */
    reviewReason?: string;
    /** Human-readable name/description for debugging */
    name?: string;
  };
}

/** Reference to the overview map asset (NOT a playable tile) */
export const MAPS_ASSET = 'maps.png';

/** Type guard helpers */
export function isRoadFeature(f: CardFeature): f is RoadFeature {
  return f.type === 'road';
}

export function isCityFeature(f: CardFeature): f is CityFeature {
  return f.type === 'city';
}

export function isMonasteryFeature(f: CardFeature): f is MonasteryFeature {
  return f.type === 'monastery';
}

export function isFieldFeature(f: CardFeature): f is FieldFeature {
  return f.type === 'field';
}

export function isRiverFeature(f: CardFeature): f is RiverFeature {
  return f.type === 'river';
}
