# Typing to Freedom — Technical Documentation

Web-based typing action game (Phaser 3 + TypeScript + Vite, local-only
persistence, built-in level editor). `../PLAN.md` is the executive summary;
these documents are the detailed engineering spec.

## Reading order

| Doc | Contents |
|---|---|
| [01-game-design.md](01-game-design.md) | Concept, enemy bestiary, boss designs, scoring/grading rules |
| [02-architecture.md](02-architecture.md) | Module layout, dependency rules, event flow, tooling/config requirements |
| [03-typing-engine.md](03-typing-engine.md) | Input pipeline, lock-on, tick loop, WPM/accuracy math — **the most gotcha-dense area** |
| [04-word-bank-and-spawning.md](04-word-bank-and-spawning.md) | Word pools, unique-first-letter invariant, SpawnDirector, seeded RNG |
| [05-boss-system.md](05-boss-system.md) | Boss phase state machine, mechanic primitives, per-mechanic gotchas |
| [06-level-format.md](06-level-format.md) | Full JSON schemas (level, boss, save), zod validation, versioning |
| [07-storage-and-saves.md](07-storage-and-saves.md) | localStorage/IndexedDB strategy, migrations, corruption recovery, import/export |
| [08-level-editor.md](08-level-editor.md) | Editor UI architecture, DOM/canvas focus wars, playtest bridge |
| [09-phaser-gotchas.md](09-phaser-gotchas.md) | Phaser 3-specific traps: scene lifecycle, text perf, audio unlock, pause semantics |
| [10-testing.md](10-testing.md) | Unit/property/schema/migration test strategy, determinism |
| [11-milestones.md](11-milestones.md) | Build order with per-milestone acceptance criteria |
| [12-rail-and-camera.md](12-rail-and-camera.md) | On-rails structure (travel/ambush segments), depth model, pseudo-3D projection & its gotchas |
| [13-status-and-roadmap.md](13-status-and-roadmap.md) | **What's built vs. what's next** — start here to pick up the work |
| [14-deployment.md](14-deployment.md) | Hosting on a webserver: subdirectory of a site, static platforms, iframe embedding |

## The three rules that keep this codebase sane

1. **`src/core/` never imports Phaser.** All game-critical logic (typing,
   targeting, spawning, bosses, scoring, stats) is pure TypeScript, driven by
   `tick(dtMs)` and `handleKey(char, tMs)`, tested in Node. Scenes render
   from `engine.snapshot()` and react to engine events. If you find yourself
   importing Phaser in `core/`, you are about to make something untestable.
2. **One schema, one loader.** Campaign levels, editor output, and imported
   files all pass through the same zod schema and the same loader. There is
   no "editor model" distinct from the "game model".
3. **No `Math.random()`, no `Date.now()` in `core/`.** Randomness comes from
   an injected seeded PRNG; time comes from accumulated tick deltas and
   keystroke timestamps passed in from the boundary. This is what makes
   replays, bug reports (`?seed=`), and tests deterministic.
