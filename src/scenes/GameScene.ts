import Phaser from 'phaser';
import { TypingEngine, FIELD_WIDTH, FIELD_HEIGHT } from '../core/TypingEngine';
import type { EngineConfig, EngineState, RailSegment } from '../core/TypingEngine';
import { EnemySprite } from '../entities/EnemySprite';
import { FONT_KEY } from '../fx/RuntimeFont';
import type { KeyRouter } from '../input/KeyRouter';
import type { AudioBus } from '../fx/AudioBus';
import { WORD_POOLS, SWARM_TIER, MAX_LEVEL, tierForLevel } from '../data/words/pools';
import { aggregateWpm, aggregateAccuracy } from '../core/runStats';

// Pseudo-3D projection: scale = FOCAL / (FOCAL + z); everything derives from it.
const HORIZON_Y = 270;
const BOTTOM_Y = 636;
const FOCAL = 260;
const SPREAD = 620;
const ROW_SPACING = 160; // z-units between floor grid lines
// Full arrow-key yaw lets you centre a mutant this far off to the side (lateral
// units); it comfortably covers the widest level-6 spawns.
const YAW_RANGE = 2.7;

/** Mutants fan out wider each level; by level 3 they arrive from the sides. */
function spreadForLevel(level: number): number {
  return Math.min(1 + (level - 1) * 0.42, 2.6);
}

const START_INTEGRITY = 5;

const LEVEL_MODULES = [
  'lib/utils/',
  'core/engine/',
  'api/routes/',
  'ci/pipeline/',
  'kernel/init/',
  'release gate',
];

const BOSS_NAMES = ['SEGFAULT', 'DEADLOCK', 'THE REGRESSION', 'THE POLYMORPH', 'THE EQUIVALENT', 'THE SURVIVOR'];
const BOSS_SENTENCES = [
  'mutants break your code to make it stronger',
  'a test that never fails is not a test',
  'coverage is not the same as correctness',
  'every surviving mutant is a missing assertion',
  'good tests bite back when the code goes bad',
  'ship it only when all the mutants are dead',
];

/**
 * Each level is a rail of three fights: two waves at the level's word
 * length (level 1 = 2 letters … level 6 = 8+), with a single-letter
 * micro-mutant swarm in between. Speeds and counts ramp with the level.
 */
function buildRail(level: number): RailSegment[] {
  const tier = tierForLevel(level);
  // Speeds climb faster per level from level 2 onward.
  const sp = (base: number): number => base + (level - 1) * 16;
  const module = LEVEL_MODULES[level - 1] ?? 'release gate';
  return [
    { kind: 'travel', durationMs: 3000, label: module },
    { kind: 'encounter', tier, mutants: 8 + level, spawnIntervalMs: 1000 - level * 40, maxLive: 5, speedMin: sp(44), speedMax: sp(74) },
    { kind: 'travel', durationMs: 3200, label: 'swarm nest ahead' },
    // Single-letter swarm: small, quick to type, so they rush in fast.
    { kind: 'encounter', tier: SWARM_TIER, mutants: 10 + level * 2, spawnIntervalMs: 620, maxLive: 7, speedMin: sp(95), speedMax: sp(135) },
    { kind: 'travel', durationMs: 3200, label: 'deep scan' },
    { kind: 'encounter', tier, mutants: 10 + level * 2, spawnIntervalMs: 880 - level * 40, maxLive: 6, speedMin: sp(52), speedMax: sp(86) },
    { kind: 'travel', durationMs: 2500, label: 'boss chamber' },
    {
      kind: 'boss',
      name: BOSS_NAMES[level - 1] ?? 'THE SURVIVOR',
      sentence: BOSS_SENTENCES[level - 1] ?? BOSS_SENTENCES[0] ?? '',
      timeLimitMs: (BOSS_SENTENCES[level - 1] ?? '').length * (620 - level * 25),
    },
    { kind: 'travel', durationMs: 2200, label: level >= MAX_LEVEL ? 'shipping v1.0.0' : 'checkpoint reached' },
  ];
}

export class GameScene extends Phaser.Scene {
  private engine!: TypingEngine;
  private units = new Map<string, EnemySprite>();
  private freeUnits: EnemySprite[] = [];
  private cleanups: Array<() => void> = [];
  private over = false;
  private won = false;
  private level = 1;
  /** Carried in from cleared levels so a run reads as one continuous game. */
  private carryScore = 0;
  private carryIntegrity = START_INTEGRITY;
  private carryCorrect = 0;
  private carryMissed = 0;
  private carryActiveMs = 0;
  private grid!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.BitmapText;
  private bossBars!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.BitmapText;
  private bossTimerText!: Phaser.GameObjects.BitmapText;
  private leftArrow!: Phaser.GameObjects.BitmapText;
  private rightArrow!: Phaser.GameObjects.BitmapText;
  private lastSegIndex = -2;
  private zScroll = 0;
  private debug = false;
  /** Camera yaw from the arrow keys, -1 (look left) .. 1 (look right). */
  private viewYaw = 0;
  private viewHeading = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('Game');
  }

  init(data: {
    level?: number;
    carryScore?: number;
    carryIntegrity?: number;
    carryCorrect?: number;
    carryMissed?: number;
    carryActiveMs?: number;
  }): void {
    // No saved progress by design — the game is too fast-paced for save
    // states. Levels are picked on the menu; only settings/identity persist.
    this.level = Math.min(Math.max(data.level ?? 1, 1), MAX_LEVEL);
    this.carryScore = data.carryScore ?? 0;
    // Build health persists across levels — a rough level leaves you fragile.
    this.carryIntegrity = data.carryIntegrity ?? START_INTEGRITY;
    this.carryCorrect = data.carryCorrect ?? 0;
    this.carryMissed = data.carryMissed ?? 0;
    this.carryActiveMs = data.carryActiveMs ?? 0;
  }

  create(): void {
    this.units = new Map();
    this.freeUnits = [];
    this.cleanups = [];
    this.over = false;
    this.won = false;
    this.lastSegIndex = -2;
    this.zScroll = 0;
    this.viewYaw = 0;
    this.viewHeading = 0;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.addCapture(['LEFT', 'RIGHT']);

    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.debug = params.get('debug') === '1';
    const seed = seedParam !== null ? Number(seedParam) >>> 0 : Math.floor(performance.now() * 997) >>> 0;

    const config: EngineConfig = {
      wordTiers: WORD_POOLS,
      integrity: this.carryIntegrity,
      segments: buildRail(this.level),
      seed,
      lateralSpread: spreadForLevel(this.level),
    };
    this.engine = new TypingEngine(config);
    this.registry.set('engine', this.engine);
    this.registry.set('seed', seed);
    this.registry.set('level', this.level);
    this.registry.set('carryScore', this.carryScore);
    this.registry.set('carryCorrect', this.carryCorrect);
    this.registry.set('carryMissed', this.carryMissed);
    this.registry.set('carryActiveMs', this.carryActiveMs);

    this.grid = this.add.graphics().setDepth(1);
    this.drawCockpit();
    this.banner = this.add
      .bitmapText(FIELD_WIDTH / 2, 150, FONT_KEY, '', 30)
      .setOrigin(0.5)
      .setDepth(600);
    // Edge cues that a mutant is off-screen to the side — turn to face it.
    this.leftArrow = this.add
      .bitmapText(28, 360, FONT_KEY, '<<', 40)
      .setOrigin(0, 0.5)
      .setDepth(605)
      .setTint(0xf85149)
      .setVisible(false);
    this.rightArrow = this.add
      .bitmapText(FIELD_WIDTH - 28, 360, FONT_KEY, '>>', 40)
      .setOrigin(1, 0.5)
      .setDepth(605)
      .setTint(0xf85149)
      .setVisible(false);
    this.tweens.add({ targets: [this.leftArrow, this.rightArrow], alpha: 0.3, duration: 450, yoyo: true, repeat: -1 });
    this.bossBars = this.add.graphics().setDepth(610);
    this.bossName = this.add
      .bitmapText(FIELD_WIDTH / 2, 56, FONT_KEY, '', 24)
      .setOrigin(0.5)
      .setDepth(611)
      .setTint(0xf85149)
      .setVisible(false);
    this.bossTimerText = this.add
      .bitmapText(FIELD_WIDTH / 2 + 250, 86, FONT_KEY, '', 18)
      .setOrigin(0, 0.5)
      .setDepth(611)
      .setTint(0xf2cc60)
      .setVisible(false);

    this.wireEngineEvents();
    this.wireInput();

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    this.scene.bringToTop('HUD');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const fn of this.cleanups) fn();
    });
  }

  override update(time: number, delta: number): void {
    if (this.over) return;
    this.engine.tick(delta);
    const snap = this.engine.snapshot();
    if (this.debug) (window as unknown as { __snap?: EngineState }).__snap = snap;
    this.updateViewYaw(delta);
    this.syncSegmentBanner(snap);
    this.drawRail(delta, snap.phase === 'travel');
    this.drawBossUI(snap);
    // Yaw is a heading in lateral units: turning brings side mutants to centre.
    const heading = this.viewYaw * YAW_RANGE;
    let offLeft = 0;
    let offRight = 0;
    for (const enemy of snap.enemies) {
      const scale = FOCAL / (FOCAL + enemy.z);
      // Lateral spread is deliberately flatter than true perspective so words
      // in adjacent lanes stay readable near the horizon (docs/12).
      const xScale = 0.35 + 0.65 * scale;
      const x = FIELD_WIDTH / 2 + (enemy.lateral - heading) * SPREAD * xScale;
      const y = HORIZON_Y + (BOTTOM_Y - HORIZON_Y) * scale;
      this.units.get(enemy.id)?.project(x, y, scale, enemy.z, time);
      if (x < 30) offLeft++;
      else if (x > FIELD_WIDTH - 30) offRight++;
    }
    this.updateEdgeArrows(offLeft, offRight);
  }

  private updateViewYaw(delta: number): void {
    const dt = delta / 1000;
    const left = this.cursors?.left.isDown ?? false;
    const right = this.cursors?.right.isDown ?? false;
    if (left && !right) this.viewYaw -= 1.8 * dt;
    else if (right && !left) this.viewYaw += 1.8 * dt;
    else this.viewYaw *= Math.max(0, 1 - 1.6 * dt); // gently ease back to centre
    this.viewYaw = Math.max(-1, Math.min(1, this.viewYaw));
    this.viewHeading = this.viewYaw * YAW_RANGE;
  }

  private updateEdgeArrows(offLeft: number, offRight: number): void {
    this.leftArrow.setVisible(offLeft > 0);
    this.rightArrow.setVisible(offRight > 0);
  }

  private syncSegmentBanner(snap: EngineState): void {
    if (snap.segIndex === this.lastSegIndex) return;
    this.lastSegIndex = snap.segIndex;
    this.tweens.killTweensOf(this.banner);
    if (snap.phase === 'travel') {
      this.banner
        .setText(`>> EN ROUTE: ${snap.travelLabel ?? ''}`)
        .setTint(0x58a6ff)
        .setAlpha(1);
    } else if (snap.phase === 'encounter') {
      this.banner.setText('There are mutations in your codebase!').setTint(0xf85149).setAlpha(1);
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 1400, duration: 500 });
    } else if (snap.phase === 'boss') {
      this.banner
        .setText(`!! BOSS: ${snap.boss?.name ?? ''} — type the whole sentence, spaces and all !!`)
        .setTint(0xf85149)
        .setAlpha(1);
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 2600, duration: 600 });
    }
  }

  private drawBossUI(snap: EngineState): void {
    const g = this.bossBars;
    g.clear();
    if (!snap.boss) {
      this.bossName.setVisible(false);
      this.bossTimerText.setVisible(false);
      return;
    }
    const width = 460;
    const x = FIELD_WIDTH / 2 - width / 2;
    this.bossName.setVisible(true).setText(`BOSS: ${snap.boss.name}`);
    // health bar — sentence progress is damage
    g.fillStyle(0x21262d, 1).fillRect(x, 72, width, 12);
    g.fillStyle(0xf85149, 1).fillRect(x, 72, width * snap.boss.hpFrac, 12);
    g.lineStyle(1, 0x8b949e, 0.8).strokeRect(x, 72, width, 12);
    // kill timer
    const frac = snap.boss.timeLimitMs > 0 ? snap.boss.timeLeftMs / snap.boss.timeLimitMs : 0;
    g.fillStyle(0x21262d, 1).fillRect(x, 90, width, 7);
    g.fillStyle(frac < 0.25 ? 0xf85149 : 0xf2cc60, 1).fillRect(x, 90, width * frac, 7);
    this.bossTimerText.setVisible(true).setText(`${(snap.boss.timeLeftMs / 1000).toFixed(1)}s`);
  }

  private drawRail(delta: number, travelling: boolean): void {
    if (travelling) this.zScroll = (this.zScroll + delta * 0.4) % ROW_SPACING;
    const g = this.grid;
    g.clear();
    g.lineStyle(2, 0x1f6feb, 0.35);
    g.lineBetween(0, HORIZON_Y, FIELD_WIDTH, HORIZON_Y);
    g.lineStyle(1, 0x1f6feb, 0.12);
    // Grid turns with the view: far vanishing point moves a little, the near
    // floor edges move a lot — that parallax reads as rotation.
    const heading = this.viewHeading;
    const apexX = FIELD_WIDTH / 2 - heading * SPREAD * 0.35;
    for (let lateral = -1.2; lateral <= 1.21; lateral += 0.3) {
      g.lineBetween(apexX, HORIZON_Y, FIELD_WIDTH / 2 + (lateral - heading) * SPREAD * 1.35, FIELD_HEIGHT);
    }
    for (let i = 0; i < 14; i++) {
      const z = i * ROW_SPACING - this.zScroll;
      if (z < 0) continue;
      const scale = FOCAL / (FOCAL + z);
      const y = HORIZON_Y + (BOTTOM_Y + 60 - HORIZON_Y) * scale;
      g.lineStyle(1, 0x1f6feb, 0.05 + 0.15 * scale);
      g.lineBetween(0, y, FIELD_WIDTH, y);
    }
  }

  private drawCockpit(): void {
    this.add
      .rectangle(FIELD_WIDTH / 2, 668, 84, 36, 0x0d419d)
      .setStrokeStyle(2, 0x58a6ff)
      .setDepth(550);
    this.add
      .bitmapText(FIELD_WIDTH / 2, 674, FONT_KEY, 'BUILD', 16)
      .setOrigin(0.5)
      .setDepth(551)
      .setTint(0x58a6ff);
  }

  private audio(): AudioBus {
    return this.registry.get('audio') as AudioBus;
  }

  private wireEngineEvents(): void {
    this.cleanups.push(
      this.engine.on('spawn', ({ enemy }) => {
        const unit = this.freeUnits.pop() ?? new EnemySprite(this);
        unit.activate(
          enemy.id,
          enemy.word,
          enemy.type === 'boss' ? { design: 'toothy-red', sizeFactor: 1.9, boss: true } : undefined,
        );
        this.units.set(enemy.id, unit);
      }),
      this.engine.on('lock', ({ enemyId }) => {
        this.units.get(enemyId)?.setLocked();
      }),
      this.engine.on('hit', ({ enemyId, letterIndex }) => {
        const unit = this.units.get(enemyId);
        if (!unit) return;
        unit.setProgress(letterIndex + 1);
        unit.punch();
        this.audio().click(letterIndex);
      }),
      this.engine.on('miss', () => {
        this.cameras.main.shake(60, 0.0015);
        this.audio().miss();
      }),
      this.engine.on('wordComplete', ({ enemyId, score }) => {
        const unit = this.units.get(enemyId);
        if (unit) this.popScore(unit.body.x, unit.body.y, score);
        this.releaseUnit(enemyId, true);
        this.audio().kill();
      }),
      this.engine.on('coreDamage', ({ enemyId }) => {
        this.releaseUnit(enemyId, false);
        this.cameras.main.flash(140, 248, 81, 73);
        this.cameras.main.shake(140, 0.005);
        this.audio().survive();
      }),
      this.engine.on('bossTimeout', ({ enemyId }) => {
        const unit = this.units.get(enemyId);
        unit?.setProgress(0);
        unit?.clearLocked();
        this.cameras.main.flash(160, 248, 81, 73);
        this.cameras.main.shake(160, 0.006);
        this.audio().survive();
      }),
      this.engine.on('levelWon', () => this.finish(true)),
      this.engine.on('levelLost', () => this.finish(false)),
    );
  }

  private wireInput(): void {
    const router = this.registry.get('keyRouter') as KeyRouter;
    const handler = (char: string): void => {
      if (this.scene.isPaused()) {
        if (char.toLowerCase() === 'm') this.toMenu();
        else this.resumeGame();
        return;
      }
      if (this.over) {
        if (char === ' ' || char === '\n') {
          const next = this.won ? (this.level >= MAX_LEVEL ? 1 : this.level + 1) : this.level;
          this.scene.restart({ level: next });
        } else if (char.toLowerCase() === 'm') {
          this.toMenu();
        }
        return;
      }
      if (char === '\x1b') {
        this.pauseGame(); // Escape pauses (with a menu option)
        return;
      }
      if (char === '\n') return; // Enter is a menu key, never a game letter
      this.engine.handleKey(char);
    };
    router.setHandler(handler);
    this.cleanups.push(() => router.clearHandler(handler));

    const onBlur = (): void => this.pauseGame();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.pauseGame();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  private pauseGame(): void {
    if (this.over || this.scene.isPaused()) return;
    this.scene.pause();
    this.scene.launch('Pause');
  }

  private resumeGame(): void {
    this.scene.stop('Pause');
    this.scene.resume();
  }

  private toMenu(): void {
    this.scene.stop('Pause');
    this.scene.stop('HUD');
    this.scene.start('Menu');
  }

  private releaseUnit(enemyId: string, withFx: boolean): void {
    const unit = this.units.get(enemyId);
    if (!unit) return;
    this.units.delete(enemyId);
    if (withFx) {
      unit.killFx(() => {
        unit.deactivate();
        this.freeUnits.push(unit);
      });
    } else {
      unit.deactivate();
      this.freeUnits.push(unit);
    }
  }

  private popScore(x: number, y: number, score: number): void {
    const text = this.add
      .bitmapText(x, y - 40, FONT_KEY, `+${score}`, 18)
      .setOrigin(0.5, 1)
      .setDepth(620)
      .setTint(0x58a6ff);
    this.tweens.add({
      targets: text,
      y: y - 80,
      alpha: 0,
      duration: 500,
      onComplete: () => text.destroy(),
    });
  }

  private finish(won: boolean): void {
    if (this.over) return;
    this.over = true;
    this.won = won;

    const snap = this.engine.snapshot();
    const seed = this.registry.get('seed') as number;
    const finalLevel = this.level >= MAX_LEVEL;
    const totalScore = this.carryScore + snap.score;
    const r = this.engine.stats.raw();
    const totals = {
      correct: this.carryCorrect + r.correct,
      missed: this.carryMissed + r.missed,
      activeMs: this.carryActiveMs + r.activeMs,
    };

    // Clearing a level flows straight into the next one, carrying score,
    // build health and cumulative typing stats.
    if (won && !finalLevel) {
      this.scene.restart({
        level: this.level + 1,
        carryScore: totalScore,
        carryIntegrity: snap.integrity,
        carryCorrect: totals.correct,
        carryMissed: totals.missed,
        carryActiveMs: totals.activeMs,
      });
      return;
    }

    this.add
      .rectangle(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, FIELD_WIDTH, FIELD_HEIGHT, 0x010409, 0.78)
      .setDepth(640);
    const title = won ? 'YOU SHIPPED v1.0.0' : 'BUILD BROKEN';
    const titleColor = won ? 0x3fb950 : 0xf85149;
    const mutationScore =
      snap.totalMutants === 0 ? 100 : Math.round((snap.kills / snap.totalMutants) * 100);
    const user = (this.registry.get('user') as string) || '???';
    const aggWpm = aggregateWpm(totals) ?? 0;
    const aggAcc = aggregateAccuracy(totals);
    const lines = [
      `PLAYER ${user}`,
      `REACHED LEVEL ${this.level}`,
      `SCORE ${totalScore}`,
      `WPM ${Math.round(aggWpm)}`,
      `ACCURACY ${(aggAcc * 100).toFixed(1)}%`,
      `MUTATION SCORE ${mutationScore}%`,
      `BEST COMBO ${snap.maxCombo}`,
      `SEED ${seed}`,
    ];
    const prompt = won ? 'SPACE: PLAY AGAIN    M: MENU' : 'SPACE: RETRY    M: MENU';
    this.add
      .bitmapText(FIELD_WIDTH / 2, 190, FONT_KEY, title, 52)
      .setOrigin(0.5)
      .setDepth(641)
      .setTint(titleColor);
    this.add
      .bitmapText(FIELD_WIDTH / 2, 310, FONT_KEY, lines.join('\n'), 26)
      .setOrigin(0.5, 0)
      .setDepth(641)
      .setCenterAlign();
    this.add
      .bitmapText(FIELD_WIDTH / 2, 640, FONT_KEY, prompt, 22)
      .setOrigin(0.5)
      .setDepth(641)
      .setTint(0x8b949e);
  }
}
