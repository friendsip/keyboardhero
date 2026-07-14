import { Emitter } from './events';
import type { EngineEvent, EnemySnapshot } from './events';
import { mulberry32, floatInRange } from './Rng';
import type { Rng } from './Rng';
import { WordBank } from './WordBank';
import { StatsTracker } from './StatsTracker';
import { TargetLock } from './TargetLock';
import { comboMultiplier, wordScore } from './Scoring';

export const STEP_MS = 1000 / 60;
export const FIELD_WIDTH = 1280;
export const FIELD_HEIGHT = 720;
/** Depth (z-units) at which mutants spawn, far down the corridor. */
export const SPAWN_Z = 1000;
/** Depth at which a mutant reaches the camera and strikes the build. */
export const ATTACK_Z = 40;
/** Lateral lanes; concurrent mutants each take a free lane so words don't stack. */
export const LANES = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9] as const;
const LANE_JITTER = 0.03;
const MAX_TICK_MS = 250;

export type RailSegment =
  | { kind: 'travel'; durationMs: number; label: string }
  | {
      kind: 'encounter';
      /** Word-length difficulty tier (1-based index into wordTiers). */
      tier: number;
      mutants: number;
      spawnIntervalMs: number;
      maxLive: number;
      speedMin: number;
      speedMax: number;
    }
  | {
      /**
       * A single boss mutant carrying a whole sentence. It does not
       * approach — it weaves around mid-corridor while a kill timer runs.
       * Timer expiry costs build integrity and resets the sentence.
       */
      kind: 'boss';
      name: string;
      sentence: string;
      timeLimitMs: number;
    };

const BOSS_TIMEOUT_DAMAGE = 2;
const BOSS_Z_MID = 420;
const BOSS_Z_SWING = 150;
const BOSS_LATERAL_SWING = 0.55;

export interface EngineConfig {
  /** Word pools by difficulty tier: tier1 = 2–3 letters … tier5 = 8+. */
  wordTiers: string[][];
  integrity: number;
  segments: RailSegment[];
  seed: number;
  caseSensitive?: boolean;
  /**
   * Multiplies lane lateral offsets so mutants spawn across a wider arc as
   * levels climb — at high spread they arrive from the sides and the player
   * must yaw (arrow keys) to find them. Default 1 (all in the front view).
   */
  lateralSpread?: number;
}

export type EnginePhase = 'travel' | 'encounter' | 'boss' | 'won' | 'lost';

export interface BossSnapshot {
  name: string;
  timeLeftMs: number;
  timeLimitMs: number;
  /** 1 = untouched, 0 = dead; driven by sentence progress. */
  hpFrac: number;
}

export interface EngineState {
  enemies: EnemySnapshot[];
  integrity: number;
  combo: number;
  comboMult: number;
  maxCombo: number;
  score: number;
  kills: number;
  totalMutants: number;
  mutantsRemaining: number;
  phase: EnginePhase;
  segIndex: number;
  segmentCount: number;
  travelLabel: string | null;
  boss: BossSnapshot | null;
}

interface Enemy {
  id: string;
  kind: 'mutant' | 'boss';
  word: string;
  progress: number;
  lateral: number;
  lane: number;
  z: number;
  speed: number;
  missesWhileLocked: number;
  lockAtMs: number;
}

export class TypingEngine {
  readonly stats = new StatsTracker();

  private readonly emitter = new Emitter<EngineEvent>();
  private readonly rng: Rng;
  private readonly bank: WordBank;
  private readonly lock = new TargetLock();
  private enemies: Enemy[] = [];
  private phase: EnginePhase = 'travel';
  private integrity: number;
  private combo = 0;
  private maxCombo = 0;
  private score = 0;
  private kills = 0;
  private survived = 0;
  private readonly totalMutants: number;
  private acc = 0;
  private activeMs = 0;
  private segIndex = -1;
  private travelRemainingMs = 0;
  private spawnClockMs = 0;
  private spawnedInEncounter = 0;
  private bossTimeLeftMs = 0;
  private bossClockMs = 0;
  private nextId = 1;

  constructor(private readonly config: EngineConfig) {
    this.rng = mulberry32(config.seed);
    this.bank = new WordBank(config.wordTiers, this.rng);
    this.integrity = config.integrity;
    this.totalMutants = config.segments.reduce(
      (sum, seg) => sum + (seg.kind === 'encounter' ? seg.mutants : seg.kind === 'boss' ? 1 : 0),
      0,
    );
    this.advanceSegment();
  }

  on<T extends EngineEvent['type']>(
    type: T,
    fn: (event: Extract<EngineEvent, { type: T }>) => void,
  ): () => void {
    return this.emitter.on(type, fn);
  }

  /** Keys only matter mid-fight; travel typing is ignored, never punished. */
  handleKey(rawChar: string): void {
    if (this.phase !== 'encounter' && this.phase !== 'boss') return;
    const char = this.fold(rawChar);

    const lockedId = this.lock.lockedId;
    if (lockedId !== null) {
      const enemy = this.enemies.find((e) => e.id === lockedId);
      if (!enemy) {
        this.lock.release();
        return;
      }
      const expected = this.fold(enemy.word[enemy.progress] ?? '');
      if (char === expected) {
        this.applyHit(enemy, rawChar);
      } else {
        enemy.missesWhileLocked++;
        this.recordMiss(expected, rawChar);
      }
      return;
    }

    const target = this.enemies.find(
      (e) => e.progress === 0 && this.fold(e.word[0] ?? '') === char,
    );
    if (target) {
      this.lock.lock(target.id);
      target.lockAtMs = this.activeMs;
      this.emitter.emit({ type: 'lock', enemyId: target.id });
      this.applyHit(target, rawChar);
    } else {
      this.recordMiss(null, rawChar);
    }
  }

  tick(deltaMs: number): void {
    if (this.isTerminal()) return;
    this.acc += Math.min(deltaMs, MAX_TICK_MS);
    while (this.acc >= STEP_MS && !this.isTerminal()) {
      this.stepOnce();
      this.acc -= STEP_MS;
    }
  }

  private isTerminal(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  snapshot(): EngineState {
    const seg = this.config.segments[this.segIndex];
    const bossEnemy = this.enemies[0];
    const boss: BossSnapshot | null =
      this.phase === 'boss' && seg?.kind === 'boss'
        ? {
            name: seg.name,
            timeLeftMs: Math.max(this.bossTimeLeftMs, 0),
            timeLimitMs: seg.timeLimitMs,
            hpFrac: bossEnemy ? 1 - bossEnemy.progress / bossEnemy.word.length : 0,
          }
        : null;
    return {
      enemies: this.enemies.map((e) => this.snapshotEnemy(e)),
      integrity: this.integrity,
      combo: this.combo,
      comboMult: comboMultiplier(this.combo),
      maxCombo: this.maxCombo,
      score: this.score,
      kills: this.kills,
      totalMutants: this.totalMutants,
      mutantsRemaining: this.totalMutants - this.kills - this.survived,
      phase: this.phase,
      segIndex: this.segIndex,
      segmentCount: this.config.segments.length,
      travelLabel: seg?.kind === 'travel' ? seg.label : null,
      boss,
    };
  }

  rollingWpm(): number | null {
    return this.stats.rollingWpm();
  }

  accuracy(): number {
    return this.stats.accuracy();
  }

  /** Test hook: place a mutant directly, bypassing the rail script. */
  debugSpawn(word: string, lateral: number, z: number, speed: number): string {
    return this.addEnemy(word, lateral, lateral, z, speed).id;
  }

  private stepOnce(): void {
    if (this.phase === 'travel') {
      this.stepTravel();
      return;
    }
    // combat time only — travel time never dilutes WPM
    this.activeMs += STEP_MS;
    this.stats.addActiveTime(STEP_MS);
    if (this.phase === 'boss') {
      this.stepBoss();
      return;
    }
    this.stepSpawn();
    this.stepEnemies();
    this.checkEncounterCleared();
  }

  private stepBoss(): void {
    const seg = this.config.segments[this.segIndex];
    if (seg?.kind !== 'boss') return;
    const boss = this.enemies[0];
    if (!boss) {
      this.advanceSegment(); // sentence finished — boss is dead
      return;
    }
    this.bossClockMs += STEP_MS;
    this.bossTimeLeftMs -= STEP_MS;
    // The boss weaves around mid-corridor instead of approaching.
    const t = this.bossClockMs / 1000;
    boss.lateral = Math.sin(t * 0.9) * BOSS_LATERAL_SWING;
    boss.z = BOSS_Z_MID + Math.sin(t * 0.5 + 1.3) * BOSS_Z_SWING;
    if (this.bossTimeLeftMs > 0) return;
    // Timer expired: the build takes a hit and the sentence resets.
    this.integrity -= BOSS_TIMEOUT_DAMAGE;
    boss.progress = 0;
    boss.missesWhileLocked = 0;
    this.lock.release();
    this.bossTimeLeftMs = seg.timeLimitMs;
    this.breakCombo();
    this.emitter.emit({ type: 'bossTimeout', enemyId: boss.id, integrityLeft: this.integrity });
    if (this.integrity <= 0) {
      this.phase = 'lost';
      this.emitter.emit({ type: 'levelLost' });
    }
  }

  private stepTravel(): void {
    this.travelRemainingMs -= STEP_MS;
    if (this.travelRemainingMs <= 0) this.advanceSegment();
  }

  private advanceSegment(): void {
    this.segIndex++;
    const seg = this.config.segments[this.segIndex];
    if (!seg) {
      this.phase = 'won';
      this.emitter.emit({ type: 'levelWon' });
      return;
    }
    if (seg.kind === 'travel') {
      this.phase = 'travel';
      this.travelRemainingMs = seg.durationMs;
      this.emitter.emit({ type: 'segmentStart', index: this.segIndex, kind: 'travel', label: seg.label });
    } else if (seg.kind === 'boss') {
      this.phase = 'boss';
      this.bossTimeLeftMs = seg.timeLimitMs;
      this.bossClockMs = 0;
      this.addEnemy(seg.sentence, 0, 0, BOSS_Z_MID, 0, 'boss');
      this.emitter.emit({ type: 'segmentStart', index: this.segIndex, kind: 'boss', label: seg.name });
    } else {
      this.phase = 'encounter';
      this.spawnClockMs = 0;
      this.spawnedInEncounter = 0;
      this.emitter.emit({ type: 'segmentStart', index: this.segIndex, kind: 'encounter' });
    }
  }

  private currentEncounter(): Extract<RailSegment, { kind: 'encounter' }> | null {
    const seg = this.config.segments[this.segIndex];
    return seg?.kind === 'encounter' ? seg : null;
  }

  private stepSpawn(): void {
    const seg = this.currentEncounter();
    if (!seg || this.spawnedInEncounter >= seg.mutants) return;
    this.spawnClockMs += STEP_MS;
    if (this.spawnClockMs < seg.spawnIntervalMs) return;
    if (this.enemies.length >= seg.maxLive) return;
    const word = this.bank.take(seg.tier, this.reservedFirstLetters());
    if (word === null) return; // starved this step; retry next step
    this.spawnClockMs = 0;
    const lane = this.pickLane();
    const spread = this.config.lateralSpread ?? 1;
    const lateral = lane * spread + floatInRange(this.rng, -LANE_JITTER, LANE_JITTER);
    const speed = floatInRange(this.rng, seg.speedMin, seg.speedMax);
    this.addEnemy(word, lateral, lane, SPAWN_Z, speed);
    this.spawnedInEncounter++;
  }

  private pickLane(): number {
    const used = new Set(this.enemies.map((e) => e.lane));
    const free = LANES.filter((lane) => !used.has(lane));
    if (free.length === 0) return floatInRange(this.rng, -0.9, 0.9);
    return free[Math.floor(this.rng() * free.length)] ?? 0;
  }

  private stepEnemies(): void {
    const dt = STEP_MS / 1000;
    for (const enemy of [...this.enemies]) {
      enemy.z -= enemy.speed * dt;
      if (enemy.z > ATTACK_Z) continue;
      this.integrity--;
      this.survived++;
      if (this.lock.isLocked(enemy.id)) this.lock.release();
      this.removeEnemy(enemy.id);
      this.breakCombo();
      this.emitter.emit({ type: 'coreDamage', enemyId: enemy.id, integrityLeft: this.integrity });
      if (this.integrity <= 0) {
        this.phase = 'lost';
        this.emitter.emit({ type: 'levelLost' });
        return;
      }
    }
  }

  private checkEncounterCleared(): void {
    const seg = this.currentEncounter();
    if (!seg) return;
    if (this.spawnedInEncounter >= seg.mutants && this.enemies.length === 0) {
      this.advanceSegment();
    }
  }

  private applyHit(enemy: Enemy, rawChar: string): void {
    const index = enemy.progress;
    enemy.progress++;
    this.stats.keystroke(true, this.fold(enemy.word[index] ?? ''), this.fold(rawChar));
    this.emitter.emit({ type: 'hit', enemyId: enemy.id, letterIndex: index, char: rawChar });
    if (enemy.progress >= enemy.word.length) this.completeWord(enemy);
  }

  private completeWord(enemy: Enemy): void {
    const flawless = enemy.missesWhileLocked === 0;
    if (flawless) this.combo++;
    else this.combo = 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const seconds = Math.max((this.activeMs - enemy.lockAtMs) / 1000, 1 / 60);
    const cps = enemy.word.length / seconds;
    const gained = wordScore(enemy.word.length, comboMultiplier(this.combo), cps);
    this.score += gained;
    this.kills++;
    this.removeEnemy(enemy.id);
    this.lock.release();
    this.emitter.emit({ type: 'wordComplete', enemyId: enemy.id, flawless, score: gained });
  }

  private recordMiss(expected: string | null, rawChar: string): void {
    this.stats.keystroke(false, expected, this.fold(rawChar));
    this.emitter.emit({ type: 'miss', expected, got: rawChar });
    this.breakCombo();
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    const was = this.combo;
    this.combo = 0;
    this.emitter.emit({ type: 'comboBreak', was });
  }

  private addEnemy(
    word: string,
    lateral: number,
    lane: number,
    z: number,
    speed: number,
    kind: 'mutant' | 'boss' = 'mutant',
  ): Enemy {
    const enemy: Enemy = {
      id: `e${this.nextId++}`,
      kind,
      word,
      progress: 0,
      lateral,
      lane,
      z,
      speed,
      missesWhileLocked: 0,
      lockAtMs: 0,
    };
    this.enemies.push(enemy);
    this.emitter.emit({ type: 'spawn', enemy: this.snapshotEnemy(enemy) });
    return enemy;
  }

  private removeEnemy(id: string): void {
    const index = this.enemies.findIndex((e) => e.id === id);
    if (index >= 0) this.enemies.splice(index, 1);
  }

  private reservedFirstLetters(): Set<string> {
    const set = new Set<string>();
    for (const e of this.enemies) {
      if (!this.lock.isLocked(e.id)) set.add(this.fold(e.word[0] ?? ''));
    }
    return set;
  }

  private snapshotEnemy(e: Enemy): EnemySnapshot {
    return {
      id: e.id,
      type: e.kind,
      lateral: e.lateral,
      z: e.z,
      word: e.word,
      progress: e.progress,
      locked: this.lock.isLocked(e.id),
    };
  }

  private fold(s: string): string {
    // Treat '_' as a space: boss sentences show gaps, and players may press
    // either the space bar or underscore — both must match a space (docs/05).
    const spaced = s === '_' ? ' ' : s;
    return this.config.caseSensitive ? spaced : spaced.toLowerCase();
  }
}
