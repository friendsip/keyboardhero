import { describe, expect, it } from 'vitest';
import { InvadersEngine, FIELD_W } from '../src/invaders/engine/InvadersEngine';
import type { InvadersConfig } from '../src/invaders/engine/InvadersEngine';
import type { InvadersEvent } from '../src/invaders/engine/events';

function makeEngine(overrides: Partial<InvadersConfig> = {}): InvadersEngine {
  return new InvadersEngine({
    cols: 4,
    rows: 2,
    formationSpeed: 40,
    descend: 24,
    fireIntervalMs: 300,
    bombIntervalMs: 1_000_000_000, // no bombs unless a test asks
    bombSpeed: 250,
    integrity: 3,
    seed: 7,
    ...overrides,
  });
}

function record(engine: InvadersEngine, types: InvadersEvent['type'][]): InvadersEvent[] {
  const log: InvadersEvent[] = [];
  for (const type of types) engine.on(type, (e) => log.push(e));
  return log;
}

describe('setup', () => {
  it('lays out cols x rows mutants, centred', () => {
    const engine = makeEngine({ cols: 4, rows: 2 });
    const snap = engine.snapshot();
    expect(snap.mutants).toHaveLength(8);
    expect(snap.totalMutants).toBe(8);
    const xs = snap.mutants.map((m) => m.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(mid).toBeCloseTo(FIELD_W / 2, 0);
  });
});

describe('player movement', () => {
  it('clamps to the play area', () => {
    const engine = makeEngine();
    engine.setPlayerX(-999);
    expect(engine.snapshot().playerX).toBeGreaterThan(0);
    engine.setPlayerX(99999);
    expect(engine.snapshot().playerX).toBeLessThan(FIELD_W);
  });
});

describe('formation movement', () => {
  it('reverses direction and descends at the edge', () => {
    const engine = makeEngine({ formationSpeed: 300 });
    const log = record(engine, ['descend']);
    const y0 = engine.snapshot().mutants[0]?.y ?? 0;
    // drive into the right edge
    for (let i = 0; i < 120; i++) engine.tick(16);
    expect(log.length).toBeGreaterThan(0);
    expect(engine.snapshot().mutants[0]?.y).toBeGreaterThan(y0);
  });
});

describe('shooting', () => {
  it('auto-fires bullets on the fire interval', () => {
    const engine = makeEngine({ fireIntervalMs: 100 });
    const log = record(engine, ['shoot']);
    engine.tick(120);
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(engine.snapshot().bullets.length).toBeGreaterThanOrEqual(1);
  });

  it('a bullet kills the mutant above the ship and scores', () => {
    const engine = makeEngine({ cols: 1, rows: 1, fireIntervalMs: 50, formationSpeed: 0 });
    const target = engine.snapshot().mutants[0];
    engine.setPlayerX(target?.x ?? FIELD_W / 2);
    const log = record(engine, ['mutantKilled']);
    for (let i = 0; i < 200 && engine.snapshot().mutants.length > 0; i++) engine.tick(16);
    expect(log).toHaveLength(1);
    expect(engine.snapshot().kills).toBe(1);
    expect(engine.snapshot().score).toBeGreaterThan(0);
  });
});

describe('win and lose', () => {
  it('clearing every mutant wins the level', () => {
    const engine = makeEngine({ cols: 1, rows: 1, fireIntervalMs: 50, formationSpeed: 0 });
    engine.setPlayerX(engine.snapshot().mutants[0]?.x ?? FIELD_W / 2);
    const log = record(engine, ['levelWon']);
    for (let i = 0; i < 300 && engine.snapshot().phase === 'running'; i++) engine.tick(16);
    expect(log.map((e) => e.type)).toEqual(['levelWon']);
    expect(engine.snapshot().phase).toBe('won');
  });

  it('mutants reaching the build line lose the level', () => {
    const engine = makeEngine({ cols: 1, rows: 1, formationSpeed: 260, descend: 60, fireIntervalMs: 1_000_000 });
    const log = record(engine, ['levelLost']);
    for (let i = 0; i < 2000 && engine.snapshot().phase === 'running'; i++) engine.tick(16);
    expect(log.map((e) => e.type)).toEqual(['levelLost']);
    expect(engine.snapshot().phase).toBe('lost');
  });

  it('bomb hits on the ship cost integrity, and enough of them lose the level', () => {
    const engine = makeEngine({
      cols: 1,
      rows: 1,
      formationSpeed: 0,
      fireIntervalMs: 1_000_000, // never shoot back
      bombIntervalMs: 60,
      bombSpeed: 900,
      integrity: 2,
    });
    // park the ship under the mutant so bombs land on it
    engine.setPlayerX(engine.snapshot().mutants[0]?.x ?? FIELD_W / 2);
    const log = record(engine, ['playerHit', 'levelLost']);
    for (let i = 0; i < 2000 && engine.snapshot().phase === 'running'; i++) engine.tick(16);
    expect(log.filter((e) => e.type === 'playerHit').length).toBeGreaterThanOrEqual(2);
    expect(engine.snapshot().phase).toBe('lost');
  });
});

describe('determinism', () => {
  it('same seed produces the same bomb sequence', () => {
    const run = (): number[] => {
      const engine = makeEngine({ cols: 3, rows: 2, bombIntervalMs: 120, fireIntervalMs: 1_000_000 });
      const xs: number[] = [];
      engine.on('bombDrop', (e) => xs.push(Math.round(e.x)));
      for (let i = 0; i < 200; i++) engine.tick(16);
      return xs;
    };
    expect(run()).toEqual(run());
  });
});
