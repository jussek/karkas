import type { CSSProperties } from 'react';
import type { Rotation, TileDefinition } from '../../game/types/geometry';
import { tileAssetForCard } from './tileAssets';

export interface TileRendererProps {
  definition: TileDefinition;
  rotation?: Rotation;
  size?: number;
  className?: string;
  highlight?: boolean;
  ariaLabel?: string;
}

export function tileImageTransform(rotation: Rotation): string {
  return `rotate(${rotation}deg)`;
}

/** Normal gameplay renderer: the supplied scan is the authoritative artwork. */
export function TileRenderer({
  definition,
  rotation = 0,
  size = 100,
  className,
  highlight = false,
  ariaLabel,
}: TileRendererProps) {
  const asset = tileAssetForCard(definition.id);
  const style: CSSProperties = {
    display: 'block',
    width: size,
    height: size,
    maxWidth: '100%',
    objectFit: 'cover',
    transform: tileImageTransform(rotation),
    borderRadius: 6,
    outline: highlight ? '3px solid #f4c542' : undefined,
  };

  return (
    <img
      src={asset.url}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={style}
      alt={ariaLabel ?? `${definition.name ?? definition.id}, rotated ${rotation} degrees`}
      data-card-id={definition.id}
      data-rotation={rotation}
    />
  );
}
