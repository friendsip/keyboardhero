import { describe, expect, it } from 'vitest';
import { StatsTracker } from '../src/core/StatsTracker';

describe('total WPM', () => {
  it('matches the hand-computed fixture: 25 correct chars in 6s = 50 WPM', () => {
    const stats = new StatsTracker();
    for (let i = 0; i < 25; i++) stats.keystroke(true, 'a', 'a');
    stats.addActiveTime(6000);
    expect(stats.finalize().wpm).toBeCloseTo(50);
  });

  it('divides by active time only — pause time is excluded by construction', () => {
    const stats = new StatsTracker();
    for (let i = 0; i < 25; i++) stats.keystroke(true, 'a', 'a');
    stats.addActiveTime(6000);
    // a 5-minute wall-clock pause adds no active time, so WPM is unchanged
    expect(stats.finalize().wpm).toBeCloseTo(50);
  });

  it('zero keystrokes finalizes without NaN: accuracy 1, wpm 0', () => {
    const stats = new StatsTracker();
    const run = stats.finalize();
    expect(run.accuracy).toBe(1);
    expect(run.wpm).toBe(0);
  });
});

describe('rolling WPM', () => {
  it('returns null during warm-up (< 2s)', () => {
    const stats = new StatsTracker();
    stats.keystroke(true, 'a', 'a');
    stats.addActiveTime(1999);
    expect(stats.rollingWpm()).toBeNull();
  });

  it('divides by elapsed time before the window fills', () => {
    const stats = new StatsTracker();
    for (let i = 0; i < 20; i++) stats.keystroke(true, 'a', 'a');
    stats.addActiveTime(4000); // 20 chars in 4s → 4 words / (1/15 h)... = 60 WPM
    expect(stats.rollingWpm()).toBeCloseTo(60);
  });

  it('expires keystrokes older than the 10s window', () => {
    const stats = new StatsTracker();
    for (let i = 0; i < 20; i++) stats.keystroke(true, 'a', 'a'); // all at t=0
    stats.addActiveTime(10_001);
    expect(stats.rollingWpm()).toBeCloseTo(0);
  });

  it('is frozen while paused: repeated reads with no active time are identical', () => {
    const stats = new StatsTracker();
    for (let i = 0; i < 10; i++) stats.keystroke(true, 'a', 'a');
    stats.addActiveTime(5000);
    const first = stats.rollingWpm();
    const second = stats.rollingWpm();
    expect(first).toEqual(second);
  });
});

describe('accuracy and heatmap', () => {
  it('accuracy counts both locked and wild misses', () => {
    const stats = new StatsTracker();
    stats.keystroke(true, 'a', 'a');
    stats.keystroke(false, 'e', 'r'); // locked miss
    stats.keystroke(false, null, 'q'); // wild miss
    expect(stats.accuracy()).toBeCloseTo(1 / 3);
  });

  it('only locked misses feed the confusion heatmap', () => {
    const stats = new StatsTracker();
    stats.keystroke(false, 'e', 'r');
    stats.keystroke(false, 'e', 'r');
    stats.keystroke(false, null, 'q');
    const run = stats.finalize();
    expect(run.keyErrors).toEqual({ 'e→r': 2 });
    expect(run.wildMisses).toBe(1);
  });
});
