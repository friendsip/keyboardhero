# 13 — Status & Roadmap

*Last updated: 2026-07-07.* Companion to [11-milestones.md](11-milestones.md)
(the original milestone definitions); this doc tracks what actually exists
and what to do next.

## ✅ Done

### M1 — Typing core (complete, plus two pivots)

**Playable today:** `npm run dev` → an on-rails first-person ride through a
codebase; the camera glides through corridors ("EN ROUTE: lib/utils/"),
hard-stops at ambushes, mutants close in carrying code words, typing kills
them, reaching the release gate wins. `SPACE` retries; `?seed=1234` pins a
deterministic run. Verified in headless Chromium with a clean console.

| Area | What exists |
|---|---|
| Scaffold | Vite + TypeScript (strict, `noUncheckedIndexedAccess`) + Phaser 3.90 + vitest + ESLint 9 |
| Core engine (`src/core/`, zero Phaser imports, lint-enforced) | `TypingEngine` (fixed-timestep tick, delta clamp, input-before-movement race rule), `TargetLock`, `WordBank` (seeded shuffle-bag + unique-first-letter reservation), `StatsTracker` (rolling + total WPM, accuracy, per-key confusion heatmap, wild misses), `Scoring` (combo tiers, speed bonus), `Rng` (mulberry32) |
| Rail model (doc 12) | `RailSegment` travel/encounter segments; lateral lane system; depth-based movement (`SPAWN_Z`→`ATTACK_Z`); combat-time-only stats; travel keystrokes ignored not punished |
| Input (doc 03) | Full keydown filter table (repeat, modifiers, IME, Dead keys, Firefox `'`/`/` quick-find, space scroll), `KeyRouter` yielding to focused form fields |
| Render layer | Pseudo-3D projection with lateral-flattening cheat, per-frame floor grid, runtime-generated bitmap font (per-letter tint: typed/next/remaining), pooled `EnemySprite`s with reset hygiene, depth sorting, punch/kill/score FX |
| Scenes | Boot, Game, HUD (WPM/ACC/combo/score/MUTANTS/RAIL/BUILD), Pause (blur + visibility auto-pause), win/lose overlay with mutation score |
| Theme | "Kill the Mutants" (mutation testing) across docs, word pools, UI |
| Tests (38) | Engine behavior, same-step races, rail progression, invariant + lane fuzz, stats fixtures, input filter table, golden determinism snapshot |
| Quality gates | `npm test`, `npm run lint` (incl. core-boundary rules), `npm run build` (= `tsc --noEmit` + vite) — all green |

### Design docs 01–12
Complete engineering spec for everything below — each next step already has
its requirements and gotchas written down.

## ⏭ Next steps, in order

### Step 0 — Repo hygiene (30 minutes, do first)
The project is **not yet a git repository**. `git init`, add a `.gitignore`
(`node_modules/`, `dist/`), commit everything, push to GitHub, and add the
CI workflow from doc 10 (`npm ci && npm run lint && npm test && npm run
build` on push). Everything after this point should be a reviewed commit.

### Step 1 — M2: Data-driven levels & bestiary (docs 04, 06, 12)
The biggest lever: levels stop being a hardcoded `RAIL` array in
`GameScene.ts` and become JSON.
1. zod schemas (`LevelSchema` with `rail` segments, `EnemyDefSchema`,
   `validateLevel()` with warnings) + campaign JSON imported at build time
   + the CI schema sweep.
2. `SpawnDirector` playing wave scripts *within* encounter segments.
3. Behavior system + first six mutants: typo (`drift`), operator
   (`beeline`), micro-mutant (`swarm`), equivalent mutant (`disguised`,
   reserve-at-reveal), race condition (`stationary` + fuse), higher-order
   mutant (re-mutation). Word tiers (tier1–5 pools).
4. `ResultsScene` with the D–S grade formula; 5 handwritten Module 1 levels.
Exit: Module 1 beatable start to finish from JSON alone.

### Step 2 — M3: Persistence & stats (doc 07)
`StorageAdapter`/`LocalAdapter`, versioned save with backup slot +
corruption recovery, unlock chain + per-level bests, `StatsScene`
(WPM/accuracy history, weak-keys heatmap), settings, multi-tab guard.
Exit: kill the tab mid-level and lose nothing but that run.

### Step 3 — M4: Boss system (doc 05)
`BossMachine` + primitives (`long-passphrase`, `multi-stream`,
`mutating-word` first), `BossOverlayScene`, DEADLOCK and THE REGRESSION as
data; a boss is the final encounter of a rail.

### Step 4 — M5: Level editor (doc 08)
Segment-strip timeline (travel/encounter blocks), wave inspector, word-pool
editor with distribution warnings, boss builder, playtest bridge, IndexedDB
+ import/export, Custom tab.

### Step 5 — M6: Content & polish
Remaining mutants (silent, heisenbug, infinite loop), remaining boss
primitives + THE POLYMORPH and THE SURVIVOR, full 4-module campaign, art
pass (real sprites over the placeholder squares), audio (keystroke audio
sprite, music intensity layers), juice pass, practice mode biased by the
weak-keys heatmap.

### Step 6 — M7: Ship (doc 14)
Keyboard-required guard, CJK notice, save-corruption UX, perf audit,
cross-browser sweep, deploy per the deployment doc.

### Anytime / opportunistic
- Tune the feel: rail pacing knobs live in `RAIL` (GameScene.ts) until M2
  moves them to JSON.
- Far-label kissing at the horizon (doc 12 gotcha 1) — revisit if it
  bothers playtesters; knobs are listed there.
- A `?debug=1` overlay (doc 10) pays for itself early in M2.

## Deferred / non-goals (unchanged from doc 11)
Server sync/accounts/leaderboards, mobile on-screen-keyboard play, IME/CJK
input, in-game level browser (sharing = files), custom Phaser build.
