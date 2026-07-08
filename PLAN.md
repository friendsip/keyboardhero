# Typing to Freedom: Kill the Mutants — Game Design & Technical Plan

A web-based typing action game inspired by Sega's *The Typing of the Dead*,
themed on **mutation testing**. You are a test suite defending a codebase
overrun by mutants — tiny malicious code edits. Every word you type is a
test that kills one; clear the codebase and the build ships — freedom.

**Stack:** Phaser 3 + TypeScript + Vite · **Persistence:** local-only
(localStorage + IndexedDB, JSON import/export) · **Levels:** built-in editor

> This file is the executive summary. The detailed engineering spec —
> per-subsystem code requirements and gotchas — lives in
> [`docs/`](docs/README.md).

---

## 1. Concept & Theme

### 1.1 Premise

The player is **SPEC-77**, the last test suite guarding a legacy codebase
flooded by a mutation storm. Each level is a *module* of the codebase
(`lib/utils` → Core Logic → API Layer → Release Gate). Killing a module's
mutants unlocks the path outward. The final boss is the last surviving
mutant guarding the release gate; kill it and the build ships —
"typing to freedom."

### 1.2 Enemy roster (mutant bestiary)

Each mutant type maps a mutation-testing concept to a typing mechanic:

| Mutant | Behavior | Typing mechanic |
|---|---|---|
| **Typo Mutant** | Slow, appears in clusters | Short words (3–5 letters) |
| **Operator Mutant** (`+`→`-`) | Fast, beelines at the build | Medium words, high urgency |
| **Equivalent Mutant** | Looks like healthy code until close | Word hidden until it "reveals"; then medium word |
| **Silent Mutant** (deleted statement) | Semi-transparent, hard to spot | Normal word but low-visibility sprite |
| **Micro-mutant** | Swarms of many weak units | Single letters / 2-letter words, tests raw speed |
| **Infinite Loop** | Latches onto a HUD slot, CI-timeout countdown | Must be killed before timer or you take heavy damage |
| **Race Condition** | Stationary, explodes on timer | Long word, generous time — punishes procrastination |
| **Higher-Order Mutant** | Word visibly re-mutates | If you stop typing for >1.5s, remaining letters reshuffle to a new word |
| **Heisenbug** | Burrows: word only shows while it surfaces (only exists when observed) | Type during surface windows |

### 1.3 Boss fights

Bosses are scripted multi-phase encounters, each built from reusable
**boss mechanics** (so the editor can compose new bosses):

1. **DEADLOCK** (Infinite Loop King) — end of Module 1.
   Phase 1: waves of infinite loops. Phase 2: a long passphrase
   (`"my tests are green and this build is shipping tonight"`) must be
   typed before the CI-timeout countdown finishes. Mistakes add time
   penalties.
2. **THE REGRESSION** (Module 2) — three word-streams active at once;
   killing a head spawns two shorter-word heads (every fix breeds two new
   bugs) until the core is exposed, which takes one very long technical
   word (`"instrumentation"`).
3. **THE POLYMORPH** (Higher-Order Mutant, Module 3) — its word *mutates
   every few seconds*; phase 2 shows the word **reversed**; phase 3 asks
   short *questions* and you must type the answer (a direct homage to the
   original game's boss quizzes: "how many legs does a spider have?" →
   `eight`).
4. **THE SURVIVOR** (final boss, Release Gate) — the last mutant your tests
   never caught; combines earlier mechanics in phases, ends with a "freedom
   sentence": a full paragraph typed against a closing merge gate, no
   backspace, accuracy-gated.

**Boss mechanic primitives** (composable in level JSON):
`waves`, `long-passphrase`, `multi-stream`, `mutating-word`, `reversed-word`,
`question-answer`, `timed-gauntlet`, `no-mistake-window`.

### 1.4 Core loop

0. The level is an on-rails first-person ride through the module (see
   docs/12): travel stretches with no combat, then hard-stop ambushes.
1. During an ambush, enemies spawn down the corridor and advance toward
   the camera and the build it carries (bottom-center HUD).
2. Each enemy displays a word. The first correct keystroke **locks on** to
   the closest enemy whose word starts with that letter.
3. Correct letters are consumed (highlighted); a wrong keystroke while locked
   counts as a miss (accuracy hit + combo break) but does not switch targets.
4. Word complete → enemy destroyed, score + combo. Enemy reaches the core →
   integrity (HP) damage.
5. Level ends on script completion (win) or integrity 0 (lose). Results
   screen shows WPM, accuracy, combo, grade (D–S), and saves bests.

**Targeting rules (important, from the original game):**
- The spawner must never spawn two *simultaneously active* enemies whose
  words share a first letter (WordBank enforces unique first letters among
  live enemies).
- Lock-on persists until the word is finished or the enemy dies/escapes.
  `Escape` key intentionally does nothing — commitment is part of the game.

### 1.5 Scoring, speed & accuracy

- **WPM** = (correct characters / 5) / minutes, computed live over a rolling
  10-second window (displayed) and over the whole level (recorded).
- **Accuracy** = correct keystrokes / total keystrokes.
- **Combo**: consecutive flawless words; multiplies score; broken by any miss
  or by an enemy reaching the core.
- **Grade**: S/A/B/C/D from a weighted formula (accuracy 40%, WPM 35%,
  damage taken 25%) with per-level tunable thresholds.
- **Historical stats**: per-level bests + global history (WPM over time,
  accuracy over time, per-key error counts → a "weak keys" heatmap the game
  can use to bias word selection in a practice mode).

---

## 2. Technical Architecture

### 2.1 Principles

- **The typing engine is pure TypeScript with zero Phaser imports.** All
  game-critical logic (input matching, lock-on, WPM/accuracy math, spawn
  scheduling, boss phase state machines) lives in plain classes that are
  unit-testable in Node. Phaser scenes are a thin render/audio layer that
  subscribes to engine events.
- **Everything is data-driven.** Levels, enemy types, boss phases, and word
  lists are JSON validated with zod. The shipped campaign and player-made
  editor levels use the *same* schema and the same loader.
- **Storage behind an interface.** `StorageAdapter` wraps
  localStorage/IndexedDB today; a server adapter could be added later
  without touching game code.

### 2.2 Project structure

```
typing-to-freedom/
├── index.html
├── vite.config.ts
├── package.json                # phaser, zod; dev: typescript, vitest, vite
├── public/
│   └── assets/                 # images, audio, fonts
├── src/
│   ├── main.ts                 # Phaser.Game config + scene registration
│   ├── core/                   # ← pure TS, no Phaser, fully unit-tested
│   │   ├── TypingEngine.ts     # keystroke → lock-on/hit/miss/complete events
│   │   ├── TargetLock.ts       # active-target state, letter matching
│   │   ├── StatsTracker.ts     # live + final WPM, accuracy, combo, per-key errors
│   │   ├── WordBank.ts         # word pools, difficulty tiers, unique-first-letter picks
│   │   ├── SpawnDirector.ts    # consumes level script, emits spawn events on a clock
│   │   ├── BossMachine.ts      # phase state machine over boss mechanic primitives
│   │   ├── Scoring.ts          # score, combo, grade formula
│   │   └── events.ts           # typed event emitter shared core ⇄ scenes
│   ├── data/
│   │   ├── schemas.ts          # zod schemas: Level, Wave, EnemyDef, BossDef, SaveFile
│   │   ├── enemies.json        # enemy type definitions (speed, hp-words, sprite key)
│   │   ├── words/              # word lists by tier: tier1.json … tier5.json, themed packs
│   │   └── levels/             # campaign levels: module1-1.json … boss4.json
│   ├── storage/
│   │   ├── StorageAdapter.ts   # interface: loadSave/saveSave/listLevels/putLevel/…
│   │   ├── LocalAdapter.ts     # localStorage (save/stats) + IndexedDB (custom levels)
│   │   └── ImportExport.ts     # level & save ⇄ JSON file download/upload, version migration
│   ├── scenes/
│   │   ├── BootScene.ts        # minimal preload of loading-bar assets
│   │   ├── PreloadScene.ts     # asset manifest load, save-file load
│   │   ├── MenuScene.ts
│   │   ├── LevelSelectScene.ts # campaign map + custom-levels tab
│   │   ├── GameScene.ts        # gameplay: renders engine state, forwards keydown
│   │   ├── BossOverlayScene.ts # boss HP bar, phase banners, passphrase UI (runs parallel to GameScene)
│   │   ├── HUDScene.ts         # WPM ticker, accuracy, combo, integrity (parallel scene)
│   │   ├── ResultsScene.ts     # grade, stats, best-diff, retry/next
│   │   ├── StatsScene.ts       # historical charts, weak-keys heatmap
│   │   ├── PauseScene.ts
│   │   └── editor/
│   │       ├── EditorScene.ts      # canvas: timeline + spawn-lane preview
│   │       ├── EditorUIScene.ts    # panels: waves, enemy palette, word pools, boss builder
│   │       └── PlaytestBridge.ts   # launch GameScene with in-memory level, return to editor
│   ├── entities/
│   │   ├── EnemySprite.ts      # sprite + word label rendering, hit flash, death anim
│   │   └── WordLabel.ts        # per-letter text: typed/next/remaining coloring
│   └── fx/
│       ├── Juice.ts            # screen shake, hit-stop, particles, floating score
│       └── AudioBus.ts         # keystroke clicks, zaps, music ducking
└── tests/
    ├── TypingEngine.test.ts
    ├── StatsTracker.test.ts
    ├── WordBank.test.ts
    ├── SpawnDirector.test.ts
    ├── BossMachine.test.ts
    └── migrations.test.ts
```

### 2.3 Core engine design

`TypingEngine` is the heart. It owns no DOM and no Phaser — it receives
normalized keystrokes and emits typed events:

```ts
// core/TypingEngine.ts (shape)
type EngineEvent =
  | { type: 'lock';        enemyId: string }
  | { type: 'hit';         enemyId: string; letterIndex: number }
  | { type: 'miss';        expected: string; got: string }
  | { type: 'wordComplete';enemyId: string; flawless: boolean }
  | { type: 'comboBreak' }
  | { type: 'coreDamage';  enemyId: string; integrityLeft: number };

class TypingEngine {
  handleKey(char: string, timestampMs: number): void;   // from scene's keydown
  tick(dtMs: number): void;                              // advance enemies, timers, boss phases
  snapshot(): EngineState;                               // scenes render from this
}
```

**Input handling details:**
- Listen on `keydown` at the Phaser game level; ignore keys with
  `ctrl/meta/alt`; use `event.key` so shifted characters and punctuation
  work; ignore non-printable keys except where a boss mechanic needs Enter.
- Case-insensitive matching by default (levels can flag `caseSensitive` for
  hard mode); words with spaces/punctuation are typed literally.
- No backspace: a miss is a miss (matches the original; keeps stats honest).
- Every keystroke is timestamped for rolling-WPM math; `StatsTracker`
  records `(expected, got)` pairs to build the per-key error heatmap.

**SpawnDirector** consumes the level script (below) on `tick()`, asking
`WordBank` for a word of the requested tier whose first letter differs from
all currently live enemies' remaining-first-letters. If none exists (rare),
it retries next tick — never spawns an ambiguous target.

**BossMachine** is a phase state machine; each phase declares a mechanic
primitive plus parameters, and completion/timeout transitions. It reuses
`TypingEngine` targeting for multi-stream phases and swaps in special modes
(passphrase buffer, question/answer) for the others.

### 2.4 Level data format (the schema the editor edits)

```jsonc
{
  "formatVersion": 1,
  "id": "module2-3",                 // custom levels get uuid ids
  "meta": { "name": "Mutation Storm", "author": "mark", "module": 2,
            "description": "Operator mutants loose in the core logic." },
  "settings": { "integrity": 5, "caseSensitive": false,
                "gradeThresholds": { "S": 0.95, "A": 0.9, "B": 0.8, "C": 0.65 } },
  "wordPools": {                     // optional overrides; default = built-in tiers
    "custom": ["packet", "socket", "router", "gateway"]
  },
  "script": [
    { "at": 0,    "wave": { "enemy": "typo",     "count": 4, "interval": 1.2, "tier": 1, "lane": "spread" } },
    { "at": 12,   "wave": { "enemy": "operator", "count": 6, "interval": 0.8, "tier": 2, "speedMult": 1.2 } },
    { "at": 30,   "wave": { "enemy": "polymorph","count": 2, "interval": 3,  "pool": "custom" } },
    { "at": 45,   "checkpoint": true }
  ],
  "boss": null                        // or a BossDef: { name, sprite, phases: [ {mechanic, params, next} ] }
}
```

A `SaveFile` (localStorage, versioned + migrated on load):

```jsonc
{
  "formatVersion": 1,
  "campaign": { "unlocked": ["module1-1", "module1-2"],
                "bests": { "module1-1": { "grade": "A", "wpm": 62, "acc": 0.94, "score": 18450 } } },
  "history": [ { "ts": 1783500000, "levelId": "module1-1", "wpm": 58, "acc": 0.91 } ],
  "keyErrors": { "e→r": 14, "i→o": 9 },
  "settings": { "volume": 0.8, "keySound": "mech", "reducedMotion": false }
}
```

Custom levels go to **IndexedDB** (they can be large and numerous);
save/stats go to **localStorage** (small, synchronous, simple).
`ImportExport.ts` downloads any level as a `.ttf-level.json` file and
imports via file picker or drag-and-drop — that's the sharing story with no
server.

### 2.5 The level editor

A Phaser scene pair (canvas preview + DOM-overlay UI panels, since form
controls are far easier in DOM than in Phaser):

- **Timeline view**: horizontal time axis; waves are draggable blocks;
  click to edit a wave's enemy type, count, interval, word tier/pool,
  speed multiplier, spawn lane.
- **Enemy palette**: the bestiary with tooltips describing each mechanic.
- **Word pool editor**: paste/type custom word lists; validation warns on
  duplicate first letters within small pools and on characters outside the
  allowed set.
- **Boss builder**: ordered list of phases; each phase picks a mechanic
  primitive and its params (passphrase text, stream count, mutation
  interval, question/answer pairs).
- **Playtest**: one keystroke (F5-style button) launches `GameScene` with
  the in-memory level and returns to the editor with the run's stats —
  tight iteration loop.
- **Validate & Save**: zod-validate, estimate difficulty (words/sec demanded
  vs. tier), save to IndexedDB, or export to file.

Custom levels appear in a "Custom" tab of Level Select, with the same
bests/grades tracking as campaign levels.

### 2.6 Rendering & game feel (Phaser specifics)

- **Scenes run in parallel**: `GameScene` (world) + `HUDScene` (stats) +
  `BossOverlayScene` when applicable — Phaser's scene system handles this
  natively and keeps UI code out of gameplay code.
- Word labels: bitmap text per letter with three colors (typed / next /
  remaining); the *next* letter subtly pulses — the single most important
  readability feature in the genre.
- Juice on every keystroke: tiny hit-stop (10–20 ms) on word completion,
  letter "pop" particle on each correct hit, screen shake scaled by enemy
  size on kill, floating score text, combo meter that visibly heats up.
- Audio: per-keystroke click (2–3 variants to avoid machine-gun monotony),
  distinct miss "thud", rising pitch across a word's letters, music with an
  intensity layer tied to live enemy count. `AudioBus` ducks music on boss
  banners.
- Art direction: flat/neon "inside the machine" vector look — dark circuit
  backgrounds, glowing enemies. This is deliberately achievable with
  simple shapes + Phaser particles; free packs (Kenney) can fill gaps.
- Accessibility: font-size slider for words, `reducedMotion` setting
  (disables shake/flash), colorblind-safe letter-state palette.

---

## 3. Build Plan (milestones)

Each milestone ends with something playable/testable.

**M1 — Typing core (the fun test).**
Vite + TS + Phaser skeleton; `TypingEngine`, `TargetLock`, `WordBank`,
`StatsTracker` in `core/` with vitest suites; one hardcoded wave of gray
rectangles with words; lock-on, hit/miss coloring, kill, live WPM/accuracy.
*Exit criterion: it already feels good to type at rectangles.*

**M2 — Data-driven levels & bestiary.**
zod schemas, `SpawnDirector`, JSON level loader; implement 5–6 enemy types
(typo mutant, operator mutant, micro-mutant, equivalent mutant, race
condition, higher-order mutant); integrity, lose/win flow, `ResultsScene`
with grading; 4–5 handwritten Module 1 levels.

**M3 — Persistence & stats.**
`StorageAdapter` + `LocalAdapter`; save file with versioned migrations;
level unlock chain, per-level bests; `StatsScene` with WPM/accuracy history
and weak-keys heatmap; settings persistence.

**M4 — Boss system.**
`BossMachine` + mechanic primitives (passphrase, multi-stream,
mutating-word, question-answer, timed-gauntlet); `BossOverlayScene`;
build DEADLOCK and THE REGRESSION; boss levels join the campaign.

**M5 — Level editor.**
Editor scenes, timeline UI, word-pool editor, boss builder, playtest
bridge, IndexedDB storage, import/export files, Custom tab in level select.

**M6 — Content & polish.**
Full campaign (4 modules ≈ 16 levels + 4 bosses incl. THE POLYMORPH and THE
SURVIVOR), remaining mutants (silent mutant, heisenbug, infinite loop), art/audio
pass, juice pass, difficulty tuning, practice mode biased by weak keys.

**M7 — Ship.**
Accessibility pass, mobile/keyboard-only guard screen, error boundary +
save-corruption recovery, Lighthouse/perf check, deploy as a static site
(GitHub Pages / Netlify / Cloudflare Pages — local-only persistence means
zero backend).

---

## 4. Testing strategy

- **Unit (vitest, runs in Node because `core/` has no Phaser):**
  keystroke matching incl. case/punctuation edge cases; WPM math against
  hand-computed fixtures; unique-first-letter spawn guarantee under fuzzed
  word pools; boss phase transitions; save-file migrations from every past
  `formatVersion`.
- **Schema:** every shipped level JSON is zod-validated in a test — a bad
  campaign file fails CI, not the player.
- **Playtesting hooks:** a `?seed=` query param makes spawns/word picks
  deterministic for reproducing reports; a debug overlay (FPS, live enemy
  count, engine state) behind `?debug=1`.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Typing feel is off (latency, mushy feedback) | M1 is *only* about feel; keystroke → visual response must be same-frame; keep engine tick decoupled from render |
| Ambiguous targets frustrate players | Unique-first-letter invariant enforced in `WordBank` + tested |
| Editor scope balloons | Editor edits the same JSON the game loads — no separate model; ship timeline + pools first, boss builder second |
| localStorage quota / corruption | Small save + IndexedDB for levels; JSON export as user-driven backup; migration tests |
| Word lists get stale/repetitive | Tiered pools + themed packs are just JSON — trivially extensible, and custom pools per level |
| International keyboards / IME | `event.key`-based matching, case-insensitive default, restrict built-in pools to ASCII; document limitation for CJK |
