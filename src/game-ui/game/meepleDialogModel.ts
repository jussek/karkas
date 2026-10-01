import type { MeeplePlacement } from '../../game/types/geometry';

const FEATURE_LABEL = {
  road: 'Дорога',
  city: 'Город',
  monastery: 'Монастырь',
} as const;

export function meepleDialogTitle(targets: readonly MeeplePlacement[]): string {
  if (targets.length !== 1) return 'Куда поставить человечка?';
  if (targets[0].featureType === 'road') return 'Поставить человечка на дорогу?';
  if (targets[0].featureType === 'city') return 'Поставить человечка в город?';
  return 'Поставить человечка на монастырь?';
}

export function meepleTargetLabel(targets: readonly MeeplePlacement[], target: MeeplePlacement): string {
  const sameType = targets.filter((item) => item.featureType === target.featureType);
  const suffix = sameType.length > 1 ? ` ${sameType.indexOf(target) + 1}` : '';
  const label = FEATURE_LABEL[target.featureType];
  if (!label) throw new Error(`Unsupported meeple feature: ${String(target.featureType)}`);
  return `${label}${suffix}`;
}
