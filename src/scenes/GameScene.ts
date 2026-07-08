import Phaser from 'phaser';
import { TypingEngine, FIELD_WIDTH, FIELD_HEIGHT } from '../core/TypingEngine';
import type { EngineConfig, EngineState, RailSegment } from '../core/TypingEngine';
import { EnemySprite } from '../entities/EnemySprite';
import { FONT_KEY } from '../fx/RuntimeFont';
import type { KeyRouter } from '../input/KeyRouter';
import words from '../data/words/words.json';

// Pseudo-3D projection: scale = FOCAL / (FOCAL + z); everything derives from it.
const HORIZON_Y = 270;
const BOTTOM_Y = 636;
const FOCAL = 260;
const SPREAD = 620;
const ROW_SPACING = 160; // z-units between floor grid lines

const RAIL: RailSegment[] = [
  { kind: 'travel', durationMs: 3500, label: 'lib/utils/' },
  { kind: 'encounter', mutants: 8, spawnIntervalMs: 1100, maxLive: 5, speedMin: 45, speedMax: 75 },
  { kind: 'travel', durationMs: 4000, label: 'core/engine/' },
  { kind: 'encounter', mutants: 12, spawnIntervalMs: 900, maxLive: 6, speedMin: 55, speedMax: 90 },
  { kind: 'travel', durationMs: 4000, label: 'api/routes/' },
  { kind: 'encounter', mutants: 16, spawnIntervalMs: 750, maxLive: 7, speedMin: 60, speedMax: 105 },
  { kind: 'travel', durationMs: 2500, label: 'release gate' },
];

export class GameScene extends Phaser.Scene {
  private engine!: TypingEngine;
  private units = new Map<string, EnemySprite>();
  private freeUnits: EnemySprite[] = [];
  private cleanups: Array<() => void> = [];
  private over = false;
  private grid!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.BitmapText;
  private lastSegIndex = -2;
  private zScroll = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.units = new Map();
    this.freeUnits = [];
    this.cleanups = [];
    this.over = false;
    this.lastSegIndex = -2;
    this.zScroll = 0;

    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const seed = seedParam !== null ? Number(seedParam) >>> 0 : Math.floor(performance.now() * 997) >>> 0;

    const config: EngineConfig = { words, integrity: 5, segments: RAIL, seed };
    this.engine = new TypingEngine(config);
    this.registry.set('engine', this.engine);
    this.registry.set('seed', seed);

    this.grid = this.add.graphics().setDepth(1);
    this.drawCockpit();
    this.banner = this.add
      .bitmapText(FIELD_WIDTH / 2, 150, FONT_KEY, '', 30)
      .setOrigin(0.5)
      .setDepth(600);

    this.wireEngineEvents();
    this.wireInput();

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    this.scene.bringToTop('HUD');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const fn of this.cleanups) fn();
    });
  }

  override update(_time: number, delta: number): void {
    if (this.over) return;
    this.engine.tick(delta);
    const snap = this.engine.snapshot();
    this.syncSegmentBanner(snap);
    this.drawRail(delta, snap.phase === 'travel');
    for (const enemy of snap.enemies) {
      const scale = FOCAL / (FOCAL + enemy.z);
      // Lateral spread is deliberately flatter than true perspective so words
      // in adjacent lanes stay readable near the horizon (docs/12).
      const xScale = 0.35 + 0.65 * scale;
      const x = FIELD_WIDTH / 2 + enemy.lateral * SPREAD * xScale;
      const y = HORIZON_Y + (BOTTOM_Y - HORIZON_Y) * scale;
      this.units.get(enemy.id)?.project(x, y, scale);
    }
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
      this.banner.setText('!! MUTANTS DETECTED !!').setTint(0xf85149).setAlpha(1);
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 1000, duration: 500 });
    }
  }

  private drawRail(delta: number, travelling: boolean): void {
    if (travelling) this.zScroll = (this.zScroll + delta * 0.4) % ROW_SPACING;
    const g = this.grid;
    g.clear();
    g.lineStyle(2, 0x1f6feb, 0.35);
    g.lineBetween(0, HORIZON_Y, FIELD_WIDTH, HORIZON_Y);
    g.lineStyle(1, 0x1f6feb, 0.12);
    for (let lateral = -1.2; lateral <= 1.21; lateral += 0.3) {
      g.lineBetween(FIELD_WIDTH / 2, HORIZON_Y, FIELD_WIDTH / 2 + lateral * SPREAD * 1.35, FIELD_HEIGHT);
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

  private wireEngineEvents(): void {
    this.cleanups.push(
      this.engine.on('spawn', ({ enemy }) => {
        const unit = this.freeUnits.pop() ?? new EnemySprite(this);
        unit.activate(enemy.id, enemy.word);
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
      }),
      this.engine.on('miss', () => {
        this.cameras.main.shake(60, 0.0015);
      }),
      this.engine.on('wordComplete', ({ enemyId, score }) => {
        const unit = this.units.get(enemyId);
        if (unit) this.popScore(unit.rect.x, unit.rect.y, score);
        this.releaseUnit(enemyId, true);
      }),
      this.engine.on('coreDamage', ({ enemyId }) => {
        this.releaseUnit(enemyId, false);
        this.cameras.main.flash(140, 248, 81, 73);
        this.cameras.main.shake(140, 0.005);
      }),
      this.engine.on('levelWon', () => this.finish(true)),
      this.engine.on('levelLost', () => this.finish(false)),
    );
  }

  private wireInput(): void {
    const router = this.registry.get('keyRouter') as KeyRouter;
    const handler = (char: string): void => {
      if (this.scene.isPaused()) {
        this.scene.stop('Pause');
        this.scene.resume();
        return;
      }
      if (this.over) {
        if (char === ' ') this.scene.restart();
        return;
      }
      this.engine.handleKey(char);
    };
    router.setHandler(handler);
    this.cleanups.push(() => router.clearHandler(handler));

    const pause = (): void => {
      if (this.over || this.scene.isPaused()) return;
      this.scene.pause();
      this.scene.launch('Pause');
    };
    const onBlur = (): void => pause();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') pause();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
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

    const stats = this.engine.stats.finalize();
    const snap = this.engine.snapshot();
    const seed = this.registry.get('seed') as number;

    this.add
      .rectangle(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, FIELD_WIDTH, FIELD_HEIGHT, 0x010409, 0.78)
      .setDepth(640);
    const title = won ? 'RELEASE GATE REACHED' : 'BUILD BROKEN';
    const titleColor = won ? 0x3fb950 : 0xf85149;
    const mutationScore =
      snap.totalMutants === 0 ? 100 : Math.round((snap.kills / snap.totalMutants) * 100);
    const lines = [
      `MUTATION SCORE ${mutationScore}%`,
      `WPM ${Math.round(stats.wpm)}`,
      `ACCURACY ${(stats.accuracy * 100).toFixed(1)}%`,
      `SCORE ${snap.score}`,
      `BEST COMBO ${snap.maxCombo}`,
      `SEED ${seed}`,
    ];
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
      .bitmapText(FIELD_WIDTH / 2, 580, FONT_KEY, 'PRESS SPACE TO RETRY', 22)
      .setOrigin(0.5)
      .setDepth(641)
      .setTint(0x8b949e);
  }
}
