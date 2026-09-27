/**
 * Stage 3E — Rule-driven SVG tile renderer.
 *
 * Pipeline:  TileDefinition (+rotation)
 *            → engine rotateTile() (public API, rotation never duplicated)
 *            → createTileRenderModel() (pure intermediate model)
 *            → deterministic SVG primitives in a 0 0 100 100 viewBox.
 *
 * No JPGs, no canvas, no external assets, no Math.random, no card-ID
 * geometry special cases. Card id only seeds decoration.
 */

import { useMemo } from 'react';
import type { Rotation, TileDefinition } from '../../game/types/geometry';
import { createRotatedTileRenderModel } from './tileRenderModel';
import type { RenderFeature } from './tileRenderModel';
import {
  ROAD_WIDTH,
  RIVER_WIDTH,
  cityBoundingBox,
  cityBuildings,
} from './tileGeometry';
import { buildFieldDecorations } from './tileDecoration';
import { PALETTE } from './tilePalette';

export interface TileRendererProps {
  definition: TileDefinition;
  /** Clockwise rotation in 0/90/180/270 degrees. Default 0. */
  rotation?: Rotation;
  /** Rendered square size in CSS pixels. Default 100. */
  size?: number;
  className?: string;
  /** Optional presentation highlight ring (no semantic effect). */
  highlight?: boolean;
  /** Override the generated screen-reader label. */
  ariaLabel?: string;
}

const EDGE_NAMES = ['north', 'east', 'south', 'west'] as const;

function describeFeatures(model: {
  roads: readonly RenderFeature[];
  cities: readonly RenderFeature[];
  rivers: readonly RenderFeature[];
}): string {
  const parts: string[] = [];
  for (const r of model.roads) {
    parts.push(`road ${r.edges.map((e) => EDGE_NAMES[e]).join('-')}`);
  }
  for (const c of model.cities) {
    parts.push(`city ${c.edges.map((e) => EDGE_NAMES[e]).join('-')}`);
  }
  for (const v of model.rivers) {
    parts.push(`river ${v.edges.map((e) => EDGE_NAMES[e]).join('-')}`);
  }
  if (model.monastery === true) parts.push('monastery');
  return parts.join(', ');
}

/* ------------------------------------------------------------------ */
/* Sub-layers (kept as local pure functions — small DOM per tile)      */
/* ------------------------------------------------------------------ */

function RoadLayer({ feature }: { feature: RenderFeature }) {
  return (
    <g data-feature={feature.id}>
      <path
        d={feature.path}
        fill="none"
        stroke={PALETTE.roadOuter}
        strokeWidth={ROAD_WIDTH + 4}
        strokeLinecap="round"
      />
      <path
        d={feature.path}
        fill="none"
        stroke={PALETTE.roadInner}
        strokeWidth={ROAD_WIDTH}
        strokeLinecap="round"
      />
    </g>
  );
}

function RiverLayer({ feature }: { feature: RenderFeature }) {
  const single = feature.edges.length === 1;
  return (
    <g data-feature={feature.id}>
      <path
        d={feature.path}
        fill="none"
        stroke={PALETTE.riverBank}
        strokeWidth={RIVER_WIDTH + 5}
        strokeLinecap="round"
      />
      <path
        d={feature.path}
        fill="none"
        stroke={PALETTE.riverWater}
        strokeWidth={RIVER_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={feature.path}
        fill="none"
        stroke={PALETTE.riverHighlight}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.6}
      />
      {single ? (
        /* source spring / lake bulge at the internal terminus */
        <circle
          cx={Number(feature.path.split(' ').pop()?.split(',')[0] ?? 50)}
          cy={Number(feature.path.split(' ').pop()?.split(',')[1] ?? 50)}
          r={RIVER_WIDTH * 0.85}
          fill={PALETTE.riverWater}
          stroke={PALETTE.riverBank}
          strokeWidth={3}
        />
      ) : null}
    </g>
  );
}

function CityLayer({
  feature,
  slot,
  seed,
}: {
  feature: RenderFeature;
  slot: number;
  seed: string;
}) {
  const bb = cityBoundingBox(feature.edges);
  const buildings = cityBuildings(feature.edges, seed, slot);
  const pointsAttr = feature.path
    .replace(/^M /, '')
    .replace(/ L /g, ' ')
    .replace(/ Z$/, '')
    .trim()
    .split(' ')
    .join(' ');
  return (
    <g data-feature={feature.id}>
      {/* A. semantic mass (connectivity lives ONLY here) */}
      <polygon
        points={pointsAttr}
        fill={PALETTE.cityMass}
        stroke={PALETTE.cityWall}
        strokeWidth={2.5}
      />
      {/* inner wall band hint along the border side */}
      <rect
        x={bb.minX + 3}
        y={bb.minY + 3}
        width={Math.max(0, bb.maxX - bb.minX - 6)}
        height={Math.max(0, bb.maxY - bb.minY - 6)}
        fill="none"
        stroke={PALETTE.cityAccent}
        strokeWidth={1.2}
        opacity={0.5}
        rx={2}
      />
      {/* B. decorative buildings (non-semantic) */}
      {buildings.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={PALETTE.cityTower}
            stroke={PALETTE.cityAccent}
            strokeWidth={0.8}
          />
          {b.roof === 'gable' ? (
            <polygon
              points={`${b.x},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w / 2},${b.y - b.h * 0.45}`}
              fill={PALETTE.cityRoof}
              stroke={PALETTE.cityAccent}
              strokeWidth={0.8}
            />
          ) : (
            <rect
              x={b.x - 1}
              y={b.y - 2.5}
              width={b.w + 2}
              height={2.5}
              fill={PALETTE.cityRoof}
            />
          )}
        </g>
      ))}
    </g>
  );
}

function MonasteryLayer() {
  return (
    <g data-feature="monastery">
      {/* courtyard path */}
      <ellipse cx={50} cy={58} rx={16} ry={7} fill={PALETTE.monasteryPath} opacity={0.85} />
      {/* nave */}
      <rect x={40} y={47} width={20} height={12} fill={PALETTE.monasteryWall} stroke={PALETTE.cityAccent} strokeWidth={0.9} />
      {/* nave roof */}
      <polygon points="38,47 62,47 50,39" fill={PALETTE.monasteryRoof} stroke={PALETTE.cityAccent} strokeWidth={0.9} />
      {/* tower */}
      <rect x={46.5} y={33} width={7} height={12} fill={PALETTE.monasteryTower} stroke={PALETTE.cityAccent} strokeWidth={0.9} />
      {/* tower spire */}
      <polygon points="45.5,33 53.5,33 49.5,26" fill={PALETTE.monasteryRoof} stroke={PALETTE.cityAccent} strokeWidth={0.8} />
      {/* door + window */}
      <rect x={48.4} y={52} width={3.2} height={7} fill={PALETTE.cityAccent} rx={1.4} />
      <circle cx={50} cy={44} r={1.4} fill={PALETTE.cityAccent} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function TileRenderer({
  definition,
  rotation = 0,
  size = 100,
  className,
  highlight = false,
  ariaLabel,
}: TileRendererProps) {
  const model = useMemo(
    () => createRotatedTileRenderModel(definition, rotation),
    [definition, rotation],
  );
  const decorations = useMemo(() => buildFieldDecorations(model), [model]);

  const label =
    ariaLabel ??
    `${definition.name ?? definition.id}${
      describeFeatures(model) ? `, ${describeFeatures(model)}` : ', open field'
    }`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
      style={{ display: 'block' }}
    >
      {/* 1. field base */}
      <rect x={0} y={0} width={100} height={100} fill={PALETTE.fieldBase} />
      {/* subtle tonal variation */}
      <rect x={0} y={0} width={100} height={34} fill={PALETTE.fieldToneA} opacity={0.5} />
      <rect x={0} y={70} width={100} height={30} fill={PALETTE.fieldToneB} opacity={0.45} />

      {/* 2. field decoration (non-semantic, deterministic) */}
      <g aria-hidden="true">
        {decorations.map((d, i) => {
          switch (d.kind) {
            case 'tree':
              return (
                <g key={i} transform={`translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})`}>
                  <rect x={-0.9} y={1} width={1.8} height={4} fill={PALETTE.fieldTrunk} />
                  <circle cx={0} cy={-1.5} r={4.2} fill={PALETTE.fieldTree} />
                </g>
              );
            case 'shrub':
              return (
                <circle
                  key={i}
                  cx={d.x.toFixed(1)}
                  cy={d.y.toFixed(1)}
                  r={2.8}
                  fill={PALETTE.fieldShrub}
                />
              );
            case 'stone':
              return (
                <ellipse
                  key={i}
                  cx={d.x.toFixed(1)}
                  cy={d.y.toFixed(1)}
                  rx={2.4}
                  ry={1.6}
                  fill={PALETTE.fieldStone}
                />
              );
            case 'tuft':
              return (
                <path
                  key={i}
                  d={`m${(d.x - 2).toFixed(1)},${(d.y + 1.5).toFixed(1)} q1,-4 2,-1 q1,-4 2,-1`}
                  stroke={PALETTE.fieldShrub}
                  strokeWidth={0.9}
                  fill="none"
                />
              );
            case 'flower':
              return (
                <circle
                  key={i}
                  cx={d.x.toFixed(1)}
                  cy={d.y.toFixed(1)}
                  r={1.1}
                  fill={PALETTE.fieldFlower}
                />
              );
          }
        })}
      </g>

      {/* 3. river (below roads so roads can cross it visually later) */}
      {model.rivers.map((f) => (
        <RiverLayer key={f.id} feature={f} />
      ))}

      {/* 4. roads */}
      {model.roads.map((f) => (
        <RoadLayer key={f.id} feature={f} />
      ))}

      {/* 5+6. city masses + their decoration */}
      {model.cities.map((f, slot) => (
        <CityLayer key={f.id} feature={f} slot={slot} seed={model.decorationSeed} />
      ))}

      {/* 7. monastery */}
      {model.monastery ? <MonasteryLayer /> : null}

      {/* 8. optional presentation highlight */}
      {highlight ? (
        <rect
          x={1.5}
          y={1.5}
          width={97}
          height={97}
          fill="none"
          stroke="#f4c542"
          strokeWidth={3}
          rx={2}
        />
      ) : null}

      {/* 32. subtle tile border (board UI handles separation/shadow later) */}
      <rect
        x={0.5}
        y={0.5}
        width={99}
        height={99}
        fill="none"
        stroke={PALETTE.border}
        strokeWidth={1}
      />
    </svg>
  );
}
