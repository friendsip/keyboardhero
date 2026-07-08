import { describe, expect, it } from 'vitest';
import { WordBank } from '../src/core/WordBank';
import { mulberry32 } from '../src/core/Rng';

const NONE = new Set<string>();

describe('shuffle bag', () => {
  it('deals every word once before any repeat', () => {
    const pool = ['ant', 'bee', 'cow', 'dog', 'elk', 'fox', 'gnu', 'hen'];
    const bank = new WordBank(pool, mulberry32(1));
    const dealt = Array.from({ length: pool.length }, () => bank.take(NONE));
    expect(new Set(dealt).size).toBe(pool.length);
    expect(bank.take(NONE)).not.toBeNull(); // refilled
  });

  it('is deterministic for a fixed seed', () => {
    const pool = ['ant', 'bee', 'cow', 'dog', 'elk'];
    const a = new WordBank(pool, mulberry32(99));
    const b = new WordBank(pool, mulberry32(99));
    for (let i = 0; i < 20; i++) expect(a.take(NONE)).toBe(b.take(NONE));
  });
});

describe('first-letter exclusion', () => {
  it('never deals a word whose first letter is excluded', () => {
    const bank = new WordBank(['ant', 'axe', 'bee', 'cow'], mulberry32(5));
    for (let i = 0; i < 10; i++) {
      const word = bank.take(new Set(['a']));
      expect(word?.[0]).not.toBe('a');
    }
  });

  it('returns null instead of hanging when every letter is excluded', () => {
    const bank = new WordBank(['cat', 'cow', 'dog'], mulberry32(5));
    expect(bank.take(new Set(['c', 'd']))).toBeNull();
  });

  it('normalizes pools to lowercase', () => {
    const bank = new WordBank(['CAT'], mulberry32(5));
    expect(bank.take(NONE)).toBe('cat');
  });
});
