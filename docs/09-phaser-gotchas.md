# 09 — Phaser 3 Gotchas

Phaser-specific traps, ordered by how likely they are to burn us.

## 1. Scene lifecycle: `shutdown` is where bugs live

- `scene.restart()` / `scene.start()` re-runs `create()` but does NOT
  garbage-collect your external subscriptions: engine-event listeners,
  `window` listeners, DOM nodes, `game.events` hooks. Symptom: retry a
  level and every keystroke sound plays twice, three times after the next
  retry.
  **Rule:** every scene that subscribes to anything owns a
  `this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => …unsubscribeAll)`
  registered in `create()`. Collect unsubscribe functions in an array.
- `init(data)` → `preload()` → `create(data)` order; data passed via
  `scene.start('Game', data)` arrives in both `init` and `create`.
- `shutdown` ≠ `destroy`. Scenes are reused; instance fields keep their
  old values across restarts. **Never rely on field initializers running
  again** — reset all mutable scene state at the top of `create()` (or in
  `init`). Symptom: second play of a level starts with the previous run's
  combo meter.

## 2. Parallel scenes (Game + HUD + BossOverlay)

- `scene.launch('HUD')` runs a scene *alongside*; `scene.start` would
  replace. Order in the game config array ≠ render order at runtime —
  use `this.scene.bringToTop('HUD')` after launching.
- Pausing: `this.scene.pause('Game')` stops Game's update/tweens/timers but
  NOT HUD's. PauseScene must pause **all three** gameplay scenes
  (Game, HUD, BossOverlay) and resume all three. Centralize in a
  `pauseGameplay()/resumeGameplay()` helper or one of them will keep
  animating behind the pause veil.
- Input: multiple active scenes all receive input events. Keyboard routing
  is already centralized (doc 03), so this mainly affects pointer buttons —
  give PauseScene `this.input.setTopOnly(true)`-style discipline or an
  invisible full-screen blocker rect.

## 3. Text rendering performance (word labels)

- `Phaser.GameObjects.Text` renders via an offscreen canvas **per object**
  and re-rasterizes on every `setText`/`setStyle`. Dozens of enemies whose
  labels change on every keystroke = death by canvas re-raster + texture
  re-upload.
- **Use `BitmapText`.** Generate a bitmap font (monospace, e.g. JetBrains
  Mono) via an atlas tool at 2 sizes. Per-letter coloring:
  `setCharacterTint(start, length, tintFill, color)` (Phaser ≥ 3.50) —
  typed = dim green, next = pulsing white, remainder = grey. One BitmapText
  per enemy; update tint only on `hit`/`mutate` events, not per frame.
- The pulsing "next letter" effect: tween a value and apply as tint
  intensity — do NOT re-set text or scale the whole label (layout shift is
  unreadable).
- Reversed-word rendering (doc 05) happens here: `setText(reverse(word))`
  and map tint indices accordingly (`labelIndex = len - 1 - progressIndex`).
- Word labels must render at integer positions (`Math.round`) — subpixel
  bitmap text shimmers when enemies drift.

## 4. Timers & tweens

- `this.time.delayedCall` and tweens are scene-clocked: they pause with the
  scene. `setTimeout` does not. **`setTimeout`/`setInterval` are banned in
  scenes** (lint rule) — a death-animation `setTimeout` firing during pause
  ruins state.
- Gameplay-relevant timing lives in the engine tick anyway (doc 03 §3);
  scene timers are for cosmetics only.
- Tweens targeting a game object that gets destroyed keep running and
  touch dead objects — call `this.tweens.killTweensOf(obj)` in the enemy
  despawn path (or use the enemy pool's reset to do it).

## 5. Audio

- **WebAudio is locked until a user gesture.** First keydown/click unlocks;
  Phaser queues `sound.play()` calls made before unlock ('unlocked' event).
  Menu music must start on 'unlocked', not on scene create, or it silently
  never plays (and Chrome logs a warning per attempt).
- **Keystroke latency:** use an **audio sprite** (one file, many markers)
  for keys/hits/misses — per-file `Audio` decode adds latency and dozens of
  HTTP fetches. Ship 2–3 click variants and rotate; one sample
  machine-gunned at 8 keys/sec is instantly grating. Randomize `detune`
  ±30 cents per play for cheap variety.
- Rising-pitch-across-word: `sound.play('click', { detune: progress * 50 })`
  — detune is in cents, positive = higher.
- `this.sound.pauseOnBlur = false` + our own blur→pause (doc 03 §1) so
  audio state stays in sync with the game's pause, not Phaser's.

## 6. Pause vs the engine

Phaser pausing a scene stops `update()` → `engine.tick()` stops → engine
time freezes. That's the entire pause implementation; the engine needs no
pause flag. **Gotcha:** anything polling `performance.now()` directly would
keep running — which is why the engine may not read wall-clock (doc 02).
Rolling-WPM reads pass `nowMs` in *from the last keystroke/tick timestamp*,
so the displayed WPM also freezes during pause instead of decaying.

## 7. Visibility & the giant delta

Phaser stops RAF when the tab is hidden; on refocus, `update` receives a
huge `delta`. Defenses (belt and suspenders):
1. Engine clamps consumed delta to 250 ms (doc 02).
2. visibilitychange → auto-pause (doc 03 §1) — the player returns to a
   pause menu, not to a lost level.

## 8. Object pooling

Enemies, word labels, and hit particles churn constantly. Use Phaser
groups as pools (`group.get()` / `setActive(false).setVisible(false)`),
never create/destroy per spawn/kill — GC hitches show up as input latency,
which this genre cannot hide.
**Pool-reset checklist for EnemySprite:** position, alpha (silent
mutant!), tint, scale, label text + tints, kill tweens, clear behavior
timers. Symptom of a missed field: a "ghost" silent-mutant alpha on an
operator mutant three waves later.

## 9. Scale / display

- `Scale.FIT` + fixed 1280×720 logical size: no gameplay code ever sees
  real pixels. Set `pixelArt: false`, `antialias: true` (vector look).
- On hiDPI, set `resolution: Math.min(window.devicePixelRatio, 2)` — capping
  at 2 avoids 4× fill cost on mobile-class GPUs for zero visible gain.
- Fullscreen: `this.scale.startFullscreen()` must be called from a user
  gesture (same restriction as audio) — bind it to a button/keypress, and
  note Esc exits fullscreen at the browser level: do NOT also bind Esc to
  anything meaningful (it's already "does nothing" per doc 01's lock rule).

## 10. Miscellany

- `depth` (z-order) is per-scene; enemy labels `setDepth(enemy.depth + 1)`.
  Don't fight cross-scene depth — that's what scene order is for (§2).
- Destroying a scene's DOM element container is manual when created outside
  Phaser's DOM plugin — EditorUI owns its overlay's removal (doc 08).
- Phaser's `game.destroy(true)` on hot-reload: with Vite HMR, guard game
  creation (`if (game) game.destroy(true)`) in `main.ts` or dev sessions
  accumulate zombie canvases and duplicated window listeners. Simplest: no
  HMR accept for main.ts — full reload on change.
