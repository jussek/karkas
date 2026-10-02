export interface BrowserExitTarget {
  history?: Pick<History, 'length' | 'back'>;
  close?: () => void;
  opener?: unknown;
}

/** Uses an application callback first, then browser history, then a safe host-window close. */
export function exitMainMenu(onExit?: () => void, browser?: BrowserExitTarget): void {
  try {
    if (onExit) { onExit(); return; }
    if (browser?.history && browser.history.length > 1) { browser.history.back(); return; }
    if (browser?.opener && browser.close) browser.close();
  } catch (error) {
    console.warn('Не удалось закрыть приложение безопасным способом', error);
  }
}
