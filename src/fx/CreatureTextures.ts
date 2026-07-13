import Phaser from 'phaser';

/**
 * Procedural creature art: each mutant design is drawn once onto a canvas
 * texture at boot (shading baked in so sprites read as volumetric), then
 * instanced as ordinary Phaser images the projection can scale. All designs
 * share a 220x200 canvas with feet on the baseline so the render layer can
 * treat them uniformly; swapping in hand-made PNGs later only has to keep
 * the texture keys.
 */
export const CREATURE_KEYS = [
  'creature-glob',
  'creature-crawler',
  'creature-wraith',
  'creature-maw',
] as const;
export const GLOW_KEY = 'creature-glow';
export const TEX_W = 220;
export const TEX_H = 200;
const BASELINE = 194;

type Ctx = CanvasRenderingContext2D;

export function registerCreatureTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'creature-glob', drawGlob);
  makeTexture(scene, 'creature-crawler', drawCrawler);
  makeTexture(scene, 'creature-wraith', drawWraith);
  makeTexture(scene, 'creature-maw', drawMaw);
  makeGlowTexture(scene);
}

function makeTexture(scene: Phaser.Scene, key: string, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, TEX_W, TEX_H);
  if (!texture) throw new Error(`CreatureTextures: could not create ${key}`);
  draw(texture.context);
  texture.refresh();
}

function makeGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_KEY)) return;
  const size = 128;
  const texture = scene.textures.createCanvas(GLOW_KEY, size, size);
  if (!texture) throw new Error('CreatureTextures: could not create glow');
  const ctx = texture.context;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 70, 60, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 50, 50, 0.18)');
  g.addColorStop(1, 'rgba(255, 40, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

function bodyGradient(ctx: Ctx, x: number, y: number, r: number, light: string, mid: string, dark: string): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.15, x, y, r * 1.15);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  return g;
}

function eye(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(255, 60, 50, 0.9)';
  ctx.shadowBlur = r * 1.6;
  ctx.fillStyle = '#ff4636';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1a0505';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.32, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function teethRow(ctx: Ctx, xs: number, xe: number, y: number, count: number, h: number, down: boolean): void {
  ctx.fillStyle = '#e8e2c4';
  const step = (xe - xs) / count;
  for (let i = 0; i < count; i++) {
    const x = xs + i * step;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + step, y);
    ctx.lineTo(x + step / 2, y + (down ? h : -h));
    ctx.closePath();
    ctx.fill();
  }
}

/** GLOB — a dripping blob with one huge bloodshot eye and a stitched grin. */
function drawGlob(ctx: Ctx): void {
  const cx = 110;
  const cy = 118;
  ctx.fillStyle = bodyGradient(ctx, cx, cy, 78, '#8ce08a', '#2e5c38', '#0d2113');
  ctx.beginPath();
  ctx.moveTo(cx - 78, cy + 30);
  ctx.bezierCurveTo(cx - 95, cy - 45, cx - 40, cy - 92, cx + 8, cy - 82);
  ctx.bezierCurveTo(cx + 62, cy - 95, cx + 92, cy - 30, cx + 80, cy + 25);
  ctx.bezierCurveTo(cx + 95, cy + 62, cx - 90, cy + 68, cx - 78, cy + 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0a1a0e';
  ctx.lineWidth = 3;
  ctx.stroke();
  // drips onto the baseline
  ctx.fillStyle = '#1e4227';
  for (const [dx, w, h] of [[-52, 12, 22], [-10, 16, 30], [38, 11, 18]] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + 62 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + dx - w / 2, cy + 55, w, h / 2 + 8);
  }
  ctx.beginPath();
  ctx.ellipse(cx, BASELINE - 4, 84, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 26, 14, 0.8)';
  ctx.fill();
  // warts
  ctx.fillStyle = 'rgba(10, 30, 16, 0.55)';
  for (const [wx, wy, wr] of [[-48, -18, 7], [52, -34, 5], [40, 22, 6], [-28, 34, 4]] as const) {
    ctx.beginPath();
    ctx.arc(cx + wx, cy + wy, wr, 0, Math.PI * 2);
    ctx.fill();
  }
  // the eye: pale sclera, red iris
  ctx.fillStyle = '#ded6b4';
  ctx.beginPath();
  ctx.arc(cx + 2, cy - 26, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a2a20';
  ctx.lineWidth = 1.5;
  for (const a of [0.4, 1.4, 2.3, 3.6, 4.6, 5.5]) {
    ctx.beginPath();
    ctx.moveTo(cx + 2 + Math.cos(a) * 16, cy - 26 + Math.sin(a) * 16);
    ctx.lineTo(cx + 2 + Math.cos(a) * 28, cy - 26 + Math.sin(a) * 28);
    ctx.stroke();
  }
  eye(ctx, cx + 2, cy - 26, 15);
  // stitched grin
  ctx.strokeStyle = '#0a1a0e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 42, cy + 26);
  ctx.quadraticCurveTo(cx, cy + 44, cx + 44, cy + 22);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  for (const t of [0.18, 0.38, 0.58, 0.78]) {
    const x = cx - 42 + t * 86;
    const y = cy + 26 + Math.sin(t * Math.PI) * 16;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 4, y + 7);
    ctx.stroke();
  }
}

/** CRAWLER — a spiky six-legged thing with mandibles and paired eyes. */
function drawCrawler(ctx: Ctx): void {
  const cx = 110;
  const cy = 128;
  // legs first (behind body)
  ctx.strokeStyle = '#132417';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (const [i, spread] of [0.55, 1.0, 1.45].entries()) {
      const hipX = cx + side * 30;
      const hipY = cy + 4 + i * 8;
      const kneeX = cx + side * (58 + spread * 18);
      const kneeY = cy - 26 + i * 16;
      const footX = cx + side * (70 + spread * 24);
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, BASELINE);
      ctx.stroke();
    }
  }
  // abdomen + thorax
  ctx.fillStyle = bodyGradient(ctx, cx + 18, cy + 6, 52, '#5d7a52', '#24391f', '#0b140a');
  ctx.beginPath();
  ctx.ellipse(cx + 22, cy + 8, 52, 40, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyGradient(ctx, cx - 34, cy - 6, 38, '#6d8a5f', '#2c4425', '#0d160b');
  ctx.beginPath();
  ctx.ellipse(cx - 34, cy - 4, 38, 32, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // shell plates
  ctx.strokeStyle = 'rgba(8, 16, 8, 0.7)';
  ctx.lineWidth = 3;
  for (const off of [-8, 10, 28]) {
    ctx.beginPath();
    ctx.arc(cx + 22 + off, cy + 8, 38, -1.9, -1.2);
    ctx.stroke();
  }
  // spikes along the back
  ctx.fillStyle = '#1a2c14';
  for (const [sx, sh] of [[-20, 22], [4, 30], [30, 24], [52, 16]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx - 7, cy - 24);
    ctx.lineTo(cx + sx + 7, cy - 24);
    ctx.lineTo(cx + sx, cy - 24 - sh);
    ctx.closePath();
    ctx.fill();
  }
  // mandibles
  ctx.strokeStyle = '#cfc49c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 62, cy + 6);
  ctx.quadraticCurveTo(cx - 88, cy + 14, cx - 78, cy + 34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 58, cy + 16);
  ctx.quadraticCurveTo(cx - 80, cy + 26, cx - 68, cy + 42);
  ctx.stroke();
  eye(ctx, cx - 52, cy - 16, 9);
  eye(ctx, cx - 34, cy - 24, 7);
}

/** WRAITH — a tattered translucent shroud with hollow sockets. */
function drawWraith(ctx: Ctx): void {
  const cx = 110;
  const top = 22;
  const veil = (spread: number, alpha: number, tint: string): void => {
    ctx.fillStyle = tint;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + 34 + spread, top + 40, cx + 44 + spread, top + 90, cx + 38 + spread, BASELINE - 30);
    // ragged bottom hem
    for (let i = 0; i < 6; i++) {
      const x = cx + 38 + spread - (i + 1) * ((76 + spread * 2) / 6);
      const y = BASELINE - (i % 2 === 0 ? 4 : 34);
      ctx.lineTo(x, y);
    }
    ctx.bezierCurveTo(cx - 44 - spread, top + 90, cx - 34 - spread, top + 40, cx, top);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  veil(14, 0.35, '#5d7a6a');
  veil(4, 0.75, '#8ba694');
  veil(-8, 0.9, '#a9bfae');
  // hood shadow
  ctx.fillStyle = 'rgba(12, 20, 15, 0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, top + 52, 30, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  // hollow sockets with pin-lights
  ctx.fillStyle = '#050a06';
  ctx.beginPath();
  ctx.ellipse(cx - 12, top + 46, 9, 13, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, top + 46, 9, 13, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = 'rgba(255, 60, 50, 1)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff4636';
  ctx.beginPath();
  ctx.arc(cx - 12, top + 48, 3, 0, Math.PI * 2);
  ctx.arc(cx + 12, top + 48, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // silent mouth
  ctx.fillStyle = '#050a06';
  ctx.beginPath();
  ctx.ellipse(cx, top + 74, 6, 11, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** MAW — a cracked skull, three eyes, a mouth of teeth, tentacles below. */
function drawMaw(ctx: Ctx): void {
  const cx = 110;
  const cy = 84;
  // tentacles first (behind skull)
  ctx.strokeStyle = '#274d2e';
  ctx.lineCap = 'round';
  for (const [i, dx] of [-64, -32, 0, 32, 64].entries()) {
    ctx.lineWidth = 11 - Math.abs(dx) / 12;
    ctx.beginPath();
    ctx.moveTo(cx + dx * 0.45, cy + 58);
    ctx.bezierCurveTo(
      cx + dx * 0.8, cy + 96,
      cx + dx * 1.15 + (i % 2 === 0 ? 14 : -14), cy + 120,
      cx + dx, BASELINE,
    );
    ctx.stroke();
  }
  // skull
  ctx.fillStyle = bodyGradient(ctx, cx, cy, 62, '#cdd6b8', '#8a9878', '#3a4432');
  ctx.beginPath();
  ctx.ellipse(cx, cy, 62, 56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#232b1d';
  ctx.lineWidth = 3;
  ctx.stroke();
  // cracks
  ctx.strokeStyle = 'rgba(30, 38, 24, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 44, cy - 34);
  ctx.lineTo(cx - 30, cy - 20);
  ctx.lineTo(cx - 38, cy - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 50, cy - 22);
  ctx.lineTo(cx + 38, cy - 10);
  ctx.stroke();
  // three eyes
  eye(ctx, cx - 22, cy - 16, 10);
  eye(ctx, cx + 22, cy - 16, 10);
  eye(ctx, cx, cy - 38, 7);
  // the maw
  ctx.fillStyle = '#120705';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 34, 44, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  teethRow(ctx, cx - 40, cx + 40, cy + 16, 7, 12, true);
  teethRow(ctx, cx - 36, cx + 36, cy + 52, 6, 11, false);
}
