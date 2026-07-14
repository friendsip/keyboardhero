import Phaser from 'phaser';
import { WordLabel } from './WordLabel';
import { CREATURE_KEYS, GLOW_KEY } from '../fx/CreatureTextures';
import { SPAWN_Z } from '../core/TypingEngine';

/** Procedural designs plus the wemutate toothy mutants (loaded PNGs). */
const DESIGNS: readonly string[] = [...CREATURE_KEYS, 'toothy-green', 'toothy-red'];
const TARGET_H = 180; // desired creature height in px at the camera (scale 1)
const MICRO_FACTOR = 0.6; // single-letter micro-mutants render smaller
const LOCK_COLOR = 0xf2cc60;

export class EnemySprite {
  readonly body: Phaser.GameObjects.Image;
  readonly label: WordLabel;
  enemyId = '';
  /** Transient hit-punch factor tweened back to 1; multiplied into the depth scale. */
  punchV = 1;

  private readonly glow: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private phase = 0; // per-creature animation offset so the horde doesn't move in sync
  /** Normalizes mixed texture sizes to TARGET_H (and shrinks micro-mutants). */
  private baseScale = 1;
  /** Display height at depth-scale 1, for label/glow placement. */
  private dispH = TARGET_H;
  /** Regular mutants balloon ~4x as they close in; the boss keeps its size. */
  private dramatic = true;

  constructor(private readonly scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = scene.add
      .ellipse(0, 0, 150, 40, LOCK_COLOR, 0.1)
      .setStrokeStyle(3, LOCK_COLOR, 0.9);
    this.body = scene.add.image(0, 0, CREATURE_KEYS[0]).setOrigin(0.5, 1);
    this.label = new WordLabel(scene);
    this.deactivate();
  }

  /** Pool reset — every field a previous life could have touched (docs/09 §8). */
  activate(
    id: string,
    word: string,
    opts?: { design?: string; sizeFactor?: number; boss?: boolean },
  ): void {
    this.enemyId = id;
    this.punchV = 1;
    this.phase = hash(id) % 628 / 100; // 0..2π
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.label.text);
    this.scene.tweens.killTweensOf(this);
    this.body
      .setTexture(opts?.design ?? DESIGNS[hash(id) % DESIGNS.length] ?? CREATURE_KEYS[0])
      .setActive(true)
      .setVisible(true)
      .setScale(0.01)
      .setAlpha(1)
      .setRotation(0);
    const size = opts?.sizeFactor ?? (word.length === 1 ? MICRO_FACTOR : 1);
    this.dispH = TARGET_H * size;
    this.baseScale = this.dispH / this.body.height;
    this.dramatic = !opts?.boss;
    this.body.clearTint();
    this.glow.setActive(true).setVisible(true).setAlpha(0);
    this.ring.setActive(false).setVisible(false);
    this.label.setActivePooled(true);
    this.label.text.setAlpha(1).setScale(1).setRotation(0);
    this.label.setWord(word);
  }

  setLocked(): void {
    this.ring.setActive(true).setVisible(true);
  }

  clearLocked(): void {
    this.ring.setActive(false).setVisible(false);
  }

  setProgress(progress: number): void {
    this.label.setProgress(progress);
  }

  /** Called every frame with the projected position, depth scale, raw z, and clock. */
  project(x: number, y: number, scale: number, z: number, timeMs: number): void {
    const t = timeMs / 1000 + this.phase;
    const proximity = 1 - Math.min(z / SPAWN_Z, 1); // 0 far → 1 at the camera
    // idle life: lateral sway + breathing; close range adds a hungry jitter
    const jitter = Math.max(proximity - 0.7, 0) * 14;
    const bx = x + Math.sin(t * 2.1) * 4 * scale + Math.sin(t * 31) * jitter;
    const by = y + Math.cos(t * 27) * jitter * 0.5;
    const breathe = 1 + Math.sin(t * 3.4) * 0.035;
    // Drama: regular mutants swell up to ~4x as they loom into the camera.
    const drama = this.dramatic ? 1 + 3 * Math.pow(proximity, 2.5) : 1;
    const s = scale * this.baseScale * this.punchV * drama;
    const heightNow = this.dispH * scale * drama;

    this.body.setPosition(Math.round(bx), Math.round(by));
    this.body.setScale(s, s * breathe);
    this.body.setRotation(Math.sin(t * 1.7) * 0.045);
    const depth = 5 + Math.round(scale * 100);
    this.body.setDepth(depth);

    this.glow.setPosition(Math.round(bx), Math.round(by - heightNow * 0.45));
    this.glow.setScale(scale * 2.2 * (1 + Math.sin(t * (3 + proximity * 5)) * 0.12));
    this.glow.setAlpha(proximity * 0.55);
    this.glow.setDepth(depth - 1);

    this.ring.setPosition(Math.round(x), Math.round(y + 4));
    this.ring.setScale(scale);
    this.ring.setDepth(depth - 2);

    this.label.setFontSize(Math.round(14 + 14 * scale));
    this.label.setPosition(x, Math.max(by - heightNow - 12, 26));
    this.label.text.setDepth(300 + depth);
  }

  punch(): void {
    this.punchV = 1.18;
    this.scene.tweens.add({ targets: this, punchV: 1, duration: 90 });
    this.body.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.enemyId !== '') this.body.clearTint();
    });
  }

  /** Death pop; calls back when the sprite is safe to return to the pool. */
  killFx(onDone: () => void): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.label.text);
    this.ring.setActive(false).setVisible(false);
    this.glow.setActive(false).setVisible(false);
    this.body.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: [this.body, this.label.text],
      alpha: 0,
      scale: this.body.scale * 1.45,
      rotation: 0.35,
      duration: 150,
      onComplete: onDone,
    });
  }

  deactivate(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.label.text);
    this.scene.tweens.killTweensOf(this);
    this.enemyId = '';
    this.punchV = 1;
    this.body.clearTint();
    this.body.setRotation(0).setActive(false).setVisible(false);
    this.glow.setActive(false).setVisible(false);
    this.ring.setActive(false).setVisible(false);
    this.label.setActivePooled(false);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
