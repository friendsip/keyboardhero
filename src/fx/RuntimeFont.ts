import Phaser from 'phaser';

export const FONT_KEY = 'mono';

const FIRST_CODE = 32;
const LAST_CODE = 126;
const CHARS_PER_ROW = 16;
const CELL_W = 22;
const CELL_H = 36;

/**
 * Draws the printable-ASCII charset onto a canvas texture and registers it as
 * a RetroFont-backed bitmap font. White glyphs so setCharacterTint (with
 * tintFill) can recolor letters per typing state (docs/09 §3).
 */
export function registerRuntimeFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;

  let charset = '';
  for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
    charset += String.fromCharCode(code);
  }
  const rows = Math.ceil(charset.length / CHARS_PER_ROW);

  const texture = scene.textures.createCanvas(
    'runtime-font-grid',
    CELL_W * CHARS_PER_ROW,
    CELL_H * rows,
  );
  if (!texture) throw new Error('RuntimeFont: could not create canvas texture');

  const ctx = texture.context;
  ctx.fillStyle = '#ffffff';
  ctx.font = '30px Menlo, Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < charset.length; i++) {
    const col = i % CHARS_PER_ROW;
    const row = Math.floor(i / CHARS_PER_ROW);
    ctx.fillText(charset[i] ?? '', col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H / 2 + 1);
  }
  texture.refresh();

  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'runtime-font-grid',
    width: CELL_W,
    height: CELL_H,
    chars: charset,
    charsPerRow: CHARS_PER_ROW,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add(FONT_KEY, data);
}
