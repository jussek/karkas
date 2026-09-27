/**
 * Stage 3E — Original procedural meeple glyph (SVG, React).
 *
 * Purely presentational: it renders a simple stylized person shape in
 * the tile's logical coordinate space. It carries no game semantics and
 * is hidden from screen readers by default (aria-hidden), since meeples
 * are announced through the tile's aria-label at the board layer later.
 */

export interface MeepleIconProps {
  /** Center x in tile viewBox units (0..100). */
  x?: number;
  /** Center y in tile viewBox units (0..100). */
  y?: number;
  /** Overall height in viewBox units. */
  size?: number;
  /** Fill color override (e.g. player color). */
  fill?: string;
  className?: string;
}

/**
 * Meeple silhouette path centered on (0,0) within a unit box of about
 * 20x24 logical units; scaled/translated via transform.
 */
const MEEPLE_PATH =
  'M 0,-12 C 3.2,-12 5.4,-9.8 5.4,-7 C 5.4,-5.4 4.8,-4.1 3.8,-3.2' +
  ' C 7.6,-2.2 10,0.6 10,4.4 L 10,12 L 5.6,12 L 5.6,6.4 L -5.6,6.4' +
  ' L -5.6,12 L -10,12 L -10,4.4 C -10,0.6 -7.6,-2.2 -3.8,-3.2' +
  ' C -4.8,-4.1 -5.4,-5.4 -5.4,-7 C -5.4,-9.8 -3.2,-12 0,-12 Z';

export function MeepleIcon({
  x = 50,
  y = 50,
  size = 24,
  fill = '#b8332b',
  className,
}: MeepleIconProps) {
  const scale = size / 24;
  return (
    <g
      className={className}
      aria-hidden="true"
      transform={`translate(${x} ${y}) scale(${scale})`}
    >
      <path d={MEEPLE_PATH} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
    </g>
  );
}
