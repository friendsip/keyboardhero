export interface NormalizedKey {
  char: string;
  preventDefault: boolean;
}

export type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'
>;

/**
 * The full filter table from docs/03. Returns null for keystrokes the game
 * must never see; preventDefault is flagged for keys the browser would
 * otherwise hijack (space scroll, Firefox quick-find on ' and /).
 */
export function normalizeKey(e: KeyEventLike): NormalizedKey | null {
  if (e.repeat) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.isComposing || e.key === 'Process') return null;
  if (e.key === 'Dead' || e.key === 'Unidentified') return null;
  if (e.key === 'Enter') return { char: '\n', preventDefault: false };
  if (e.key.length !== 1) return null;
  const preventDefault = e.key === ' ' || e.key === "'" || e.key === '/';
  return { char: e.key, preventDefault };
}
