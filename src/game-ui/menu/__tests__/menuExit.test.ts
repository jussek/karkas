import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exitMainMenu } from '../menuExit';

describe('main menu exit control', () => {
  it('click handler invokes the supplied application exit callback', () => {
    const onExit = vi.fn();
    exitMainMenu(onExit, { history: { length: 2, back: vi.fn() } });
    expect(onExit).toHaveBeenCalledOnce();
    expect(readFileSync(join(process.cwd(), 'src/game-ui/menu/MainMenu.tsx'), 'utf8')).toContain('onClick={() => exitMainMenu(onExit');
  });

  it('falls back to browser history and never throws without a host close API', () => {
    const back = vi.fn();
    exitMainMenu(undefined, { history: { length: 2, back } });
    expect(back).toHaveBeenCalledOnce();
    expect(() => exitMainMenu()).not.toThrow();
    expect(() => exitMainMenu(() => { throw new Error('host failed'); })).not.toThrow();
  });
});
