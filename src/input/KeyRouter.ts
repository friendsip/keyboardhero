import { normalizeKey } from './normalizeKey';

export type KeyHandler = (char: string) => void;

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export class KeyRouter {
  private handler: KeyHandler | null = null;

  private readonly listener = (e: KeyboardEvent): void => {
    const active = document.activeElement;
    if (
      active &&
      (FORM_TAGS.has(active.tagName) || (active as HTMLElement).isContentEditable)
    ) {
      return;
    }
    const key = normalizeKey(e);
    if (key === null) return;
    if (key.preventDefault) e.preventDefault();
    this.handler?.(key.char);
  };

  attach(): void {
    window.addEventListener('keydown', this.listener);
  }

  detach(): void {
    window.removeEventListener('keydown', this.listener);
  }

  setHandler(h: KeyHandler): void {
    this.handler = h;
  }

  clearHandler(h?: KeyHandler): void {
    if (!h || this.handler === h) this.handler = null;
  }
}
