# 01 — Game Design

## Premise — "Kill the Mutants"

The theme is mutation testing. You are **SPEC-77**, the last test suite
guarding a legacy codebase. A mutation storm has flooded the repo with
**mutants** — tiny malicious edits to the code (`<` flipped to `<=`, a `+`
turned into a `-`, a statement silently deleted). Every word you type is a
test; finishing it **kills the mutant**. Mutants that reach the **build**
break it.

The release is frozen until the mutation score is high enough to trust the
code. Fight through the codebase module by module — `lib/utils` → core
logic → API layer → the release gate — kill the final surviving mutant, and
the build ships. That's the freedom in *Typing to Freedom*: v1.0.0 escapes
the pipeline.

Tone: neon "inside the codebase" — dark editor-theme backgrounds, glowing
green-tinged mutants. Deliberately achievable with simple shapes, particles,
and a good monospace font.

## Core loop

The game is an **on-rails first-person shooter** (doc 12): each level is a
rail through a module — the camera glides down neon code-corridors during
*travel* stretches, then hard-stops at *ambush* points where a wave of
mutants attacks from the corridor ahead. Clear the wave and the rail
resumes; reach the end of the rail to finish the level.

1. During an ambush, mutants spawn down the corridor and close in on the
   camera / the **build** (depth-scaling sprites; the build plate at the
   bottom of the screen doubles as build-health HUD).
2. Every mutant carries a word. The first correct keystroke **locks on** to
   the eligible mutant whose word starts with that letter.
3. While locked, correct letters are consumed (colored); a wrong keystroke
   is a **miss** (accuracy hit, combo break) but does **not** drop the lock.
4. Completing the word kills the mutant. A mutant reaching the build deals
   build damage and despawns — it *survived* your tests.
5. Win: script exhausted and all mutants dead (and boss dead, if any).
   Lose: build health reaches 0 — the build is broken.

Design intent carried over from *The Typing of the Dead*: the game is about
**commitment and flow** — you cannot cancel a lock, you cannot backspace,
and every keystroke either advances you or is a mistake. All feel decisions
(hit-stop, per-letter pop, pulse on the next letter) serve keystroke →
response immediacy.

## Mutant bestiary

Mutant *types* are data (`src/data/enemies.json`), not classes. Each entry:
sprite key, base speed (px/s at reference resolution), word tier default,
damage on build contact, and a `behavior` id that selects one of a small set
of coded movement/reveal behaviors. Adding a mutant that reuses an existing
behavior requires **zero engine code**.

| Mutant | Behavior id | Typing mechanic | Params |
|---|---|---|---|
| Typo Mutant | `drift` | Short words (tier 1), spawns in clusters | speed 30, dmg 1 |
| Operator Mutant (`+`→`-`) | `beeline` | Medium words, fast, high urgency | speed 90, dmg 1 |
| Equivalent Mutant | `disguised` | Looks like healthy code; word hidden until within `revealDist` px of the build | revealDist 300 |
| Silent Mutant (deleted statement) | `drift` + alpha 0.35 | Normal word, low-visibility sprite | dmg 1 |
| Micro-mutant | `swarm` | 1–2 letter words, spawns 8–15 at once | speed 60, dmg 1 |
| Infinite Loop | `latch` | Stationary after latching to a HUD slot; hard CI-timeout countdown | timer 8s, dmg 3 |
| Race Condition | `stationary` | Long word (tier 4–5), generous fuse — punishes procrastination | fuse 15s, dmg 2 |
| Higher-Order Mutant | `drift` | Untyped remainder *re-mutates* to a new word after `idleMs` without a correct hit on it | idleMs 1500 |
| Heisenbug | `burrow` | Word visible/typeable only while it surfaces (only exists when observed) | surface 2s / buried 2.5s |

**Behavior gotchas**

- `disguised` (Equivalent Mutant): while hidden, the mutant is **not
  lock-eligible** — its word must not participate in the unique-first-letter
  reservation until reveal, otherwise it silently blocks other spawns (see
  doc 04).
- `burrow` (Heisenbug): if the player is mid-word when it buries, **keep the
  lock and keep accepting keystrokes** (the player has memorized the word);
  only hide the label. Dropping the lock feels like a bug.
- `drift`+re-mutate (Higher-Order Mutant): re-mutation replaces only the
  **untyped remainder**, and the new remainder must be re-checked against
  the active-first-letter set *only if the mutant is unlocked* (a locked
  mutant can mutate to anything — ambiguity is impossible while locked).
- `latch` (Infinite Loop): the countdown is real-time-in-game — it must
  pause when the scene pauses (drive it from engine ticks, never
  `setTimeout`).

## Boss fights

Bosses are scripted multi-phase encounters composed from **mechanic
primitives** (doc 05), so the editor's boss builder can create new bosses
without code.

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
4. **THE SURVIVOR** (final boss, Release Gate) — the last surviving mutant,
   the one your tests never caught. Combines earlier mechanics in phases,
   ends with a "freedom sentence": a full paragraph typed against a closing
   merge gate, no backspace, accuracy-gated.

**Boss mechanic primitives** (composable in level JSON):
`waves`, `long-passphrase`, `multi-stream`, `mutating-word`, `reversed-word`,
`question-answer`, `timed-gauntlet`, `no-mistake-window`.

## Scoring, speed, accuracy

- **WPM** = (correct characters ÷ 5) ÷ minutes.
  - *Displayed live*: over a rolling 10 s window (ring buffer of keystroke
    timestamps; see doc 03 for edge cases).
  - *Recorded*: over active level time (paused time excluded).
- **Accuracy** = correct keystrokes ÷ total scoring keystrokes.
  A keystroke is "scoring" if it is a printable character delivered to the
  engine (modifier-chorded keys, repeats, and non-printables are filtered at
  the boundary and never reach the stats).
  A keystroke that matches **no** eligible mutant's next letter counts as a
  miss — including when the player is unlocked and no live word starts with
  that letter. This is the original game's rule and keeps accuracy honest.
- **Mutation score** = mutants killed ÷ total mutants in the level. Shown
  on the results screen (it's the theme's namesake stat); mutants that
  reach the build *survived*. 100 % on every module is the completionist
  goal but is not required to pass a level.
- **Combo** = consecutive flawless words. Multiplier tiers: ×1 (0–2),
  ×2 (3–5), ×3 (6–9), ×4 (10+). Broken by any miss or build damage.
- **Score per word** = `basePoints(tier) × comboMult × speedBonus`, where
  `speedBonus = clamp(1 + (charsPerSec − 3) × 0.15, 1, 2)`.
- **Grade** (per level, D–S): weighted `accuracy 40 % + wpmScore 35 % +
  buildHealthKept 25 %`, where `wpmScore = clamp(wpm / levelTargetWpm, 0, 1)`.
  Thresholds live in level JSON (defaults S ≥ 0.95, A ≥ 0.90, B ≥ 0.80,
  C ≥ 0.65). **Gotcha:** clamp every component to [0, 1] *before* weighting
  or a 200-WPM player gets an S with 60 % accuracy.
- **Historical stats**: per-level bests + global history rows
  `{ts, levelId, wpm, acc, grade}`; per-key confusion counts
  (`"e→r": 14` = expected `e`, typed `r`) feeding a weak-keys heatmap and a
  practice mode that biases word selection toward the player's worst keys.

## Word flavor

Word pools use programmer/testing vocabulary — `assert`, `boundary`,
`coverage`, `fixture`, `refactor`, `deadlock` — so the fiction extends into
what your fingers are doing. Tiers still sort purely by length/difficulty
(doc 04); flavor never overrides the ASCII policy or first-letter
distribution rules.

## Modes

- **Campaign**: fixed module chain with unlocks.
- **Custom**: editor-made / imported levels, same grading and bests.
- **Practice** (post-M6): endless waves; word selection weighted by the
  player's per-key error heatmap; no build damage, stats-only.
