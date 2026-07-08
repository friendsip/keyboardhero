# 02 — Architecture & Tooling

## Dependency rules (enforced, not aspirational)

```
src/core/      → may import: nothing outside core/ (and src/data/schemas types)
src/data/      → may import: zod only
src/storage/   → may import: data/schemas; NOT core, NOT scenes
src/scenes/    → may import: core, data, storage, entities, fx, phaser
src/entities/  → may import: phaser, core (types/events only)
src/fx/        → may import: phaser
```

Enforce with an ESLint `no-restricted-imports` rule (or
`eslint-plugin-boundaries`) so `import ... from 'phaser'` inside `src/core/`
is a lint **error**. Without enforcement this rule erodes in a week.

## Project structure

```
typing-to-freedom/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/assets/           # sprites, audio, bitmap fonts (see notes below)
├── src/
│   ├── main.ts              # Phaser.Game config, scene registration, global input bootstrap
│   ├── core/
│   │   ├── TypingEngine.ts  # façade: handleKey / tick / snapshot / on(event)
│   │   ├── TargetLock.ts    # lock state + letter matching
│   │   ├── StatsTracker.ts  # WPM (rolling + total), accuracy, combo, per-key errors
│   │   ├── WordBank.ts      # tiered pools, shuffle-bags, first-letter reservation
│   │   ├── SpawnDirector.ts # level-script playback → spawn events
│   │   ├── BossMachine.ts   # phase state machine over mechanic primitives
│   │   ├── Scoring.ts       # score, combo tiers, grade formula
│   │   ├── Rng.ts           # mulberry32 seeded PRNG (the ONLY randomness in core)
│   │   └── events.ts        # typed emitter + EngineEvent union
│   ├── data/
│   │   ├── schemas.ts       # zod: LevelSchema, BossSchema, SaveSchema, EnemyDefSchema
│   │   ├── enemies.json
│   │   ├── words/tier1..5.json  (+ themed packs)
│   │   └── levels/*.json    # campaign
│   ├── storage/
│   │   ├── StorageAdapter.ts  # interface
│   │   ├── LocalAdapter.ts    # localStorage (save) + IndexedDB (custom levels)
│   │   ├── migrations.ts      # formatVersion N → N+1 chain
│   │   └── ImportExport.ts    # Blob download / file import + validation
│   ├── scenes/  (Boot, Preload, Menu, LevelSelect, Game, HUD, BossOverlay,
│   │             Results, Stats, Pause, editor/{Editor, EditorUI, PlaytestBridge})
│   ├── entities/ (EnemySprite.ts, WordLabel.ts)
│   └── fx/       (Juice.ts, AudioBus.ts)
└── tests/        (mirrors core/ + storage/migrations + level schema sweep)
```

## Runtime data flow

```
window keydown ──(normalize/filter: doc 03)──► TypingEngine.handleKey(char, t)
Phaser Scene.update(time, delta) ────────────► TypingEngine.tick(delta)
TypingEngine ──emits──► EngineEvent ─────────► GameScene / HUDScene / AudioBus / Juice
GameScene.render ◄── engine.snapshot()  (positions, word states, lock, timers)
ResultsScene ◄── StatsTracker.finalize() ───► SaveSystem.recordRun(...)
```

Key decisions:

- **Events out, snapshot for render.** Discrete things (hit, miss, kill,
  lock, combo break, core damage, phase change) are events so audio/FX fire
  exactly once. Continuous things (positions, letter progress, timer bars)
  are read from `snapshot()` each frame. Never render by accumulating
  events — a dropped frame desyncs you forever.
- **Engine owns enemy positions.** Enemies advance in `tick()` in engine
  space (a fixed 1280×720 reference coordinate system). Sprites lerp/copy
  from the snapshot. This keeps "did it reach the core" logic testable and
  makes the render layer swappable.
- **Fixed-timestep inside the engine.** `tick(deltaMs)` accumulates and
  steps in fixed 16.67 ms increments (`while (acc >= STEP) step()`), with a
  **cap of ~250 ms** consumed per call. Gotcha: without the cap, a
  backgrounded tab that Phaser doesn't fully pause delivers one giant delta
  on refocus and every enemy teleports into the core. See doc 09 for the
  visibility-pause interaction.

## Typed events

```ts
// core/events.ts
export type EngineEvent =
  | { type: 'spawn';        enemy: EnemySnapshot }
  | { type: 'lock';         enemyId: string }
  | { type: 'hit';          enemyId: string; letterIndex: number; char: string }
  | { type: 'miss';         expected: string | null; got: string }
  | { type: 'wordComplete'; enemyId: string; flawless: boolean; score: number }
  | { type: 'mutate';       enemyId: string; newRemainder: string }   // higher-order mutant
  | { type: 'comboBreak';   was: number }
  | { type: 'coreDamage';   enemyId: string; integrityLeft: number }
  | { type: 'bossPhase';    phaseIndex: number; mechanic: MechanicId }
  | { type: 'levelWon' }
  | { type: 'levelLost' };
```

Write the emitter yourself (~30 lines, `on/off/emit` with a `Map<type,
Set<fn>>`). **Gotcha:** scenes must unsubscribe in their `shutdown` handler
(doc 09 §1) — a restarted `GameScene` that re-subscribes without
unsubscribing plays every sound twice. Make `on()` return an unsubscribe
function and collect them in the scene.

## Tooling requirements

**package.json**

```jsonc
{
  "dependencies": { "phaser": "^3.90", "zod": "^3" },
  "devDependencies": { "typescript": "^5", "vite": "^6", "vitest": "^3",
                       "eslint": "^9", "@typescript-eslint/*": "^8" },
  "scripts": {
    "dev": "vite", "build": "tsc --noEmit && vite build",
    "test": "vitest run", "lint": "eslint src tests"
  }
}
```

- **`tsc --noEmit` in the build script is mandatory** — Vite's esbuild
  transpile strips types without checking them; without this line, type
  errors ship.
- `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`
  (catches `pool[i]` possibly-undefined bugs in WordBank),
  `"resolveJsonModule": true` (campaign levels are imported as modules so a
  malformed JSON fails the build, not the player).

**vite.config.ts notes**

- `base: './'` so the build works on GitHub Pages subpaths.
- Phaser is ~1.2 MB min+gz'd as a whole; fine to ship whole for v1. Do not
  chase tree-shaking custom Phaser builds until M7, if ever.
- Assets referenced by Phaser's loader must live in `public/` (loader takes
  URL strings at runtime; Vite's hashed imports don't apply). **Gotcha:**
  this means asset renames are not caught by the type checker — the asset
  manifest in `PreloadScene` is the single place URLs may appear; grep-able.

**Phaser.Game config (main.ts)**

```ts
new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280, height: 720,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  dom: { createContainer: true },        // needed by the editor overlay (doc 08)
  audio: { disableWebAudio: false },
  scene: [Boot, Preload, Menu, LevelSelect, Game, HUD, BossOverlay,
          Results, Stats, Pause, Editor, EditorUI],
});
```

Engine coordinates == canvas logical coordinates (1280×720). All gameplay
distances/speeds are in this space; `Scale.FIT` handles the rest.
**Gotcha:** never read `window.innerWidth` in gameplay code.

## What is deliberately NOT in the architecture

- **No physics engine.** Movement is `pos += dir * speed * dt` in core.
  Arcade physics would put positions on the Phaser side — wrong side of the
  boundary.
- **No state-management library.** The engine snapshot + save file are the
  only state. Menus read/write via `SaveSystem` directly.
- **No server, no accounts.** `StorageAdapter` is an interface so a remote
  adapter *could* exist later; do not build any of it now.
