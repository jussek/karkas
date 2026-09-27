/**
 * Stage 3E — TileGalleryPage (/tiles)
 *
 * Human semantic-audit tool: renders every catalog tile through the
 * rule-driven SVG TileRenderer so we can verify that game topology and
 * rendered topology agree before building the board. No JPG thumbnails.
 */

import { useMemo, useState } from 'react';
import type { Rotation } from '../../game/types/geometry';
import { TileRenderer } from '../tiles/TileRenderer';
import {
  badgesFor,
  buildGalleryEntries,
  filterGalleryEntries,
} from './galleryModel';
import type { GalleryFilter } from './galleryModel';
import './tileGallery.css';

const FILTERS: { key: GalleryFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'road', label: 'Дороги' },
  { key: 'city', label: 'Города' },
  { key: 'river', label: 'Река' },
  { key: 'monastery', label: 'Монастыри' },
];

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

const BADGE_LABELS: Record<GalleryFilter, string> = {
  all: '',
  road: 'ROAD',
  city: 'CITY',
  river: 'RIVER',
  monastery: 'MONASTERY',
};

export function TileGalleryPage() {
  const entries = useMemo(() => buildGalleryEntries(), []);
  // ONE global rotation state for the whole gallery (not per tile).
  const [rotation, setRotation] = useState<Rotation>(0);
  const [filter, setFilter] = useState<GalleryFilter>('all');

  const visible = useMemo(
    () => filterGalleryEntries(entries, filter),
    [entries, filter],
  );

  return (
    <main className="tile-gallery">
      <header className="tile-gallery__header">
        <h1 className="tile-gallery__title">Каркас плитки — визуальный аудит</h1>
        <p className="tile-gallery__subtitle">
          Геометрия строится из структурированных данных топологии (TileDefinition),
          не из изображений. {visible.length} / {entries.length} плиток
        </p>
      </header>

      <div className="tile-gallery__controls" role="toolbar" aria-label="Фильтры галереи">
        <div className="tile-gallery__filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tile-gallery__chip${filter === f.key ? ' is-active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="tile-gallery__rotation">
          Поворот:
          <select
            value={rotation}
            onChange={(ev) => setRotation(Number(ev.target.value) as Rotation)}
          >
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {r}°
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="tile-gallery__grid">
        {visible.map((entry) => (
          <li key={entry.id} className="tile-gallery__card">
            <TileRenderer
              definition={entry.definition}
              rotation={rotation}
              size={140}
            />
            <span className="tile-gallery__id">{entry.id}</span>
            <span className="tile-gallery__badges" aria-hidden="true">
              {badgesFor(entry).map((b) => (
                <em key={b} className={`tile-gallery__badge tile-gallery__badge--${b}`}>
                  {BADGE_LABELS[b]}
                </em>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
