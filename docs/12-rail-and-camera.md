# 12 — Rail Structure & Pseudo-3D Camera

The game is an on-rails first-person shooter, like the original *Typing of
the Dead*. The camera glides through the codebase; at ambush points the rail
**hard-stops**, a wave of mutants attacks from the corridor ahead, and the
rail resumes when the last one dies. Free FPS movement was rejected for a
hard reason: **both hands live on the home row** — WASD *are* typing keys.
The rail moves you so your fingers never leave the keyboard, which is
exactly why the original was on rails.

## Rail model (engine)

A level is a list of segments:

```ts
type RailSegment =
  | { kind: 'travel'; durationMs: number; label: string }        // camera glides; no combat
  | { kind: 'encounter'; mutants: number; spawnIntervalMs: number;
      maxLive: number; speedMin: number; speedMax: number };      // rail halts; wave attacks
```

Engine phases: `travel → encounter → travel → … → won` (or `lost` when
build integrity hits 0). Rules:

- **Travel:** timer only. No spawns, no enemies, and `handleKey` returns
  immediately — typing during travel is **ignored, never punished** (a
  keystroke that can't possibly hit anything must not dent accuracy).
- **Encounter:** the per-encounter spawner runs (interval + maxLive +
  total), mutants advance in *depth*, and the segment completes when
  `spawned === mutants && live === 0`. Completion advances the rail.
- An exhausted segment list = `levelWon`. An empty rail is won on
  construction (degenerate but defined — the editor can't crash the engine
  with an empty level).
- **Stats count combat time only.** `activeMs` and `StatsTracker` advance
  only during encounters, so travel never dilutes WPM and the rolling WPM
  freezes (showing your last fight's pace) between fights.
- Checkpoints fall out for free: retry-from-checkpoint = rebuild the engine
  and fast-forward `segIndex` (doc 04's checkpoint rules still apply to the
  WordBank rebuild).

### Depth model

Enemies live in `(lateral, z)` space, not screen space:

- `z`: `SPAWN_Z` (1000) at spawn → `ATTACK_Z` (40) where the mutant strikes
  the build (damage + despawn — it *survived* your tests). Movement is
  `z -= speed × dt` in the fixed-step tick; same-step race rules (input
  before movement) carry over from doc 03 unchanged.
- `lateral`: −1 … 1 across the corridor. Concurrent mutants each take a
  free **lane** from `LANES = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]` (small
  jitter, freed on death). Lanes are what keep word labels from stacking on
  top of each other — the invariant tests assert pairwise lateral
  separation ≥ 0.15. `maxLive` must stay ≤ 7 (lane count); the level
  validator should enforce this.

## Projection (render layer only)

The engine never sees screen coordinates. `GameScene` projects per frame:

```
scale  = FOCAL / (FOCAL + z)          FOCAL = 260
xScale = 0.35 + 0.65 * scale          ← deliberate perspective cheat, see below
x      = 640 + lateral * SPREAD * xScale        SPREAD = 620
y      = HORIZON_Y + (BOTTOM_Y - HORIZON_Y) * scale     HORIZON_Y = 270, BOTTOM_Y = 636
spriteScale = scale (body is 120 px at scale 1)
labelFontSize = 14 + 14 * scale (clamped by the font's own min legibility)
```

**Gotchas learned building it:**

1. **The lateral cheat is load-bearing.** True perspective (`x ∝ scale`)
   squeezes all lanes into ~130 px at the horizon and every far word
   overlaps. Flattening lateral spread (`0.35 + 0.65·scale`) keeps far
   lanes ~90 px apart while still converging near the camera. It looks
   fine — the eye forgives lateral flattening far more than vertical.
   Long words in adjacent lanes at near-identical z can still kiss at the
   horizon; they separate as they approach. Tuning knobs, in order:
   lane-jitter (keep ≤ 0.03), the xScale floor, lane count.
2. **Depth-sort every frame.** `setDepth(scale × 100)` for bodies; labels
   at `300 + depth` so *all* labels render above *all* bodies, nearest
   label on top. Without the label offset a near body occludes a far word.
3. **Punch-vs-projection tween conflict.** The hit "punch" cannot tween
   `rect.scale` — projection overwrites it every frame. Tween a `punchV`
   factor on the sprite object instead and multiply it into the projected
   scale each frame. Any per-frame-driven property must never also be a
   tween target (general rule; this is its first bite).
4. **Min font size.** Below ~14 px the bitmap font turns to porridge;
   labels clamp there and also clamp `y ≥ 26` so far words never leave the
   screen.
5. **The floor grid is a per-frame `Graphics` redraw** (one clear + ~25
   lines — trivial). During travel, a `zScroll` offset cycles row depth so
   the floor flows toward the camera; during encounters it freezes. Don't
   move persistent line objects — redrawing is simpler and cheaper than it
   sounds.
6. **Banners are cosmetic.** "EN ROUTE: core/engine/" and "MUTANTS
   DETECTED" render from *snapshot polling* (segIndex change), not from
   the `segmentStart` event — the constructor emits the first segment's
   event before any scene can subscribe. Snapshot-driven UI has no
   ordering hazard; keep it that way.

## Level format impact (doc 06)

`script` is replaced by `rail`: an array of segments where each encounter
embeds its wave list (the old wave format, unchanged). Travel segments
carry `duration` and `label` (the location line shown in the banner and
level select). The editor's timeline (doc 08) becomes a segment strip —
travel blocks and encounter blocks — with the existing wave inspector
inside encounter blocks. Difficulty estimation (words/sec demanded) now
applies per encounter, which is *more* accurate than the old whole-level
estimate.

## View yaw (arrow keys, render-only)

Left/right arrows pan the camera: `GameScene` keeps a `viewYaw` in [-1, 1]
(held arrows push it, release eases it back to centre) and derives
`viewPanPx = viewYaw * 300`. The vanishing point is drawn at
`FIELD_WIDTH/2 - viewPanPx`, and every enemy's screen x is computed from
that same shifted vanishing point, so the whole corridor turns together —
it reads as looking around, not sliding. Purely cosmetic: the engine never
sees yaw, `lateral`/`z` are unchanged, and determinism/tests are unaffected.
Arrows are read via Phaser `createCursorKeys()` (not the typing KeyRouter)
with `addCapture(['LEFT','RIGHT'])` so they don't scroll the page.

**Proximity drama:** regular mutants swell up to ~4x as they close in
(`EnemySprite`: `1 + 3·proximity^2.5`), so the last stretch before a mutant
hits the build is genuinely in-your-face. The boss is exempt (fixed size).

## What did NOT change

The typing engine's brain: lock-on, the locking-keystroke rule, miss
semantics, the unique-first-letter reservation, WordBank shuffle-bags,
stats math, scoring/combo, boss primitives (bosses become the encounter at
the end of a rail), determinism (`?seed=`), and the golden-run test
approach. The pivot swapped the *world model* (positions + win condition),
not the game.
