import { describe, expect, it } from 'vitest';
import { normalizeKey } from '../src/input/normalizeKey';
import type { KeyEventLike } from '../src/input/normalizeKey';

function event(overrides: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: 'a',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  };
}

describe('normalizeKey filter table (docs/03 §1)', () => {
  it('passes plain printable characters through', () => {
    expect(normalizeKey(event({ key: 'a' }))).toEqual({ char: 'a', preventDefault: false });
    expect(normalizeKey(event({ key: 'Z' }))).toEqual({ char: 'Z', preventDefault: false });
    expect(normalizeKey(event({ key: '7' }))).toEqual({ char: '7', preventDefault: false });
  });

  it('drops OS key auto-repeat', () => {
    expect(normalizeKey(event({ key: 'a', repeat: true }))).toBeNull();
  });

  it('drops modifier chords (ctrl/meta/alt) so browser shortcuts work', () => {
    expect(normalizeKey(event({ key: 'w', ctrlKey: true }))).toBeNull();
    expect(normalizeKey(event({ key: 'w', metaKey: true }))).toBeNull();
    expect(normalizeKey(event({ key: 'a', altKey: true }))).toBeNull();
  });

  it('drops IME composition and Process keys', () => {
    expect(normalizeKey(event({ key: 'a', isComposing: true }))).toBeNull();
    expect(normalizeKey(event({ key: 'Process' }))).toBeNull();
  });

  it('drops Dead and Unidentified keys without counting a miss', () => {
    expect(normalizeKey(event({ key: 'Dead' }))).toBeNull();
    expect(normalizeKey(event({ key: 'Unidentified' }))).toBeNull();
  });

  it('drops named keys (Shift, Tab, arrows, F-keys)', () => {
    for (const key of ['Shift', 'Tab', 'ArrowLeft', 'F5', 'Escape', 'Backspace']) {
      expect(normalizeKey(event({ key }))).toBeNull();
    }
  });

  it('passes Enter through as newline (menu confirm; gameplay ignores it)', () => {
    expect(normalizeKey(event({ key: 'Enter' }))).toEqual({ char: '\n', preventDefault: false });
  });

  it('keeps space, apostrophe and slash but flags preventDefault', () => {
    expect(normalizeKey(event({ key: ' ' }))).toEqual({ char: ' ', preventDefault: true });
    expect(normalizeKey(event({ key: "'" }))).toEqual({ char: "'", preventDefault: true });
    expect(normalizeKey(event({ key: '/' }))).toEqual({ char: '/', preventDefault: true });
  });
});
