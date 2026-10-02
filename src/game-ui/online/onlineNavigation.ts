export type OnlineNavigationAction = 'find' | 'back' | 'create' | 'joined';
export type OnlineNavigationScreen = 'menu' | 'online-browser' | 'online-create' | 'online-lobby';
export function onlineNavigationTarget(action: OnlineNavigationAction): OnlineNavigationScreen {
  if (action === 'find') return 'online-browser';
  if (action === 'create') return 'online-create';
  if (action === 'joined') return 'online-lobby';
  return 'menu';
}
