import { describe, expect, it } from 'vitest';
import { TypingEngine, ATTACK_Z, SPAWN_Z, STEP_MS } from '../src/core/TypingEngine';
import type { EngineConfig, RailSegment } from '../src/core/TypingEngine';
import type { EngineEvent } from '../src/core/events';

/** An encounter that never auto-spawns and never clears — a blank arena for debugSpawn. */
const IDLE_ARENA: RailSegment = {
  kind: 'encounter',
  tier: 1,
  mutants: 999,
  spawnIntervalMs: 1_000_000_000,
  maxLive: 9,
  speedMin: 30,
  speedMax: 30,
};

function makeEngine(overrides: Partial<EngineConfig> = {}): TypingEngine {
  return new TypingEngine({
    wordTiers: [['alpha', 'bravo', 'cargo', 'delta', 'echo']],
    integrity: 5,
    segments: [IDLE_ARENA],
    seed: 42,
    ...overrides,
  });
}

function record(engine: TypingEngine, types: EngineEvent['type'][]): EngineEvent[] {
  const log: EngineEvent[] = [];
  for (const type of types) engine.on(type, (e) => log.push(e));
  return log;
}

function typeWord(engine: TypingEngine, word: string): void {
  for (const char of word) engine.handleKey(char);
}

describe('lock-on', () => {
  it('the locking keystroke consumes the first letter', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', 0, 500, 0);
    const log = record(engine, ['lock', 'hit']);
    engine.handleKey('c');
    const enemy = engine.snapshot().enemies[0];
    expect(enemy?.progress).toBe(1);
    expect(enemy?.locked).toBe(true);
    expect(log.map((e) => e.type)).toEqual(['lock', 'hit']);
  });

  it('locks the enemy whose word starts with the typed letter', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', -0.5, 500, 0);
    const dogId = engine.debugSpawn('dog', 0.5, 500, 0);
    engine.handleKey('d');
    const locked = engine.snapshot().enemies.find((e) => e.locked);
    expect(locked?.id).toBe(dogId);
  });

  it('matching is case-insensitive by default', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', 0, 500, 0);
    engine.handleKey('C');
    expect(engine.snapshot().enemies[0]?.progress).toBe(1);
    expect(engine.accuracy()).toBe(1);
  });
});

describe('misses', () => {
  it('a miss while locked keeps the lock and records the confusion pair', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', -0.5, 500, 0);
    engine.debugSpawn('dog', 0.5, 500, 0);
    const log = record(engine, ['miss']);
    engine.handleKey('c');
    engine.handleKey('x'); // expected 'a'
    const cat = engine.snapshot().enemies.find((e) => e.word === 'cat');
    expect(cat?.locked).toBe(true);
    expect(cat?.progress).toBe(1);
    expect(log).toEqual([{ type: 'miss', expected: 'a', got: 'x' }]);
    expect(engine.stats.finalize().keyErrors).toEqual({ 'a→x': 1 });
    expect(engine.accuracy()).toBe(0.5);
  });

  it('a keystroke matching no enemy is a wild miss (expected null, not in heatmap)', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', 0, 500, 0);
    const log = record(engine, ['miss']);
    engine.handleKey('z');
    expect(log).toEqual([{ type: 'miss', expected: null, got: 'z' }]);
    const stats = engine.stats.finalize();
    expect(stats.wildMisses).toBe(1);
    expect(stats.keyErrors).toEqual({});
  });
});

describe('word completion and combo', () => {
  it('completing a word flawlessly kills the mutant and increments combo', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', 0, 500, 0);
    const log = record(engine, ['wordComplete']);
    typeWord(engine, 'cat');
    expect(engine.snapshot().enemies).toHaveLength(0);
    expect(log).toHaveLength(1);
    const complete = log[0] as Extract<EngineEvent, { type: 'wordComplete' }>;
    expect(complete.flawless).toBe(true);
    expect(complete.score).toBeGreaterThan(0);
    expect(engine.snapshot().combo).toBe(1);
    expect(engine.snapshot().kills).toBe(1);
  });

  it('a mid-word miss makes the completion non-flawless and resets combo', () => {
    const engine = makeEngine();
    engine.debugSpawn('cat', 0, 500, 0);
    typeWord(engine, 'cat');
    expect(engine.snapshot().combo).toBe(1);

    engine.debugSpawn('dog', 0, 500, 0);
    const log = record(engine, ['wordComplete', 'comboBreak']);
    engine.handleKey('d');
    engine.handleKey('x'); // miss → comboBreak (was 1)
    engine.handleKey('o');
    engine.handleKey('g');
    expect(log[0]).toEqual({ type: 'comboBreak', was: 1 });
    const complete = log[1] as Extract<EngineEvent, { type: 'wordComplete' }>;
    expect(complete.flawless).toBe(false);
    expect(engine.snapshot().combo).toBe(0);
  });

  it('combo multiplier tiers apply', () => {
    const engine = makeEngine();
    for (let i = 0; i < 3; i++) {
      engine.debugSpawn('hub', 0, 500, 0);
      typeWord(engine, 'hub');
    }
    expect(engine.snapshot().combo).toBe(3);
    expect(engine.snapshot().comboMult).toBe(2);
  });
});

describe('build damage and lose', () => {
  it('a mutant reaching the camera damages the build and releases a lock silently', () => {
    const engine = makeEngine();
    engine.debugSpawn('run', 0, ATTACK_Z + 2, 60);
    engine.handleKey('r'); // lock it
    const log = record(engine, ['coreDamage', 'wordComplete']);
    engine.tick(3000); // clamped to 250ms consumed per call — tick repeatedly
    engine.tick(3000);
    expect(log.map((e) => e.type)).toEqual(['coreDamage']);
    expect(engine.snapshot().integrity).toBe(4);
    expect(engine.snapshot().enemies).toHaveLength(0);
    // lock was released: a fresh 'r' mutant is lockable immediately
    engine.debugSpawn('rip', 0, 500, 0);
    engine.handleKey('r');
    expect(engine.snapshot().enemies[0]?.locked).toBe(true);
  });

  it('the killing keystroke wins a same-step race with the attack', () => {
    const engine = makeEngine();
    engine.debugSpawn('a', 0, ATTACK_Z + 0.5, 60);
    const log = record(engine, ['coreDamage', 'wordComplete']);
    engine.handleKey('a'); // input applies on arrival, before the next movement step
    engine.tick(100);
    expect(log.map((e) => e.type)).toEqual(['wordComplete']);
    expect(engine.snapshot().integrity).toBe(5);
  });

  it('integrity 0 loses the level and further keys are ignored', () => {
    const engine = makeEngine({ integrity: 1 });
    engine.debugSpawn('cat', 0, ATTACK_Z + 2, 120);
    const log = record(engine, ['levelLost']);
    engine.tick(3000);
    expect(log.map((e) => e.type)).toEqual(['levelLost']);
    expect(engine.snapshot().phase).toBe('lost');
    engine.handleKey('c');
    expect(engine.stats.finalize().correct + engine.stats.finalize().missed).toBe(0);
  });
});

describe('rail segments', () => {
  it('keystrokes during travel are ignored, not punished', () => {
    const engine = makeEngine({
      segments: [{ kind: 'travel', durationMs: 10_000, label: 'lib/utils/' }],
    });
    expect(engine.snapshot().phase).toBe('travel');
    engine.handleKey('z');
    const stats = engine.stats.finalize();
    expect(stats.correct + stats.missed).toBe(0);
  });

  it('an empty rail is won immediately', () => {
    const engine = makeEngine({ segments: [] });
    expect(engine.snapshot().phase).toBe('won');
  });

  it('progresses travel → encounter → travel → won', () => {
    const engine = makeEngine({
      segments: [
        { kind: 'travel', durationMs: 100, label: 'lib/utils/' },
        { kind: 'encounter', tier: 1, mutants: 1, spawnIntervalMs: 50, maxLive: 3, speedMin: 0, speedMax: 0 },
        { kind: 'travel', durationMs: 100, label: 'release gate' },
      ],
    });
    const log = record(engine, ['segmentStart', 'levelWon']);

    engine.tick(200); // finish travel 0
    expect(engine.snapshot().phase).toBe('encounter');

    engine.tick(100); // spawn arrives after the interval
    const mutant = engine.snapshot().enemies[0];
    expect(mutant).toBeDefined();
    expect(mutant?.z).toBe(SPAWN_Z);
    typeWord(engine, mutant?.word ?? '');
    engine.tick(STEP_MS); // clear-check advances to the final travel
    expect(engine.snapshot().phase).toBe('travel');
    expect(engine.snapshot().travelLabel).toBe('release gate');

    engine.tick(200);
    expect(engine.snapshot().phase).toBe('won');
    expect(log.map((e) => e.type)).toEqual(['segmentStart', 'segmentStart', 'levelWon']);
  });

  it('encounters draw words from their declared tier', () => {
    const engine = makeEngine({
      wordTiers: [['ab', 'cd', 'ef'], ['wxyz', 'stuv', 'qrst']],
      segments: [
        { kind: 'encounter', tier: 2, mutants: 3, spawnIntervalMs: 50, maxLive: 3, speedMin: 0, speedMax: 0 },
      ],
    });
    engine.tick(400);
    const words = engine.snapshot().enemies.map((e) => e.word);
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) expect(word.length).toBe(4);
  });

  it('WPM counts combat time only — travel does not dilute it', () => {
    const engine = makeEngine({
      segments: [
        { kind: 'travel', durationMs: 60_000, label: 'long haul' },
        IDLE_ARENA,
      ],
    });
    engine.tick(30_000 * 4); // (clamped) chew through some travel
    expect(engine.stats.finalize().durationMs).toBe(0);
  });
});

describe('boss fights', () => {
  const BOSS: RailSegment = { kind: 'boss', name: 'SEGFAULT', sentence: 'fix me now', timeLimitMs: 5000 };

  it('typing the sentence (spaces included) kills the boss and wins the rail', () => {
    const engine = makeEngine({ segments: [BOSS] });
    const boss = engine.snapshot().enemies[0];
    expect(boss?.type).toBe('boss');
    expect(engine.snapshot().boss?.name).toBe('SEGFAULT');
    typeWord(engine, 'fix me now');
    expect(engine.snapshot().kills).toBe(1);
    engine.tick(STEP_MS * 2);
    expect(engine.snapshot().phase).toBe('won');
  });

  it('damage shows on the health bar as sentence progress', () => {
    const engine = makeEngine({ segments: [BOSS] });
    typeWord(engine, 'fix m'); // 5 of 10 chars
    expect(engine.snapshot().boss?.hpFrac).toBeCloseTo(0.5);
  });

  it('weaves around mid-corridor instead of approaching the camera', () => {
    const engine = makeEngine({ segments: [BOSS] });
    const before = engine.snapshot().enemies[0];
    engine.tick(2000);
    const after = engine.snapshot().enemies[0];
    expect(after?.lateral).not.toBe(before?.lateral);
    expect((after?.z ?? 0) > 200).toBe(true);
  });

  it('timer expiry damages the build, resets the sentence, and restarts the timer', () => {
    const engine = makeEngine({ segments: [{ ...BOSS, timeLimitMs: 300 }] });
    engine.handleKey('f'); // lock + one letter of progress
    const log = record(engine, ['bossTimeout']);
    engine.tick(250); // delta is clamped to 250ms per call
    engine.tick(250);
    expect(log).toHaveLength(1);
    const snap = engine.snapshot();
    expect(snap.integrity).toBe(3); // 5 - 2
    expect(snap.enemies[0]?.progress).toBe(0);
    expect(snap.enemies[0]?.locked).toBe(false);
    expect(snap.boss?.timeLeftMs).toBeGreaterThan(0);
  });

  it('repeated timeouts break the build', () => {
    const engine = makeEngine({ segments: [{ ...BOSS, timeLimitMs: 200 }], integrity: 3 });
    const log = record(engine, ['levelLost']);
    engine.tick(250);
    engine.tick(250);
    expect(log.map((e) => e.type)).toEqual(['levelLost']);
    expect(engine.snapshot().phase).toBe('lost');
  });
});

describe('unique-first-letter invariant and lanes', () => {
  it('holds across scripted spawning under autoplay pressure', () => {
    for (const seed of [1, 7, 1234]) {
      const engine = makeEngine({
        wordTiers: [['alpha', 'apple', 'arrow', 'atlas', 'beta', 'cargo', 'delta']],
        segments: [
          { kind: 'encounter', tier: 1, mutants: 30, spawnIntervalMs: 200, maxLive: 6, speedMin: 30, speedMax: 30 },
        ],
        seed,
      });
      let steps = 0;
      while (engine.snapshot().phase === 'encounter' && steps < 4000) {
        engine.tick(50);
        steps++;
        const snap = engine.snapshot();
        const unlockedFirsts = snap.enemies.filter((e) => !e.locked).map((e) => e.word[0]);
        expect(new Set(unlockedFirsts).size).toBe(unlockedFirsts.length);
        // lanes keep words horizontally separated
        const lats = snap.enemies.map((e) => e.lateral).sort((a, b) => a - b);
        for (let i = 1; i < lats.length; i++) {
          expect((lats[i] ?? 0) - (lats[i - 1] ?? 0)).toBeGreaterThanOrEqual(0.15);
        }
        const target = snap.enemies.find((e) => e.locked) ?? snap.enemies[0];
        if (target) engine.handleKey(target.word[target.progress] ?? '');
      }
      expect(engine.snapshot().phase).toBe('won');
    }
  });
});
