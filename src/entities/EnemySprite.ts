import Phaser from 'phaser';
import { WordLabel } from './WordLabel';

const BODY_FILL = 0x122117;
const BORDER_IDLE = 0x56d364;
const BORDER_LOCKED = 0xf2cc60;
const BODY_SIZE = 120; // px at scale 1 (mutant at the camera)

export class EnemySprite {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly label: WordLabel;
  enemyId = '';
  /** Transient hit-punch factor tweened back to 1; multiplied into the depth scale. */
  punchV = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.rect = scene.add
      .rectangle(0, 0, BODY_SIZE, BODY_SIZE, BODY_FILL)
      .setStrokeStyle(3, BORDER_IDLE)
      .setDepth(5);
    this.label = new WordLabel(scene);
  }

  /** Pool reset — every field a previous life could have touched (docs/09 §8). */
  activate(id: string, word: string): void {
    this.enemyId = id;
    this.punchV = 1;
    this.scene.tweens.killTweensOf(this.rect);
    this.scene.tweens.killTweensOf(this.label.text);
    this.scene.tweens.killTweensOf(this);
    this.rect.setActive(true).setVisible(true).setScale(0.01).setAlpha(1);
    this.rect.setStrokeStyle(3, BORDER_IDLE);
    this.label.setActivePooled(true);
    this.label.text.setAlpha(1).setScale(1);
    this.label.setWord(word);
  }

  setLocked(): void {
    this.rect.setStrokeStyle(3, BORDER_LOCKED);
  }

  setProgress(progress: number): void {
    this.label.setProgress(progress);
  }

  /** Called every frame with the projected screen position and depth scale. */
  project(x: number, y: number, scale: number): void {
    this.rect.setPosition(Math.round(x), Math.round(y));
    this.rect.setScale(scale * this.punchV);
    const depth = 5 + Math.round(scale * 100);
    this.rect.setDepth(depth);
    const half = (BODY_SIZE / 2) * scale;
    this.label.setFontSize(Math.round(14 + 14 * scale));
    this.label.setPosition(x, Math.max(y - half - 10, 26));
    this.label.text.setDepth(300 + depth);
  }

  punch(): void {
    this.punchV = 1.22;
    this.scene.tweens.add({ targets: this, punchV: 1, duration: 90 });
  }

  /** Death pop; calls back when the sprite is safe to return to the pool. */
  killFx(onDone: () => void): void {
    this.scene.tweens.killTweensOf(this.rect);
    this.scene.tweens.killTweensOf(this.label.text);
    this.scene.tweens.add({
      targets: [this.rect, this.label.text],
      alpha: 0,
      scale: this.rect.scale * 1.5,
      duration: 140,
      onComplete: onDone,
    });
  }

  deactivate(): void {
    this.scene.tweens.killTweensOf(this.rect);
    this.scene.tweens.killTweensOf(this.label.text);
    this.scene.tweens.killTweensOf(this);
    this.enemyId = '';
    this.punchV = 1;
    this.rect.setActive(false).setVisible(false);
    this.label.setActivePooled(false);
  }
}
