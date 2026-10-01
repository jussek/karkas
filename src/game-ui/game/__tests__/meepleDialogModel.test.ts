import { describe, expect, it } from 'vitest';
import type { MeeplePlacement } from '../../../game/types/geometry';
import { meepleDialogTitle, meepleTargetLabel } from '../meepleDialogModel';

const road: MeeplePlacement = { featureType: 'road', edge: 0 };
const secondRoad: MeeplePlacement = { featureType: 'road', edge: 2 };
const city: MeeplePlacement = { featureType: 'city', edge: 1 };
const monastery: MeeplePlacement = { featureType: 'monastery', edge: null };

describe('meeple dialog presentation for authoritative targets', () => {
  it.each([
    [[road], 'Поставить человечка на дорогу?'],
    [[city], 'Поставить человечка в город?'],
    [[monastery], 'Поставить человечка на монастырь?'],
  ] as const)('formats a single feature confirmation', (targets, expected) => {
    expect(meepleDialogTitle(targets)).toBe(expected);
  });

  it('keeps road and city as distinct choices', () => {
    const targets = [road, city];
    expect(meepleDialogTitle(targets)).toBe('Куда поставить человечка?');
    expect(targets.map((target) => meepleTargetLabel(targets, target))).toEqual(['Дорога', 'Город']);
  });

  it('numbers independent features of the same type', () => {
    const targets = [road, secondRoad];
    expect(targets.map((target) => meepleTargetLabel(targets, target))).toEqual(['Дорога 1', 'Дорога 2']);
  });

  it('has no field presentation path', () => {
    expect(() => meepleTargetLabel([road], { featureType: 'field', edge: 0 } as never)).toThrow();
  });
});
