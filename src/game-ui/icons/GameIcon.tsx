export type GameIconName =
  | 'search' | 'plus' | 'minus' | 'refresh' | 'back' | 'close' | 'menu'
  | 'sound' | 'music' | 'meeple' | 'crown' | 'map' | 'clock'
  | 'check' | 'send' | 'copy' | 'bot' | 'users' | 'public' | 'private'
  | 'chat' | 'fit' | 'rotate' | 'trophy' | 'home' | 'pause' | 'play'
  | 'rules' | 'retry' | 'target';

const paths: Record<GameIconName, string[]> = {
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'm15.5 15 5 5'],
  plus: ['M12 4v16', 'M4 12h16'],
  minus: ['M5 12h14'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6.5 8a7 7 0 0 1 11.8-1L20 12', 'M4 12l1.7 5a7 7 0 0 0 11.8-1'],
  back: ['M19 12H5', 'm11 6-6 6 6 6'],
  close: ['M5 5l14 14', 'M19 5 5 19'],
  menu: ['M5 7h14', 'M5 12h14', 'M5 17h14'],
  sound: ['M4 10v4h4l5 4V6l-5 4H4', 'M16 9a5 5 0 0 1 0 6'],
  music: ['M9 18V6l10-2v12', 'M6 18a3 2 0 1 0 6 0 3 2 0 1 0-6 0Z', 'M16 16a3 2 0 1 0 6 0 3 2 0 1 0-6 0Z'],
  meeple: ['M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', 'm9 10-5 5 3 2 2-2v6h6v-6l2 2 3-2-5-5H9Z'],
  crown: ['m4 17-1-9 5 4 4-7 4 7 5-4-1 9H4Z'],
  map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z', 'M9 3v15', 'M15 6v15'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  check: ['m5 12 4 4L19 6'],
  send: ['M4 5.5 21 12 4 18.5l2.5-5.2L16 12l-9.5-1.3L4 5.5Z'],
  copy: ['M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z', 'M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  bot: ['M8 7h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z', 'M12 7V4', 'M9 4h6', 'M8.5 12h.01', 'M15.5 12h.01', 'M9 16h6'],
  users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M2.5 21a6.5 6.5 0 0 1 13 0', 'M17 11a3 3 0 1 0 0-6', 'M18 14a5 5 0 0 1 3.5 7'],
  public: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3.5 12h17', 'M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21', 'M12 3C9.5 5.5 8.2 8.5 8.2 12S9.5 18.5 12 21'],
  private: ['M6 10h12v10H6V10Z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  chat: ['M4 5h16v11H9l-5 4V5Z', 'M8 9h8', 'M8 12h6'],
  fit: ['M4 9V4h5', 'M15 4h5v5', 'M4 15v5h5', 'M20 15v5h-5', 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'],
  rotate: ['M19 7v5h-5', 'M19 12a7 7 0 1 0-2 5'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0V4Z', 'M12 13v4', 'M8 21h8', 'M9 17h6', 'M8 6H4v1a5 5 0 0 0 4 5', 'M16 6h4v1a5 5 0 0 1-4 5'],
  home: ['m3 11 9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  pause: ['M8 5v14', 'M16 5v14'],
  play: ['m8 5 11 7-11 7V5Z'],
  rules: ['M4 5a3 3 0 0 1 3-2h5v16H7a3 3 0 0 0-3 2V5Z', 'M20 5a3 3 0 0 0-3-2h-5v16h5a3 3 0 0 1 3 2V5Z'],
  retry: ['M20 7v5h-5', 'M19.5 12a7.5 7.5 0 1 0-2 5.2'],
  target: ['M12 4v3', 'M12 17v3', 'M4 12h3', 'M17 12h3', 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'],
};

export function GameIcon({ name, className }: { name: GameIconName; className?: string }) {
  return <svg className={className ? `game-icon ${className}` : 'game-icon'} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths[name].map((d, index) => <path d={d} key={index} />)}
  </svg>;
}
