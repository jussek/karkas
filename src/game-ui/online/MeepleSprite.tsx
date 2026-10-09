import type { CSSProperties } from 'react';
import './meepleSprite.css';

const COLOR_INDEX: Record<string, number> = {
  blue: 0,
  red: 1,
  green: 2,
  yellow: 3,
  purple: 4,
  black: 5,
};

export function MeepleSprite({ color, ghost = false, size = 28, className = '' }: { color: string; ghost?: boolean; size?: number; className?: string }) {
  const index = COLOR_INDEX[color] ?? 5;
  const style = {
    '--meeple-size': `${size}px`,
    '--meeple-x': `${index * 20}%`,
    '--meeple-y': ghost ? '76%' : '31%',
  } as CSSProperties;
  return <span className={`meeple-sprite-v4${ghost ? ' is-ghost' : ''}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />;
}
