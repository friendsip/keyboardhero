import { describe, expect, it } from 'vitest';
import { aggregateWpm, aggregateAccuracy } from '../src/core/runStats';

describe('aggregate run stats', () => {
  it('averages WPM across the whole run (25 correct chars in 6s = 50 WPM)', () => {
    expect(aggregateWpm({ correct: 25, missed: 0, activeMs: 6000 })).toBeCloseTo(50);
  });

  it('combines two levels into one WPM figure', () => {
    // level 1: 25 chars / 6s, level 2: 50 chars / 6s → 75 chars / 12s
    expect(aggregateWpm({ correct: 75, missed: 0, activeMs: 12_000 })).toBeCloseTo(75);
  });

  it('returns null during warm-up', () => {
    expect(aggregateWpm({ correct: 5, missed: 0, activeMs: 1999 })).toBeNull();
  });

  it('accuracy is correct over total scoring keystrokes', () => {
    expect(aggregateAccuracy({ correct: 90, missed: 10, activeMs: 5000 })).toBeCloseTo(0.9);
  });

  it('accuracy is 1 when nothing has been typed', () => {
    expect(aggregateAccuracy({ correct: 0, missed: 0, activeMs: 0 })).toBe(1);
  });
});
