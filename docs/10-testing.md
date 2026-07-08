# 10 — Testing Strategy

`src/core/` has no Phaser imports (enforced by lint, doc 02), so the entire
gameplay brain runs under vitest in Node with zero mocking of the framework.
This is the payoff of the architecture — protect it.

## Unit tests (vitest, `tests/` mirrors `core/`)

### TypingEngine / TargetLock

- Locking keystroke consumes the first letter (doc 03 §2).
- Miss while locked: accuracy dinged, lock retained, combo broken.
- Miss while unlocked (`expected: null`): counted, goes to `wildMisses`
  not the heatmap.
- Case-insensitive default; `caseSensitive: true` path; the Turkish-locale
  trap: assert `'I'` matches `'i'` under default folding regardless of a
  mocked locale (i.e., verify we used `toLowerCase`, not locale-aware).
- Same-step race: final letter + core contact in one step → kill wins
  (fixed input-before-movement order, doc 03 §2).
- Locked enemy removed by external cause → lock released, no
  `wordComplete`, no `comboBreak`.
- `flawless` is per-lock, not global (miss on enemy A, then perfect enemy
  B ⇒ B flawless).
- Space and apostrophe as expected characters in passphrases.

### StatsTracker

- WPM against hand-computed fixtures (e.g. 25 correct chars in 6.0 s ⇒
  50 WPM).
- Rolling window: warm-up divides by elapsed (< 10 s), entries expire at
  exactly 10 s, frozen `nowMs` during pause freezes the reading.
- Active-time exclusion: 60 s typing + 300 s pause ⇒ WPM uses 60 s.
- Zero-keystroke finalize ⇒ acc 1.0, wpm 0, no NaN anywhere in grade.
- Heatmap: `expected:'e', got:'r'` increments exactly `"e→r"`.

### WordBank (property/fuzz tests — highest value in the suite)

- **Invariant fuzz:** for 1000 seeded iterations of random
  take/lock/kill/mutate sequences over random pools: at no point do two
  unlocked lock-eligible enemies share a first letter. This single test
  guards the game's core promise.
- Shuffle-bag: no word repeats until pool exhausted; deterministic under a
  fixed seed.
- Starvation: 3-first-letter pool → `take` returns null (not a hang, not a
  duplicate) and the degraded `lockPriority` path activates after the
  2 s policy window.
- Equivalent-mutant reserve-at-reveal, including the "letter stolen while
  disguised → word swap" path (doc 04 gotcha 2).

### SpawnDirector

- Script `{at: 0, count: 3, interval: 1}` ticked in odd-sized deltas emits
  spawns at t=0, 1, 2 exactly once each (fixed-step accumulation).
- Clamped giant delta does not burst-spawn (doc 04 gotcha 2).
- `isExhausted` semantics; checkpoint restart rebuilds bank + director and
  does not replay pre-checkpoint word draws (doc 04 gotcha 3).

### BossMachine

- Phase-transition sweep: entering `long-passphrase` clears field, releases
  reservations, drops lock silently (doc 05).
- Input-mode routing: keystrokes during `buffer` phases never reach
  targeting, and mode restores after the phase.
- `question-answer` multi-candidate matching (`eight` / `8`), candidate
  elimination, miss only on zero candidates.
- Gauntlet accuracy gate: per-phase stats isolated; retry resets; heatmap
  fed once.
- Timer expiry → integrity damage + phase restart, not level loss (until
  integrity 0).

### Determinism (regression keystone)

Golden-run test: fixed seed + fixed level + scripted keystroke tape
(char + timestamp list) ⇒ assert final `{score, wpm, acc, events hash}`
matches a stored snapshot. Any unintended behavior change in the engine
trips this. Update the snapshot only in a commit that explains why.

## Schema & data tests

- Every file in `src/data/levels/` and `src/data/words/` zod-parses.
- Campaign-specific lint: every level's pools pass the first-letter
  distribution check; every boss references valid mechanics; every level id
  in the unlock chain exists.
- `validateLevel()` warning cases (small pools) produce warnings, not
  errors.

## Migration tests

- Frozen fixture per historical `formatVersion` for save AND level;
  chain-migrate each → current zod parse succeeds (doc 07).
- Corrupt inputs: truncated JSON, `formatVersion: 999` (refuse), missing
  version (corrupt path), non-object root.

## Storage tests

- LocalAdapter against a localStorage stub: backup-slot rotation, recovery
  order (main → bak → default), quota-throw → history-trim retry.
- ImportExport: id-collision → fresh UUID; oversize reject; forward-version
  reject.
- IndexedDB via `fake-indexeddb` in vitest — enough to test the wrapper's
  transaction shapes.

## Manual / playtest tooling

- `?seed=1234` pins Rng; `?debug=1` overlay: FPS, live enemy count, engine
  step backlog, reservation set contents, current input mode.
- `?level=<id>` boots straight into a level (dev builds only) — saves
  minutes per iteration every day.
- Keystroke tape recorder behind debug flag: dumps the golden-run tape
  format from a real play session, turning any reported bug + seed into a
  reproducible test case.

## What is NOT tested

- Phaser rendering, tweens, audio — verified by playing. No jsdom-Phaser
  rigs, no screenshot diffing; they cost more than they catch at this
  scale. The boundary discipline is what keeps this corner small.

## CI

GitHub Actions on push: `npm ci && npm run lint && npm test && npm run
build` (build includes `tsc --noEmit`, doc 02). All four must pass; the
schema sweep makes bad campaign data a CI failure rather than a player
crash.
