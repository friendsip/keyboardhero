import Phaser from 'phaser';
import {
  InvadersEngine,
  FIELD_W,
  FIELD_H,
  PLAYER_Y,
  MUTANT_HALF,
} from '../engine/InvadersEngine';
import type { InvadersConfig } from '../engine/InvadersEngine';
import { CREATURE_KEYS } from '../../fx/CreatureTextures';
import { SHIP_KEY, BULLET_KEY, BOMB_KEY } from '../fx/ShipTextures';
import { FONT_KEY } from '../../fx/RuntimeFont';
import type { AudioBus } from '../../fx/AudioBus';

const MAX_LEVEL = 5;
const START_INTEGRITY = 4;
const DESIGNS = [...CREATURE_KEYS, 'toothy-green', 'toothy-red'];
const designKey = (i: number): string => DESIGNS[i % DESIGNS.length] ?? 'toothy-green';

function buildLevel(level: number): InvadersConfig {
  return {
    cols: Math.min(4 + level, 8),
    rows: Math.min(2 + level, 5),
    formationSpeed: 26 + level * 9,
    descend: 16 + level * 3,
    fireIntervalMs: 300,
    bombIntervalMs: Math.max(1500 - level * 180, 500),
    bombSpeed: 210 + level * 30,
    integrity: START_INTEGRITY, // overridden by carried health below
    seed: 1000 + level,
  };
}

export class GameScene extends Phaser.Scene {
  private engine!: InvadersEngine;
  private level = 1;
  private carryScore = 0;
  private carryIntegrity = START_INTEGRITY;
  private over = false;
  private won = false;
  private mutants = new Map<number, Phaser.GameObjects.Image>();
  private bullets = new Map<number, Phaser.GameObjects.Image>();
  private bombs = new Map<number, Phaser.GameObjects.Image>();
  private ship!: Phaser.GameObjects.Image;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private cleanups: Array<() => void> = [];

  constructor() {
    super('Game');
  }

  init(data: { level?: number; carryScore?: number; carryIntegrity?: number }): void {
    this.level = Math.min(Math.max(data.level ?? 1, 1), MAX_LEVEL);
    this.carryScore = data.carryScore ?? 0;
    this.carryIntegrity = data.carryIntegrity ?? START_INTEGRITY;
  }

  create(): void {
    this.over = false;
    this.won = false;
    this.mutants = new Map();
    this.bullets = new Map();
    this.bombs = new Map();
    this.cleanups = [];

    this.cameras.main.setBackgroundColor('#05070d');
    this.drawStarfield();
    this.add.rectangle(FIELD_W / 2, PLAYER_Y + 30, FIELD_W, 3, 0x1f6feb, 0.5);
    this.add
      .bitmapText(FIELD_W / 2, PLAYER_Y + 40, FONT_KEY, 'BUILD', 14)
      .setOrigin(0.5, 0)
      .setTint(0x58a6ff);

    const config = { ...buildLevel(this.level), integrity: this.carryIntegrity };
    this.engine = new InvadersEngine(config);
    this.registry.set('engine', this.engine);
    this.registry.set('level', this.level);
    this.registry.set('carryScore', this.carryScore);

    this.ship = this.add.image(FIELD_W / 2, PLAYER_Y, SHIP_KEY).setDepth(20);

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
    // keyboard nudge for desktop; touch drag is handled in wireInput
    const dt = delta / 1000;
    if (this.cursors?.left.isDown) this.engine.movePlayer(-460 * dt);
    else if (this.cursors?.right.isDown) this.engine.movePlayer(460 * dt);

    this.engine.tick(delta);
    const snap = this.engine.snapshot();
    (window as unknown as { __invSnap?: unknown }).__invSnap = snap;

    this.ship.setX(snap.playerX);
    this.reconcile(this.mutants, snap.mutants, (v) => {
      const img = this.add.image(v.x, v.y, designKey(v.design ?? 0)).setDepth(10);
      img.setScale((MUTANT_HALF * 2) / img.height);
      return img;
    });
    this.reconcile(this.bullets, snap.bullets, () => this.add.image(0, 0, BULLET_KEY).setDepth(15));
    this.reconcile(this.bombs, snap.bombs, () => this.add.image(0, 0, BOMB_KEY).setDepth(15));
  }

  private reconcile(
    map: Map<number, Phaser.GameObjects.Image>,
    views: Array<{ id: number; x: number; y: number }>,
    create: (v: { id: number; x: number; y: number; design?: number }) => Phaser.GameObjects.Image,
  ): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let img = map.get(v.id);
      if (!img) {
        img = create(v as never);
        map.set(v.id, img);
      }
      img.setPosition(Math.round(v.x), Math.round(v.y));
    }
    for (const [id, img] of map) {
      if (!seen.has(id)) {
        img.destroy();
        map.delete(id);
      }
    }
  }

  private audio(): AudioBus {
    return this.registry.get('audio') as AudioBus;
  }

  private wireEngineEvents(): void {
    this.cleanups.push(
      this.engine.on('shoot', () => this.audio().click(0)),
      this.engine.on('mutantKilled', ({ id, x, y, design }) => {
        this.mutants.get(id)?.destroy();
        this.mutants.delete(id);
        this.burst(x, y, design);
        this.audio().kill();
      }),
      this.engine.on('playerHit', () => {
        this.cameras.main.shake(160, 0.008);
        this.cameras.main.flash(140, 248, 81, 73);
        this.audio().survive();
      }),
      this.engine.on('levelWon', () => this.finish(true)),
      this.engine.on('levelLost', () => this.finish(false)),
    );
  }

  private wireInput(): void {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.addCapture(['LEFT', 'RIGHT']);
    const follow = (p: Phaser.Input.Pointer): void => {
      if (!this.over) this.engine.setPlayerX(p.x);
    };
    this.input.on('pointerdown', follow);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) follow(p);
    });
  }

  private burst(x: number, y: number, design: number): void {
    const shard = this.add.image(x, y, designKey(design)).setDepth(16);
    shard.setScale((MUTANT_HALF * 2) / shard.height).setTintFill(0xffffff);
    this.tweens.add({ targets: shard, scale: shard.scale * 1.6, alpha: 0, duration: 180, onComplete: () => shard.destroy() });
  }

  private drawStarfield(): void {
    const g = this.add.graphics().setDepth(0);
    let s = 20;
    const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    g.fillStyle(0x2a3550, 1);
    for (let i = 0; i < 60; i++) g.fillCircle(rnd() * FIELD_W, rnd() * FIELD_H, rnd() * 1.5 + 0.5);
  }

  private finish(won: boolean): void {
    if (this.over) return;
    this.over = true;
    this.won = won;
    const snap = this.engine.snapshot();
    const totalScore = this.carryScore + snap.score;
    if (won && this.level < MAX_LEVEL) {
      this.scene.restart({ level: this.level + 1, carryScore: totalScore, carryIntegrity: snap.integrity });
      return;
    }
    this.scene.stop('HUD');
    this.scene.start('GameOver', {
      won,
      level: this.level,
      score: totalScore,
      kills: snap.kills,
      total: snap.totalMutants,
    });
  }
}
