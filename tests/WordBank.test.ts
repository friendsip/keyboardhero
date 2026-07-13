import { describe, expect, it } from 'vitest';
import { WordBank } from '../src/core/WordBank';
import { mulberry32 } from '../src/core/Rng';

const NONE = new Set<string>();

describe('shuffle bag (per tier)', () => {
  it('deals every word in a tier once before any repeat', () => {
    const pool = ['ant', 'bee', 'cow', 'dog', 'elk', 'fox', 'gnu', 'hen'];
    const bank = new WordBank([pool], mulberry32(1));
    const dealt = Array.from({ length: pool.length }, () => bank.take(1, NONE));
    expect(new Set(dealt).size).toBe(pool.length);
    expect(bank.take(1, NONE)).not.toBeNull(); // refilled
  });

  it('is deterministic for a fixed seed', () => {
    const pools = [['ant', 'bee', 'cow'], ['dogs', 'elks']];
    const a = new WordBank(pools, mulberry32(99));
    const b = new WordBank(pools, mulberry32(99));
    for (let i = 0; i < 20; i++) expect(a.take(1, NONE)).toBe(b.take(1, NONE));
  });

  it('normalizes pools to lowercase', () => {
    const bank = new WordBank([['CAT']], mulberry32(5));
    expect(bank.take(1, NONE)).toBe('cat');
  });
});

describe('tier selection', () => {
  it('deals from the requested tier when it has eligible words', () => {
    const bank = new WordBank([['ab', 'cd'], ['efgh', 'ijkl']], mulberry32(7));
    for (let i = 0; i < 6; i++) {
      const word = bank.take(2, NONE);
      expect(word?.length).toBe(4);
    }
  });

  it('clamps out-of-range tiers to the nearest existing tier', () => {
    const bank = new WordBank([['ab', 'cd']], mulberry32(7));
    expect(bank.take(5, NONE)).not.toBeNull();
    expect(bank.take(0, NONE)).not.toBeNull();
  });

  it('falls back to a neighboring tier when the requested tier is starved', () => {
    const bank = new WordBank([['cat', 'cow'], ['dogs']], mulberry32(7));
    const word = bank.take(1, new Set(['c'])); // tier 1 fully excluded
    expect(word).toBe('dogs');
  });

  it('returns null instead of hanging when every tier is starved', () => {
    const bank = new WordBank([['cat', 'cow'], ['dogs']], mulberry32(7));
    expect(bank.take(1, new Set(['c', 'd']))).toBeNull();
  });
});

describe('first-letter exclusion', () => {
  it('never deals a word whose first letter is excluded', () => {
    const bank = new WordBank([['ant', 'axe', 'bee', 'cow']], mulberry32(5));
    for (let i = 0; i < 10; i++) {
      const word = bank.take(1, new Set(['a']));
      expect(word?.[0]).not.toBe('a');
    }
  });
});
