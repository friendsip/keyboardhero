import Phaser from 'phaser';

export const SHIP_KEY = 'inv-ship';
export const BULLET_KEY = 'inv-bullet';
export const BOMB_KEY = 'inv-bomb';

type Ctx = CanvasRenderingContext2D;

/** Procedural player ship (a neon "test-runner" defender) and shots. */
export function registerShipTextures(scene: Phaser.Scene): void {
  make(scene, SHIP_KEY, 60, 48, drawShip);
  make(scene, BULLET_KEY, 12, 26, drawBullet);
  make(scene, BOMB_KEY, 16, 22, drawBomb);
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) throw new Error(`ShipTextures: could not create ${key}`);
  draw(tex.context, w, h);
  tex.refresh();
}

function drawShip(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  ctx.fillStyle = '#3fb950';
  ctx.strokeStyle = '#0a1a0e';
  ctx.lineWidth = 2;
  // hull
  ctx.beginPath();
  ctx.moveTo(cx, 4);
  ctx.lineTo(w - 6, h - 10);
  ctx.lineTo(w - 20, h - 6);
  ctx.lineTo(cx, h - 16);
  ctx.lineTo(20, h - 6);
  ctx.lineTo(6, h - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cockpit
  ctx.fillStyle = '#7ee787';
  ctx.beginPath();
  ctx.moveTo(cx, 12);
  ctx.lineTo(cx + 8, h - 20);
  ctx.lineTo(cx - 8, h - 20);
  ctx.closePath();
  ctx.fill();
  // barrel
  ctx.fillStyle = '#58a6ff';
  ctx.fillRect(cx - 3, 0, 6, 12);
}

function drawBullet(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#a5d6ff');
  g.addColorStop(1, '#1f6feb');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx + 4, h);
  ctx.lineTo(cx - 4, h);
  ctx.closePath();
  ctx.fill();
}

function drawBomb(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  ctx.fillStyle = '#f85149';
  ctx.beginPath();
  ctx.ellipse(cx, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd0cc';
  ctx.beginPath();
  ctx.ellipse(cx - 2, h / 2 - 3, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}
