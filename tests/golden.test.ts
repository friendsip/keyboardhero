import { describe, expect, it } from 'vitest';
import { TypingEngine } from '../src/core/TypingEngine';
import type { EngineEvent } from '../src/core/events';
import words from '../src/data/words/words.json';

/**
 * Golden determinism run (docs/10): fixed seed + deterministic autoplay must
 * always produce byte-identical results. Any unintended engine behavior
 * change trips the snapshot; update it only in a commit that explains why.
 */
describe('golden run', () => {
  it('a seeded autoplay run over a full rail is fully deterministic', () => {
    const engine = new TypingEngine({
      words,
      integrity: 5,
      segments: [
        { kind: 'travel', durationMs: 1000, label: 'lib/utils/' },
        { kind: 'encounter', mutants: 6, spawnIntervalMs: 400, maxLive: 5, speedMin: 40, speedMax: 70 },
        { kind: 'travel', durationMs: 800, label: 'core/engine/' },
        { kind: 'encounter', mutants: 8, spawnIntervalMs: 350, maxLive: 6, speedMin: 50, speedMax: 90 },
        { kind: 'travel', durationMs: 600, label: 'release gate' },
      ],
      seed: 1234,
    });

    const eventLog: string[] = [];
    const types: EngineEvent['type'][] = [
      'spawn', 'segmentStart', 'lock', 'hit', 'miss', 'wordComplete',
      'comboBreak', 'coreDamage', 'levelWon', 'levelLost',
    ];
    for (const type of types) engine.on(type, (e) => eventLog.push(JSON.stringify(e)));

    let keystrokes = 0;
    for (let i = 0; i < 4000; i++) {
      const phase = engine.snapshot().phase;
      if (phase === 'won' || phase === 'lost') break;
      engine.tick(50);
      const snap = engine.snapshot();
      const target =
        snap.enemies.find((e) => e.locked) ??
        [...snap.enemies].sort((a, b) => a.z - b.z)[0];
      if (!target) continue;
      keystrokes++;
      if (keystrokes % 15 === 0) {
        engine.handleKey('7'); // deliberate periodic miss
      } else {
        engine.handleKey(target.word[target.progress] ?? '');
      }
    }

    expect(engine.snapshot().phase).toBe('won');
    const run = engine.stats.finalize();
    expect({
      score: engine.snapshot().score,
      kills: engine.snapshot().kills,
      maxCombo: engine.snapshot().maxCombo,
      wpm: run.wpm,
      accuracy: run.accuracy,
      correct: run.correct,
      missed: run.missed,
      durationMs: run.durationMs,
      eventCount: eventLog.length,
      eventLogHash: hash(eventLog.join('\n')),
    }).toMatchSnapshot();
  });
});

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
