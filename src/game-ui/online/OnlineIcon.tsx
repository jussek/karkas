export type OnlineIconName = 'search' | 'plus' | 'refresh' | 'back' | 'close' | 'sound' | 'music' | 'meeple' | 'crown' | 'map';

const paths: Record<OnlineIconName, string> = {
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5',
  plus: 'M12 4v16M4 12h16', refresh: 'M20 7v5h-5M4 17v-5h5M6.5 8a7 7 0 0 1 11.8-1L20 12M4 12l1.7 5a7 7 0 0 0 11.8-1',
  back: 'M19 12H5m6-6-6 6 6 6', close: 'M5 5l14 14M19 5 5 19',
  sound: 'M4 10v4h4l5 4V6l-5 4H4m12-1a5 5 0 0 1 0 6', music: 'M9 18V6l10-2v12M6 18a3 2 0 1 0 6 0 3 2 0 1 0-6 0Zm10-2a3 2 0 1 0 6 0 3 2 0 1 0-6 0Z',
  meeple: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-3 7-5 5 3 2 2-2v6h6v-6l2 2 3-2-5-5H9Z',
  crown: 'm4 17-1-9 5 4 4-7 4 7 5-4-1 9H4Z', map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
};

export function OnlineIcon({ name, className }: { name: OnlineIconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
