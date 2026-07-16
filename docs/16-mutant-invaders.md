# 16 — Mutant Invaders (mobile Space Invaders)

A second game in the same repo, sharing the mutant sprites, font, seeded RNG
and AudioBus with *Night of the Living Mutant*, but built for **touch /
mobile** — no typing. Portrait 480×800, `Scale.FIT`.

- **Dev URL:** `/invaders.html`  · **Entry:** `src/invaders/main.ts`
- **Build:** second Rollup input in `vite.config.ts`; ships `dist/invaders.html`.

## Theme

You're a test-runner ship defending the **build** at the bottom. A
Space-Invaders formation of mutants marches side to side and descends. You
auto-fire "test cases" (bullets) upward; each kill is a caught mutation.
Bombs are "bugs" the mutants drop. Mutants reaching the build line, or
enough bombs hitting you, breaks the build.

## Controls (mobile-first)

- **Drag** anywhere to move the ship (pointer/touch); ship snaps to finger x.
- **Auto-fire** on a fixed cadence — no fire button (one-finger play).
- Desktop: left/right arrows also move; any tap/key starts and retries.

## Architecture (mirrors the typing game)

- `src/invaders/engine/InvadersEngine.ts` — **pure TS, no Phaser**, fixed
  timestep, seeded RNG (`core/Rng`), emits events via the shared
  `core/events` `Emitter`. Owns formation march + edge-reverse-and-descend,
  auto-fire, bullet/mutant and bomb/ship collisions, win/lose. Node-tested
  (`tests/InvadersEngine.test.ts`, incl. a determinism check).
- `src/invaders/scenes/` — Boot, Menu, Game, HUD, GameOver. Game renders
  from `engine.snapshot()` each frame and reconciles sprite pools by id.
- `src/invaders/fx/ShipTextures.ts` — procedural ship/bullet/bomb canvas
  textures. Mutants reuse `fx/CreatureTextures` + the toothy PNGs.

## Progression

`buildLevel(level)` scales cols/rows/speed/descend/bomb-rate across
`MAX_LEVEL = 5`. Levels flow straight on: clearing one carries **score and
build health** into the next (health persists — a rough level leaves you
fragile, same rule the sister game uses). Final win → "BUILD SHIPPED!",
loss → "BUILD OVERRUN", both with score + mutation score.

## Gotchas that bit during the build

- **Missing-texture green box:** `wemutate-logo-white.png` had been renamed
  to `wemutate-glitch.png`; the Boot loader must match the current asset
  name (assets get reorganised — grep before assuming a filename).
- **Text width at 480px:** the bitmap font is ~0.87×fontSize per glyph, so
  keep titles ≤ ~14 chars at 34px or they clip the portrait width.
- **`Scale.FIT` pointer coords** arrive already in game space (0–480), so
  `setPlayerX(pointer.x)` needs no manual unscaling.
